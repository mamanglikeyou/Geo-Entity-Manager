package httpapi

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"net/url"
	"path"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/google/uuid"

	"geo-entity-manager/backend/internal/entity"
)

// EntityService is the subset of entity.Service the HTTP layer depends on.
type EntityService interface {
	List(ctx context.Context, filter entity.ListFilter) ([]entity.Entity, error)
	Get(ctx context.Context, id uuid.UUID) (entity.Entity, error)
	Create(ctx context.Context, in entity.Input) (entity.Entity, error)
	Update(ctx context.Context, id uuid.UUID, in entity.Input) (entity.Entity, error)
	Delete(ctx context.Context, id uuid.UUID) error
}

type entityRequest struct {
	Name        string            `json:"name"`
	Type        string            `json:"type"`
	Status      string            `json:"status"`
	Description string            `json:"description"`
	Attributes  map[string]string `json:"attributes"`
	// Pointers distinguish a missing coordinate from 0, which is valid.
	Latitude  *float64 `json:"latitude"`
	Longitude *float64 `json:"longitude"`
}

type entityResponse struct {
	ID          string            `json:"id"`
	Name        string            `json:"name"`
	Type        string            `json:"type"`
	Status      string            `json:"status"`
	Description string            `json:"description"`
	Attributes  map[string]string `json:"attributes"`
	Latitude    float64           `json:"latitude"`
	Longitude   float64           `json:"longitude"`
	CreatedAt   time.Time         `json:"createdAt"`
	UpdatedAt   time.Time         `json:"updatedAt"`
}

type listResponse struct {
	Items []entityResponse `json:"items"`
	Count int              `json:"count"`
}

type entityHandler struct {
	svc    EntityService
	logger *slog.Logger
}

func (h *entityHandler) routes(r chi.Router) {
	r.Get("/", h.list)
	r.Post("/", h.create)
	r.Get("/{id}", h.get)
	r.Put("/{id}", h.update)
	r.Delete("/{id}", h.delete)
}

func (h *entityHandler) list(w http.ResponseWriter, r *http.Request) {
	filter, reqErr := parseListFilter(r.URL.Query())
	if reqErr != nil {
		writeRequestError(w, reqErr)
		return
	}

	entities, err := h.svc.List(r.Context(), filter)
	if err != nil {
		h.writeServiceError(w, r, err)
		return
	}

	resp := listResponse{Items: make([]entityResponse, len(entities)), Count: len(entities)}
	for i, e := range entities {
		resp.Items[i] = toEntityResponse(e)
	}
	writeJSON(w, http.StatusOK, resp)
}

func (h *entityHandler) get(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r)
	if !ok {
		return
	}

	e, err := h.svc.Get(r.Context(), id)
	if err != nil {
		h.writeServiceError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, toEntityResponse(e))
}

func (h *entityHandler) create(w http.ResponseWriter, r *http.Request) {
	in, reqErr := decodeEntityInput(w, r)
	if reqErr != nil {
		writeRequestError(w, reqErr)
		return
	}

	e, err := h.svc.Create(r.Context(), in)
	if err != nil {
		h.writeServiceError(w, r, err)
		return
	}

	w.Header().Set("Location", path.Join(r.URL.Path, e.ID.String()))
	writeJSON(w, http.StatusCreated, toEntityResponse(e))
}

func (h *entityHandler) update(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	in, reqErr := decodeEntityInput(w, r)
	if reqErr != nil {
		writeRequestError(w, reqErr)
		return
	}

	e, err := h.svc.Update(r.Context(), id, in)
	if err != nil {
		h.writeServiceError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, toEntityResponse(e))
}

