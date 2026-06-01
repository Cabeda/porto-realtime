import json
import re
from datetime import datetime, timezone

import httpx

from worker.r2 import get_r2, BUCKET

FIWARE_URL = "https://broker.fiware.urbanplatform.portodigital.pt/v2/entities?q=vehicleType==bus&limit=1000"
_STCP_RE = re.compile(r"(?i)STCP\s+(\d+)")
_ROUTE_PART_RE = re.compile(r"^[A-Za-z0-9]{1,4}$")

# Rolling state for today.json
_state = {
    "date": "",
    "positions_collected": 0,
    "vehicles": set(),
    "routes": set(),
    "speed_sum": 0.0,
    "speed_count": 0,
    "hourly_speed_sum": [0.0] * 24,
    "hourly_speed_count": [0] * 24,
    "hourly_vehicles": [set() for _ in range(24)],
    "hourly_routes": [set() for _ in range(24)],
}


def _reset_state(date: str):
    _state["date"] = date
    _state["positions_collected"] = 0
    _state["vehicles"] = set()
    _state["routes"] = set()
    _state["speed_sum"] = 0.0
    _state["speed_count"] = 0
    _state["hourly_speed_sum"] = [0.0] * 24
    _state["hourly_speed_count"] = [0] * 24
    _state["hourly_vehicles"] = [set() for _ in range(24)]
    _state["hourly_routes"] = [set() for _ in range(24)]


def _unwrap_str(raw) -> str:
    if raw is None:
        return ""
    if isinstance(raw, dict) and "value" in raw:
        v = raw["value"]
        return str(v) if v is not None else ""
    if isinstance(raw, str):
        return raw
    return ""


def _unwrap_float(raw):
    if raw is None:
        return None
    if isinstance(raw, dict) and "value" in raw:
        v = raw["value"]
        return float(v) if v is not None else None
    if isinstance(raw, (int, float)):
        return float(raw)
    return None


def _unwrap_location(raw):
    if raw is None:
        return None, None
    coords = None
    if isinstance(raw, dict):
        if "value" in raw and isinstance(raw["value"], dict):
            coords = raw["value"].get("coordinates")
        elif "coordinates" in raw:
            coords = raw["coordinates"]
    if coords and len(coords) >= 2 and (coords[0] != 0 or coords[1] != 0):
        return coords[0], coords[1]  # lon, lat
    return None, None


def _parse_entity(e: dict) -> dict | None:
    lon, lat = _unwrap_location(e.get("location"))
    if lon is None:
        return None

    # Route extraction
    route = ""
    for field in ("routeShortName", "route", "lineId", "line"):
        route = _unwrap_str(e.get(field))
        if route:
            break

    if not route:
        vid = _unwrap_str(e.get("vehiclePlateIdentifier")) or _unwrap_str(e.get("vehicleNumber")) or _unwrap_str(e.get("name"))
        if vid:
            m = _STCP_RE.search(vid)
            if m:
                route = m.group(1)
        if not route and e.get("id"):
            parts = e["id"].split(":")
            for p in parts[2:-1]:
                if p and p not in ("Vehicle", "porto", "stcp") and _ROUTE_PART_RE.match(p):
                    route = p
                    break

    # Direction and trip from annotations
    direction_id = None
    trip_id = None
    annotations = e.get("annotations")
    if isinstance(annotations, dict):
        annotations = annotations.get("value", [])
    if isinstance(annotations, list):
        for ann in annotations:
            if isinstance(ann, str):
                if ann.startswith("stcp:sentido:"):
                    try:
                        direction_id = int(ann.split(":")[-1])
                    except ValueError:
                        pass
                elif ann.startswith("stcp:nr_viagem:"):
                    trip_id = ann.split(":", 2)[-1]

    # Vehicle number
    vehicle_num = ""
    for field in ("vehiclePlateIdentifier", "vehicleNumber", "license_plate", "name"):
        vehicle_num = _unwrap_str(e.get(field))
        if vehicle_num:
            break
    if not vehicle_num and e.get("id"):
        vehicle_num = e["id"].split(":")[-1]
    if vehicle_num:
        last = vehicle_num.split()[-1]
        if last.isdigit():
            vehicle_num = last

    speed = _unwrap_float(e.get("speed"))
    heading = _unwrap_float(e.get("heading")) or _unwrap_float(e.get("bearing"))

    return {
        "vehicleId": e.get("id", ""),
        "vehicleNum": vehicle_num or None,
        "route": route or None,
        "tripId": trip_id,
        "directionId": direction_id,
        "lat": lat,
        "lon": lon,
        "speed": speed,
        "heading": heading,
    }


def collect_positions() -> int:
    now = datetime.now(timezone.utc)
    r2 = get_r2()

    resp = httpx.get(FIWARE_URL, headers={"User-Agent": "PortoMove-Collector/2.0", "Cache-Control": "no-cache"}, timeout=15)
    resp.raise_for_status()
    entities = resp.json()

    if not entities:
        raise RuntimeError("FIWARE returned empty response")

    positions = []
    for e in entities:
        if not e.get("id"):
            continue
        p = _parse_entity(e)
        if p:
            positions.append(p)

    if not positions:
        return 0

    snapshot = {"recordedAt": now.isoformat(), "positions": positions}
    snapshot_json = json.dumps(snapshot, separators=(",", ":")).encode()

    # Write snapshot to R2
    key = f"snapshots/{now:%Y/%m/%d}/{now:%H%M%S}.json"
    r2.put_object(Bucket=BUCKET, Key=key, Body=snapshot_json, ContentType="application/json")

    # Update rolling state and write today.json
    today = now.strftime("%Y-%m-%d")
    if _state["date"] != today:
        _reset_state(today)

    h = now.hour
    _state["positions_collected"] += len(positions)
    for p in positions:
        _state["vehicles"].add(p["vehicleId"])
        if p["route"]:
            _state["routes"].add(p["route"])
        if p.get("speed") and p["speed"] > 0:
            _state["speed_sum"] += p["speed"]
            _state["speed_count"] += 1
            _state["hourly_speed_sum"][h] += p["speed"]
            _state["hourly_speed_count"][h] += 1
        _state["hourly_vehicles"][h].add(p["vehicleId"])
        if p["route"]:
            _state["hourly_routes"][h].add(p["route"])

    avg_speed = round(_state["speed_sum"] / _state["speed_count"], 1) if _state["speed_count"] else None
    summary = {
        "updatedAt": now.isoformat(),
        "date": today,
        "positionsCollected": _state["positions_collected"],
        "activeVehicles": len(_state["vehicles"]),
        "activeRoutes": len(_state["routes"]),
        "avgSpeed": avg_speed,
        "hourlySpeed": [
            {"hour": i, "avgSpeed": round(_state["hourly_speed_sum"][i] / _state["hourly_speed_count"][i], 1) if _state["hourly_speed_count"][i] else None, "samples": _state["hourly_speed_count"][i]}
            for i in range(24)
        ],
        "hourlyFleet": [
            {"hour": i, "vehicles": len(_state["hourly_vehicles"][i]), "routes": len(_state["hourly_routes"][i])}
            for i in range(24)
        ],
    }

    r2.put_object(Bucket=BUCKET, Key="snapshots/today.json", Body=json.dumps(summary, separators=(",", ":")).encode(), ContentType="application/json")

    return len(positions)
