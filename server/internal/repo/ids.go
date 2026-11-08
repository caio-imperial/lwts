package repo

import "github.com/google/uuid"

// isUUID reports whether s is a valid UUID. Non-UUID path values must resolve
// to not-found before reaching the database: Postgres rejects the cast and the
// request would otherwise return 500 instead of 404.
func isUUID(s string) bool {
	_, err := uuid.Parse(s)
	return err == nil
}
