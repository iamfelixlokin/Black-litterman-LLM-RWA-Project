"""
Alpaca Paper Trading Integration
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Executes the BL rebalance on Alpaca's paper trading account,
then computes the real NAV from the actual portfolio value.

Setup:
  pip install alpaca-py

Keys (add to .env):
  ALPACA_API_KEY    – from paper.alpaca.markets → API Keys
  ALPACA_SECRET_KEY – same page
"""

import logging
import os
import time
from typing import Dict, List, Tuple

from alpaca.trading.client import TradingClient
from alpaca.trading.requests import MarketOrderRequest
from alpaca.trading.enums import OrderSide, TimeInForce
from alpaca.data.historical import StockHistoricalDataClient
from alpaca.data.requests import StockLatestQuoteRequest

logger = logging.getLogger(__name__)

# Initial fund capital (paper trading starts with $100k by default on Alpaca)
INITIAL_CAPITAL_USD = 100_000.0


class AlpacaTrader:
    """
    Wraps Alpaca paper trading API.

    Responsibilities:
    - Execute monthly rebalance orders based on BL target weights
    - Compute current portfolio NAV from live Alpaca account equity
    """

    def __init__(self, api_key: str, secret_key: str):
        self.trading = TradingClient(
            api_key=api_key,
            secret_key=secret_key,
            paper=True,          # always paper trading
        )
        self.data = StockHistoricalDataClient(
            api_key=api_key,
            secret_key=secret_key,
        )
        logger.info("Alpaca paper trading client initialised")

    # ── NAV ──────────────────────────────────────────────────────────────────

    def get_portfolio_nav(self) -> Tuple[float, float]:
        """
        Returns (nav_per_token, total_equity_usd).

        nav_per_token is scaled so that $100 = initial NAV, matching the
        on-chain INITIAL_NAV of 100e6 (USDC 6-decimal representation).

        The caller should convert nav_per_token → int by multiplying by 1e6.
        """
        account = self.trading.get_account()
        equity  = float(account.equity)
        cash    = float(account.cash)
        logger.info(f"Alpaca equity: ${equity:,.2f}  cash: ${cash:,.2f}")

        # NAV relative to initial capital
        nav_per_token = 100.0 * (equity / INITIAL_CAPITAL_USD)
        return nav_per_token, equity

    def get_nav_usdc_int(self) -> Tuple[int, int]:
        """
        Returns (nav_int, total_aum_int) in USDC 6-decimal integers,
        ready to pass directly to RWAFund.updateNAV().
        """
        nav_float, equity = self.get_portfolio_nav()
        nav_int = int(nav_float * 1e6)       # e.g. $103.52 → 103_520_000
        aum_int = int(equity   * 1e6)        # total AUM in USDC micro-units
        return nav_int, aum_int

    # ── Positions ─────────────────────────────────────────────────────────────

    def get_current_weights(self) -> Dict[str, float]:
        """Return current portfolio weights by symbol {AAPL: 0.15, ...}."""
        account   = self.trading.get_account()
        equity    = float(account.equity)
        positions = self.trading.get_all_positions()

        weights: Dict[str, float] = {}
        for pos in positions:
            market_value = float(pos.market_value)
            weights[pos.symbol] = market_value / equity if equity > 0 else 0.0

        return weights

    # ── Rebalance ─────────────────────────────────────────────────────────────

    def rebalance(self, target_weights: Dict[str, float]) -> List[dict]:
        """
        Rebalance the paper portfolio to match target_weights.

        Steps:
        1. Get current positions & account equity
        2. Compute target USD value per symbol
        3. Get latest quotes
        4. Calculate share differences
        5. Submit market orders (sells first, then buys)

        Returns list of submitted order dicts.
        """
        account  = self.trading.get_account()
        equity   = float(account.equity)
        logger.info(f"Rebalancing ${equity:,.2f} portfolio to targets: {target_weights}")

        # Current positions
        current_weights = self.get_current_weights()

        # Latest prices
        symbols = list(target_weights.keys())
        quotes  = self._get_latest_prices(symbols)

        orders_submitted = []

        # --- Sells first ---
        for symbol, target_w in target_weights.items():
            current_w  = current_weights.get(symbol, 0.0)
            price      = quotes.get(symbol)
            if price is None or price <= 0:
                logger.warning(f"No price for {symbol}, skipping")
                continue

            target_usd  = equity * target_w
            current_usd = equity * current_w
            delta_usd   = target_usd - current_usd

            if delta_usd < -50:  # sell (ignore tiny diffs < $50)
                qty = abs(delta_usd) / price
                order = self._submit_order(symbol, qty, OrderSide.SELL)
                if order:
                    orders_submitted.append(order)

        # Small pause to let sells settle
        if orders_submitted:
            time.sleep(2)

        # --- Buys ---
        for symbol, target_w in target_weights.items():
            current_w  = current_weights.get(symbol, 0.0)
            price      = quotes.get(symbol)
            if price is None or price <= 0:
                continue

            target_usd  = equity * target_w
            current_usd = equity * current_w
            delta_usd   = target_usd - current_usd

            if delta_usd > 50:  # buy
                qty = delta_usd / price
                order = self._submit_order(symbol, qty, OrderSide.BUY)
                if order:
                    orders_submitted.append(order)

        logger.info(f"Submitted {len(orders_submitted)} orders")
        return orders_submitted

    def close_all_positions(self):
        """Emergency: liquidate entire portfolio."""
        logger.warning("Closing all positions!")
        self.trading.close_all_positions(cancel_orders=True)

    # ── Private ───────────────────────────────────────────────────────────────

    def _get_latest_prices(self, symbols: List[str]) -> Dict[str, float]:
        """Fetch latest ask price for a list of symbols."""
        req    = StockLatestQuoteRequest(symbol_or_symbols=symbols)
        quotes = self.data.get_stock_latest_quote(req)
        prices = {}
        for sym, q in quotes.items():
            price = float(q.ask_price or q.bid_price or 0)
            if price > 0:
                prices[sym] = price
        return prices

    def _submit_order(self, symbol: str, qty: float, side: OrderSide) -> dict | None:
        """Submit a fractional market order."""
        qty = round(qty, 4)
        if qty <= 0:
            return None
        try:
            req = MarketOrderRequest(
                symbol=symbol,
                qty=qty,
                side=side,
                time_in_force=TimeInForce.DAY,
            )
            order = self.trading.submit_order(req)
            logger.info(f"  {side.value.upper():4s} {qty:.4f} {symbol} @ market")
            return {"symbol": symbol, "side": side.value, "qty": qty, "id": str(order.id)}
        except Exception as exc:
            logger.error(f"Order failed for {symbol}: {exc}")
            return None


# ── Quick test ────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import sys
    from dotenv import load_dotenv
    logging.basicConfig(level=logging.INFO)
    load_dotenv()

    trader = AlpacaTrader(
        api_key=os.environ["ALPACA_API_KEY"],
        secret_key=os.environ["ALPACA_SECRET_KEY"],
    )

    nav, aum = trader.get_nav_usdc_int()
    print(f"NAV  : ${nav / 1e6:.6f} USDC")
    print(f"AUM  : ${aum / 1e6:,.2f} USDC")
    print(f"Weights: {trader.get_current_weights()}")
