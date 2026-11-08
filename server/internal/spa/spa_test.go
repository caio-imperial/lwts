package spa

import (
	"net/http"
	"testing"
)

func TestShouldServeIndex(t *testing.T) {
	tests := []struct {
		method string
		path   string
		want   bool
	}{
		// SPA navigation routes.
		{http.MethodGet, "/", true},
		{http.MethodGet, "/boards", true},
		{http.MethodGet, "/boards/850946ec-91ca-41af-9c0a-da48f757eba0", true},
		{http.MethodGet, "/boards/meu-board/cards/42", true},
		{http.MethodGet, "/settings/general", true},
		{http.MethodHead, "/boards", true},

		// API and plugin prefixes never fall back.
		{http.MethodGet, "/api", false},
		{http.MethodGet, "/api/v1/boards", false},
		{http.MethodGet, "/api/nope", false},
		{http.MethodGet, "/plugins", false},
		{http.MethodGet, "/plugins/x.js", false},

		// Health endpoints.
		{http.MethodGet, "/healthz", false},
		{http.MethodGet, "/readyz", false},

		// Static assets with an extension are 404s, not index.html.
		{http.MethodGet, "/assets/app.js", false},
		{http.MethodGet, "/styles/board.css", false},
		{http.MethodGet, "/favicon.svg", false},
		{http.MethodGet, "/login.html", false},
		{http.MethodGet, "/data.json", false},

		// Non-navigation methods.
		{http.MethodPost, "/boards", false},
		{http.MethodPut, "/boards/x", false},
		{http.MethodDelete, "/boards/x", false},
		{http.MethodOptions, "/boards", false},

		// Malformed paths.
		{"GET", "boards", false},
	}

	for _, tt := range tests {
		if got := ShouldServeIndex(tt.method, tt.path); got != tt.want {
			t.Errorf("ShouldServeIndex(%q, %q) = %v, want %v", tt.method, tt.path, got, tt.want)
		}
	}
}
