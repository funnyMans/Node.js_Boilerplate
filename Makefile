.PHONY: help build images build-image up e2e-up down restart rebuild logs status health order-journey migrate migrate-orders reset dev-up dev-down k8s-apply k8s-down helm-install helm-uninstall

help:
	@printf "Available targets:\n"
	@printf "  make up          Start already-built images (no image build)\n"
	@printf "  make e2e-up      Start the journey stack with local fake payment provider\n"
	@printf "  make down        Stop the Docker Compose stack\n"
	@printf "  make restart     Restart the stack\n"
	@printf "  make build-image SERVICE=orders  Build one service image\n"
	@printf "  make images      Build all images (can use substantial memory)\n"
	@printf "  make rebuild     Rebuild all images without cache (high resource use)\n"
	@printf "  make logs        Follow container logs\n"
	@printf "  make status      Show all containers, including completed jobs\n"
	@printf "  make health      Check HTTP health endpoints\n"
	@printf "  make order-journey Run the local order integration journey (stack must be up)\n"
	@printf "  make migrate     Run Prisma migrations inside users container\n"
	@printf "  make migrate-orders Run orders service Prisma migrations\n"
	@printf "  make reset       Stop stack and remove volumes\n"
	@printf "  make build       Build workspace packages\n"
	@printf "  make dev-up      Backward-compatible alias for up\n"
	@printf "  make dev-down    Backward-compatible alias for down\n\n"

build:
	pnpm -w -s build

images: build
	docker compose -f infra/docker-compose.dev.yml build

build-image:
	@test -n "$(SERVICE)" || (printf "Usage: make build-image SERVICE=orders\n" >&2; exit 2)
	docker compose -f infra/docker-compose.dev.yml build "$(SERVICE)"

up:
	docker compose -f infra/docker-compose.dev.yml up -d --no-build

e2e-up:
	docker compose -f infra/docker-compose.dev.yml -f infra/docker-compose.e2e.yml up -d --no-build --wait api-gateway

down:
	docker compose -f infra/docker-compose.dev.yml down --remove-orphans

restart: down up

rebuild:
	docker compose -f infra/docker-compose.dev.yml build --no-cache

logs:
	docker compose -f infra/docker-compose.dev.yml logs -f --tail=200

status:
	docker compose -f infra/docker-compose.dev.yml ps --all

health:
	@curl -fsS http://localhost:8080/health
	@printf "\n"
	@curl -fsS http://localhost:3001/health
	@printf "\n"

order-journey:
	E2E_ORDER_JOURNEY=1 pnpm exec vitest run services/orders/tests/e2e/order-journey.e2e.test.ts

migrate:
	docker compose -f infra/docker-compose.dev.yml exec -T users pnpm exec prisma migrate deploy --schema=services/users/prisma/schema.prisma

migrate-orders:
	docker compose -f infra/docker-compose.dev.yml exec -T orders sh -c "cd services/orders && pnpm exec prisma migrate deploy"

reset: down
	docker compose -f infra/docker-compose.dev.yml down -v --remove-orphans || true

# Backward-compatible aliases

dev-up: up

dev-down: down

k8s-apply:
	# Apply k8s namespace first, then the rest
	kubectl apply -f k8s/namespace.yaml
	kubectl apply -f k8s/

k8s-down:
	kubectl delete -f k8s/ --ignore-not-found

helm-install:
	helm upgrade --install boilerplate charts/boilerplate -n node-boilerplate --create-namespace

helm-uninstall:
	helm uninstall boilerplate -n node-boilerplate || true
