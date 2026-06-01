FROM python:3.12-slim

WORKDIR /app
COPY worker-py/pyproject.toml .
COPY worker-py/worker/ ./worker/
RUN pip install --no-cache-dir . \
    && python -c "import duckdb; db=duckdb.connect(); db.execute('INSTALL postgres'); db.execute('INSTALL httpfs')"

RUN useradd -r worker
USER worker

CMD ["python", "-m", "worker.main"]