func (h *entityHandler) delete(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r)
	if !ok {
		return
	}

	if err := h.svc.Delete(r.Context(), id); err != nil {
		h.writeServiceError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *entityHandler) writeServiceError(w http.ResponseWriter, r *http.Request, err error) {
	var verr *entity.ValidationError
	switch {
	case errors.As(err, &verr):
		details := make([]fieldError, len(verr.Fields))
		for i, f := range verr.Fields {
			details[i] = fieldError{Field: f.Field, Message: f.Message}
		}
		writeErrorDetails(w, http.StatusUnprocessableEntity, codeValidationFailed, "validation failed", details)
	case errors.Is(err, entity.ErrNotFound):
		writeError(w, http.StatusNotFound, codeNotFound, "entity not found")
	default:
		// The cause may contain internal details (SQL, hostnames), so it is
		// logged with the request ID and never sent to the client.
		h.logger.ErrorContext(r.Context(), "entity request failed",
			"error", err,
			"method", r.Method,
			"path", r.URL.Path,
			"request_id", middleware.GetReqID(r.Context()),
		)
		writeError(w, http.StatusInternalServerError, codeInternal, "internal server error")
	}
}

func parseID(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeRequestError(w, badRequest("invalid entity id",
			fieldError{Field: "id", Message: "must be a valid UUID"}))
		return uuid.Nil, false
	}
	return id, true
}

func decodeEntityInput(w http.ResponseWriter, r *http.Request) (entity.Input, *requestError) {
	var req entityRequest
	if reqErr := decodeJSON(w, r, &req); reqErr != nil {
		return entity.Input{}, reqErr
	}

	var missing []fieldError
	if req.Latitude == nil {
		missing = append(missing, fieldError{Field: "latitude", Message: "is required"})
	}
	if req.Longitude == nil {
		missing = append(missing, fieldError{Field: "longitude", Message: "is required"})
	}
	if len(missing) > 0 {
		return entity.Input{}, &requestError{
			status:  http.StatusUnprocessableEntity,
			code:    codeValidationFailed,
			message: "validation failed",
			details: missing,
		}
	}

	return entity.Input{
		Name:        req.Name,
		Type:        entity.Type(req.Type),
		Status:      entity.Status(req.Status),
		Description: req.Description,
		Attributes:  req.Attributes,
		Location:    entity.Location{Latitude: *req.Latitude, Longitude: *req.Longitude},
	}, nil
}

// parseListFilter only converts query strings into typed values; range and
// enum checks are left to the domain so the rules live in one place.
func parseListFilter(q url.Values) (entity.ListFilter, *requestError) {
	f := entity.ListFilter{
		Type:   entity.Type(q.Get("type")),
		Status: entity.Status(q.Get("status")),
		Search: q.Get("search"),
	}

	var details []fieldError
	if v := q.Get("limit"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil {
			details = append(details, fieldError{Field: "limit", Message: "must be an integer"})
		}
		f.Limit = n
	}
	if v := q.Get("bbox"); v != "" {
		bbox, ok := parseBoundingBox(v)
		if !ok {
			details = append(details, fieldError{
				Field:   "bbox",
				Message: "must be four comma-separated numbers: minLng,minLat,maxLng,maxLat",
			})
		}
		f.BBox = bbox
	}

	if len(details) > 0 {
		return entity.ListFilter{}, badRequest("invalid query parameters", details...)
	}
	return f, nil
}

func parseBoundingBox(s string) (*entity.BoundingBox, bool) {
	parts := strings.Split(s, ",")
	if len(parts) != 4 {
		return nil, false
	}

	var v [4]float64
	for i, p := range parts {
		f, err := strconv.ParseFloat(strings.TrimSpace(p), 64)
		if err != nil {
			return nil, false
		}
		v[i] = f
	}
	return &entity.BoundingBox{MinLongitude: v[0], MinLatitude: v[1], MaxLongitude: v[2], MaxLatitude: v[3]}, true
}

func toEntityResponse(e entity.Entity) entityResponse {
	// Always emit an object so clients never have to handle "attributes": null.
	if e.Attributes == nil {
		e.Attributes = map[string]string{}
	}
	return entityResponse{
		ID:          e.ID.String(),
		Name:        e.Name,
		Type:        string(e.Type),
		Status:      string(e.Status),
		Description: e.Description,
		Attributes:  e.Attributes,
		Latitude:    e.Location.Latitude,
		Longitude:   e.Location.Longitude,
		CreatedAt:   e.CreatedAt,
		UpdatedAt:   e.UpdatedAt,
	}
}
