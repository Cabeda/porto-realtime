# PortoMove Worker

Python worker that collects real-time bus positions from Porto's FIWARE platform and runs daily analytics aggregation using DuckDB.

## Architecture

- **Collection loop** (every 30s): Fetches bus positions from FIWARE → writes JSON snapshots to Cloudflare R2
- **Scheduled jobs** (daily/weekly): DuckDB reads R2 snapshots, processes data, writes results to Neon PostgreSQL

DuckDB handles all heavy processing with automatic spill-to-disk, keeping memory usage under 256MB.

## Requirements

- Python 3.12+
- Environment variables (see `.env.example`)

## Setup

```bash
uv venv && uv pip install -e ".[dev]"
```

## Running

```bash
# Start the worker (collection loop + scheduled jobs)
python -m worker.main

# Run a specific job manually
python -m worker.main run aggregate-daily

# Backfill a specific date
DATE=2024-01-15 python -m worker.main run aggregate-daily
```

## Available Jobs

| Job | Schedule | Description |
|-----|----------|-------------|
| `snapshot-schedule` | 01:00 UTC daily | Fetch scheduled trips from OTP |
| `aggregate-daily` | 03:00 UTC daily | Process yesterday's positions → trips, route performance |
| `archive-positions` | 03:00 UTC daily | Convert JSON snapshots to Parquet |
| `cleanup-positions` | 04:00 UTC daily | Delete R2 snapshots older than 2 days |
| `refresh-segments` | 05:00 UTC Monday | Refresh route stops from OTP |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Neon PostgreSQL connection string |
| `R2_ENDPOINT` | Yes | Cloudflare R2 endpoint URL |
| `R2_ACCESS_KEY_ID` | Yes | R2 access key |
| `R2_SECRET_ACCESS_KEY` | Yes | R2 secret key |
| `R2_BUCKET` | No | R2 bucket name (default: `porto-move`) |
| `COLLECT_INTERVAL_S` | No | Collection interval in seconds (default: `30`) |
| `FIWARE_URL` | No | FIWARE broker URL (has default) |
| `OTP_URL` | No | OTP GraphQL endpoint (has default) |
| `DATE` | No | Override date for `aggregate-daily` backfills (YYYY-MM-DD) |

## Testing

```bash
pytest
```

## Docker

```bash
docker build -f worker-py/Dockerfile -t portomove-worker .
docker run --env-file .env portomove-worker
```
