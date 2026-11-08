package repo

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/oceanplexian/lwts/server/internal/db"
	"github.com/oceanplexian/lwts/server/internal/slug"
)

type BoardRepository struct {
	ds db.Datasource
}

func NewBoardRepository(ds db.Datasource) *BoardRepository {
	return &BoardRepository{ds: ds}
}

func (r *BoardRepository) Create(ctx context.Context, name, projectKey, ownerID string) (Board, error) {
	id := uuid.New().String()
	now := time.Now().UTC()
	defaultCols := `[{"id":"backlog","label":"Backlog","color":"#8c8c8c","type":"start"},{"id":"todo","label":"To Do","color":"#579DFF","type":"active"},{"id":"in-progress","label":"In Progress","color":"#fb8c00","type":"active"},{"id":"done","label":"Done","color":"#4ade80","type":"done"},{"id":"wont-do","label":"Won't Do","color":"#94a3b8","type":"done"}]`
	defaultSettings := `{}`

	workspaceID, err := r.defaultWorkspaceID(ctx)
	if err != nil {
		return Board{}, err
	}
	boardSlug, err := r.uniqueBoardSlug(ctx, workspaceID, slug.Normalize(name), id)
	if err != nil {
		return Board{}, err
	}

	_, err = r.ds.Exec(ctx,
		`INSERT INTO boards (id, name, project_key, owner_id, columns, settings, workspace_id, slug, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
		id, name, projectKey, ownerID, defaultCols, defaultSettings, workspaceID, boardSlug, now, now,
	)
	if err != nil {
		return Board{}, err
	}

	return Board{
		ID:          id,
		Name:        name,
		ProjectKey:  projectKey,
		WorkspaceID: workspaceID,
		Slug:        boardSlug,
		CardSeq:     0,
		OwnerID:     ownerID,
		Columns:     defaultCols,
		Settings:    defaultSettings,
		CreatedAt:   now,
		UpdatedAt:   now,
	}, nil
}

func (r *BoardRepository) GetByID(ctx context.Context, id string) (Board, error) {
	if !isUUID(id) {
		return Board{}, ErrNotFound
	}
	row := r.ds.QueryRow(ctx,
		`SELECT id, name, project_key, owner_id, columns, settings,
		        COALESCE(workspace_id, ''), COALESCE(slug, ''), card_seq,
		        created_at, updated_at
		 FROM boards WHERE id = $1`, id)

	var b Board
	err := row.Scan(&b.ID, &b.Name, &b.ProjectKey, &b.OwnerID, &b.Columns, &b.Settings,
		&b.WorkspaceID, &b.Slug, &b.CardSeq, &b.CreatedAt, &b.UpdatedAt)
	if err == db.ErrNoRows {
		return Board{}, ErrNotFound
	}
	return b, err
}

func (r *BoardRepository) List(ctx context.Context) ([]Board, error) {
	rows, err := r.ds.Query(ctx,
		`SELECT id, name, project_key, owner_id, columns, settings,
		        COALESCE(workspace_id, ''), COALESCE(slug, ''), card_seq,
		        created_at, updated_at
		 FROM boards ORDER BY created_at`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var boards []Board
	for rows.Next() {
		var b Board
		if err := rows.Scan(&b.ID, &b.Name, &b.ProjectKey, &b.OwnerID, &b.Columns, &b.Settings,
			&b.WorkspaceID, &b.Slug, &b.CardSeq, &b.CreatedAt, &b.UpdatedAt); err != nil {
			return nil, err
		}
		boards = append(boards, b)
	}
	return boards, rows.Err()
}

type BoardUpdate struct {
	Name       *string
	ProjectKey *string
	Columns    *string
	Settings   *string
}

func (r *BoardRepository) Update(ctx context.Context, id string, fields BoardUpdate) (Board, error) {
	if !isUUID(id) {
		return Board{}, ErrNotFound
	}
	var sets []string
	var args []any
	argN := 1

	if fields.Name != nil {
		workspaceID, err := r.boardWorkspaceID(ctx, id)
		if err != nil {
			return Board{}, err
		}
		boardSlug, err := r.uniqueBoardSlug(ctx, workspaceID, slug.Normalize(*fields.Name), id)
		if err != nil {
			return Board{}, err
		}
		sets = append(sets, "name = $"+strconv.Itoa(argN))
		args = append(args, *fields.Name)
		argN++
		sets = append(sets, "slug = $"+strconv.Itoa(argN))
		args = append(args, boardSlug)
		argN++
	}
	if fields.ProjectKey != nil {
		sets = append(sets, "project_key = $"+strconv.Itoa(argN))
		args = append(args, *fields.ProjectKey)
		argN++
	}
	if fields.Columns != nil {
		sets = append(sets, "columns = $"+strconv.Itoa(argN))
		args = append(args, *fields.Columns)
		argN++
	}
	if fields.Settings != nil {
		sets = append(sets, "settings = $"+strconv.Itoa(argN))
		args = append(args, *fields.Settings)
		argN++
	}

	if len(sets) == 0 {
		return r.GetByID(ctx, id)
	}

	now := time.Now().UTC()
	sets = append(sets, "updated_at = $"+strconv.Itoa(argN))
	args = append(args, now)
	argN++

	args = append(args, id)
	query := "UPDATE boards SET " + strings.Join(sets, ", ") + " WHERE id = $" + strconv.Itoa(argN)

	n, err := r.ds.Exec(ctx, query, args...)
	if err != nil {
		return Board{}, err
	}
	if n == 0 {
		return Board{}, ErrNotFound
	}

	return r.GetByID(ctx, id)
}

func (r *BoardRepository) Delete(ctx context.Context, id string) error {
	if !isUUID(id) {
		return ErrNotFound
	}
	n, err := r.ds.Exec(ctx, `DELETE FROM boards WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

// defaultWorkspaceID returns the oldest workspace, which is the implicit
// workspace for boards created without an explicit one.
func (r *BoardRepository) defaultWorkspaceID(ctx context.Context) (string, error) {
	var id string
	err := r.ds.QueryRow(ctx, `SELECT id FROM workspaces ORDER BY created_at LIMIT 1`).Scan(&id)
	if err == db.ErrNoRows {
		return "", fmt.Errorf("no default workspace: run migrations before creating boards")
	}
	if err != nil {
		return "", err
	}
	return id, nil
}

// boardWorkspaceID reads the workspace a board belongs to, falling back to the
// default workspace for legacy rows created before the backfill.
func (r *BoardRepository) boardWorkspaceID(ctx context.Context, boardID string) (string, error) {
	var workspaceID *string
	err := r.ds.QueryRow(ctx, `SELECT workspace_id FROM boards WHERE id = $1`, boardID).Scan(&workspaceID)
	if err == db.ErrNoRows {
		return "", ErrNotFound
	}
	if err != nil {
		return "", err
	}
	if workspaceID != nil && *workspaceID != "" {
		return *workspaceID, nil
	}
	return r.defaultWorkspaceID(ctx)
}

// uniqueBoardSlug returns base, or base-2, base-3, ... until no other board in
// the same workspace uses that slug. excludeID is ignored in the collision
// check, so a rename does not collide with itself.
func (r *BoardRepository) uniqueBoardSlug(ctx context.Context, workspaceID, base, excludeID string) (string, error) {
	candidate := base
	for i := 2; i < 10000; i++ {
		var found int
		err := r.ds.QueryRow(ctx,
			`SELECT 1 FROM boards WHERE workspace_id = $1 AND slug = $2 AND id <> $3`,
			workspaceID, candidate, excludeID).Scan(&found)
		if err == db.ErrNoRows {
			return candidate, nil
		}
		if err != nil {
			return "", err
		}
		candidate = fmt.Sprintf("%s-%d", base, i)
	}
	return "", fmt.Errorf("could not find a unique board slug for %q", base)
}
