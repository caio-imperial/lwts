// Package spa decides when the static file handler must fall back to
// index.html so client-side routes (docs/ROUTES.md) survive a direct load.
package spa

import (
	"net/http"
	"path"
	"strings"
)

var excludedPrefixes = []string{"/api", "/plugins"}

var excludedPaths = map[string]bool{
	"/healthz": true,
	"/readyz":  true,
}

// ShouldServeIndex reports whether a request should receive index.html instead
// of a 404 from the static handler.
//
// It only applies to GET/HEAD navigation requests: API and plugin prefixes are
// excluded, as are health endpoints and any path whose last segment looks like
// a file (has an extension).
func ShouldServeIndex(method, requestPath string) bool {
	if method != http.MethodGet && method != http.MethodHead {
		return false
	}
	if !strings.HasPrefix(requestPath, "/") {
		return false
	}
	if excludedPaths[requestPath] {
		return false
	}
	for _, prefix := range excludedPrefixes {
		if requestPath == prefix || strings.HasPrefix(requestPath, prefix+"/") {
			return false
		}
	}
	// A last segment with an extension is a static asset (missing → 404).
	if path.Ext(requestPath) != "" {
		return false
	}
	return true
}
