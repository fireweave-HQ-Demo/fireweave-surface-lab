COMPOSE = docker compose --env-file .env -f infra/compose.yml --profile core --profile app --profile agents

.PHONY: up seed test e2e down reset observe

up:
	$(COMPOSE) build api sandbox-ehr browser-runner agent-worker
	$(COMPOSE) up -d

seed:
	$(COMPOSE) exec -T api pnpm --filter @clinic/api exec tsx src/seed.ts

test:
	pnpm test

e2e:
	pnpm exec playwright test

down:
	$(COMPOSE) down

reset:
	$(COMPOSE) down -v

observe:
	@echo "Local OpenObserve http://127.0.0.1:5080  admin@example.com"
	@echo "Hosted OpenObserve https://cloud.openobserve.ai  stream clinic"
