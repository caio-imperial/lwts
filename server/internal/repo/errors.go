package repo

import "errors"

var (
	ErrNotFound = errors.New("not found")
	ErrConflict = errors.New("version conflict")
	// ErrAmbiguous is returned when a lookup by card key matches more than one
	// board. Keys are unique per board, not globally.
	ErrAmbiguous = errors.New("ambiguous key")
)
