from worker.aggregate import run_aggregate_daily
from worker.archive import run_archive_positions
from worker.schedule import run_snapshot_schedule, run_cleanup_positions, run_refresh_segments

JOBS = [
    {"name": "snapshot-schedule", "hour": 1, "fn": run_snapshot_schedule},
    {"name": "aggregate-daily", "hour": 3, "fn": run_aggregate_daily},
    {"name": "archive-positions", "hour": 3, "fn": run_archive_positions},
    {"name": "cleanup-positions", "hour": 4, "fn": run_cleanup_positions},
    {"name": "refresh-segments", "hour": 5, "day_of_week": 0, "fn": run_refresh_segments},  # Monday
]
