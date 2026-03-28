"""
Oracle Service
~~~~~~~~~~~~~~
Connects the Black-Litterman strategy to the RWAFund smart contract.

Responsibilities
----------------
- Pull latest NAV from the BL model and push it on-chain via updateNAV()
- Monthly: run the BL rebalance and push new weights via updateRebalance()

Usage
-----
  # One-off NAV update
  python oracle/oracle_service.py --action nav

  # Monthly rebalance (also updates NAV)
  python oracle/oracle_service.py --action rebalance

  # Both
  python oracle/oracle_service.py --action both

Environment variables (see .env.example)
-----------------------------------------
  ALCHEMY_RPC_URL          Polygon Amoy Alchemy RPC
  ORACLE_PRIVATE_KEY       Private key of the ORACLE_ROLE wallet
  FUND_CONTRACT_ADDRESS    Deployed RWAFund address
  ANTHROPIC_API_KEY        (optional) enables LLM views
"""

import argparse
import json
import logging
import os
import sys
import time
from pathlib import Path

from dotenv import load_dotenv
from web3 import Web3
from web3.middleware import ExtraDataToPOAMiddleware

from nav_calculator import NAVCalculator
from alpaca_trader import AlpacaTrader

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s – %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(
            Path(__file__).parent.parent / "logs" / "oracle.log",
            encoding="utf-8",
        ),
    ],
)
logger = logging.getLogger("oracle")


