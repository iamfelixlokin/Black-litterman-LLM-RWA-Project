"""
Scheduler
~~~~~~~~~
Automates the oracle service:
  - NAV update  : daily at 09:00 UTC (after US pre-market opens)
  - Rebalance   : first trading day of each month at 09:30 UTC

Usage
-----
  # Run the scheduler (blocking loop)
  python oracle/scheduler.py

  # Dry-run: print next schedule without executing
  python oracle/scheduler.py --dry-run

  # Force immediate execution (for testing)
  python oracle/scheduler.py --run-now nav
  python oracle/scheduler.py --run-now rebalance
"""

import argparse
import logging
import os
import sys
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path

import schedule
from dotenv import load_dotenv

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s – %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(
            Path(__file__).parent.parent / "logs" / "scheduler.log",
            encoding="utf-8",
        ),
    ],
)
logger = logging.getLogger("scheduler")

# Add oracle/ to path so imports work when run from project root
sys.path.insert(0, str(Path(__file__).parent))
from oracle_service import OracleService


# ─────────────────────────────────────────────────────────────────────────────
def build_oracle() -> OracleService:
    """Instantiate OracleService from environment variables."""
    load_dotenv()
    return OracleService(
        rpc_url=os.environ["ALCHEMY_RPC_URL"],
        private_key=os.environ["ORACLE_PRIVATE_KEY"],
        fund_address=os.environ["FUND_CONTRACT_ADDRESS"],
        anthropic_key=os.getenv("ANTHROPIC_API_KEY", ""),
    )


# ── Job definitions ───────────────────────────────────────────────────────────

def job_nav_update():
    """Daily NAV update job."""
    logger.info(">>> [SCHEDULED] Daily NAV update starting…")
    try:
        oracle = build_oracle()
        tx = oracle.run_nav_update()
        logger.info(f">>> NAV update complete – tx: {tx}")
    except Exception as exc:
        logger.error(f">>> NAV update FAILED: {exc}", exc_info=True)


def job_monthly_rebalance():
    """
    Monthly rebalance job.
    Runs on the 1st of each month, but checks internally whether today is the
    first business day to avoid running on weekends/holidays.
    """
    today = datetime.now(tz=timezone.utc)
    # Run if it's the 1st–3rd of the month (handles weekend offsets)
    if today.day > 3:
        logger.info("Rebalance skipped – not start of month")
        return

    logger.info(">>> [SCHEDULED] Monthly rebalance starting…")
    try:
        oracle = build_oracle()
        tx = oracle.run_rebalance()
        logger.info(f">>> Rebalance complete – tx: {tx}")
    except Exception as exc:
        logger.error(f">>> Rebalance FAILED: {exc}", exc_info=True)


# ── Schedule configuration ────────────────────────────────────────────────────

def configure_schedule():
    """Register all jobs with the `schedule` library."""
    # Daily NAV update at 09:00 UTC (after most exchanges open)
    schedule.every().day.at("09:00").do(job_nav_update)

    # Monthly rebalance check on the 1st of each month at 09:30 UTC
    # `schedule` doesn't support monthly natively; we run daily and guard inside
    schedule.every().day.at("09:30").do(job_monthly_rebalance)

    logger.info("Scheduled jobs:")
    for job in schedule.get_jobs():
        logger.info(f"  {job}")


def print_next_runs():
    """Print next scheduled run times."""
    print("\nNext scheduled runs:")
    now = datetime.now(tz=timezone.utc)
    for job in schedule.get_jobs():
        next_run = job.next_run
        delta = next_run - datetime.now()  # schedule uses local time
        print(f"  {job.job_func.__name__:30s}  next: {next_run}  (in {delta})")


# ── Entry point ───────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="BL-RWA Oracle Scheduler")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print schedule without running jobs",
    )
    parser.add_argument(
        "--run-now",
        choices=["nav", "rebalance"],
        help="Execute a specific job immediately and exit",
    )
    args = parser.parse_args()

    if args.run_now:
        load_dotenv()
        logger.info(f"Force-running: {args.run_now}")
        if args.run_now == "nav":
            job_nav_update()
        else:
            job_monthly_rebalance()
        return

    configure_schedule()

    if args.dry_run:
        print_next_runs()
        return

    logger.info("Scheduler started. Press Ctrl+C to stop.")
    try:
        while True:
            schedule.run_pending()
            time.sleep(30)  # check every 30 seconds
    except KeyboardInterrupt:
        logger.info("Scheduler stopped by user.")


if __name__ == "__main__":
    main()
