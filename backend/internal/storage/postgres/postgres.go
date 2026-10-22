// Package postgres implements persistence on top of PostgreSQL + PostGIS.
package postgres

import (
	"context"
	"embed"
	"fmt"
	"io/fs"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
)

//go:embed migrations/*.sql
var embeddedMigrations embed.FS

// Connect opens a connection pool and waits until the database answers.
// It retries until ctx expires because, when everything starts together
// (docker compose), the API is often up before PostgreSQL accepts connections.
func Connect(ctx context.Context, databaseURL string) (*pgxpool.Pool, error) {
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, fmt.Errorf("create pool: %w", err)
	}

	delay := 250 * time.Millisecond
	for {
		err := pool.Ping(ctx)
		if err == nil {
			return pool, nil
		}
		select {
		case <-ctx.Done():
			pool.Close()
			return nil, fmt.Errorf("ping database: %w", err)
		case <-time.After(delay):
			delay = min(delay*2, 4*time.Second)
		}
	}
}

// Migrate applies all pending migrations and returns how many were applied.
// Migrations are embedded in the binary so a deployment can never run with
// a schema that does not match its code.
func Migrate(ctx context.Context, pool *pgxpool.Pool) (int, error) {
	migrations, err := fs.Sub(embeddedMigrations, "migrations")
	if err != nil {
		return 0, err
	}

	// goose works on database/sql; this wrapper shares the pool's connections.
	// Closing it releases only the wrapper, never the pool, and cannot fail
	// in a way that matters here.
	db := stdlib.OpenDBFromPool(pool)
	defer func() { _ = db.Close() }()

	provider, err := goose.NewProvider(goose.DialectPostgres, db, migrations)
	if err != nil {
		return 0, fmt.Errorf("create migration provider: %w", err)
	}

	results, err := provider.Up(ctx)
	if err != nil {
		return 0, fmt.Errorf("apply migrations: %w", err)
	}
	return len(results), nil
}