# ─────────────────────────────────────────────────────────────────────────────
class OracleService:
    """
    Signs and submits oracle transactions to the RWAFund contract.

    Parameters
    ----------
    rpc_url       : Alchemy (or any) JSON-RPC URL for Polygon Amoy
    private_key   : Oracle wallet private key (must hold ORACLE_ROLE)
    fund_address  : Deployed RWAFund contract address
    anthropic_key : Anthropic API key (empty = no LLM views)
    tickers       : Asset ticker list (must match on-chain expectations)
    """

    CHAIN_ID = 80002  # Polygon Amoy

    # Gas limits for each tx type
    GAS_UPDATE_NAV       = 120_000
    GAS_UPDATE_REBALANCE = 400_000

    def __init__(
        self,
        rpc_url: str,
        private_key: str,
        fund_address: str,
        anthropic_key: str = "",
        alpaca_api_key: str = "",
        alpaca_secret_key: str = "",
        tickers: list[str] | None = None,
    ):
        # ── Web3 ──────────────────────────────────────────────────────────────
        self.w3 = Web3(Web3.HTTPProvider(rpc_url))
        # Polygon uses PoA consensus – inject middleware so extra data is handled
        self.w3.middleware_onion.inject(ExtraDataToPOAMiddleware, layer=0)

        if not self.w3.is_connected():
            raise ConnectionError(f"Cannot connect to RPC: {rpc_url}")
        logger.info(f"Connected to chain {self.w3.eth.chain_id} via {rpc_url[:40]}…")

        # ── Wallet ────────────────────────────────────────────────────────────
        self.account = self.w3.eth.account.from_key(private_key)
        logger.info(f"Oracle wallet: {self.account.address}")

        # ── Contract ──────────────────────────────────────────────────────────
        abi = self._load_abi()
        self.fund = self.w3.eth.contract(
            address=Web3.to_checksum_address(fund_address),
            abi=abi,
        )

        # ── NAV Calculator ────────────────────────────────────────────────────
        self.tickers = tickers or ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "TSLA", "META"]
        self.nav_calc = NAVCalculator(
            tickers=self.tickers,
            fund_contract=self.fund,
            anthropic_api_key=anthropic_key,
        )

        # ── Alpaca (optional) ─────────────────────────────────────────────────
        self.alpaca: AlpacaTrader | None = None
        if alpaca_api_key and alpaca_secret_key:
            self.alpaca = AlpacaTrader(alpaca_api_key, alpaca_secret_key)
            logger.info("Alpaca paper trading enabled – NAV sourced from live portfolio")

    # ── Public entry points ───────────────────────────────────────────────────

    def run_nav_update(self) -> str:
        """Calculate new NAV and push it on-chain. Returns tx hash."""
        logger.info("=== NAV Update ===")

        # Prefer live Alpaca portfolio value; fall back to price-based calc
        if self.alpaca:
            new_nav, total_aum = self.alpaca.get_nav_usdc_int()
            logger.info("NAV source: Alpaca paper portfolio")
        else:
            new_nav, total_aum = self.nav_calc.compute_nav()
            logger.info("NAV source: yfinance price model")

        logger.info(f"New NAV   : ${new_nav / 1e6:.6f} USDC")
        logger.info(f"Total AUM : ${total_aum / 1e6:,.2f} USDC")

        tx_hash = self._send_tx(
            self.fund.functions.updateNAV(new_nav, total_aum),
            gas=self.GAS_UPDATE_NAV,
        )
        logger.info(f"NAV updated – tx: {tx_hash}")
        return tx_hash

    def run_rebalance(self) -> str:
        """Run BL model, push new weights, and also update NAV. Returns tx hash."""
        logger.info("=== Monthly Rebalance ===")

        assets, weight_bps = self.nav_calc.compute_rebalance_weights()
        logger.info(f"Submitting {len(assets)} assets to updateRebalance…")

        # Execute trades on Alpaca paper account if available
        if self.alpaca:
            target = {a: w / 10_000 for a, w in zip(assets, weight_bps)}
            self.alpaca.rebalance(target)
            logger.info("Alpaca paper trades submitted")

        tx_hash = self._send_tx(
            self.fund.functions.updateRebalance(assets, weight_bps),
            gas=self.GAS_UPDATE_REBALANCE,
        )
        logger.info(f"Rebalance stored on-chain – tx: {tx_hash}")

        # Push fresh NAV after rebalance
        self.run_nav_update()

        return tx_hash

    # ── Transaction helper ────────────────────────────────────────────────────

    def _send_tx(self, fn, gas: int, retries: int = 3) -> str:
        """
        Build, sign, and broadcast a transaction.  Retries on nonce/gas errors.
        Returns the hex transaction hash on success.
        """
        for attempt in range(1, retries + 1):
            try:
                nonce = self.w3.eth.get_transaction_count(
                    self.account.address, "pending"
                )
                # EIP-1559 fees – use slightly generous values for Polygon Amoy
                base_fee     = self.w3.eth.gas_price
                max_priority = self.w3.to_wei("30", "gwei")
                max_fee      = base_fee * 2 + max_priority

                raw_tx = fn.build_transaction({
                    "from":                  self.account.address,
                    "nonce":                 nonce,
                    "gas":                   gas,
                    "maxFeePerGas":          max_fee,
                    "maxPriorityFeePerGas":  max_priority,
                    "chainId":               self.CHAIN_ID,
                })

                signed   = self.w3.eth.account.sign_transaction(raw_tx, self.account.key)
                tx_hash  = self.w3.eth.send_raw_transaction(signed.raw_transaction)
                receipt  = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)

                if receipt.status == 0:
                    raise RuntimeError(f"Transaction reverted: {tx_hash.hex()}")

                return tx_hash.hex()

            except Exception as exc:
                logger.warning(f"Attempt {attempt}/{retries} failed: {exc}")
                if attempt < retries:
                    time.sleep(5 * attempt)
                else:
                    raise

    # ── ABI loader ────────────────────────────────────────────────────────────

    @staticmethod
    def _load_abi() -> list:
        """Load RWAFund ABI from Hardhat artifact."""
        artifact_path = (
            Path(__file__).parent.parent
            / "artifacts"
            / "contracts"
            / "RWAFund.sol"
            / "RWAFund.json"
        )
        if not artifact_path.exists():
            raise FileNotFoundError(
                f"ABI not found at {artifact_path}. "
                "Run `npx hardhat compile` first."
            )
        with open(artifact_path) as fh:
            return json.load(fh)["abi"]


# ── CLI ───────────────────────────────────────────────────────────────────────
def main():
    load_dotenv()

    parser = argparse.ArgumentParser(description="BL-RWA Oracle Service")
    parser.add_argument(
        "--action",
        choices=["nav", "rebalance", "both"],
        default="nav",
        help="Action to perform (default: nav)",
    )
    args = parser.parse_args()

    rpc_url      = os.environ["ALCHEMY_RPC_URL"]
    private_key  = os.environ["ORACLE_PRIVATE_KEY"]
    fund_address = os.environ["FUND_CONTRACT_ADDRESS"]
    anthropic_key = os.getenv("ANTHROPIC_API_KEY", "")

    oracle = OracleService(
        rpc_url=rpc_url,
        private_key=private_key,
        fund_address=fund_address,
        anthropic_key=anthropic_key,
        alpaca_api_key=os.getenv("ALPACA_API_KEY", ""),
        alpaca_secret_key=os.getenv("ALPACA_SECRET_KEY", ""),
    )

    if args.action in ("nav", "both"):
        oracle.run_nav_update()

    if args.action in ("rebalance", "both"):
        oracle.run_rebalance()

    logger.info("Oracle run complete.")


if __name__ == "__main__":
    main()
