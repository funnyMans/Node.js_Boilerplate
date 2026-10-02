# System maps

These diagrams show the current local development stack described by
[`infra/docker-compose.dev.yml`](../infra/docker-compose.dev.yml). They are
kept deliberately separate from optional future learning topics: AWS services,
durable NATS consumers, notifications, and shipping are not implied by these
local diagrams. They describe what is configured locally, not a production
deployment.

Editable Mermaid sources used by the diagram renderer are in
[`diagrams-src/`](./diagrams-src/). The SVG output directory is generated and
ignored by Git; the Mermaid in this document is the readable, versioned
reference.

## Local runtime topology

```mermaid
flowchart LR
  Client --> Nginx["Nginx :8080"]
  Nginx --> Gateway["API gateway :3000"]
  Nginx --> Users["Users :3001"]
  Gateway --> Auth["Auth service :3002"]
  Gateway --> Users
  Gateway --> Orders["Orders :3003"]
  Orders --> Payments["Payments :3010"]
  Orders --> Inventory["Inventory :3011"]

  Gateway --> Redis[(Redis)]
  Users --> Redis
  Gateway --> NATS[(NATS)]
  Orders --> NATS
  Postgres[(PostgreSQL)] --> Users
  Postgres --> Auth
  Postgres --> Orders
  Postgres --> Payments
  Postgres --> Inventory
  Orders --> Temporal["Temporal :7233"]

  S3Mock["Moto S3 mock :9000"] --> Init["s3-mock-init (one-shot)"]
  Init -->|seeds raw and curated buckets| S3Mock
  Orders -->|raw event export| S3Mock
  Dagster["Dagster UI :3004"] -->|reads raw; writes curated| S3Mock

  Gateway -. "/metrics" .-> Prometheus["Prometheus :9090"]
  Users -. "/metrics" .-> Prometheus
  Auth -. "/metrics" .-> Prometheus
  Orders -. "/metrics" .-> Prometheus
  Payments -. "/metrics" .-> Prometheus
  Inventory -. "/metrics" .-> Prometheus
  Prometheus --> Grafana["Grafana :3005"]
  Gateway -. "OTLP/HTTP traces" .-> OTel["OTel collector :4318"]
  Users -. "OTLP/HTTP traces" .-> OTel
  Auth -. "OTLP/HTTP traces" .-> OTel
  Orders -. "OTLP/HTTP traces" .-> OTel
  Payments -. "OTLP/HTTP traces" .-> OTel
  Inventory -. "OTLP/HTTP traces" .-> OTel
  Orders -. "outbox backlog/age gauges" .-> Prometheus
```

Solid arrows represent application or data dependencies in the local
configuration. Dotted arrows represent configured monitoring paths; Prometheus
scrapes all six HTTP services, and the collector exports traces to Tempo.
Grafana can query both Prometheus metrics and Tempo traces. Tempo retains local
traces for a bounded period; this path is configured but not covered by the
hosted order-journey CI job. The shared HTTP metrics helper keeps metric names,
labels, and response format consistent across those services.

For `POST /orders`, W3C trace context is passed from the gateway to the orders
service and the downstream trace ID is returned to the caller. The order and
outbox row commit together; the outbox stores only W3C `traceparent` and
`tracestate` as durable context. Each later stage creates its own child span,
while the correlation ID remains the business-level join key. Baggage is not
persisted or published. Orders outbox gauges expose backlog, age, retries, and
terminal failures for each independent delivery stage to Prometheus.

## Order creation and asynchronous effects

```mermaid
sequenceDiagram
  actor Client
  participant Edge as Nginx / API gateway
  participant Auth as Auth service
  participant Orders as Orders service
  participant DB as PostgreSQL
  participant NATS
  participant Temporal
  participant Pay as Payments service
  participant Inv as Inventory service
  participant S3 as Moto raw bucket
  participant Dagster

  Client->>Edge: POST /orders
  Edge->>Auth: validate caller
  Auth-->>Edge: authenticated identity
  Edge->>Orders: forward request + identity
  Orders->>DB: insert order, event, and W3C trace context in one transaction
  DB-->>Orders: commit
  Orders-->>Client: order response

  par NATS outbox publisher
    Orders->>DB: claim pending outbox row
    Orders->>NATS: publish event with child traceparent/tracestate headers
    Orders->>DB: mark published
  and S3 raw exporter
    Orders->>DB: claim raw-export work
    Orders->>S3: write deterministic JSONL object in export child span
    Orders->>DB: record export result
  and Temporal dispatcher
    Orders->>DB: claim workflow dispatch
    Orders->>Temporal: start deterministic workflow with child trace context
  end

  Temporal->>Orders: run activity child spans from workflow input context
  Orders->>Pay: charge or refund via HTTP with W3C child context
  Orders->>Inv: reserve inventory via HTTP with W3C child context
  Temporal->>Orders: confirm or cancel order
  Dagster->>S3: read raw events
  Dagster->>S3: write curated daily Parquet
```

The HTTP request waits for the order transaction, not for asynchronous
outbox deliveries or Dagster. The outbox workers do not reuse the finished
HTTP span: they create independent child spans from the persisted W3C context.
Temporal receives its context in workflow input (the current Temporal client
contract does not provide generic workflow headers here). Activity HTTP calls
inject their child span context so payments and inventory can continue the
trace. Grafana/Tempo provide local trace search, but the order-journey CI check
does not verify trace search or retention. There is no application NATS
consumer in this repository.

## Health, dependencies, and completion

```mermaid
flowchart TD
  PG["Postgres health check"] --> Users["users /ready"]
  Redis["Redis health check"] --> Users
  PG --> Auth["auth-service /health check"]
  Users --> Auth
  PG --> Orders["orders /ready"]
  NATS["NATS health check"] --> Orders
  Temporal["Temporal: service_started dependency"] --> Orders
  Payments["payments /ready"] --> Orders
  Inventory["inventory /ready"] --> Orders
  Orders --> Gateway["api-gateway /ready"]
  Users --> Gateway
  Redis --> Gateway
  NATS --> Gateway
  Temporal --> Gateway
  Gateway --> Nginx["nginx starts after gateway is healthy"]
  S3["s3-mock: TCP health check"] --> Init["s3-mock-init runs once"]
  Init -->|service_completed_successfully| Dagster["Dagster"]
  Init -->|service_completed_successfully| Gateway
  Init -->|service_completed_successfully| Orders
```

`service_started` means only that the dependency's container process started.
It does not prove the dependency is ready. The Moto S3 mock uses a TCP listener
check before `s3-mock-init` runs; that check does not prove that S3 operations
or seed data are correct. `s3-mock-init` is expected to finish with exit code
`0`; it is not expected to remain running or become healthy.
Compose health checks are configured for only some services. See the
[operations guide](../infra/README.md) for the exact coverage and known limits.

## ETL data shape

```mermaid
flowchart LR
  Outbox["orders.order.created event"] --> Raw["raw/orders/.../*.jsonl"]
  Seed["s3-mock-init sample event"] --> Raw
  Raw --> Validate["Dagster: validate and deduplicate"]
  Validate --> Flatten["One row per order item"]
  Flatten --> Parquet["curated/orders/created_date=YYYY-MM-DD/orders.parquet"]
```

The local S3-compatible service is Moto and is in-memory. Recreating it loses
its objects; the init job seeds sample data again. It is a development/testing
substitute, not durable production object storage.
