package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"reflect"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"geo-entity-manager/backend/internal/entity"
)

// stubService lets each test decide how the domain layer responds. Calls
// to a method the test did not set up fail loudly via errNotStubbed.
type stubService struct {
	list   func(context.Context, entity.ListFilter) ([]entity.Entity, error)
	get    func(context.Context, uuid.UUID) (entity.Entity, error)
	create func(context.Context, entity.Input) (entity.Entity, error)
	update func(context.Context, uuid.UUID, entity.Input) (entity.Entity, error)
	delete func(context.Context, uuid.UUID) error
}

var errNotStubbed = errors.New("stubService: method not stubbed")

func (s *stubService) List(ctx context.Context, f entity.ListFilter) ([]entity.Entity, error) {
	if s.list == nil {
		return nil, errNotStubbed
	}
	return s.list(ctx, f)
}

func (s *stubService) Get(ctx context.Context, id uuid.UUID) (entity.Entity, error) {
	if s.get == nil {
		return entity.Entity{}, errNotStubbed
	}
	return s.get(ctx, id)
}

func (s *stubService) Create(ctx context.Context, in entity.Input) (entity.Entity, error) {
	if s.create == nil {
		return entity.Entity{}, errNotStubbed
	}
	return s.create(ctx, in)
}

func (s *stubService) Update(ctx context.Context, id uuid.UUID, in entity.Input) (entity.Entity, error) {
	if s.update == nil {
		return entity.Entity{}, errNotStubbed
	}
	return s.update(ctx, id, in)
}

func (s *stubService) Delete(ctx context.Context, id uuid.UUID) error {
	if s.delete == nil {
		return errNotStubbed
	}
	return s.delete(ctx, id)
}

var (
	truckID = uuid.MustParse("0b6c8f2e-8d0a-4c55-9f43-1f5a2d3e4b6c")
	truck   = entity.Entity{
		ID:          truckID,
		Name:        "Truck 01",
		Type:        entity.TypeVehicle,
		Status:      entity.StatusActive,
		Description: "Delivery truck",
		Attributes:  map[string]string{"plate_number": "B 1234 XYZ"},
		Location:    entity.Location{Latitude: -6.2088, Longitude: 106.8456},
		CreatedAt:   time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC),
		UpdatedAt:   time.Date(2026, 1, 2, 0, 0, 0, 0, time.UTC),
	}
	validBody = `{"name":"Truck 01","type":"vehicle","status":"active",` +
		`"attributes":{"plate_number":"B 1234 XYZ"},"latitude":-6.2088,"longitude":106.8456}`
)

