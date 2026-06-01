import duckdb
import pytest

from worker.collector import _parse_entity, _unwrap_str, _unwrap_float, _unwrap_location


class TestUnwrapHelpers:
    def test_unwrap_str_value_obj(self):
        assert _unwrap_str({"value": "500"}) == "500"

    def test_unwrap_str_raw(self):
        assert _unwrap_str("hello") == "hello"

    def test_unwrap_str_none(self):
        assert _unwrap_str(None) == ""

    def test_unwrap_float_value_obj(self):
        assert _unwrap_float({"value": 3.5}) == 3.5

    def test_unwrap_float_raw(self):
        assert _unwrap_float(42.0) == 42.0

    def test_unwrap_float_none(self):
        assert _unwrap_float(None) is None

    def test_unwrap_location_nested(self):
        raw = {"value": {"coordinates": [-8.6, 41.15]}}
        lon, lat = _unwrap_location(raw)
        assert lon == -8.6
        assert lat == 41.15

    def test_unwrap_location_direct(self):
        raw = {"coordinates": [-8.6, 41.15]}
        lon, lat = _unwrap_location(raw)
        assert lon == -8.6
        assert lat == 41.15

    def test_unwrap_location_none(self):
        assert _unwrap_location(None) == (None, None)

    def test_unwrap_location_zeros(self):
        assert _unwrap_location({"coordinates": [0, 0]}) == (None, None)


class TestParseEntity:
    def test_valid_entity(self):
        entity = {
            "id": "urn:ngsi-ld:Vehicle:stcp:500:1234",
            "type": "Vehicle",
            "location": {"value": {"coordinates": [-8.6, 41.15]}},
            "routeShortName": {"value": "500"},
            "speed": {"value": 25.0},
        }
        result = _parse_entity(entity)
        assert result is not None
        assert result["lat"] == 41.15
        assert result["lon"] == -8.6
        assert result["route"] == "500"
        assert result["speed"] == 25.0

    def test_missing_location(self):
        entity = {"id": "test", "routeShortName": {"value": "500"}}
        assert _parse_entity(entity) is None

    def test_route_from_id(self):
        entity = {
            "id": "urn:ngsi-ld:Vehicle:stcp:205:9999",
            "location": {"value": {"coordinates": [-8.6, 41.15]}},
        }
        result = _parse_entity(entity)
        assert result is not None
        assert result["route"] == "205"

    def test_annotations_direction(self):
        entity = {
            "id": "urn:ngsi-ld:Vehicle:stcp:500:1234",
            "location": {"value": {"coordinates": [-8.6, 41.15]}},
            "routeShortName": {"value": "500"},
            "annotations": {"value": ["stcp:sentido:1", "stcp:nr_viagem:T42"]},
        }
        result = _parse_entity(entity)
        assert result["directionId"] == 1
        assert result["tripId"] == "T42"


class TestAggregateTripReconstruction:
    """Test trip reconstruction SQL logic using in-memory DuckDB."""

    def test_trip_split_on_gap(self):
        db = duckdb.connect(":memory:")
        # Create positions with a >10min gap
        db.execute("""
            CREATE TABLE pos AS SELECT * FROM (VALUES
                ('2024-01-01 08:00:00'::TIMESTAMP, 'v1', NULL, '500', NULL, 1::SMALLINT, 41.15, -8.6, 20.0::FLOAT),
                ('2024-01-01 08:01:00'::TIMESTAMP, 'v1', NULL, '500', NULL, 1::SMALLINT, 41.16, -8.6, 22.0::FLOAT),
                ('2024-01-01 08:02:00'::TIMESTAMP, 'v1', NULL, '500', NULL, 1::SMALLINT, 41.17, -8.6, 18.0::FLOAT),
                ('2024-01-01 08:20:00'::TIMESTAMP, 'v1', NULL, '500', NULL, 1::SMALLINT, 41.18, -8.6, 25.0::FLOAT),
                ('2024-01-01 08:21:00'::TIMESTAMP, 'v1', NULL, '500', NULL, 1::SMALLINT, 41.19, -8.6, 23.0::FLOAT),
                ('2024-01-01 08:22:00'::TIMESTAMP, 'v1', NULL, '500', NULL, 1::SMALLINT, 41.20, -8.6, 21.0::FLOAT)
            ) AS t(recorded_at, vehicle_id, vehicle_num, route, trip_id, direction_id, lat, lon, speed)
        """)

        db.execute("""
            CREATE TABLE trips AS
            WITH ordered AS (
                SELECT *,
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
                vehicle_id, route, direction_id, trip_num,
                MIN(recorded_at) AS started_at,
                MAX(recorded_at) AS ended_at,
                COUNT(*) AS positions,
                ROUND(AVG(CASE WHEN speed > 0 THEN speed END), 1) AS avg_speed
            FROM trip_boundaries
            GROUP BY vehicle_id, route, direction_id, trip_num
            HAVING COUNT(*) >= 3
        """)

        trips = db.execute("SELECT * FROM trips ORDER BY started_at").fetchall()
        assert len(trips) == 2
        assert trips[0][6] == 3  # first trip: 3 positions
        assert trips[1][6] == 3  # second trip: 3 positions

    def test_single_trip_no_gap(self):
        db = duckdb.connect(":memory:")
        db.execute("""
            CREATE TABLE pos AS SELECT * FROM (VALUES
                ('2024-01-01 08:00:00'::TIMESTAMP, 'v1', NULL, '500', NULL, 1::SMALLINT, 41.15, -8.6, 20.0::FLOAT),
                ('2024-01-01 08:01:00'::TIMESTAMP, 'v1', NULL, '500', NULL, 1::SMALLINT, 41.16, -8.6, 22.0::FLOAT),
                ('2024-01-01 08:02:00'::TIMESTAMP, 'v1', NULL, '500', NULL, 1::SMALLINT, 41.17, -8.6, 18.0::FLOAT),
                ('2024-01-01 08:03:00'::TIMESTAMP, 'v1', NULL, '500', NULL, 1::SMALLINT, 41.18, -8.6, 25.0::FLOAT)
            ) AS t(recorded_at, vehicle_id, vehicle_num, route, trip_id, direction_id, lat, lon, speed)
        """)

        db.execute("""
            CREATE TABLE trips AS
            WITH ordered AS (
                SELECT *,
                    LAG(recorded_at) OVER (PARTITION BY vehicle_id, route, direction_id ORDER BY recorded_at) AS prev_at
                FROM pos
            ),
            trip_boundaries AS (
                SELECT *,
                    SUM(CASE WHEN prev_at IS NULL OR EPOCH(recorded_at - prev_at) > 600 THEN 1 ELSE 0 END)
                        OVER (PARTITION BY vehicle_id, route, direction_id ORDER BY recorded_at) AS trip_num
                FROM ordered
            )
            SELECT COUNT(*) AS positions
            FROM trip_boundaries
            GROUP BY vehicle_id, route, direction_id, trip_num
            HAVING COUNT(*) >= 3
        """)

        trips = db.execute("SELECT * FROM trips").fetchall()
        assert len(trips) == 1
        assert trips[0][0] == 4
