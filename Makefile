TEST_DATABASE_URL := postgres://geo:geo@db:5432/geo_test?sslmode=disable

.PHONY: db-up db-down backend-run backend-test backend-test-integration backend-tidy

db-up:
	docker compose up -d --wait db

db-down:
	docker compose down

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

backend-tidy:
	cd backend && go mod tidy
