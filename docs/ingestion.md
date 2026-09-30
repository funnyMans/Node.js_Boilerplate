# Ingestion Patterns

Two main modes: API-driven (file/record upload) and streaming.

API-driven

- Flow: Client → API Gateway → validate (Zod) → store raw in S3 → metadata in DB → emit event (SNS).
- Useful for: user uploads, webhook ingestion.

Streaming / telemetry

- Flow: Producers → Kinesis (prod) or NATS (dev) → consumers → Firehose → S3.
- Use schema enforcement at producer (Zod) and CI contract checks.
- The orders service also independently exports its durable `orders.order.created` outbox events to S3-compatible raw storage for batch ETL. This idempotent retry loop is separate from NATS delivery.

ETL trigger points

- File arrival (S3) → EventBridge / S3 event → Dagster or Lambda job.
- Event-driven: SNS/SQS messages trigger consumers for near-real-time processing.

Local development

- The runnable application stack is `infra/docker-compose.dev.yml`; its
  operations guide is [`infra/README.md`](../infra/README.md).
- It uses Moto (not MinIO) as an in-memory S3-compatible endpoint. The
  `s3-mock-init` one-shot job creates the buckets and seeds
  `raw/orders/` with example events.
- The orders service independently exports newly persisted order outbox events
  to that raw bucket. Dagster reads raw events and writes curated Parquet.
- The older `infra/docker-compose.yml` is an incomplete infrastructure-only
  configuration, not the runnable app stack.
