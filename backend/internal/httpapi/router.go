// Package httpapi exposes the application over HTTP.
package httpapi

import (
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

type RouterConfig struct {
	Logger         *slog.Logger
	AllowedOrigins []string
	DB             Pinger
}

func NewRouter(cfg RouterConfig) http.Handler {
	r := chi.NewRouter()

	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(requestLogger(cfg.Logger))
	r.Use(recoverer(cfg.Logger))
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins: cfg.AllowedOrigins,
		AllowedMethods: []string{http.MethodGet, http.MethodPost, http.MethodPut, http.MethodDelete, http.MethodOptions},
		AllowedHeaders: []string{"Accept", "Content-Type", middleware.RequestIDHeader},
		ExposedHeaders: []string{middleware.RequestIDHeader},
		MaxAge:         300,
	}))

	r.NotFound(func(w http.ResponseWriter, _ *http.Request) {
		writeError(w, http.StatusNotFound, codeNotFound, "resource not found")
	})
	r.MethodNotAllowed(func(w http.ResponseWriter, _ *http.Request) {
		writeError(w, http.StatusMethodNotAllowed, codeMethodNotAllowed, "method not allowed")
	})

	r.Get("/healthz", handleHealth)
	r.Get("/readyz", handleReady(cfg.DB, cfg.Logger))

	return r
}
