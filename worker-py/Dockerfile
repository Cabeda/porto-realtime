FROM python:3.12-slim

WORKDIR /app
COPY worker-py/pyproject.toml .
RUN pip install --no-cache-dir .

COPY worker-py/worker/ ./worker/

# Pre-install DuckDB extensions
RUN python -c "import duckdb; db=duckdb.connect(); db.execute('INSTALL postgres'); db.execute('INSTALL httpfs'); print('Extensions installed')"

CMD ["python", "-m", "worker.main"]
