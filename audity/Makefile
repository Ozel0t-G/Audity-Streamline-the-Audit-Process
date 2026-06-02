COMPOSE ?= docker compose

.PHONY: up down logs db\:migrate db\:seed

up:
	$(COMPOSE) up --build

down:
	$(COMPOSE) down

logs:
	$(COMPOSE) logs -f

db\:migrate:
	$(COMPOSE) run --rm audity-api npm run db:migrate

db\:seed:
	$(COMPOSE) run --rm audity-api npm run db:seed
