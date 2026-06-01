"""Aggregate daily job: reads Parquet/JSON from R2, processes in DuckDB, writes results to R2 Parquet + Neon."""
import logging
import os
import time
from datetime import datetime, timezone, timedelta

from worker.db import get_duck, attach_neon, r2_bucket_url
from worker.r2 import get_r2, BUCKET

log = logging.getLogger("worker")


def run_aggregate_daily() -> None:
    start = time.time()

    date_str = os.getenv("DATE")
    if date_str:
        yesterday = datetime.strptime(date_str, "%Y-%m-%d").date()
    else:
        yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).date()

    date_str = yesterday.isoformat()
    date_path = yesterday.strftime("%Y/%m/%d")
    log.info("[aggregate] Starting for %s", date_str)

    db = get_duck()
    bucket_url = r2_bucket_url()

    # Prefer Parquet (written by archive job at 02:00) over raw JSON
    parquet_path = f"{bucket_url}/positions/{date_path}.parquet"
    json_path = f"{bucket_url}/snapshots/{date_path}/*.json"

    try:
        db.execute(f"""
            CREATE TABLE pos AS
            SELECT recorded_at::TIMESTAMP AS recorded_at, vehicle_id, vehicle_num,
                   route, trip_id, direction_id, lat, lon, speed
            FROM read_parquet('{parquet_path}')
            WHERE route IS NOT NULL AND route != ''
            ORDER BY vehicle_id, route, direction_id, recorded_at
        """)
        log.info("[aggregate] Reading from Parquet archive")
    except Exception:
        # Fallback to JSON if Parquet not yet available
        log.info("[aggregate] Parquet not found, reading JSON snapshots")
        r2 = get_r2()
        prefix = f"snapshots/{date_path}/"
        resp = r2.list_objects_v2(Bucket=BUCKET, Prefix=prefix, MaxKeys=1)
        if not resp.get("Contents"):
            log.info("[aggregate] No snapshots for %s", date_str)
            return
        db.execute(f"""
            CREATE TABLE pos AS
            SELECT recorded_at, vehicle_id, vehicle_num, route, trip_id, direction_id, lat, lon, speed
            FROM (
                SELECT p.vehicleId AS vehicle_id, p.vehicleNum AS vehicle_num,
                       p.route AS route, p.tripId AS trip_id,
                       p.directionId::SMALLINT AS direction_id,
                       p.lat::DOUBLE AS lat, p.lon::DOUBLE AS lon,
                       p.speed::FLOAT AS speed,
                       recordedAt::TIMESTAMP AS recorded_at
                FROM (
                    SELECT unnest(positions) AS p, recordedAt
                    FROM read_json('{json_path}', format='auto', union_by_name=true)
                )
            )
            WHERE route IS NOT NULL AND route != ''
            ORDER BY vehicle_id, route, direction_id, recorded_at
        """)

    total = db.execute("SELECT count(*) FROM pos").fetchone()[0]
    log.info("[aggregate] Loaded %d positions", total)

    if total == 0:
        return

    # Trip reconstruction (pre-sorted data = streaming window pass)
    db.execute("""
        CREATE TABLE trips AS
        WITH trip_boundaries AS (
            SELECT *,
                SUM(CASE WHEN
                    LAG(recorded_at) OVER w IS NULL OR
                    EPOCH(recorded_at - LAG(recorded_at) OVER w) > 600
                THEN 1 ELSE 0 END) OVER w AS trip_num
            FROM pos
            WINDOW w AS (PARTITION BY vehicle_id, route, direction_id ORDER BY recorded_at)
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
    log.info("[aggregate] Reconstructed %d trips", trip_count)

    # Route performance
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

    # Write analytics to R2 as Parquet (zero Neon compute for reads)
    log.info("[aggregate] Writing analytics Parquet to R2...")
    db.execute(f"""
        COPY (SELECT '{date_str}'::DATE AS date, * FROM trips)
        TO '{bucket_url}/analytics/trips/{date_str}.parquet' (FORMAT PARQUET, COMPRESSION ZSTD)
    """)
    db.execute(f"""
        COPY (SELECT '{date_str}'::DATE AS date, * FROM route_perf)
        TO '{bucket_url}/analytics/route_perf/{date_str}.parquet' (FORMAT PARQUET, COMPRESSION ZSTD)
    """)

    # Also write to Neon for backward compatibility (minimal compute)
    attach_neon(db)
    db.execute("CALL postgres_execute('neon', 'BEGIN')")
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

        ns = db.execute("SELECT * FROM network_summary").fetchone()
        avg_speed_val = ns[2] if ns[2] is not None else "NULL"
        db.execute(f"""CALL postgres_execute('neon', '
            INSERT INTO "NetworkSummaryDaily" (date, "activeVehicles", "totalTrips", "avgCommercialSpeed", "positionsCollected")
            VALUES (''{date_str}'', {ns[0]}, {ns[1]}, {avg_speed_val}, {total})
            ON CONFLICT (date) DO UPDATE SET
                "activeVehicles" = EXCLUDED."activeVehicles",
                "totalTrips" = EXCLUDED."totalTrips",
                "avgCommercialSpeed" = EXCLUDED."avgCommercialSpeed",
                "positionsCollected" = EXCLUDED."positionsCollected"
        ')""")

        db.execute("CALL postgres_execute('neon', 'COMMIT')")
    except Exception:
        db.execute("CALL postgres_execute('neon', 'ROLLBACK')")
        raise

    elapsed = time.time() - start
    log.info("[aggregate] Complete for %s: %d positions, %d trips in %.1fs", date_str, total, trip_count, elapsed)
