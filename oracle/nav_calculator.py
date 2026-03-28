"""
NAV Calculator
~~~~~~~~~~~~~~
Computes the current NAV per token by:
  1. Fetching today's prices for the portfolio assets (yfinance)
  2. Pulling the last on-chain weights (via RWAFund.getAssets / weights)
  3. Computing the portfolio return since the last NAV update
  4. Scaling the previous on-chain NAV by that return

Also handles the monthly rebalance workflow:
  - Runs the Black-Litterman model (with optional LLM views)
  - Returns new asset weights as basis-point integers
"""

import os
import sys
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Tuple

import numpy as np
import pandas as pd
import yfinance as yf

logger = logging.getLogger(__name__)

# ── Path so we can import from ../src ─────────────────────────────────────────
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from black_litterman import BlackLittermanModel
from llm_view_generator import LLMViewGenerator
from data_collection import DataCollector


# ─────────────────────────────────────────────────────────────────────────────
class NAVCalculator:
    """
    Calculates NAV and rebalance weights for the on-chain oracle.

    Parameters
    ----------
    tickers : list[str]
        Portfolio asset tickers (e.g. ["AAPL","MSFT",...])
    fund_contract : web3.contract.Contract
        Already-instantiated web3 contract object (read-only methods called here)
    anthropic_api_key : str
        API key for the LLM view generator (optional; skips LLM if empty)
    lookback_days : int
        Rolling window used when training the BL model (default 252)
    """

    # Approximate market caps (USD billions) – used for BL implied returns
    # Update these periodically; rough order matters more than precision
    MARKET_CAPS = {
        "AAPL":  3000,
        "MSFT":  2800,
        "GOOGL": 2000,
        "AMZN":  1800,
        "NVDA":  2200,
        "TSLA":   600,
        "META":  1200,
    }

    def __init__(
        self,
        tickers: List[str],
        fund_contract,
        anthropic_api_key: str = "",
        lookback_days: int = 252,
    ):
        self.tickers = tickers
        self.fund_contract = fund_contract
        self.lookback_days = lookback_days

        self.data_collector = DataCollector(tickers=tickers, benchmark="SPY")
        self.bl_model = BlackLittermanModel(risk_aversion=1.8, tau=0.15)

        self.llm_generator: LLMViewGenerator | None = None
        if anthropic_api_key:
            self.llm_generator = LLMViewGenerator(
                api_key=anthropic_api_key,
                model="claude-sonnet-4-20250514",
                temperature=0.3,
                max_tokens=2000,
            )

    # ── NAV calculation ───────────────────────────────────────────────────────

    def compute_nav(self) -> Tuple[int, int]:
        """
        Compute the new NAV per token (USDC, 6 decimals) and total AUM.

        Returns
        -------
        (new_nav_int, total_aum_int)
            Both expressed with 6 decimal places (USDC units).
        """
        current_nav_int = self.fund_contract.functions.navPerToken().call()
        last_update_ts  = self.fund_contract.functions.lastNavUpdate().call()
        total_supply    = self.fund_contract.functions.totalSupply().call()  # 18 dec

        if last_update_ts == 0:
            logger.info("First NAV update – using initial contract NAV")
            total_aum = (total_supply * current_nav_int) // 10**18
            return current_nav_int, total_aum

        # On-chain weights
        weights = self._get_on_chain_weights()
        if not weights:
            logger.warning("No weights on-chain yet; returning unchanged NAV")
            total_aum = (total_supply * current_nav_int) // 10**18
            return current_nav_int, total_aum

        # Fetch prices since last update
        last_date = datetime.fromtimestamp(last_update_ts, tz=timezone.utc)
        today     = datetime.now(tz=timezone.utc)

        period_return = self._compute_portfolio_return(weights, last_date, today)
        logger.info(f"Portfolio return since {last_date.date()}: {period_return:.4%}")

        new_nav_float = current_nav_int * (1.0 + period_return)
        new_nav_int   = max(1, int(new_nav_float))  # never go below 1 unit

        total_aum = (total_supply * new_nav_int) // 10**18
        return new_nav_int, total_aum

    # ── Rebalance weights ─────────────────────────────────────────────────────

    def compute_rebalance_weights(self) -> Tuple[List[str], List[int]]:
        """
        Run the Black-Litterman model and return new portfolio weights.

        Returns
        -------
        (assets, weight_bps)
            assets     : ordered ticker list
            weight_bps : weights in basis points (integers, sum == 10_000)
        """
        end_date   = datetime.now().strftime("%Y-%m-%d")
        start_date = (datetime.now() - timedelta(days=self.lookback_days + 30)).strftime("%Y-%m-%d")

        prices  = self.data_collector.fetch_price_data(start_date, end_date)
        returns = prices[self.tickers].pct_change().dropna().tail(self.lookback_days)

        P, Q, Omega = self._build_views(returns)

        market_caps = np.array([
            self.MARKET_CAPS.get(t, 1000) for t in self.tickers
        ], dtype=float)

        result = self.bl_model.run_bl_optimization(
            returns=returns,
            P=P,
            Q=Q,
            Omega=Omega,
            market_caps=market_caps,
            min_weight=0.05,
            max_weight=0.30,
        )

        raw_weights: np.ndarray = result["weights"]
        assets: List[str]       = result["asset_names"]

        weight_bps = [int(w * 10_000) for w in raw_weights]

        # Adjust rounding so sum == exactly 10_000
        diff = 10_000 - sum(weight_bps)
        if diff != 0:
            weight_bps[int(np.argmax(raw_weights))] += diff

        logger.info("BL rebalance weights (bps):")
        for t, w in zip(assets, weight_bps):
            logger.info(f"  {t}: {w} bps ({w/100:.2f}%)")

        return assets, weight_bps

    # ── Private helpers ───────────────────────────────────────────────────────

    def _get_on_chain_weights(self) -> Dict[str, float]:
        """Fetch portfolio weights from the smart contract."""
        assets = self.fund_contract.functions.getAssets().call()
        if not assets:
            return {}
        weights = {}
        for asset in assets:
            bps = self.fund_contract.functions.weights(asset).call()
            weights[asset] = bps / 10_000
        return weights

    def _compute_portfolio_return(
        self,
        weights: Dict[str, float],
        start: datetime,
        end: datetime,
    ) -> float:
        """Compute weighted portfolio return over [start, end]."""
        tickers = list(weights.keys())
        start_str = (start - timedelta(days=5)).strftime("%Y-%m-%d")  # buffer for weekends
        end_str   = end.strftime("%Y-%m-%d")

        try:
            data = yf.download(tickers, start=start_str, end=end_str, progress=False)
            prices = data["Close"] if isinstance(data.columns, pd.MultiIndex) else data
        except Exception as exc:
            logger.error(f"yfinance download failed: {exc}")
            return 0.0

        if prices.empty or len(prices) < 2:
            logger.warning("Insufficient price data for return calculation")
            return 0.0

        first_prices = prices.iloc[0]
        last_prices  = prices.iloc[-1]

        portfolio_return = 0.0
        for ticker, weight in weights.items():
            if ticker in first_prices.index and ticker in last_prices.index:
                p0 = first_prices[ticker]
                p1 = last_prices[ticker]
                if p0 > 0:
                    portfolio_return += weight * (p1 / p0 - 1.0)

        return portfolio_return

    def _build_views(
        self,
        returns: pd.DataFrame,
    ) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        """
        Build P, Q, Omega matrices for the BL model.

        Uses LLM-generated views if the generator is available;
        otherwise falls back to neutral (equal-weight market prior, no views).
        """
        n_assets = len(self.tickers)

        if self.llm_generator is None:
            # No LLM: return trivial identity views with zero expected return
            P     = np.eye(n_assets)
            Q     = np.zeros(n_assets)
            Omega = np.eye(n_assets) * 0.1
            return P, Q, Omega

        # Build per-ticker context strings (last 30 days of returns)
        contexts: Dict[str, str] = {}
        for ticker in self.tickers:
            if ticker not in returns.columns:
                continue
            r = returns[ticker].tail(30)
            ctx_lines = [
                f"Ticker: {ticker}",
                f"30-day cumulative return: {(1 + r).prod() - 1:.2%}",
                f"30-day volatility (annualised): {r.std() * np.sqrt(252):.2%}",
                f"7-day return: {(1 + r.tail(7)).prod() - 1:.2%}",
            ]
            contexts[ticker] = "\n".join(ctx_lines)

        views_df = self.llm_generator.generate_views_batch(
            tickers=self.tickers,
            contexts=contexts,
        )

        P, Q = self.llm_generator.convert_to_bl_format(
            views_df=views_df,
            tickers=self.tickers,
        )

        covariance = returns.cov().values
        Omega = self.llm_generator.calculate_omega(
            views_df=views_df.head(len(Q)),
            covariance=covariance,
            P=P,
            tau=0.15,
        )

        return P, Q, Omega
