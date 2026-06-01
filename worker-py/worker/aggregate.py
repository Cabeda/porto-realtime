"""Aggregate daily job: reads R2 snapshots via DuckDB httpfs, processes, writes to Neon."""
import logging
import os
import time
from datetime import datetime, timezone, timedelta

from worker.db import get_duck, attach_neon, r2_bucket_url
from worker.r2 import get_r2, BUCKET

log = logging.getLogger("worker")


def run_aggregate_daily():
    start = time.time()

    # Support DATE env var for backfills
    date_str = os.getenv("DATE")
    if date_str:
        yesterday = datetime.strptime(date_str, "%Y-%m-%d").date()
    else:
        yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).date()

    date_str = yesterday.isoformat()
    date_path = yesterday.strftime("%Y/%m/%d")
    log.info(f"[aggregate] Starting for {date_str}")

    # Check if snapshots exist
    r2 = get_r2()
    prefix = f"snapshots/{date_path}/"
    resp = r2.list_objects_v2(Bucket=BUCKET, Prefix=prefix, MaxKeys=1)
    if not resp.get("Contents"):
        log.info(f"[aggregate] No snapshots for {date_str}")
        return

    db = get_duck()
    attach_neon(db)

    bucket_url = r2_bucket_url()
    s3_path = f"{bucket_url}/{prefix}*.json"

    # Load all snapshots into a local table via httpfs
    log.info(f"[aggregate] Reading snapshots from {s3_path}")
    db.execute(f"""
        CREATE TABLE positions AS
        SELECT
            unnest(positions) AS p,
            recordedAt::TIMESTAMP AS recorded_at
        FROM read_json('{s3_path}', format='auto', union_by_name=true)
    """)
    db.execute("""
        CREATE TABLE pos AS
        SELECT
            recorded_at,
            p.vehicleId AS vehicle_id,
            p.vehicleNum AS vehicle_num,
            p.route AS route,
            p.tripId AS trip_id,
            p.directionId::SMALLINT AS direction_id,
            p.lat::DOUBLE AS lat,
            p.lon::DOUBLE AS lon,
            p.speed::FLOAT AS speed
        FROM positions
        WHERE p.route IS NOT NULL AND p.route != ''
    """)
    db.execute("DROP TABLE positions")

    total = db.execute("SELECT count(*) FROM pos").fetchone()[0]
    log.info(f"[aggregate] Loaded {total} positions")

    # Trip reconstruction: group by vehicle+route+direction, split on >10min gaps
    db.execute("""
        CREATE TABLE trips AS
        WITH ordered AS (
            SELECT *,
                ROW_NUMBER() OVER (PARTITION BY vehicle_id, route, direction_id ORDER BY recorded_at) AS rn,
                LAG(recorded_at) OVER (PARTITION BY vehicle_id, route, direction_id ORDER BY recorded_at) AS prev_at
            FROM pos
        ),
        trip_boundaries AS (
            SELECT *,
                SUM(CASE WHEN prev_at IS NULL OR EPOCH(recorded_at - prev_at) > 600 THEN 1 ELSE 0 END)
                    OVER (PARTITION BY vehicle_id, route, direction_id ORDER BY recorded_at) AS trip_num
            FROM ordered
        )
        SELECT
            vehicle_id,
            FIRST(vehicle_num) AS vehicle_num,
            route,
            FIRST(trip_id) AS trip_id,
            direction_id,
            MIN(recorded_at) AS started_at,
            MAX(recorded_at) AS ended_at,
            EXTRACT(EPOCH FROM MAX(recorded_at) - MIN(recorded_at))::INTEGER AS runtime_secs,
            COUNT(*) AS positions,
            ROUND(AVG(CASE WHEN speed > 0 THEN speed END), 1) AS avg_speed
        FROM trip_boundaries
        GROUP BY vehicle_id, route, direction_id, trip_num
        HAVING COUNT(*) >= 3
    """)

    trip_count = db.execute("SELECT count(*) FROM trips").fetchone()[0]
    log.info(f"[aggregate] Reconstructed {trip_count} trips")

    # Route performance daily
    db.execute("""
        CREATE TABLE route_perf AS
        SELECT
            route,
            direction_id,
            COUNT(*) AS trips_observed,
            ROUND(AVG(runtime_secs), 0)::INTEGER AS avg_runtime_secs,
            ROUND(AVG(avg_speed), 1) AS avg_commercial_speed
        FROM trips
        WHERE runtime_secs > 60
        GROUP BY route, direction_id
    """)

    # Network summary
    db.execute("""
        CREATE TABLE network_summary AS
        SELECT
            COUNT(DISTINCT vehicle_id) AS active_vehicles,
            COUNT(*) AS total_trips,
            ROUND(AVG(avg_speed), 1) AS avg_commercial_speed
        FROM trips
    """)

    # Write to Neon in a single transaction
    log.info("[aggregate] Writing to Neon...")
    db.execute(f"CALL postgres_execute('neon', 'BEGIN')")
    try:
        db.execute(f"CALL postgres_execute('neon', 'DELETE FROM \"TripLog\" WHERE date = ''{date_str}''')")
        db.execute(f"""
            INSERT INTO neon."TripLog" (date, "vehicleId", "vehicleNum", route, "tripId", "directionId", "startedAt", "endedAt", "runtimeSecs", positions, "avgSpeed")
            SELECT '{date_str}'::DATE, vehicle_id, vehicle_num, route, trip_id, direction_id, started_at, ended_at, runtime_secs, positions, avg_speed
            FROM trips
        """)

        db.execute(f"CALL postgres_execute('neon', 'DELETE FROM \"RoutePerformanceDaily\" WHERE date = ''{date_str}''')")
        db.execute(f"""
            INSERT INTO neon."RoutePerformanceDaily" (date, route, "directionId", "tripsObserved", "avgRuntimeSecs", "avgCommercialSpeed")
            SELECT '{date_str}'::DATE, route, direction_id, trips_observed, avg_runtime_secs, avg_commercial_speed
            FROM route_perf
        """)

        # Network summary upsert via postgres_execute
        ns = db.execute("SELECT * FROM network_summary").fetchone()
        db.execute(f"""CALL postgres_execute('neon', '
            INSERT INTO "NetworkSummaryDaily" (date, "activeVehicles", "totalTrips", "avgCommercialSpeed", "positionsCollected")
            VALUES (''{date_str}'', {ns[0]}, {ns[1]}, {ns[2] or "NULL"}, {total})
            ON CONFLICT (date) DO UPDATE SET
                "activeVehicles" = EXCLUDED."activeVehicles",
                "totalTrips" = EXCLUDED."totalTrips",
                "avgCommercialSpeed" = EXCLUDED."avgCommercialSpeed",
                "positionsCollected" = EXCLUDED."positionsCollected"
        ')""")

        db.execute(f"CALL postgres_execute('neon', 'COMMIT')")
    except Exception:
        db.execute(f"CALL postgres_execute('neon', 'ROLLBACK')")
        raise

    elapsed = time.time() - start
    log.info(f"[aggregate] Complete for {date_str}: {total} positions, {trip_count} trips in {elapsed:.1f}s")
