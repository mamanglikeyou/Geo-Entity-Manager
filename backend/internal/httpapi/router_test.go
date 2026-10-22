package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
)

const testOrigin = "http://localhost:5173"

type fakePinger struct{ err error }

func (p fakePinger) Ping(context.Context) error { return p.err }

func newTestRouter() http.Handler {
	return testRouter(RouterConfig{})
}

func newTestRouterWithDB(db Pinger) http.Handler {
	return testRouter(RouterConfig{DB: db})
}

// testRouter fills every dependency cfg leaves unset with a harmless default.
func testRouter(cfg RouterConfig) http.Handler {
	if cfg.Logger == nil {
		cfg.Logger = discardLogger()
	}
	if cfg.AllowedOrigins == nil {
		cfg.AllowedOrigins = []string{testOrigin}
	}
	if cfg.DB == nil {
		cfg.DB = fakePinger{}
	}
	if cfg.Entities == nil {
		cfg.Entities = &stubService{}
	}
	return NewRouter(cfg)
}

func discardLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func TestHealth(t *testing.T) {
	rec := httptest.NewRecorder()
	newTestRouter().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/healthz", nil))

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}
	if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("Content-Type = %q, want application/json", ct)
	}

	var body map[string]string
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	if body["status"] != "ok" {
		t.Errorf("status field = %q, want ok", body["status"])
	}
}

func TestReady(t *testing.T) {
	t.Run("database reachable", func(t *testing.T) {
		rec := httptest.NewRecorder()
		newTestRouterWithDB(fakePinger{}).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/readyz", nil))

		if rec.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
		}
	})

	t.Run("database down", func(t *testing.T) {
		rec := httptest.NewRecorder()
		db := fakePinger{err: errors.New("connection refused")}
		newTestRouterWithDB(db).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/readyz", nil))

		if rec.Code != http.StatusServiceUnavailable {
			t.Fatalf("status = %d, want %d", rec.Code, http.StatusServiceUnavailable)
		}
		assertErrorCode(t, rec, codeUnavailable)
	})
}

func TestRoutingErrorsUseErrorEnvelope(t *testing.T) {
	tests := []struct {
		name       string
		method     string
		path       string
		wantStatus int
		wantCode   string
	}{
		{"unknown route", http.MethodGet, "/does-not-exist", http.StatusNotFound, codeNotFound},
		{"wrong method", http.MethodPost, "/healthz", http.StatusMethodNotAllowed, codeMethodNotAllowed},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			newTestRouter().ServeHTTP(rec, httptest.NewRequest(tt.method, tt.path, nil))

			if rec.Code != tt.wantStatus {
				t.Fatalf("status = %d, want %d", rec.Code, tt.wantStatus)
			}
			assertErrorCode(t, rec, tt.wantCode)
		})
	}
}

func TestCORS(t *testing.T) {
	tests := []struct {
		name       string
		origin     string
		wantHeader string
	}{
		{"allowed origin", testOrigin, testOrigin},
		{"unknown origin", "http://evil.test", ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
			req.Header.Set("Origin", tt.origin)
			rec := httptest.NewRecorder()
			newTestRouter().ServeHTTP(rec, req)

			if got := rec.Header().Get("Access-Control-Allow-Origin"); got != tt.wantHeader {
				t.Errorf("Access-Control-Allow-Origin = %q, want %q", got, tt.wantHeader)
			}
		})
	}
}

func assertErrorCode(t *testing.T, rec *httptest.ResponseRecorder, want string) {
	t.Helper()

	var body errorResponse
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode error body: %v", err)
	}
	if body.Error.Code != want {
		t.Errorf("error code = %q, want %q", body.Error.Code, want)
	}
	if body.Error.Message == "" {
		t.Error("error message is empty")
	}
}