func serve(t *testing.T, svc *stubService, method, target, body string) *httptest.ResponseRecorder {
	t.Helper()

	var req *http.Request
	if body == "" {
		req = httptest.NewRequest(method, target, nil)
	} else {
		req = httptest.NewRequest(method, target, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
	}

	rec := httptest.NewRecorder()
	testRouter(RouterConfig{Entities: svc}).ServeHTTP(rec, req)
	return rec
}

func decodeBody[T any](t *testing.T, rec *httptest.ResponseRecorder) T {
	t.Helper()
	var v T
	if err := json.NewDecoder(rec.Body).Decode(&v); err != nil {
		t.Fatalf("decode response body: %v", err)
	}
	return v
}

func assertStatus(t *testing.T, rec *httptest.ResponseRecorder, want int) {
	t.Helper()
	if rec.Code != want {
		t.Fatalf("status = %d, want %d (body: %s)", rec.Code, want, rec.Body.String())
	}
}

// assertErrorFields checks the error code and the fields named in details.
func assertErrorFields(t *testing.T, rec *httptest.ResponseRecorder, wantCode string, wantFields ...string) {
	t.Helper()

	body := decodeBody[errorResponse](t, rec)
	if body.Error.Code != wantCode {
		t.Errorf("error code = %q, want %q", body.Error.Code, wantCode)
	}

	got := make([]string, len(body.Error.Details))
	for i, d := range body.Error.Details {
		got[i] = d.Field
	}
	if !slices.Equal(got, wantFields) {
		t.Errorf("detail fields = %v, want %v", got, wantFields)
	}
}

func TestListEntities(t *testing.T) {
	var gotFilter entity.ListFilter
	svc := &stubService{list: func(_ context.Context, f entity.ListFilter) ([]entity.Entity, error) {
		gotFilter = f
		return []entity.Entity{truck}, nil
	}}

	rec := serve(t, svc, http.MethodGet,
		"/api/v1/entities?type=vehicle&status=active&search=truck&limit=50&bbox=106.6,-6.4,107.0,-6.0", "")

	assertStatus(t, rec, http.StatusOK)
	wantFilter := entity.ListFilter{
		Type:   entity.TypeVehicle,
		Status: entity.StatusActive,
		Search: "truck",
		Limit:  50,
		BBox:   &entity.BoundingBox{MinLongitude: 106.6, MinLatitude: -6.4, MaxLongitude: 107.0, MaxLatitude: -6.0},
	}
	if !reflect.DeepEqual(gotFilter, wantFilter) {
		t.Errorf("filter = %+v, want %+v", gotFilter, wantFilter)
	}

	body := decodeBody[listResponse](t, rec)
	if body.Count != 1 || len(body.Items) != 1 {
		t.Fatalf("count = %d, items = %d, want 1 and 1", body.Count, len(body.Items))
	}
	if got := body.Items[0]; got.ID != truckID.String() || got.Latitude != -6.2088 || got.Type != "vehicle" {
		t.Errorf("item = %+v, does not match the stored entity", got)
	}
}

func TestListEntitiesEmptyIsArray(t *testing.T) {
	svc := &stubService{list: func(context.Context, entity.ListFilter) ([]entity.Entity, error) {
		return nil, nil
	}}

	rec := serve(t, svc, http.MethodGet, "/api/v1/entities", "")

	assertStatus(t, rec, http.StatusOK)
	if !strings.Contains(rec.Body.String(), `"items":[]`) {
		t.Errorf("body = %s, want items to be an empty array", rec.Body.String())
	}
}

func TestListEntitiesQueryErrors(t *testing.T) {
	tests := []struct {
		name       string
		query      string
		wantFields []string
	}{
		{"limit not a number", "limit=ten", []string{"limit"}},
		{"bbox with three values", "bbox=1,2,3", []string{"bbox"}},
		{"bbox with text", "bbox=a,b,c,d", []string{"bbox"}},
		{"both invalid", "limit=1.5&bbox=1,2", []string{"limit", "bbox"}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := serve(t, &stubService{}, http.MethodGet, "/api/v1/entities?"+tt.query, "")

			assertStatus(t, rec, http.StatusBadRequest)
			assertErrorFields(t, rec, codeInvalidRequest, tt.wantFields...)
		})
	}
}

func TestListEntitiesDomainValidation(t *testing.T) {
	svc := &stubService{list: func(context.Context, entity.ListFilter) ([]entity.Entity, error) {
		return nil, &entity.ValidationError{Fields: []entity.FieldError{{Field: "type", Message: "must be one of: ..."}}}
	}}

	rec := serve(t, svc, http.MethodGet, "/api/v1/entities?type=boat", "")

	assertStatus(t, rec, http.StatusUnprocessableEntity)
	assertErrorFields(t, rec, codeValidationFailed, "type")
}

func TestGetEntity(t *testing.T) {
	svc := &stubService{get: func(_ context.Context, id uuid.UUID) (entity.Entity, error) {
		if id == truckID {
			return truck, nil
		}
		return entity.Entity{}, entity.ErrNotFound
	}}

	t.Run("found", func(t *testing.T) {
		rec := serve(t, svc, http.MethodGet, "/api/v1/entities/"+truckID.String(), "")

		assertStatus(t, rec, http.StatusOK)
		got := decodeBody[entityResponse](t, rec)
		want := toEntityResponse(truck)
		if !reflect.DeepEqual(got, want) {
			t.Errorf("body = %+v, want %+v", got, want)
		}
	})

	t.Run("missing", func(t *testing.T) {
		rec := serve(t, svc, http.MethodGet, "/api/v1/entities/"+uuid.NewString(), "")

		assertStatus(t, rec, http.StatusNotFound)
		assertErrorFields(t, rec, codeNotFound)
	})

	t.Run("malformed id", func(t *testing.T) {
		rec := serve(t, svc, http.MethodGet, "/api/v1/entities/not-a-uuid", "")

		assertStatus(t, rec, http.StatusBadRequest)
		assertErrorFields(t, rec, codeInvalidRequest, "id")
	})
}

