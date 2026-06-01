"""PortoMove Worker — collects bus positions and runs daily aggregation jobs."""
import os
import sys
import signal
import time
import logging
from datetime import datetime, timezone

from worker.collector import collect_positions
from worker.jobs import JOBS, Job

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger("worker")

INTERVAL_S = int(os.getenv("COLLECT_INTERVAL_S", "30"))


def check_scheduled_jobs(last_run: dict[str, str]) -> None:
    now = datetime.now(timezone.utc)
    hour = now.hour
    weekday = now.weekday()
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

        log.info("[scheduler] Starting %s...", job["name"])
        try:
            job["fn"]()
            log.info("[scheduler] %s completed", job["name"])
        except Exception:
            log.exception("[scheduler] %s failed", job["name"])


def main() -> None:
    # CLI mode: run a specific job
    if len(sys.argv) >= 3 and sys.argv[1] == "run":
        job_name = sys.argv[2]
        job = next((j for j in JOBS if j["name"] == job_name), None)
        if not job:
            log.error("Unknown job: %s. Available: %s", job_name, ", ".join(j["name"] for j in JOBS))
            sys.exit(1)
        log.info("[run] Executing %s...", job_name)
        job["fn"]()
        log.info("[run] %s completed", job_name)
        return

    log.info("=== PortoMove Worker (Python/DuckDB) ===")
    log.info("Collection interval: %ds", INTERVAL_S)
    log.info("Scheduled jobs:")
    days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    for job in JOBS:
        day = days[job["day_of_week"]] if job.get("day_of_week") is not None else "daily"
        log.info("  - %s: %02d:00 UTC (%s)", job["name"], job["hour"], day)

    running = True

    def shutdown(*_: object) -> None:
        nonlocal running
        running = False

    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)

    last_run: dict[str, str] = {}
    total_collected = 0
    total_cycles = 0
    total_errors = 0

    while running:
        try:
            n = collect_positions()
            total_collected += n
            total_cycles += 1
            if total_cycles % 10 == 0:
                log.info("[collect] cycle %d: %d positions | total: %d, errors: %d", total_cycles, n, total_collected, total_errors)
            else:
                log.info("[collect] %d positions", n)
        except Exception:
            total_errors += 1
            log.exception("[collect] Failed")

        check_scheduled_jobs(last_run)

        for _ in range(INTERVAL_S):
            if not running:
                break
            time.sleep(1)

    log.info("Shutdown. Total: %d positions in %d cycles, %d errors.", total_collected, total_cycles, total_errors)


if __name__ == "__main__":
    main()
