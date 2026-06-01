import os
import sys
import signal
import time
import logging
from datetime import datetime, timezone

from worker.collector import collect_positions
from worker.jobs import JOBS

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger("worker")

INTERVAL_S = 30


def check_scheduled_jobs(last_run: dict):
    now = datetime.now(timezone.utc)
    hour = now.hour
    weekday = now.weekday()  # 0=Monday
    today_key = now.strftime("%Y-%m-%d")

    for job in JOBS:
        if hour != job["hour"]:
            continue
        if job.get("day_of_week") is not None and weekday != job["day_of_week"]:
            continue
        run_key = f"{today_key}:{job['name']}"
        if last_run.get(job["name"]) == run_key:
            continue
        last_run[job["name"]] = run_key

        log.info(f"[scheduler] Starting {job['name']}...")
        try:
            job["fn"]()
            log.info(f"[scheduler] {job['name']} completed")
        except Exception as e:
            log.error(f"[scheduler] {job['name']} failed: {e}")


def main():
    # CLI mode: run a specific job
    if len(sys.argv) >= 3 and sys.argv[1] == "run":
        job_name = sys.argv[2]
        job = next((j for j in JOBS if j["name"] == job_name), None)
        if not job:
            log.error(f"Unknown job: {job_name}")
            log.info(f"Available: {', '.join(j['name'] for j in JOBS)}")
            sys.exit(1)
        log.info(f"[run] Executing {job_name}...")
        job["fn"]()
        log.info(f"[run] {job_name} completed")
        return

    log.info("=== PortoMove Worker (Python/DuckDB) ===")
    log.info(f"Collection interval: {INTERVAL_S}s")
    log.info("Scheduled jobs:")
    days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    for job in JOBS:
        day = days[job["day_of_week"]] if job.get("day_of_week") is not None else "daily"
        log.info(f"  - {job['name']}: {job['hour']:02d}:00 UTC ({day})")

    running = True

    def shutdown(*_):
        nonlocal running
        running = False

    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)

    last_run: dict = {}
    total_collected = 0
    total_cycles = 0
    total_errors = 0

    while running:
        try:
            n = collect_positions()
            total_collected += n
            total_cycles += 1
            if total_cycles % 10 == 0:
                log.info(f"[collect] cycle {total_cycles}: {n} positions | total: {total_collected}, errors: {total_errors}")
            else:
                log.info(f"[collect] {n} positions")
        except Exception as e:
            total_errors += 1
            log.error(f"[collect] Failed: {e}")

        check_scheduled_jobs(last_run)

        # Sleep in small increments to allow signal handling
        for _ in range(INTERVAL_S):
            if not running:
                break
            time.sleep(1)

    log.info(f"Shutdown. Total: {total_collected} positions in {total_cycles} cycles, {total_errors} errors.")


if __name__ == "__main__":
    main()
