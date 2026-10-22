// Package config loads runtime configuration from environment variables.
package config

import (
	"fmt"
	"log/slog"
	"os"
	"strings"
	"time"
)

// defaultDatabaseURL matches the database started by docker-compose.yml so
// the API runs locally without extra setup. Deployments must override it.
const defaultDatabaseURL = "postgres://geo:geo@localhost:5432/geo?sslmode=disable"

type Config struct {
	HTTPAddr        string
	DatabaseURL     string
	LogLevel        slog.Level
	AllowedOrigins  []string
	ShutdownTimeout time.Duration
}

func Load() (Config, error) {
	return load(os.LookupEnv)
}

// load takes the lookup function as a parameter so tests can supply
// their own environment without touching the process env.
func load(lookup func(string) (string, bool)) (Config, error) {
	get := func(key, fallback string) string {
		if v, ok := lookup(key); ok && strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
		return fallback
	}

	cfg := Config{
		HTTPAddr:       get("HTTP_ADDR", ":8080"),
		DatabaseURL:    get("DATABASE_URL", defaultDatabaseURL),
		AllowedOrigins: splitList(get("CORS_ALLOWED_ORIGINS", "http://localhost:5173")),
	}

	if err := cfg.LogLevel.UnmarshalText([]byte(get("LOG_LEVEL", "info"))); err != nil {
		return Config{}, fmt.Errorf("LOG_LEVEL: %w", err)
	}

	timeout, err := time.ParseDuration(get("SHUTDOWN_TIMEOUT", "10s"))
	if err != nil {
		return Config{}, fmt.Errorf("SHUTDOWN_TIMEOUT: %w", err)
	}
	if timeout <= 0 {
		return Config{}, fmt.Errorf("SHUTDOWN_TIMEOUT: must be positive, got %s", timeout)
	}
	cfg.ShutdownTimeout = timeout

	return cfg, nil
}

func splitList(s string) []string {
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}
