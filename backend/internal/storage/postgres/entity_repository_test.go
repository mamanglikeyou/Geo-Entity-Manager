package postgres_test

import (
	"context"
	"errors"
	"fmt"
	"os"
	"reflect"
	"slices"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"geo-entity-manager/backend/internal/entity"
	"geo-entity-manager/backend/internal/storage/postgres"
)

// These are integration tests against a real PostGIS database. They run only
// when TEST_DATABASE_URL is set, and they truncate the entities table, so
// point it at a dedicated database (docker-compose creates geo_test).
var testPool *pgxpool.Pool

func TestMain(m *testing.M) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		fmt.Println("TEST_DATABASE_URL not set, skipping postgres integration tests")
		os.Exit(0)
	}

	ctx := context.Background()
	pool, err := postgres.Connect(ctx, url)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	if _, err := postgres.Migrate(ctx, pool); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	testPool = pool
	code := m.Run()
	pool.Close()
	os.Exit(code)
}

func newRepo(t *testing.T) *postgres.EntityRepository {
	t.Helper()
	if _, err := testPool.Exec(context.Background(), "TRUNCATE entities"); err != nil {
		t.Fatalf("truncate: %v", err)
	}
	return postgres.NewEntityRepository(testPool)
}

var baseTime = time.Date(2026, 3, 1, 8, 0, 0, 123456000, time.UTC)

func sampleEntity(name string, typ entity.Type, status entity.Status, lat, lng float64, updated time.Time) entity.Entity {
	return entity.Entity{
		ID:          uuid.New(),
		Name:        name,
		Type:        typ,
		Status:      status,
		Description: "seeded by test",
		Attributes:  map[string]string{"owner": "ops"},
		Location:    entity.Location{Latitude: lat, Longitude: lng},
		CreatedAt:   baseTime,
		UpdatedAt:   updated,
	}
}

func mustCreate(t *testing.T, repo *postgres.EntityRepository, e entity.Entity) entity.Entity {
	t.Helper()
	created, err := repo.Create(context.Background(), e)
	if err != nil {
		t.Fatalf("create %q: %v", e.Name, err)
	}
	return created
}

func TestCreateAndGet(t *testing.T) {
	repo := newRepo(t)
	want := sampleEntity("Truck 01", entity.TypeVehicle, entity.StatusActive, -6.2088, 106.8456, baseTime)
	want.Attributes = map[string]string{"plate_number": "B 1234 XYZ", "driver": "Budi"}

	created := mustCreate(t, repo, want)
	assertEntityEqual(t, created, want)

	got, err := repo.Get(context.Background(), want.ID)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	assertEntityEqual(t, got, want)
}

func TestGetMissing(t *testing.T) {
	repo := newRepo(t)

	_, err := repo.Get(context.Background(), uuid.New())
	if !errors.Is(err, entity.ErrNotFound) {
		t.Fatalf("error = %v, want ErrNotFound", err)
	}
}

func TestUpdate(t *testing.T) {
	repo := newRepo(t)
	original := mustCreate(t, repo,
		sampleEntity("Sensor A", entity.TypeIoTDevice, entity.StatusActive, -6.2, 106.8, baseTime))

	changed := original
	changed.Name = "Sensor A (moved)"
	changed.Status = entity.StatusMaintenance
	changed.Attributes = map[string]string{}
	changed.Location = entity.Location{Latitude: -7.25, Longitude: 112.75}
	changed.CreatedAt = time.Time{} // the repository must keep the stored value
	changed.UpdatedAt = baseTime.Add(time.Hour)

	got, err := repo.Update(context.Background(), changed)
	if err != nil {
		t.Fatalf("update: %v", err)
	}

	want := changed
	want.CreatedAt = original.CreatedAt
	assertEntityEqual(t, got, want)
}

func TestUpdateMissing(t *testing.T) {
	repo := newRepo(t)
	e := sampleEntity("Ghost", entity.TypeOther, entity.StatusActive, 0, 0, baseTime)

	_, err := repo.Update(context.Background(), e)
	if !errors.Is(err, entity.ErrNotFound) {
		t.Fatalf("error = %v, want ErrNotFound", err)
	}
}

