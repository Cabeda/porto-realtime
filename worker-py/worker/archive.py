"""Archive positions: convert yesterday's R2 JSON snapshots to a single Parquet file."""
import logging
import time
from datetime import datetime, timezone, timedelta

from worker.db import get_duck, r2_bucket_url
from worker.r2 import get_r2, BUCKET

log = logging.getLogger("worker")


def run_archive_positions() -> None:
    start = time.time()
    yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).date()
    date_path = yesterday.strftime("%Y/%m/%d")
    parquet_key = f"positions/{date_path}.parquet"

    r2 = get_r2()

    # Check if already archived
    try:
        r2.head_object(Bucket=BUCKET, Key=parquet_key)
        log.info("[archive] %s already exists — skipping", parquet_key)
        return
    except r2.exceptions.ClientError:
        pass

    # Check if snapshots exist
    prefix = f"snapshots/{date_path}/"
    resp = r2.list_objects_v2(Bucket=BUCKET, Prefix=prefix, MaxKeys=1)
    if not resp.get("Contents"):
        log.info("[archive] No snapshots for %s", yesterday)
        return

    db = get_duck()
    bucket_url = r2_bucket_url()
    r2_src = f"{bucket_url}/{prefix}*.json"

    log.info("[archive] Reading %s", r2_src)

    # Read all snapshots and write as Parquet directly to R2
    # Column names match what aggregate.py expects for direct Parquet read
    db.execute(f"""
        COPY (
            SELECT
                recordedAt::TIMESTAMP AS recorded_at,
                p.vehicleId AS vehicle_id,
                p.vehicleNum AS vehicle_num,
                p.route AS route,
                p.tripId AS trip_id,
                p.directionId::SMALLINT AS direction_id,
                p.lat::DOUBLE AS lat,
                p.lon::DOUBLE AS lon,
                p.speed::FLOAT AS speed,
                p.heading::FLOAT AS heading
            FROM (
                SELECT unnest(positions) AS p, recordedAt
                FROM read_json('{r2_src}', format='auto', union_by_name=true)
            )
        ) TO '{bucket_url}/{parquet_key}' (FORMAT PARQUET, COMPRESSION ZSTD)
    """)

    elapsed = time.time() - start
    log.info("[archive] Wrote %s in %.1fs", parquet_key, elapsed)
