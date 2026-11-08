// Package slug normalizes human-readable names into URL-safe identifiers.
package slug

import (
	"strings"
	"unicode"

	"golang.org/x/text/unicode/norm"
)

// maxLen is the maximum length of a normalized slug.
const maxLen = 60

// fallback is used when a name contains no usable characters.
const fallback = "board"

// reserved lists slugs that would collide with platform routes or well-known
// identifiers. A reserved slug is prefixed with "board-" instead of rejected.
var reserved = map[string]bool{
	"settings": true,
	"api":      true,
	"assets":   true,
	"login":    true,
	"plugins":  true,
	"healthz":  true,
	"readyz":   true,
	"boards":   true,
	"new":      true,
	"default":  true,
}

// Normalize converts a display name into a slug:
//   - NFKD decomposition, combining marks removed, lowercased
//   - [a-z0-9] kept, every other rune becomes "-"
//   - repeated "-" collapsed, leading/trailing "-" trimmed
//   - empty result falls back to "board"
//   - reserved slugs are prefixed with "board-"
//   - result is capped at 60 characters (trimmed on the right)
func Normalize(name string) string {
	var b strings.Builder
	b.Grow(len(name))

	prevDash := false
	for _, r := range norm.NFKD.String(name) {
		if unicode.Is(unicode.Mn, r) {
			continue
		}
		r = unicode.ToLower(r)
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
			prevDash = false
			continue
		}
		if !prevDash {
			b.WriteByte('-')
			prevDash = true
		}
	}

	out := strings.Trim(b.String(), "-")
	if out == "" {
		out = fallback
	}
	if reserved[out] {
		out = "board-" + out
	}
	if len(out) > maxLen {
		out = strings.TrimRight(out[:maxLen], "-")
	}
	return out
}
