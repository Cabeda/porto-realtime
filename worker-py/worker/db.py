import os
import duckdb


def get_duck(memory_limit: str = "256MB") -> duckdb.DuckDBPyConnection:
    """Create a DuckDB connection with postgres + httpfs extensions."""
    db = duckdb.connect(":memory:", config={"memory_limit": memory_limit, "threads": "1"})

    db.execute("INSTALL postgres; LOAD postgres;")
    db.execute("INSTALL httpfs; LOAD httpfs;")

    # Configure R2 access using native R2 secret type
    # Extract account ID from endpoint: https://<account_id>.r2.cloudflarestorage.com
    endpoint = os.environ["R2_ENDPOINT"]
    account_id = endpoint.replace("https://", "").split(".")[0]
    db.execute(f"""
        CREATE SECRET r2 (
            TYPE r2,
            KEY_ID '{os.environ["R2_ACCESS_KEY_ID"]}',
            SECRET '{os.environ["R2_SECRET_ACCESS_KEY"]}',
            ACCOUNT_ID '{account_id}',
            REGION 'auto'
        )
    """)

    return db


def r2_bucket_url() -> str:
    """Return the r2:// URL prefix for the bucket."""
    return f"r2://{os.getenv('R2_BUCKET', 'porto-move')}"


def attach_neon(db: duckdb.DuckDBPyConnection):
    """Attach Neon postgres database."""
    url = os.environ["DATABASE_URL"]
    url = url.replace("&channel_binding=require", "").replace("?channel_binding=require&", "?").replace("?channel_binding=require", "")
    db.execute("SET pg_connection_limit = 2")
    db.execute(f"ATTACH '{url}' AS neon (TYPE postgres, SCHEMA 'public')")
