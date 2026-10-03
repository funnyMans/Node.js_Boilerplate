# System maps

These diagrams show the current local development stack described by
[`infra/docker-compose.dev.yml`](../infra/docker-compose.dev.yml). They are
kept deliberately separate from optional future learning topics: AWS services,
application NATS consumers, notifications, and shipping are not implied by
these local diagrams. They describe what is configured locally, not a
production deployment.

Editable Mermaid sources used by the diagram renderer are in
[`diagrams-src/`](./diagrams-src/). The SVG output directory is generated and
ignored by Git; the Mermaid in this document is the readable, versioned
reference.

## Local runtime topology

```mermaid
flowchart LR
  Client --> Nginx["Nginx :8080"]
  Nginx --> Gateway["API gateway :3000"]
  Gateway --> Auth["Auth service :3002"]
  Gateway --> Users["Users :3001"]
  Gateway --> Orders["Orders :3003"]
  Gateway -->|payment-method routes| Payments["Payments :3010"]
  Orders -->|workflow activities| Payments
  Orders -->|workflow activities| Inventory["Inventory :3011"]

  Gateway -. "health checks" .-> Redis[(Redis)]
  Users -. "health checks" .-> Redis
  Orders -->|JetStream publish| NATS[(NATS JetStream)]
  Gateway -. "health check" .-> NATS
  Orders -. "health check" .-> NATS
  Users --> Postgres[(PostgreSQL)]
  Auth --> Postgres
  Orders --> Postgres
  Payments --> Postgres
  Inventory --> Postgres
  Temporal --> Postgres
  Orders -->|dispatch after NATS publish acknowledgement| Temporal["Temporal :7233"]

  Init["s3-mock-init (one-shot)"] -->|creates buckets and seeds examples| S3Mock["Moto S3 mock :9000"]
  Orders -->|raw event export| S3Mock
  Dagster["Dagster UI :3004"] -->|reads raw; writes curated| S3Mock

  Prometheus["Prometheus :9090"] -. "scrapes /metrics" .-> Gateway
  Prometheus -. "scrapes /metrics" .-> Users
  Prometheus -. "scrapes /metrics" .-> Auth
  Prometheus -. "scrapes /metrics" .-> Orders
  Prometheus -. "scrapes /metrics" .-> Payments
  Prometheus -. "scrapes /metrics" .-> Inventory
  Prometheus -. "scrapes internal metrics" .-> OTel
  Prometheus -. "scrapes internal metrics" .-> Tempo["Tempo :3200"]
  Grafana["Grafana :3005"] -. "queries" .-> Prometheus
  Grafana -. "queries traces" .-> Tempo
  Gateway -. "OTLP/HTTP traces" .-> OTel["OTel collector :4318"]
  Users -. "OTLP/HTTP traces" .-> OTel
  Auth -. "OTLP/HTTP traces" .-> OTel
  Orders -. "OTLP/HTTP traces" .-> OTel
  Payments -. "OTLP/HTTP traces" .-> OTel
  Inventory -. "OTLP/HTTP traces" .-> OTel
```

Solid arrows represent application or data dependencies in the local
configuration. Dotted arrows represent health or monitoring paths. Nginx
forwards application traffic only to the gateway; the gateway owns client
routes, while orders calls payments and inventory during workflow activities.
The arrows to PostgreSQL show database ownership/use, not database-initiated
calls. Prometheus scrapes the six HTTP services plus collector and Tempo
self-metrics. The collector exports traces to Tempo through a bounded
in-memory retry queue, and Grafana queries both data sources. Tempo retains
local traces for a bounded period; trace search and retention are not verified
by the hosted order-journey CI job. The shared HTTP metrics helper keeps
service metric names, labels, and response format consistent.

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

  Client->>Edge: POST /orders
  Edge->>Auth: validate caller
  Auth-->>Edge: authenticated identity
  Edge->>Orders: forward request + identity
  Orders->>DB: insert order, event, and W3C trace context in one transaction
  DB-->>Orders: commit

  par HTTP response
    Orders-->>Edge: order response
    Edge-->>Client: order response
  and NATS outbox publisher
    Orders->>DB: claim pending outbox row
    Orders->>NATS: publish to ORDERS JetStream with child trace context
    NATS-->>Orders: PubAck
    Orders->>DB: mark published after broker acknowledgement
  and S3 raw exporter
    Orders->>DB: claim raw-export work
    Orders->>S3: write deterministic JSONL object in export child span
    Orders->>DB: record export result
  and Temporal workflow dispatcher
    Orders->>DB: poll until NATS stage is recorded as published
    Orders->>Temporal: start deterministic workflow with child trace context
    Temporal-->>Orders: workflow start accepted
    Orders->>DB: record workflow started
  end
```

The HTTP response and three pollers can proceed concurrently after the order
transaction commits; the request does not wait for outbox deliveries or
Dagster. The workflow dispatcher polls independently but does not start a
workflow until NATS publication is recorded as `PUBLISHED`. It does not wait
for raw export.
The outbox workers do not reuse the finished HTTP span: they create
independent child spans from the persisted W3C context.
Temporal receives its context in workflow input (the current Temporal client
contract does not provide generic workflow headers here). Activity HTTP calls
inject their child span context so payments and inventory can continue the
trace. The collector uses a bounded in-memory queue with retries and
Prometheus scrapes collector and Tempo self-metrics. Grafana/Tempo provide
local trace search, but the order-journey CI check does not verify trace
search or retention. There is no application NATS
consumer in this repository.

## Health, dependencies, and completion

```mermaid
flowchart TD
  PG["Postgres health check"] --> Users["users /ready"]
  Redis["Redis health check"] --> Users
  PG --> Auth["auth-service /health check"]
  Users --> Auth
  PG --> OrdersReady["orders /ready"]
  NATS["NATS health check"] --> OrdersStartup["orders startup dependency"]
  Temporal["Temporal gRPC health check"] --> OrdersStartup
  Payments["payments /ready"] --> OrdersStartup
  Inventory["inventory /ready"] --> OrdersStartup
  Init --> OrdersStartup
  OrdersStartup --> OrdersReady
  OrdersReady --> Gateway["api-gateway /ready"]
  Users --> Gateway
  Auth --> Gateway
  Payments --> Gateway
  Redis --> Gateway
  NATS --> Gateway
  Temporal --> Gateway
  Gateway -->|startup dependency| Nginx["Nginx"]
  Nginx -->|proxies health probe| GatewayHealth["api-gateway /health"]
  S3["s3-mock: S3 ListBuckets health check"] --> Init["s3-mock-init runs once"]
  Init -->|service_completed_successfully| Dagster["Dagster"]
  Init -->|service_completed_successfully| Gateway
  OTel["OTel collector"] -->|health probe| OTelHealth["health extension"]
  Prometheus["Prometheus"] -->|health probe| PromHealth["/-/healthy"]
  Grafana["Grafana"] -->|health probe| GrafanaHealth["/api/health"]
  Temporal -->|gRPC health probe| TemporalHealth["Temporal health check"]
```

The diagram shows the configured dependency and health-check relationships,
not a guarantee that every upstream remains healthy after startup. A Docker
health check reports only its specific probe: for example, the Moto `ListBuckets`
probe proves the S3 API responds, not that required buckets or seed objects
exist. The `s3-mock-init` one-shot job must exit `0`; it is not expected to
remain running or become healthy. Tempo has no Compose health check. See the
[operations guide](../infra/README.md) for exact coverage and probe limits.

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