func TestCreateEntity(t *testing.T) {
	var gotInput entity.Input
	svc := &stubService{create: func(_ context.Context, in entity.Input) (entity.Entity, error) {
		gotInput = in
		return truck, nil
	}}

	rec := serve(t, svc, http.MethodPost, "/api/v1/entities", validBody)

	assertStatus(t, rec, http.StatusCreated)
	if loc := rec.Header().Get("Location"); loc != "/api/v1/entities/"+truckID.String() {
		t.Errorf("Location = %q, want the new entity's URL", loc)
	}

	wantInput := entity.Input{
		Name:       "Truck 01",
		Type:       entity.TypeVehicle,
		Status:     entity.StatusActive,
		Attributes: map[string]string{"plate_number": "B 1234 XYZ"},
		Location:   entity.Location{Latitude: -6.2088, Longitude: 106.8456},
	}
	if !reflect.DeepEqual(gotInput, wantInput) {
		t.Errorf("input = %+v, want %+v", gotInput, wantInput)
	}
}

func TestCreateEntityAcceptsZeroCoordinates(t *testing.T) {
	var gotInput entity.Input
	svc := &stubService{create: func(_ context.Context, in entity.Input) (entity.Entity, error) {
		gotInput = in
		return truck, nil
	}}

	rec := serve(t, svc, http.MethodPost, "/api/v1/entities",
		`{"name":"Null Island buoy","type":"iot_device","status":"active","latitude":0,"longitude":0}`)

	assertStatus(t, rec, http.StatusCreated)
	if gotInput.Location != (entity.Location{}) {
		t.Errorf("location = %+v, want 0,0", gotInput.Location)
	}
}

func TestCreateEntityRequestErrors(t *testing.T) {
	tests := []struct {
		name        string
		contentType string
		body        string
		wantStatus  int
		wantCode    string
		wantFields  []string
	}{
		{"wrong content type", "text/plain", validBody,
			http.StatusUnsupportedMediaType, codeUnsupportedMediaType, nil},
		{"empty body", "application/json", "",
			http.StatusBadRequest, codeInvalidRequest, nil},
		{"malformed JSON", "application/json", `{"name": "Truck"`,
			http.StatusBadRequest, codeInvalidRequest, nil},
		{"two JSON objects", "application/json", validBody + validBody,
			http.StatusBadRequest, codeInvalidRequest, nil},
		{"unknown field", "application/json", `{"name":"x","lat":1}`,
			http.StatusBadRequest, codeInvalidRequest, []string{"lat"}},
		{"coordinate as string", "application/json", `{"latitude":"north"}`,
			http.StatusBadRequest, codeInvalidRequest, []string{"latitude"}},
		{"missing coordinates", "application/json", `{"name":"x","type":"vehicle","status":"active"}`,
			http.StatusUnprocessableEntity, codeValidationFailed, []string{"latitude", "longitude"}},
		{"body too large", "application/json",
			`{"description":"` + strings.Repeat("a", maxBodyBytes) + `"}`,
			http.StatusRequestEntityTooLarge, codePayloadTooLarge, nil},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/api/v1/entities", strings.NewReader(tt.body))
			req.Header.Set("Content-Type", tt.contentType)
			rec := httptest.NewRecorder()

			// The stub fails the test if the request ever reaches the domain.
			svc := &stubService{create: func(context.Context, entity.Input) (entity.Entity, error) {
				t.Error("service called for an invalid request")
				return entity.Entity{}, nil
			}}
			testRouter(RouterConfig{Entities: svc}).ServeHTTP(rec, req)

			assertStatus(t, rec, tt.wantStatus)
			assertErrorFields(t, rec, tt.wantCode, tt.wantFields...)
		})
	}
}

