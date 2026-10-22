package entity

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
)

// fakeRepo is an in-memory Repository that records how it was called.
type fakeRepo struct {
	entities   map[uuid.UUID]Entity
	lastFilter ListFilter
	calls      int
}

func newFakeRepo(seed ...Entity) *fakeRepo {
	r := &fakeRepo{entities: make(map[uuid.UUID]Entity)}
	for _, e := range seed {
		r.entities[e.ID] = e
	}
	return r
}

func (r *fakeRepo) List(_ context.Context, f ListFilter) ([]Entity, error) {
	r.calls++
	r.lastFilter = f
	out := make([]Entity, 0, len(r.entities))
	for _, e := range r.entities {
		out = append(out, e)
	}
	return out, nil
}

func (r *fakeRepo) Get(_ context.Context, id uuid.UUID) (Entity, error) {
	r.calls++
	e, ok := r.entities[id]
	if !ok {
		return Entity{}, ErrNotFound
	}
	return e, nil
}

func (r *fakeRepo) Create(_ context.Context, e Entity) (Entity, error) {
	r.calls++
	r.entities[e.ID] = e
	return e, nil
}

func (r *fakeRepo) Update(_ context.Context, e Entity) (Entity, error) {
	r.calls++
	existing, ok := r.entities[e.ID]
	if !ok {
		return Entity{}, ErrNotFound
	}
	e.CreatedAt = existing.CreatedAt
	r.entities[e.ID] = e
	return e, nil
}

func (r *fakeRepo) Delete(_ context.Context, id uuid.UUID) error {
	r.calls++
	if _, ok := r.entities[id]; !ok {
		return ErrNotFound
	}
	delete(r.entities, id)
	return nil
}

var (
	fixedID   = uuid.MustParse("6f1c2a52-3c4b-4a8e-9a7d-2f0e5b7c9d10")
	fixedTime = time.Date(2026, 1, 2, 3, 4, 5, 123456789, time.UTC)
)

func newTestService(repo Repository) *Service {
	s := NewService(repo)
	s.now = func() time.Time { return fixedTime }
	s.newID = func() uuid.UUID { return fixedID }
	return s
}

func TestServiceCreate(t *testing.T) {
	repo := newFakeRepo()
	svc := newTestService(repo)

	in := validInput()
	in.Name = "  Truck 01  "

	got, err := svc.Create(context.Background(), in)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if got.ID != fixedID {
		t.Errorf("ID = %s, want %s", got.ID, fixedID)
	}
	if got.Name != "Truck 01" {
		t.Errorf("Name = %q, want trimmed %q", got.Name, "Truck 01")
	}
	wantTime := fixedTime.Truncate(time.Microsecond)
	if !got.CreatedAt.Equal(wantTime) || !got.UpdatedAt.Equal(wantTime) {
		t.Errorf("timestamps = (%v, %v), want %v", got.CreatedAt, got.UpdatedAt, wantTime)
	}
	if _, ok := repo.entities[fixedID]; !ok {
		t.Error("entity was not persisted")
	}
}

func TestServiceCreateRejectsInvalidInput(t *testing.T) {
	repo := newFakeRepo()
	svc := newTestService(repo)

	in := validInput()
	in.Location.Latitude = 91

	_, err := svc.Create(context.Background(), in)

	assertInvalidFields(t, err, []string{"latitude"})
	if repo.calls != 0 {
		t.Errorf("repository called %d times, want 0", repo.calls)
	}
}

func TestServiceUpdate(t *testing.T) {
	created := time.Date(2025, 6, 1, 0, 0, 0, 0, time.UTC)
	repo := newFakeRepo(Entity{ID: fixedID, Name: "Old", CreatedAt: created, UpdatedAt: created})
	svc := newTestService(repo)

	in := validInput()
	in.Status = StatusMaintenance

	got, err := svc.Update(context.Background(), fixedID, in)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if got.Status != StatusMaintenance {
		t.Errorf("Status = %q, want %q", got.Status, StatusMaintenance)
	}
	if !got.CreatedAt.Equal(created) {
		t.Errorf("CreatedAt = %v, want unchanged %v", got.CreatedAt, created)
	}
	if !got.UpdatedAt.Equal(fixedTime.Truncate(time.Microsecond)) {
		t.Errorf("UpdatedAt = %v, want %v", got.UpdatedAt, fixedTime)
	}
}

func TestServiceUpdateRejectsInvalidInput(t *testing.T) {
	repo := newFakeRepo()
	svc := newTestService(repo)

	_, err := svc.Update(context.Background(), fixedID, Input{})

	var verr *ValidationError
	if !errors.As(err, &verr) {
		t.Fatalf("error = %v, want *ValidationError", err)
	}
	if repo.calls != 0 {
		t.Errorf("repository called %d times, want 0", repo.calls)
	}
}

func TestServiceNotFound(t *testing.T) {
	svc := newTestService(newFakeRepo())
	ctx := context.Background()
	missing := uuid.New()

	_, getErr := svc.Get(ctx, missing)
	_, updateErr := svc.Update(ctx, missing, validInput())
	deleteErr := svc.Delete(ctx, missing)

	for name, err := range map[string]error{"Get": getErr, "Update": updateErr, "Delete": deleteErr} {
		if !errors.Is(err, ErrNotFound) {
			t.Errorf("%s error = %v, want ErrNotFound", name, err)
		}
	}
}

func TestServiceDelete(t *testing.T) {
	repo := newFakeRepo(Entity{ID: fixedID})
	svc := newTestService(repo)

	if err := svc.Delete(context.Background(), fixedID); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, ok := repo.entities[fixedID]; ok {
		t.Error("entity still present after delete")
	}
}

func TestServiceListAppliesDefaults(t *testing.T) {
	repo := newFakeRepo()
	svc := newTestService(repo)

	if _, err := svc.List(context.Background(), ListFilter{Search: " depot "}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if repo.lastFilter.Limit != DefaultListLimit {
		t.Errorf("Limit = %d, want %d", repo.lastFilter.Limit, DefaultListLimit)
	}
	if repo.lastFilter.Search != "depot" {
		t.Errorf("Search = %q, want %q", repo.lastFilter.Search, "depot")
	}
}

func TestServiceListRejectsInvalidFilter(t *testing.T) {
	repo := newFakeRepo()
	svc := newTestService(repo)

	_, err := svc.List(context.Background(), ListFilter{Limit: -5})

	assertInvalidFields(t, err, []string{"limit"})
	if repo.calls != 0 {
		t.Errorf("repository called %d times, want 0", repo.calls)
	}
}
