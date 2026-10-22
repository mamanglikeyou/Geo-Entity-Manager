package entity

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
)

var ErrNotFound = errors.New("entity not found")

// Repository persists entities. Get, Update and Delete return ErrNotFound
// when no entity has the given ID.
type Repository interface {
	List(ctx context.Context, filter ListFilter) ([]Entity, error)
	Get(ctx context.Context, id uuid.UUID) (Entity, error)
	Create(ctx context.Context, e Entity) (Entity, error)
	// Update replaces every field except CreatedAt, which keeps its stored
	// value and is filled in on the returned entity.
	Update(ctx context.Context, e Entity) (Entity, error)
	Delete(ctx context.Context, id uuid.UUID) error
}

type Service struct {
	repo  Repository
	now   func() time.Time
	newID func() uuid.UUID
}

func NewService(repo Repository) *Service {
	return &Service{repo: repo, now: time.Now, newID: uuid.New}
}

func (s *Service) List(ctx context.Context, filter ListFilter) ([]Entity, error) {
	filter = filter.normalize()
	if err := filter.validate(); err != nil {
		return nil, err
	}

	entities, err := s.repo.List(ctx, filter)
	if err != nil {
		return nil, fmt.Errorf("list entities: %w", err)
	}
	return entities, nil
}

func (s *Service) Get(ctx context.Context, id uuid.UUID) (Entity, error) {
	e, err := s.repo.Get(ctx, id)
	if err != nil {
		return Entity{}, fmt.Errorf("get entity %s: %w", id, err)
	}
	return e, nil
}

func (s *Service) Create(ctx context.Context, in Input) (Entity, error) {
	in = in.normalize()
	if err := in.validate(); err != nil {
		return Entity{}, err
	}

	now := s.timestamp()
	e := fromInput(s.newID(), in)
	e.CreatedAt = now
	e.UpdatedAt = now

	created, err := s.repo.Create(ctx, e)
	if err != nil {
		return Entity{}, fmt.Errorf("create entity: %w", err)
	}
	return created, nil
}

func (s *Service) Update(ctx context.Context, id uuid.UUID, in Input) (Entity, error) {
	in = in.normalize()
	if err := in.validate(); err != nil {
		return Entity{}, err
	}

	e := fromInput(id, in)
	e.UpdatedAt = s.timestamp()

	updated, err := s.repo.Update(ctx, e)
	if err != nil {
		return Entity{}, fmt.Errorf("update entity %s: %w", id, err)
	}
	return updated, nil
}

func (s *Service) Delete(ctx context.Context, id uuid.UUID) error {
	if err := s.repo.Delete(ctx, id); err != nil {
		return fmt.Errorf("delete entity %s: %w", id, err)
	}
	return nil
}

// timestamp is truncated to microseconds because that is what PostgreSQL
// stores; otherwise the value returned to the client would differ from the
// one read back later.
func (s *Service) timestamp() time.Time {
	return s.now().UTC().Truncate(time.Microsecond)
}

func fromInput(id uuid.UUID, in Input) Entity {
	return Entity{
		ID:          id,
		Name:        in.Name,
		Type:        in.Type,
		Status:      in.Status,
		Description: in.Description,
		Attributes:  in.Attributes,
		Location:    in.Location,
	}
}
