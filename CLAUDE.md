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
make db-up                      # start PostGIS (docker compose)
make backend-run                # start the API on :8080, applies migrations
make backend-test               # unit tests; DB tests skip without TEST_DATABASE_URL
make backend-test-integration   # full suite incl. PostGIS tests, inside a Go container
cd backend && go vet ./...
```

```bash
# Frontend (run from frontend/)
npm run dev          # Vite on :5173, proxies /api to :8080
npm test             # Vitest
npm run lint         # ESLint, type-aware (strictTypeChecked)
npm run typecheck
npm run build
npm run format       # Prettier; run before finishing a change
```

Configuration is read from environment variables; see `backend/.env.example`
and `frontend/.env.example`.

On the developer's Windows machine, Smart App Control may block locally built
test binaries. If `go test` fails with "An Application Control policy has blocked
this file", use `make backend-test-integration`, which runs in a Linux container.

## Backend architecture

```
cmd/api            entrypoint: config, wiring, graceful shutdown
internal/config    environment-based configuration
internal/entity    domain: model, validation, service, Repository interface
internal/httpapi   router, middleware, handlers, JSON responses
internal/storage/postgres
                   pgx pool, embedded goose migrations, entity.Repository impl
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
- Schema changes go in a new numbered file under
  `internal/storage/postgres/migrations/`; never edit an applied migration.
  Migrations run automatically on API startup.
- SQL is written by hand with pgx placeholders (`$1`). Never interpolate user
  input into SQL; escape LIKE patterns with `escapeLike`.
- Locations are stored as `geometry(Point, 4326)`; longitude is X, latitude is Y.
- Every non-2xx response uses the error envelope in `internal/httpapi/respond.go`:
  `{"error": {"code": "...", "message": "...", "details": [...]}}`.
  Never write plain-text error bodies.
- Status codes: 400 when the request cannot be parsed (`requestError`), 422 when it
  parses but breaks a domain rule (`*entity.ValidationError`), 404 for
  `entity.ErrNotFound`. Anything else is logged and returned as an opaque 500.
- Handlers depend on the `httpapi.EntityService` interface and are tested with
  `stubService`; JSON field names are camelCase.
- `docs/API.md` is the API contract. Update it in the same change as any
  endpoint, field or error code.
- Wrap errors with context (`fmt.Errorf("load config: %w", err)`); log once, at the edge.
- Use `log/slog` with structured key/value pairs. No `fmt.Println` / `log.Printf`.
- `context.Context` is the first parameter of anything that does I/O.

## Frontend architecture

```
src/app                  app shell, QueryClient setup
src/components/ui        generic, feature-agnostic components (Button, Input, ...)
src/features/<feature>/  model.ts   types, zod schemas, enum labels and colors
                         api.ts     HTTP calls for the feature
                         queries.ts TanStack Query keys and hooks
                         map.ts     pure map helpers (GeoJSON, bbox, camera)
                         filters.ts filter form state
                         form.ts    entity form schema (zod), conversions,
                                    server-error mapping
                         components/
src/hooks                generic React hooks
src/lib                  cross-cutting code (HTTP client, formatting)
src/test                 test setup and helpers (mockFetch, routeFetch, ...)
```

`EntityExplorer` is the main screen. It owns the filter, viewport (bbox) and
panel state (`list | detail | create | edit`), runs the single list query, and
passes the results to both `EntityMap` and `EntityList`.

Rules:

- Server state lives only in TanStack Query. Components use the hooks in
  `queries.ts`; they never call `fetch` or `api.ts` directly.
- Every API response is parsed with a zod schema in `model.ts`. Every failure is
  an `ApiError` (from `lib/http.ts`) with `status`, `code` and field `details`.
- Enums in `model.ts` mirror `internal/entity/entity.go`; change both together.
- After a write, update the detail cache and invalidate all list queries.
- Styling is Tailwind utility classes only; `index.css` holds just the import.
- Import across folders via the `@/` alias; relative imports within a feature.
- Tests use Vitest + Testing Library and stub `fetch` with `mockFetch` (ordered
  responses) or `routeFetch` (by path). Query by role or visible text, not by
  class names or test ids.
- Component files export only components (Fast Refresh); constants and helpers
  go in a sibling `.ts` file.

Forms (react-hook-form + zod):

- `entityFormSchema` in `form.ts` mirrors the backend rules (`LIMITS` and
  `ATTRIBUTE_KEY_PATTERN` in `model.ts`). Change them together with
  `internal/entity/validation.go`. Lengths count code points, like Go runes.
- Form values are text (`z.input`); the schema parses them into `EntityInput`
  (`z.output`). Attributes are edited as rows and turned into a map on submit.
- Server validation errors go through `toServerFormErrors` onto the matching
  fields; anything unmatched becomes a form-level alert. Never only toast them.
- Use `Field` for labelled controls: it wires `aria-invalid` and
  `aria-describedby` to the hint or error.
- Location sync: map click/drag -> `pickedLocation` -> form fields; form fields
  -> `onLocationChange` -> draft pin. Keep that one-way flow in each direction.

Map (MapLibre via `react-map-gl/maplibre`):

- Entities are one clustered GeoJSON source with circle layers, not DOM
  markers. Status colors come from `ENTITY_STATUS_COLORS` in `model.ts`.
- In click handlers, query features with `map.queryRenderedFeatures(point)`.
  Do not rely on `event.features`: react-map-gl fills it from the last
  mousemove, so it is empty for taps and clicks without a preceding move.
- The worker URL is set explicitly via `?worker&url` in `EntityMap.tsx`;
  without it the map never loads after bundling.
- `EntityMap` is lazy-loaded. jsdom has no WebGL, so component tests mock it
  (see `EntityExplorer.test.tsx`); keep map logic in `map.ts` where it is
  unit-testable.

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
