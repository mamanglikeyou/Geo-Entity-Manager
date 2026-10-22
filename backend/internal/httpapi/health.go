package httpapi

import (
	"context"
	"log/slog"
	"net/http"
	"time"
)

// Pinger reports whether a dependency (such as the database) is reachable.
type Pinger interface {
	Ping(ctx context.Context) error
}

// handleHealth is a liveness check: it only says the process is serving.
func handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// handleReady is a readiness check: it fails while the database is
// unreachable, so a load balancer stops routing traffic to this instance.
func handleReady(db Pinger, logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()

		if err := db.Ping(ctx); err != nil {
			logger.WarnContext(ctx, "readiness check failed", "error", err)
			writeError(w, http.StatusServiceUnavailable, codeUnavailable, "database unavailable")
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ready"})
	}
}
