package postgres

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"geo-entity-manager/backend/internal/entity"
)

const entityColumns = `id, name, type, status, description, attributes,
	ST_Y(location) AS latitude, ST_X(location) AS longitude,
	created_at, updated_at`

// EntityRepository implements entity.Repository.
type EntityRepository struct {
	pool *pgxpool.Pool
}

var _ entity.Repository = (*EntityRepository)(nil)

func NewEntityRepository(pool *pgxpool.Pool) *EntityRepository {
	return &EntityRepository{pool: pool}
}

func (r *EntityRepository) List(ctx context.Context, f entity.ListFilter) ([]entity.Entity, error) {
	var (
		conds []string
		args  []any
	)
	// arg registers a query parameter and returns its placeholder, so the
	// WHERE clause can be assembled from only the filters that are set.
	arg := func(v any) string {
		args = append(args, v)
		return fmt.Sprintf("$%d", len(args))
	}

	if f.Type != "" {
		conds = append(conds, "type = "+arg(f.Type))
	}
	if f.Status != "" {
		conds = append(conds, "status = "+arg(f.Status))
	}
	if f.Search != "" {
		conds = append(conds, "name ILIKE "+arg("%"+escapeLike(f.Search)+"%"))
	}
	if b := f.BBox; b != nil {
		conds = append(conds, fmt.Sprintf("location && ST_MakeEnvelope(%s, %s, %s, %s, 4326)",
			arg(b.MinLongitude), arg(b.MinLatitude), arg(b.MaxLongitude), arg(b.MaxLatitude)))
	}

	var q strings.Builder
	q.WriteString("SELECT " + entityColumns + " FROM entities")
	if len(conds) > 0 {
		q.WriteString(" WHERE " + strings.Join(conds, " AND "))
	}
	q.WriteString(" ORDER BY updated_at DESC, id LIMIT " + arg(f.Limit))

	rows, err := r.pool.Query(ctx, q.String(), args...)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (entity.Entity, error) {
		return scanEntity(row)
	})
}

func (r *EntityRepository) Get(ctx context.Context, id uuid.UUID) (entity.Entity, error) {
	row := r.pool.QueryRow(ctx, `SELECT `+entityColumns+` FROM entities WHERE id = $1`, id)
	return scanOne(row)
}

func (r *EntityRepository) Create(ctx context.Context, e entity.Entity) (entity.Entity, error) {
	row := r.pool.QueryRow(ctx, `
		INSERT INTO entities (id, name, type, status, description, attributes, location, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, ST_SetSRID(ST_MakePoint($7, $8), 4326), $9, $10)
		RETURNING `+entityColumns,
		e.ID, e.Name, e.Type, e.Status, e.Description, e.Attributes,
		e.Location.Longitude, e.Location.Latitude, e.CreatedAt, e.UpdatedAt,
	)
	return scanOne(row)
}

func (r *EntityRepository) Update(ctx context.Context, e entity.Entity) (entity.Entity, error) {
	row := r.pool.QueryRow(ctx, `
		UPDATE entities
		SET name = $2, type = $3, status = $4, description = $5, attributes = $6,
		    location = ST_SetSRID(ST_MakePoint($7, $8), 4326), updated_at = $9
		WHERE id = $1
		RETURNING `+entityColumns,
		e.ID, e.Name, e.Type, e.Status, e.Description, e.Attributes,
		e.Location.Longitude, e.Location.Latitude, e.UpdatedAt,
	)
	return scanOne(row)
}

func (r *EntityRepository) Delete(ctx context.Context, id uuid.UUID) error {
	tag, err := r.pool.Exec(ctx, `DELETE FROM entities WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return entity.ErrNotFound
	}
	return nil
}

func scanOne(row pgx.Row) (entity.Entity, error) {
	e, err := scanEntity(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return entity.Entity{}, entity.ErrNotFound
	}
	return e, err
}

func scanEntity(row pgx.Row) (entity.Entity, error) {
	var e entity.Entity
	err := row.Scan(
		&e.ID, &e.Name, &e.Type, &e.Status, &e.Description, &e.Attributes,
		&e.Location.Latitude, &e.Location.Longitude,
		&e.CreatedAt, &e.UpdatedAt,
	)
	if err != nil {
		return entity.Entity{}, err
	}
	// pgx returns timestamps in the local zone; the domain works in UTC.
	e.CreatedAt = e.CreatedAt.UTC()
	e.UpdatedAt = e.UpdatedAt.UTC()
	return e, nil
}

// escapeLike makes user input match literally inside a LIKE pattern, so a
// search for "50%" does not behave like a wildcard.
func escapeLike(s string) string {
	return strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(s)
}
