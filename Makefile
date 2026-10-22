.PHONY: backend-run backend-test backend-tidy

backend-run:
	cd backend && go run ./cmd/api

backend-test:
	cd backend && go test ./...

backend-tidy:
	cd backend && go mod tidy