func TestCreateEntityDomainValidation(t *testing.T) {
	svc := &stubService{create: func(context.Context, entity.Input) (entity.Entity, error) {
		return entity.Entity{}, &entity.ValidationError{Fields: []entity.FieldError{
			{Field: "name", Message: "is required"},
			{Field: "latitude", Message: "must be between -90 and 90"},
		}}
	}}

	rec := serve(t, svc, http.MethodPost, "/api/v1/entities", validBody)

	assertStatus(t, rec, http.StatusUnprocessableEntity)
	assertErrorFields(t, rec, codeValidationFailed, "name", "latitude")
}

func TestUpdateEntity(t *testing.T) {
	var gotID uuid.UUID
	svc := &stubService{update: func(_ context.Context, id uuid.UUID, in entity.Input) (entity.Entity, error) {
		gotID = id
		if id != truckID {
			return entity.Entity{}, entity.ErrNotFound
		}
		updated := truck
		updated.Status = in.Status
		return updated, nil
	}}

	t.Run("existing", func(t *testing.T) {
		body := strings.Replace(validBody, `"active"`, `"maintenance"`, 1)
		rec := serve(t, svc, http.MethodPut, "/api/v1/entities/"+truckID.String(), body)

		assertStatus(t, rec, http.StatusOK)
		if gotID != truckID {
			t.Errorf("service got id %s, want %s", gotID, truckID)
		}
		if got := decodeBody[entityResponse](t, rec); got.Status != "maintenance" {
			t.Errorf("status = %q, want maintenance", got.Status)
		}
	})

	t.Run("missing", func(t *testing.T) {
		rec := serve(t, svc, http.MethodPut, "/api/v1/entities/"+uuid.NewString(), validBody)

		assertStatus(t, rec, http.StatusNotFound)
		assertErrorFields(t, rec, codeNotFound)
	})
}

func TestDeleteEntity(t *testing.T) {
	svc := &stubService{delete: func(_ context.Context, id uuid.UUID) error {
		if id != truckID {
			return entity.ErrNotFound
		}
		return nil
	}}

	t.Run("existing", func(t *testing.T) {
		rec := serve(t, svc, http.MethodDelete, "/api/v1/entities/"+truckID.String(), "")

		assertStatus(t, rec, http.StatusNoContent)
		if rec.Body.Len() != 0 {
			t.Errorf("body = %q, want empty", rec.Body.String())
		}
	})

	t.Run("missing", func(t *testing.T) {
		rec := serve(t, svc, http.MethodDelete, "/api/v1/entities/"+uuid.NewString(), "")

		assertStatus(t, rec, http.StatusNotFound)
		assertErrorFields(t, rec, codeNotFound)
	})
}

func TestUnexpectedErrorsAreNotLeaked(t *testing.T) {
	svc := &stubService{get: func(context.Context, uuid.UUID) (entity.Entity, error) {
		return entity.Entity{}, errors.New("dial tcp 10.0.0.5:5432: connection refused")
	}}

	rec := serve(t, svc, http.MethodGet, "/api/v1/entities/"+truckID.String(), "")

	assertStatus(t, rec, http.StatusInternalServerError)
	if strings.Contains(rec.Body.String(), "10.0.0.5") {
		t.Errorf("response leaks internal error: %s", rec.Body.String())
	}
	assertErrorFields(t, rec, codeInternal)
}

func TestEntityRoutesUseErrorEnvelope(t *testing.T) {
	rec := serve(t, &stubService{}, http.MethodPatch, "/api/v1/entities/"+truckID.String(), validBody)

	assertStatus(t, rec, http.StatusMethodNotAllowed)
	assertErrorFields(t, rec, codeMethodNotAllowed)
}
