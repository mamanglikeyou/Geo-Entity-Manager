# CLAUDE.md

Guidance for Claude Code (and any other coding agent) working in this repository.

## Project

Geo Entity Manager: a web app to display and manage entities that have a geographic
location (vehicles, IoT devices, facilities, ...). Users can list, view, create, update
and delete entities on an interactive map.

- `backend/` – Go REST API (chi, PostgreSQL + PostGIS)
- `frontend/` – React + TypeScript SPA (Vite, MapLibre GL, TanStack Query)

## Commands

```bash
# Backend (run from backend/)
go mod tidy          # sync dependencies
go run ./cmd/api     # start the API on :8080
go test ./...        # run all tests
go vet ./...
```

Configuration is read from environment variables; see `backend/.env.example`.

## Backend architecture

```
cmd/api            entrypoint: config, wiring, graceful shutdown
internal/config    environment-based configuration
internal/entity    domain: model, validation, service, Repository interface
internal/httpapi   router, middleware, handlers, JSON responses
```

Rules:

- Dependencies point inward: `httpapi` -> `entity.Service` -> `entity.Repository`.
  `internal/entity` must not import `net/http` or any database driver.
- All business validation lives in `internal/entity` and is hand-written (no
  reflection-based validator), returning `*entity.ValidationError` with every
  invalid field. The HTTP layer only checks that the request is well-formed JSON.
- The `Repository` interface is defined by its consumer (`entity`), not by the
  storage package. Implementations return `entity.ErrNotFound` for missing rows.
- Timestamps and IDs are assigned by `entity.Service`, not by the database.
- Every non-2xx response uses the error envelope in `internal/httpapi/respond.go`:
  `{"error": {"code": "...", "message": "...", "details": [...]}}`.
  Never write plain-text error bodies.
- Wrap errors with context (`fmt.Errorf("load config: %w", err)`); log once, at the edge.
- Use `log/slog` with structured key/value pairs. No `fmt.Println` / `log.Printf`.
- `context.Context` is the first parameter of anything that does I/O.

## Conventions

- Go: `gofmt`, table-driven tests, `httptest` for handlers, no global mutable state.
- Comments explain *why*, not *what*. Do not add comments that restate the code.
- Do not add a dependency without a concrete reason; mention it in the README's
  library section.
- Keep changes scoped to the current phase. Do not scaffold code for later phases.

## Workflow

Work is split into phases. For each phase the agent proposes and implements the change,
the developer reviews it, runs it locally, adjusts what they disagree with, and commits.
The agent does not commit or push on its own.

1. Repository scaffold and backend skeleton
2. Domain model, validation and unit tests
3. Database, migrations and repository
4. HTTP handlers for entity CRUD
5. Frontend scaffold and API client
6. Map view, markers and detail panel
7. Create / edit / delete forms with validation
8. Docker Compose, documentation and CI
