# API reference

Base URL: `http://localhost:8080`. All request and response bodies are JSON
(`Content-Type: application/json`). Every response carries an `X-Request-Id`
header that matches the server logs.

## Entity

```json
{
  "id": "3e65e37a-4d9f-493f-aae0-2152ec7a765f",
  "name": "Truck 01",
  "type": "vehicle",
  "status": "active",
  "description": "Delivery truck for the Jakarta area",
  "attributes": { "plate_number": "B 1234 XYZ" },
  "latitude": -6.2088,
  "longitude": 106.8456,
  "createdAt": "2026-10-22T14:58:45.791039Z",
  "updatedAt": "2026-10-22T14:58:45.791039Z"
}
```

| Field         | Rules                                                                     |
| ------------- | ------------------------------------------------------------------------- |
| `name`        | required, 1–100 characters (surrounding whitespace is trimmed)            |
| `type`        | required, one of `vehicle`, `iot_device`, `facility`, `other`             |
| `status`      | required, one of `active`, `inactive`, `maintenance`, `offline`           |
| `description` | optional, up to 500 characters                                            |
| `attributes`  | optional string map, up to 20 entries; keys 1–50 chars of `[A-Za-z0-9_-]`, values up to 200 chars |
| `latitude`    | required, -90 to 90                                                       |
| `longitude`   | required, -180 to 180                                                     |

`id`, `createdAt` and `updatedAt` are set by the server and ignored if sent.
Sending any other unknown field is rejected.

## Endpoints

### `GET /api/v1/entities`

Lists entities, most recently updated first.

| Query param | Description                                                       |
| ----------- | ----------------------------------------------------------------- |
| `type`      | exact match on type                                               |
| `status`    | exact match on status                                             |
| `search`    | case-insensitive substring match on name                          |
| `bbox`      | `minLng,minLat,maxLng,maxLat`; only entities inside the box       |
| `limit`     | 1–1000, default 500                                               |

Response `200`:

```json
{ "items": [ /* entities */ ], "count": 1 }
```

### `GET /api/v1/entities/{id}`

Returns one entity (`200`), or `404` if it does not exist.

### `POST /api/v1/entities`

Creates an entity. Responds `201` with the entity and a `Location` header.

```bash
curl -X POST http://localhost:8080/api/v1/entities \
  -H 'Content-Type: application/json' \
  -d '{"name":"Truck 01","type":"vehicle","status":"active","latitude":-6.2088,"longitude":106.8456}'
```

### `PUT /api/v1/entities/{id}`

Replaces every editable field of an entity (same body as `POST`). Fields left
out are reset to their empty value, e.g. omitting `attributes` clears them.
Responds `200` with the updated entity, or `404`.

### `DELETE /api/v1/entities/{id}`

Responds `204` with no body, or `404`.

### `GET /healthz`, `GET /readyz`

Liveness (process is up) and readiness (database is reachable, `503` otherwise).

## Errors

Every error uses the same envelope:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "validation failed",
    "details": [
      { "field": "name", "message": "is required" },
      { "field": "latitude", "message": "must be between -90 and 90" }
    ]
  }
}
```

`details` is present only when the error relates to specific fields. All
invalid fields are reported at once.

| Status | Code                     | When                                                        |
| ------ | ------------------------ | ----------------------------------------------------------- |
| 400    | `INVALID_REQUEST`        | malformed JSON, unknown field, wrong JSON type, bad query parameter or id |
| 404    | `NOT_FOUND`              | entity or route does not exist                              |
| 405    | `METHOD_NOT_ALLOWED`     | method not supported on the route                           |
| 413    | `PAYLOAD_TOO_LARGE`      | body larger than 64 KiB                                     |
| 415    | `UNSUPPORTED_MEDIA_TYPE` | `Content-Type` is not `application/json`                    |
| 422    | `VALIDATION_FAILED`      | well-formed request that breaks a business rule             |
| 500    | `INTERNAL_ERROR`         | unexpected failure; details are only in the server log      |
| 503    | `SERVICE_UNAVAILABLE`    | readiness check failed                                      |
