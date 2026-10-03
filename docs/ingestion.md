# Ingestion Patterns

This page contrasts general ingestion patterns with the local order event
pipeline. The API-upload and managed streaming examples are design patterns,
not additional running integrations in this repository.

## API-driven uploads (pattern, not implemented here)

- Flow: Client → API Gateway → validate (Zod) → store raw in S3 → metadata in DB → emit event (SNS).
- Useful for: user uploads, webhook ingestion.

## Streaming (general pattern; local order path described below)

- A common managed-cloud design is producers → Kinesis → consumers →
  Firehose → S3. This repository does not implement that path.
- The local order path persists an event in the orders PostgreSQL outbox,
  publishes it to a file-backed JetStream stream, and independently exports
  the same event to Moto for batch ETL. There is no application NATS consumer.
- Validate untrusted events at receiving boundaries; compile-time TypeScript
  types alone do not validate messages at runtime.

## ETL trigger points (alternatives, not configured locally)

- File arrival (S3) → EventBridge / S3 event → Dagster or Lambda job.
- Event-driven: SNS/SQS messages trigger consumers for near-real-time processing.

## Local development

- The runnable application stack is `infra/docker-compose.dev.yml`; its
  operations guide is [`infra/README.md`](../infra/README.md).
- It uses Moto (not MinIO) as an in-memory S3-compatible endpoint. The
  `s3-mock-init` one-shot job creates the buckets and seeds
  `raw/orders/` with example events.
- The orders service independently exports newly persisted order outbox events
  to that raw bucket. Dagster reads raw events and writes curated Parquet.
- The older `infra/docker-compose.yml` is an incomplete infrastructure-only
  configuration, not the runnable app stack.
