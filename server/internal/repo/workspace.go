package repo

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/oceanplexian/lwts/server/internal/db"
	"github.com/oceanplexian/lwts/server/internal/slug"
)

// Workspace is the top-level container for boards.
type Workspace struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Slug      string    `json:"slug"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// WorkspaceRepository provides persistence for workspaces.
type WorkspaceRepository struct {
	ds db.Datasource
}

func NewWorkspaceRepository(ds db.Datasource) *WorkspaceRepository {
	return &WorkspaceRepository{ds: ds}
}

const workspaceSelectColumns = `id, name, slug, created_at, updated_at`

type workspaceScanner interface {
	Scan(dest ...any) error
}

func scanWorkspace(scanner workspaceScanner) (Workspace, error) {
	var w Workspace
	err := scanner.Scan(&w.ID, &w.Name, &w.Slug, &w.CreatedAt, &w.UpdatedAt)
	return w, err
}

// List returns all workspaces ordered by creation time.
func (r *WorkspaceRepository) List(ctx context.Context) ([]Workspace, error) {
	rows, err := r.ds.Query(ctx,
		`SELECT `+workspaceSelectColumns+` FROM workspaces ORDER BY created_at, id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var workspaces []Workspace
	for rows.Next() {
		w, err := scanWorkspace(rows)
		if err != nil {
			return nil, err
		}
		workspaces = append(workspaces, w)
	}
	return workspaces, rows.Err()
}

// GetByID returns a workspace by its UUID.
func (r *WorkspaceRepository) GetByID(ctx context.Context, id string) (Workspace, error) {
	if !isUUID(id) {
		return Workspace{}, ErrNotFound
	}
	row := r.ds.QueryRow(ctx,
		`SELECT `+workspaceSelectColumns+` FROM workspaces WHERE id = $1`, id)

	w, err := scanWorkspace(row)
	if err == db.ErrNoRows {
		return Workspace{}, ErrNotFound
	}
	return w, err
}

// GetBySlug returns a workspace by its globally unique slug.
func (r *WorkspaceRepository) GetBySlug(ctx context.Context, slugValue string) (Workspace, error) {
	row := r.ds.QueryRow(ctx,
		`SELECT `+workspaceSelectColumns+` FROM workspaces WHERE slug = $1`, slugValue)

	w, err := scanWorkspace(row)
	if err == db.ErrNoRows {
		return Workspace{}, ErrNotFound
	}
	return w, err
}

// GetDefault returns the oldest workspace, which acts as the default one.
func (r *WorkspaceRepository) GetDefault(ctx context.Context) (Workspace, error) {
	row := r.ds.QueryRow(ctx,
		`SELECT `+workspaceSelectColumns+` FROM workspaces ORDER BY created_at, id LIMIT 1`)

	w, err := scanWorkspace(row)
	if err == db.ErrNoRows {
		return Workspace{}, ErrNotFound
	}
	return w, err
}

// Create inserts a workspace, deriving a globally unique slug from the name
// ("-2", "-3", ... suffixes on collision).
func (r *WorkspaceRepository) Create(ctx context.Context, name string) (Workspace, error) {
	workspaceSlug, err := r.uniqueSlug(ctx, slug.Normalize(name))
	if err != nil {
		return Workspace{}, err
	}

	w := Workspace{
		ID:        uuid.NewString(),
		Name:      name,
		Slug:      workspaceSlug,
		CreatedAt: time.Now().UTC(),
	}
	w.UpdatedAt = w.CreatedAt

	if _, err := r.ds.Exec(ctx,
		`INSERT INTO workspaces (id, name, slug, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)`,
		w.ID, w.Name, w.Slug, w.CreatedAt, w.UpdatedAt); err != nil {
		return Workspace{}, err
	}

	return w, nil
}

// uniqueSlug returns base, or base-2, base-3, ... until no other workspace has
// that slug.
func (r *WorkspaceRepository) uniqueSlug(ctx context.Context, base string) (string, error) {
	candidate := base
	for i := 2; i < 10000; i++ {
		var found int
		err := r.ds.QueryRow(ctx, `SELECT 1 FROM workspaces WHERE slug = $1`, candidate).Scan(&found)
		if err == db.ErrNoRows {
			return candidate, nil
		}
		if err != nil {
			return "", err
		}
		candidate = fmt.Sprintf("%s-%d", base, i)
	}
	return "", fmt.Errorf("could not find a unique workspace slug for %q", base)
}
