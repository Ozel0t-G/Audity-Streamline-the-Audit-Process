COMPOSE ?= docker compose

.PHONY: install update health up down logs db\:migrate db\:seed

install:
	./scripts/install.sh

update:
	./scripts/update.sh

health:
	./scripts/healthcheck.sh

up:
	$(COMPOSE) up --build -d

down:
	$(COMPOSE) down

logs:
	$(COMPOSE) logs -f

db\:migrate:
	$(COMPOSE) run --rm audity-api npm run db:migrate

db\:seed:
	$(COMPOSE) run --rm audity-api npm run db:seed
