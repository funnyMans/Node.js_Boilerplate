# Infrastructure notes

## Local development

The runnable local application stack is
[`infra/docker-compose.dev.yml`](../infra/docker-compose.dev.yml). It uses
PostgreSQL, Redis, NATS, Temporal, service containers, Moto for S3-compatible
testing, Dagster, Prometheus, Grafana, an OpenTelemetry collector, and Tempo
for local trace storage and querying.

Use [`infra/README.md`](../infra/README.md) for the current service list,
resource-conscious build/start procedure, ports, health semantics, and data
reset warnings. Do not use the older, incomplete
[`infra/docker-compose.yml`](../infra/docker-compose.yml) as the application
stack; it is not referenced by the Makefile or package scripts.

## Production direction (not implemented here)

These are possible mappings, not deployed infrastructure or validated
architecture decisions:

| Concern                | Possible managed option                                    |
| ---------------------- | ---------------------------------------------------------- |
| Compute                | ECS Fargate or EKS                                         |
| Container images       | Amazon ECR                                                 |
| Relational data        | RDS PostgreSQL, with explicit per-service ownership        |
| Messaging              | SNS/SQS or a deliberately selected durable NATS deployment |
| Object storage         | S3                                                         |
| Workflow orchestration | Temporal or Step Functions; choose one per workflow        |
| Secrets                | AWS Secrets Manager or Systems Manager Parameter Store     |
| Metrics and logs       | CloudWatch with OpenTelemetry integration                  |
| Traces                 | X-Ray or a compatible OpenTelemetry trace backend          |

No AWS deployment, IAM policies, CDK stacks, or production secret configuration
is included in the current local Compose setup. Decide these only after the
local journey and failure/recovery behavior are repeatable.
