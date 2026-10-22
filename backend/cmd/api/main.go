// Command api runs the Geo Entity Manager HTTP API.
package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"geo-entity-manager/backend/internal/config"
	"geo-entity-manager/backend/internal/entity"
	"geo-entity-manager/backend/internal/httpapi"
	"geo-entity-manager/backend/internal/storage/postgres"
)

func main() {
	if err := run(); err != nil {
		slog.Error("api stopped", "error", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("load config: %w", err)
	}

	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: cfg.LogLevel}))
	slog.SetDefault(logger)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	startupCtx, cancelStartup := context.WithTimeout(ctx, 30*time.Second)
	defer cancelStartup()

	pool, err := postgres.Connect(startupCtx, cfg.DatabaseURL)
	if err != nil {
		return fmt.Errorf("connect database: %w", err)
	}
	defer pool.Close()

	applied, err := postgres.Migrate(startupCtx, pool)
	if err != nil {
		return fmt.Errorf("migrate database: %w", err)
	}
	logger.Info("database ready", "migrations_applied", applied)

	srv := &http.Server{
		Addr: cfg.HTTPAddr,
		Handler: httpapi.NewRouter(httpapi.RouterConfig{
			Logger:         logger,
			AllowedOrigins: cfg.AllowedOrigins,
			DB:             pool,
			Entities:       entity.NewService(postgres.NewEntityRepository(pool)),
		}),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	serverErr := make(chan error, 1)
	go func() {
		logger.Info("http server listening", "addr", cfg.HTTPAddr)
		serverErr <- srv.ListenAndServe()
	}()

	// ListenAndServe only returns before Shutdown when it fails to start
	// (e.g. port already in use), so anything received here is fatal.
	select {
	case err := <-serverErr:
		return fmt.Errorf("http server: %w", err)
	case <-ctx.Done():
	}

	logger.Info("shutting down", "timeout", cfg.ShutdownTimeout.String())
	shutdownCtx, cancel := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
	defer cancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		return fmt.Errorf("graceful shutdown: %w", err)
	}
	return nil
}
