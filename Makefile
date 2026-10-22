TEST_DATABASE_URL := postgres://geo:geo@db:5432/geo_test?sslmode=disable
GOLANGCI_LINT := golangci/golangci-lint:v2.15.0

.PHONY: up down db-up \
	backend-run backend-test backend-test-integration backend-lint backend-tidy \
	frontend-install frontend-dev frontend-check

# Whole stack: database, API and web UI on http://localhost:3000.
up:
	docker compose up -d --build --wait

down:
	docker compose down

db-up:
	docker compose up -d --wait db

backend-run:
	cd backend && go run ./cmd/api

backend-test:
	cd backend && go test ./...

# Runs the whole suite, including the PostGIS integration tests, inside a Go
# container on the compose network.
backend-test-integration: db-up
	docker run --rm --network geo-entity-manager_default \
		-v "$(CURDIR)/backend:/src" -v geo-go-mod-cache:/go/pkg/mod -w /src \
		-e TEST_DATABASE_URL=$(TEST_DATABASE_URL) \
		golang:1.26 go test -count=1 ./...

backend-lint:
	docker run --rm -v "$(CURDIR)/backend:/src" -v geo-go-mod-cache:/go/pkg/mod -w /src \
		$(GOLANGCI_LINT) golangci-lint run ./...

backend-tidy:
	cd backend && go mod tidy

frontend-install:
	cd frontend && npm install

frontend-dev:
	cd frontend && npm run dev

# Everything CI runs for the frontend.
frontend-check:
	cd frontend && npm run format:check && npm run lint && npm run typecheck && npm test && npm run build
