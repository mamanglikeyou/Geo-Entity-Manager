package config

import (
	"log/slog"
	"slices"
	"testing"
	"time"
)

func envFrom(m map[string]string) func(string) (string, bool) {
	return func(key string) (string, bool) {
		v, ok := m[key]
		return v, ok
	}
}

func TestLoadDefaults(t *testing.T) {
	cfg, err := load(envFrom(nil))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if cfg.HTTPAddr != ":8080" {
		t.Errorf("HTTPAddr = %q, want %q", cfg.HTTPAddr, ":8080")
	}
	if cfg.DatabaseURL != defaultDatabaseURL {
		t.Errorf("DatabaseURL = %q, want %q", cfg.DatabaseURL, defaultDatabaseURL)
	}
	if cfg.LogLevel != slog.LevelInfo {
		t.Errorf("LogLevel = %v, want %v", cfg.LogLevel, slog.LevelInfo)
	}
	if cfg.ShutdownTimeout != 10*time.Second {
		t.Errorf("ShutdownTimeout = %v, want %v", cfg.ShutdownTimeout, 10*time.Second)
	}
	if want := []string{"http://localhost:5173"}; !slices.Equal(cfg.AllowedOrigins, want) {
		t.Errorf("AllowedOrigins = %v, want %v", cfg.AllowedOrigins, want)
	}
	if cfg.SeedSampleData {
		t.Error("SeedSampleData = true, want false by default")
	}
}

func TestLoadOverrides(t *testing.T) {
	cfg, err := load(envFrom(map[string]string{
		"HTTP_ADDR":            ":9090",
		"DATABASE_URL":         "postgres://u:p@db:5432/app",
		"LOG_LEVEL":            "debug",
		"CORS_ALLOWED_ORIGINS": " http://a.test, http://b.test ,",
		"SHUTDOWN_TIMEOUT":     "3s",
		"SEED_SAMPLE_DATA":     "true",
	}))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if cfg.HTTPAddr != ":9090" {
		t.Errorf("HTTPAddr = %q, want %q", cfg.HTTPAddr, ":9090")
	}
	if cfg.DatabaseURL != "postgres://u:p@db:5432/app" {
		t.Errorf("DatabaseURL = %q, want override", cfg.DatabaseURL)
	}
	if cfg.LogLevel != slog.LevelDebug {
		t.Errorf("LogLevel = %v, want %v", cfg.LogLevel, slog.LevelDebug)
	}
	if cfg.ShutdownTimeout != 3*time.Second {
		t.Errorf("ShutdownTimeout = %v, want %v", cfg.ShutdownTimeout, 3*time.Second)
	}
	if want := []string{"http://a.test", "http://b.test"}; !slices.Equal(cfg.AllowedOrigins, want) {
		t.Errorf("AllowedOrigins = %v, want %v", cfg.AllowedOrigins, want)
	}
	if !cfg.SeedSampleData {
		t.Error("SeedSampleData = false, want true")
	}
}

func TestLoadRejectsInvalidValues(t *testing.T) {
	tests := []struct {
		name string
		env  map[string]string
	}{
		{name: "unknown log level", env: map[string]string{"LOG_LEVEL": "verbose"}},
		{name: "unparsable timeout", env: map[string]string{"SHUTDOWN_TIMEOUT": "soon"}},
		{name: "zero timeout", env: map[string]string{"SHUTDOWN_TIMEOUT": "0s"}},
		{name: "negative timeout", env: map[string]string{"SHUTDOWN_TIMEOUT": "-1s"}},
		{name: "seed flag not a boolean", env: map[string]string{"SEED_SAMPLE_DATA": "yes please"}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if _, err := load(envFrom(tt.env)); err == nil {
				t.Fatal("expected an error, got nil")
			}
		})
	}
}
