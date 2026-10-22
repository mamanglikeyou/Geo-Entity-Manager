-- +goose Up
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE entities (
    id          uuid PRIMARY KEY,
    name        text NOT NULL,
    type        text NOT NULL CHECK (type IN ('vehicle', 'iot_device', 'facility', 'other')),
    status      text NOT NULL CHECK (status IN ('active', 'inactive', 'maintenance', 'offline')),
    description text NOT NULL DEFAULT '',
    attributes  jsonb NOT NULL DEFAULT '{}'::jsonb,
    -- geometry rather than geography: viewport (bounding box) queries are
    -- planar rectangles in lon/lat, which is exactly what && on geometry does.
    location    geometry(Point, 4326) NOT NULL,
    created_at  timestamptz NOT NULL,
    updated_at  timestamptz NOT NULL
);

CREATE INDEX entities_location_idx ON entities USING gist (location);
CREATE INDEX entities_name_trgm_idx ON entities USING gin (name gin_trgm_ops);
CREATE INDEX entities_updated_at_idx ON entities (updated_at DESC, id);

-- +goose Down
DROP TABLE entities;
