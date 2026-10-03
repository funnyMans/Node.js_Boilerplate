# ETL & Dagster

Role

- Dagster defines batch/asset pipelines, transforms raw data to curated assets, and emits lineage. The current code location has one manually materialized partitioned asset job; no schedule or sensor automatically launches it.

Dev stack

- Dagster's local development server (UI and daemon) + Moto's in-memory S3-compatible server. Dagster run, event-log, and schedule metadata use local SQLite storage in the `dagster-home` volume.

Project placement

- `services/etl/` contains a runnable Dagster code location, S3 resource, partitioned assets, and transformation tests.

Integration

- The orders service independently exports each matching durable `orders.order.created` outbox row to the `raw` bucket. Export is retried with exponential backoff and tracked on the outbox row separately from NATS delivery, so S3 outages do not block order creation or lose the source event.
- Each event is written as one newline-terminated JSON object to `orders/created_date={UTC date}/events/{outbox UUID}.jsonl`. A stable key makes retry-after-write idempotent; export is marked complete only after the object write succeeds.
- The `curated_orders` daily UTC asset reads JSONL `order.created.v1` event envelopes from the `raw` bucket under `orders/`.
- It validates the shared event shape, filters by the selected UTC day, deduplicates redelivered event IDs, flattens order items, and writes Zstandard-compressed Parquet to `curated/orders/created_date={YYYY-MM-DD}/orders.parquet`.
- Events must include an ISO-8601 `occurredAt` timestamp with a timezone. Invalid matching events fail the partition run rather than being silently dropped. Non-order event types are ignored.
- Object reads are capped at 64 MiB each. Duplicate event IDs with conflicting contents fail the run.
- Production can use the standard AWS credential chain and leave `S3_ENDPOINT_URL` unset; optionally configure `AWS_REGION`, `AWS_ACCESS_KEY_ID`, and `AWS_SECRET_ACCESS_KEY`. Local S3 mock credentials and endpoint are only for development.
- Dagster can kick off business workflows (e.g., call an API to trigger Step Functions or Temporal workflows) when data conditions are met.

Local development

- Build the images one at a time, then start without rebuilding:

  ```bash
  docker compose -f infra/docker-compose.dev.yml build orders
  docker compose -f infra/docker-compose.dev.yml build dagster
  docker compose -f infra/docker-compose.dev.yml up -d --no-build orders s3-mock s3-mock-init dagster
  ```

- Dagster UI: `http://localhost:3004`. Materialize the `curated_orders` asset for partition `2026-09-27` to process the seeded example events.
- The local S3-compatible endpoint is `http://localhost:9000` (development credentials: `minioadmin` / `minioadmin`). Raw and curated buckets are created automatically. Moto stores objects in memory, so restarting its container resets them and the init service must be rerun.
- The Moto health check calls the S3 `ListBuckets` API; it does not assert that buckets are seeded. `s3-mock-init` owns bucket creation and sample seeding. Local Moto credentials are placeholders, not an authentication boundary.
- Orders raw writes use stable event-derived object keys and a bounded 10-second request deadline. The shared ETL boto3 client uses bounded connect/read timeouts, standard retries (up to three attempts), and path-style addressing. These are local client safeguards; they do not make Moto durable or guarantee AWS-equivalent behavior.
- Creating an order through the API writes its event to the orders outbox; the background exporter then makes it available under `raw/orders/`. Run the matching UTC partition from Dagster to process it.

Observability & testing

- Run transformation tests with `python -m unittest discover -s services/etl/tests` in an environment with `services/etl/requirements.txt` installed.
- A Docker health check verifies the Dagster `/server_info` endpoint returns webserver version metadata. Asset materializations include source object count, output row count, partition date, output URI, and output byte size.
- The Compose health check calls Dagster's `/server_info` endpoint. A healthy UI/daemon and persisted SQLite run metadata do not make Moto objects durable, and they do not cause the ETL job to run automatically.
