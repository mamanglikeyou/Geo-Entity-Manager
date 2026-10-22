# Geo Entity Manager

A web application to display and manage entities that have a geographic location,
such as vehicles, IoT devices or facilities. Each entity has an identity, basic
attributes, a status and a coordinate, and can be created, viewed, updated and
deleted directly on a map.

> **Status:** work in progress. The REST API and the map view (clustered
> markers, viewport-based loading, filters, detail panel) are complete; the
> create / edit / delete forms are being added next.

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
│   └── internal/
│       ├── config/   environment-based configuration
│       ├── entity/   domain model, validation rules and service
│       ├── httpapi/  router, middleware, JSON responses
│       └── storage/postgres/  repository and SQL migrations
├── deploy/postgres/  database init scripts for docker compose
├── docs/API.md       REST API reference
├── frontend/         React + TypeScript client
│   └── src/
│       ├── app/                  app shell and query client
│       ├── components/ui/        generic UI components
│       ├── features/entities/    entity model, API calls, query hooks, map, components
│       ├── hooks/                generic React hooks
│       └── lib/                  HTTP client, formatting
├── docker-compose.yml
├── CLAUDE.md         instructions for the AI coding agent used on this project
└── Makefile
```

## Running the backend

Prerequisites: [Go 1.26+](https://go.dev/dl/) and
[Docker](https://www.docker.com/products/docker-desktop/).

Start PostgreSQL + PostGIS, then the API:

```bash
docker compose up -d --wait db
cd backend
go run ./cmd/api
```

Database migrations are embedded in the binary and applied automatically on
startup. The API listens on `http://localhost:8080`:

```bash
curl http://localhost:8080/healthz   # liveness:  {"status":"ok"}
curl http://localhost:8080/readyz    # readiness: {"status":"ready"} once the DB is reachable
curl http://localhost:8080/api/v1/entities
```

The endpoints, request rules and error format are documented in
[docs/API.md](docs/API.md).

### Tests

```bash
cd backend
go test ./...
```

Repository tests talk to a real PostGIS database and are skipped unless
`TEST_DATABASE_URL` is set. Docker Compose creates a separate `geo_test`
database for them. The easiest way to run the full suite is inside a Go
container on the compose network:

```bash
make backend-test-integration
```

Without `make` (e.g. on Windows), the equivalent is:

```bash
docker compose up -d --wait db
docker run --rm --network geo-entity-manager_default -v "$(pwd)/backend:/src" -w /src -e TEST_DATABASE_URL="postgres://geo:geo@db:5432/geo_test?sslmode=disable" golang:1.26 go test ./...
```

### Configuration

The backend is configured through environment variables (see `backend/.env.example`).

| Variable               | Default                 | Description                                |
| ---------------------- | ----------------------- | ------------------------------------------ |
| `HTTP_ADDR`            | `:8080`                 | Address the HTTP server listens on         |
| `DATABASE_URL`         | local compose database  | PostgreSQL connection string               |
| `LOG_LEVEL`            | `info`                  | `debug`, `info`, `warn` or `error`         |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:5173` | Comma-separated list of allowed origins    |
| `SHUTDOWN_TIMEOUT`     | `10s`                   | Grace period for in-flight requests        |

## Running the frontend

Prerequisites: [Node.js 20+](https://nodejs.org/) and the backend running on
`http://localhost:8080`.

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. The Vite dev server proxies `/api` to the
backend, so no CORS setup is needed in development.

The map uses [OpenFreeMap](https://openfreemap.org) vector tiles, which need no
API key. Only the entities inside the visible map area are loaded, and they are
re-fetched as you pan and zoom. See `frontend/.env.example` to change the map
style or the API location.

| Command             | Purpose                                 |
| ------------------- | --------------------------------------- |
| `npm run dev`       | development server with hot reload      |
| `npm test`          | unit and component tests (Vitest)       |
| `npm run lint`      | ESLint (type-aware)                     |
| `npm run typecheck` | TypeScript, no emit                     |
| `npm run build`     | type-check and production build         |
| `npm run format`    | format with Prettier                    |
