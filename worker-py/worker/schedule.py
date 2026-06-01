"""Remaining scheduled jobs: snapshot-schedule, cleanup-positions, refresh-segments."""
import logging
import os
import time
from datetime import datetime, timezone, timedelta

import httpx

from worker.db import get_duck, attach_neon
from worker.r2 import get_r2, BUCKET

log = logging.getLogger("worker")

OTP_URL = os.getenv("OTP_URL", "https://otp.portodigital.pt/otp/routers/default/index/graphql")
OTP_HEADERS = {"Content-Type": "application/json", "Origin": "https://explore.porto.pt"}
_HTTP = httpx.Client(timeout=60, transport=httpx.HTTPTransport(retries=3))


def run_snapshot_schedule():
    """Fetch today's scheduled trips from OTP and store in ScheduledTripDaily."""
    start = time.time()

    # Porto local midnight
    now = datetime.now(timezone.utc)
    today = now.date()
    target_epoch = int(datetime(today.year, today.month, today.day, tzinfo=timezone.utc).timestamp())
    date_str = today.isoformat()

    log.info(f"[snapshot] Fetching OTP timetable for {date_str}")

    query = """{
        routes {
            shortName
            patterns {
                directionId
                trips { gtfsId activeDates }
            }
        }
    }"""

    resp = _HTTP.post(OTP_URL, json={"query": query}, headers=OTP_HEADERS)
    resp.raise_for_status()
    data = resp.json().get("data", {})
    routes = data.get("routes", [])

    if not routes:
        log.info("[snapshot] No routes from OTP")
        return

    rows = []
    for route in routes:
        short_name = route.get("shortName", "")
        if not short_name:
            continue
        for pattern in route.get("patterns", []):
            dir_id = pattern.get("directionId")
            for trip in pattern.get("trips", []):
                if target_epoch in (trip.get("activeDates") or []):
                    rows.append((short_name, dir_id, trip["gtfsId"]))

    log.info(f"[snapshot] Found {len(rows)} scheduled trips for {date_str}")
    if not rows:
        return

    db = get_duck()
    attach_neon(db)

    db.execute(f"CALL postgres_execute('neon', 'DELETE FROM \"ScheduledTripDaily\" WHERE date = ''{date_str}''')")

    db.execute("CREATE TABLE local_sched (route VARCHAR, direction_id SMALLINT, trip_id VARCHAR)")
    db.executemany("INSERT INTO local_sched VALUES (?, ?, ?)", rows)
    db.execute(f"""
        INSERT INTO neon."ScheduledTripDaily" (date, route, "directionId", "tripId")
        SELECT '{date_str}'::DATE, route, direction_id, trip_id FROM local_sched
    """)

    elapsed = time.time() - start
    log.info(f"[snapshot] Stored {len(rows)} trips in {elapsed:.1f}s")


def run_cleanup_positions():
    """Delete R2 snapshot objects older than 2 days."""
    start = time.time()
    cutoff = (datetime.now(timezone.utc) - timedelta(days=2)).date()
    r2 = get_r2()

    deleted = 0
    paginator = r2.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=BUCKET, Prefix="snapshots/"):
        for obj in page.get("Contents", []):
            key = obj["Key"]
            if key == "snapshots/today.json":
                continue
            # Extract date from snapshots/YYYY/MM/DD/...
            parts = key.replace("snapshots/", "").split("/")
            if len(parts) < 3:
                continue
            try:
                file_date = datetime(int(parts[0]), int(parts[1]), int(parts[2])).date()
            except (ValueError, IndexError):
                continue
            if file_date < cutoff:
                r2.delete_object(Bucket=BUCKET, Key=key)
                deleted += 1

    elapsed = time.time() - start
    log.info(f"[cleanup] Deleted {deleted} snapshots older than {cutoff} in {elapsed:.1f}s")


def run_refresh_segments():
    """Refresh route segments and stops from OTP."""
    start = time.time()
    log.info("[segments] Refreshing from OTP...")

    query = """query {
        routes {
            shortName
            patterns {
                directionId
                patternGeometry { points }
                stops { gtfsId name lat lon }
            }
        }
    }"""

    resp = _HTTP.post(OTP_URL, json={"query": query}, headers=OTP_HEADERS)
    resp.raise_for_status()
    routes = resp.json().get("data", {}).get("routes", [])

    if not routes:
        log.warning("[segments] No routes from OTP")
        return

    db = get_duck()
    attach_neon(db)

    # Collect all stops into a local table, then bulk insert to Neon
    db.execute("CREATE TABLE local_stops (id VARCHAR, route VARCHAR, direction_id INTEGER, stop_seq INTEGER, stop_id VARCHAR, stop_name VARCHAR, lat DOUBLE, lon DOUBLE)")

    total_stops = 0
    for route in routes:
        short_name = route.get("shortName", "")
        if not short_name:
            continue
        for pattern in route.get("patterns", []):
            dir_id = pattern.get("directionId", 0)
            stops = pattern.get("stops", [])
            for seq, stop in enumerate(stops):
                if not stop.get("gtfsId"):
                    continue
                stop_id_key = f"{short_name}:{dir_id}:{seq}"
                db.execute(
                    "INSERT INTO local_stops VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    [stop_id_key, short_name, dir_id, seq, stop["gtfsId"], stop.get("name"), stop["lat"], stop["lon"]],
                )
                total_stops += 1

    if total_stops > 0:
        db.execute("""CALL postgres_execute('neon', '
            CREATE TABLE IF NOT EXISTS "_tmp_stops" (id VARCHAR, route VARCHAR, "directionId" INTEGER, "stopSequence" INTEGER, "stopId" VARCHAR, "stopName" VARCHAR, lat DOUBLE PRECISION, lon DOUBLE PRECISION)
        ')""")
        db.execute("""CALL postgres_execute('neon', 'TRUNCATE "_tmp_stops"')""")
        db.execute("""INSERT INTO neon."_tmp_stops" SELECT * FROM local_stops""")
        db.execute("""CALL postgres_execute('neon', '
            INSERT INTO "RouteStop" (id, route, "directionId", "stopSequence", "stopId", "stopName", lat, lon)
            SELECT id, route, "directionId", "stopSequence", "stopId", "stopName", lat, lon FROM "_tmp_stops"
            ON CONFLICT (id) DO UPDATE SET
                "stopId" = EXCLUDED."stopId", "stopName" = EXCLUDED."stopName",
                lat = EXCLUDED.lat, lon = EXCLUDED.lon
        ')""")
        db.execute("""CALL postgres_execute('neon', 'DROP TABLE "_tmp_stops"')""")

    elapsed = time.time() - start
    log.info(f"[segments] Refreshed {total_stops} stops from {len(routes)} routes in {elapsed:.1f}s")
