# Geo Entity Manager

A web application to display and manage entities that have a geographic location,
such as vehicles, IoT devices or facilities. Each entity has an identity, basic
attributes, a status and a coordinate, and can be created, viewed, updated and
deleted directly on a map.

> **Status:** work in progress. The backend skeleton is in place; the domain,
> persistence and frontend are being added in subsequent changes.

## Tech stack

| Layer    | Choice                                              |
| -------- | --------------------------------------------------- |
| Backend  | Go, chi, PostgreSQL + PostGIS                        |
| Frontend | React, TypeScript, Vite, MapLibre GL, TanStack Query |

A full explanation of the library choices will be added once all layers are in place.

## Repository layout

```
.
├── backend/          Go REST API
│   ├── cmd/api/      application entrypoint
│   └── internal/     config, HTTP layer (more packages to come)
├── frontend/         React + TypeScript client (coming soon)
├── CLAUDE.md         instructions for the AI coding agent used on this project
└── Makefile
```

## Running the backend

Prerequisites: [Go 1.23+](https://go.dev/dl/).

```bash
cd backend
go mod tidy
go run ./cmd/api
```

The API listens on `http://localhost:8080`. Check it with:

```bash
curl http://localhost:8080/healthz
# {"status":"ok"}
```

Run the tests:

```bash
cd backend
go test ./...
```

### Configuration

The backend is configured through environment variables (see `backend/.env.example`).

| Variable               | Default                 | Description                                |
| ---------------------- | ----------------------- | ------------------------------------------ |
| `HTTP_ADDR`            | `:8080`                 | Address the HTTP server listens on         |
| `LOG_LEVEL`            | `info`                  | `debug`, `info`, `warn` or `error`         |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:5173` | Comma-separated list of allowed origins    |
| `SHUTDOWN_TIMEOUT`     | `10s`                   | Grace period for in-flight requests        |