func TestDelete(t *testing.T) {
	repo := newRepo(t)
	ctx := context.Background()
	e := mustCreate(t, repo, sampleEntity("Depot", entity.TypeFacility, entity.StatusActive, 0, 0, baseTime))

	if err := repo.Delete(ctx, e.ID); err != nil {
		t.Fatalf("delete: %v", err)
	}
	if _, err := repo.Get(ctx, e.ID); !errors.Is(err, entity.ErrNotFound) {
		t.Errorf("get after delete: error = %v, want ErrNotFound", err)
	}
	if err := repo.Delete(ctx, e.ID); !errors.Is(err, entity.ErrNotFound) {
		t.Errorf("second delete: error = %v, want ErrNotFound", err)
	}
}

func TestListFilters(t *testing.T) {
	repo := newRepo(t)
	mustCreate(t, repo, sampleEntity("Truck 01", entity.TypeVehicle, entity.StatusActive,
		-6.2000, 106.8000, baseTime.Add(3*time.Minute)))
	mustCreate(t, repo, sampleEntity("Sensor 50% humidity", entity.TypeIoTDevice, entity.StatusOffline,
		-6.2100, 106.8500, baseTime.Add(2*time.Minute)))
	mustCreate(t, repo, sampleEntity("Depot Surabaya", entity.TypeFacility, entity.StatusActive,
		-7.2500, 112.7500, baseTime.Add(1*time.Minute)))

	jakarta := &entity.BoundingBox{MinLongitude: 106.6, MinLatitude: -6.4, MaxLongitude: 107.0, MaxLatitude: -6.0}

	tests := []struct {
		name   string
		filter entity.ListFilter
		want   []string
	}{
		{"no filter, newest first", entity.ListFilter{},
			[]string{"Truck 01", "Sensor 50% humidity", "Depot Surabaya"}},
		{"by type", entity.ListFilter{Type: entity.TypeVehicle},
			[]string{"Truck 01"}},
		{"by status", entity.ListFilter{Status: entity.StatusActive},
			[]string{"Truck 01", "Depot Surabaya"}},
		{"search is case-insensitive", entity.ListFilter{Search: "truck"},
			[]string{"Truck 01"}},
		{"percent sign is literal", entity.ListFilter{Search: "%"},
			[]string{"Sensor 50% humidity"}},
		{"underscore is literal", entity.ListFilter{Search: "_"},
			[]string{}},
		{"bounding box", entity.ListFilter{BBox: jakarta},
			[]string{"Truck 01", "Sensor 50% humidity"}},
		{"combined filters", entity.ListFilter{Type: entity.TypeIoTDevice, BBox: jakarta},
			[]string{"Sensor 50% humidity"}},
		{"limit", entity.ListFilter{Limit: 1},
			[]string{"Truck 01"}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f := tt.filter
			if f.Limit == 0 {
				f.Limit = entity.DefaultListLimit
			}

			got, err := repo.List(context.Background(), f)
			if err != nil {
				t.Fatalf("list: %v", err)
			}

			names := make([]string, len(got))
			for i, e := range got {
				names[i] = e.Name
			}
			if !slices.Equal(names, tt.want) {
				t.Errorf("names = %v, want %v", names, tt.want)
			}
		})
	}
}

func assertEntityEqual(t *testing.T, got, want entity.Entity) {
	t.Helper()

	if !got.CreatedAt.Equal(want.CreatedAt) {
		t.Errorf("CreatedAt = %v, want %v", got.CreatedAt, want.CreatedAt)
	}
	if !got.UpdatedAt.Equal(want.UpdatedAt) {
		t.Errorf("UpdatedAt = %v, want %v", got.UpdatedAt, want.UpdatedAt)
	}

	got.CreatedAt, got.UpdatedAt = time.Time{}, time.Time{}
	want.CreatedAt, want.UpdatedAt = time.Time{}, time.Time{}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("entity mismatch\n got: %+v\nwant: %+v", got, want)
	}
}
