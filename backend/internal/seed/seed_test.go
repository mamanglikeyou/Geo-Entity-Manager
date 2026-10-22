package seed

import (
	"context"
	"testing"

	"github.com/google/uuid"

	"geo-entity-manager/backend/internal/entity"
)

// memoryRepo is the minimum entity.Repository needed to run the real
// service, so the samples go through the same validation as user input.
type memoryRepo struct {
	entities []entity.Entity
}

func (r *memoryRepo) List(_ context.Context, f entity.ListFilter) ([]entity.Entity, error) {
	return r.entities[:min(len(r.entities), f.Limit)], nil
}

func (r *memoryRepo) Create(_ context.Context, e entity.Entity) (entity.Entity, error) {
	r.entities = append(r.entities, e)
	return e, nil
}

func (r *memoryRepo) Get(context.Context, uuid.UUID) (entity.Entity, error) {
	return entity.Entity{}, entity.ErrNotFound
}

func (r *memoryRepo) Update(context.Context, entity.Entity) (entity.Entity, error) {
	return entity.Entity{}, entity.ErrNotFound
}

func (r *memoryRepo) Delete(context.Context, uuid.UUID) error {
	return entity.ErrNotFound
}

func TestSampleDataSeedsAnEmptyStore(t *testing.T) {
	repo := &memoryRepo{}

	created, err := SampleData(context.Background(), entity.NewService(repo))
	if err != nil {
		t.Fatalf("unexpected error (is a sample invalid?): %v", err)
	}

	if created != len(samples) || len(repo.entities) != len(samples) {
		t.Errorf("created %d, stored %d, want %d", created, len(repo.entities), len(samples))
	}
}

func TestSampleDataLeavesExistingDataAlone(t *testing.T) {
	repo := &memoryRepo{entities: []entity.Entity{{Name: "Existing"}}}

	created, err := SampleData(context.Background(), entity.NewService(repo))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if created != 0 || len(repo.entities) != 1 {
		t.Errorf("created %d, stored %d, want nothing added", created, len(repo.entities))
	}
}
