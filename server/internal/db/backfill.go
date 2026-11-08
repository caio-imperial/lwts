package db

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/oceanplexian/lwts/server/internal/slug"
)

// BackfillIdentity re-runs the idempotent identity backfill. Used after a
// restore, which inserts rows that may predate the workspace/slug/number
// columns.
func BackfillIdentity(ctx context.Context, ds Datasource) error {
	return backfillWorkspaces(ctx, ds)
}

// backfillWorkspaces fills the phase 3a-1 identity columns for pre-existing
// data. It is called from Migrate while the migration lock is held, and it is
// idempotent: running it twice changes nothing.
//
// Steps:
//  1. ensure a default workspace exists (first by created_at)
//  2. attach every board without a workspace to the default one
//  3. generate unique slugs for boards that have none
//  4. assign card numbers per board and sync boards.card_seq
func backfillWorkspaces(ctx context.Context, ds Datasource) error {
	workspaceID, err := ensureDefaultWorkspace(ctx, ds)
	if err != nil {
		return fmt.Errorf("ensure default workspace: %w", err)
	}

	if _, err := ds.Exec(ctx,
		`UPDATE boards SET workspace_id = $1 WHERE workspace_id IS NULL`, workspaceID); err != nil {
		return fmt.Errorf("attach boards to default workspace: %w", err)
	}

	if err := backfillBoardSlugs(ctx, ds, workspaceID); err != nil {
		return fmt.Errorf("backfill board slugs: %w", err)
	}

	if err := backfillCardNumbers(ctx, ds); err != nil {
		return fmt.Errorf("backfill card numbers: %w", err)
	}

	return nil
}

// ensureDefaultWorkspace returns the id of the oldest workspace, creating the
// "Default" workspace ("default" slug) when the table is empty.
func ensureDefaultWorkspace(ctx context.Context, ds Datasource) (string, error) {
	var id string
	err := ds.QueryRow(ctx, `SELECT id FROM workspaces ORDER BY created_at LIMIT 1`).Scan(&id)
	if err == nil {
		return id, nil
	}
	if !errors.Is(err, ErrNoRows) {
		return "", err
	}

	id = uuid.NewString()
	now := time.Now().UTC()
	if _, err := ds.Exec(ctx,
		`INSERT INTO workspaces (id, name, slug, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)`,
		id, "Default", "default", now, now); err != nil {
		return "", err
	}
	return id, nil
}

// pendingBoard is a board that still needs a slug.
type pendingBoard struct {
	id          string
	name        string
	workspaceID string
}

// backfillBoardSlugs assigns a unique slug per workspace to boards that have
// none. Existing slugs are left untouched, which makes the pass idempotent.
func backfillBoardSlugs(ctx context.Context, ds Datasource, defaultWorkspaceID string) error {
	rows, err := ds.Query(ctx, `SELECT id, name, workspace_id FROM boards WHERE slug IS NULL ORDER BY created_at, id`)
	if err != nil {
		return err
	}

	// Read everything before writing: a single-connection datasource (SQLite)
	// would deadlock if we executed updates while rows were still open.
	var pending []pendingBoard
	for rows.Next() {
		var b pendingBoard
		var workspaceID *string
		if err := rows.Scan(&b.id, &b.name, &workspaceID); err != nil {
			rows.Close()
			return err
		}
		b.workspaceID = defaultWorkspaceID
		if workspaceID != nil && *workspaceID != "" {
			b.workspaceID = *workspaceID
		}
		pending = append(pending, b)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return err
	}
	rows.Close()

	for _, b := range pending {
		boardSlug, err := uniqueSlug(ctx, ds,
			`SELECT 1 FROM boards WHERE workspace_id = $1 AND slug = $2 AND id <> $3`,
			b.workspaceID, slug.Normalize(b.name), b.id)
		if err != nil {
			return err
		}
		if _, err := ds.Exec(ctx, `UPDATE boards SET slug = $1 WHERE id = $2`, boardSlug, b.id); err != nil {
			return err
		}
	}
	return nil
}

// uniqueSlug returns base, or base-2, base-3, ... until the collision query
// finds no other row. The collision query receives (scope, candidate, excludeID)
// as $1, $2, $3.
func uniqueSlug(ctx context.Context, ds Datasource, collisionQuery, scope, base, excludeID string) (string, error) {
	candidate := base
	for i := 2; i < 10000; i++ {
		var found int
		err := ds.QueryRow(ctx, collisionQuery, scope, candidate, excludeID).Scan(&found)
		if errors.Is(err, ErrNoRows) {
			return candidate, nil
		}
		if err != nil {
			return "", err
		}
		candidate = fmt.Sprintf("%s-%d", base, i)
	}
	return "", fmt.Errorf("could not find a unique slug for %q", base)
}

// backfillCardNumbers assigns sequential numbers (starting at the current max)
// to cards that have none, then syncs boards.card_seq to MAX(number).
func backfillCardNumbers(ctx context.Context, ds Datasource) error {
	boardRows, err := ds.Query(ctx, `SELECT id FROM boards ORDER BY created_at, id`)
	if err != nil {
		return err
	}
	var boardIDs []string
	for boardRows.Next() {
		var id string
		if err := boardRows.Scan(&id); err != nil {
			boardRows.Close()
			return err
		}
		boardIDs = append(boardIDs, id)
	}
	if err := boardRows.Err(); err != nil {
		boardRows.Close()
		return err
	}
	boardRows.Close()

	for _, boardID := range boardIDs {
		cardRows, err := ds.Query(ctx,
			`SELECT id FROM cards WHERE board_id = $1 AND number IS NULL ORDER BY created_at, id`, boardID)
		if err != nil {
			return err
		}
		var cardIDs []string
		for cardRows.Next() {
			var id string
			if err := cardRows.Scan(&id); err != nil {
				cardRows.Close()
				return err
			}
			cardIDs = append(cardIDs, id)
		}
		if err := cardRows.Err(); err != nil {
			cardRows.Close()
			return err
		}
		cardRows.Close()

		var maxNumber int
		if err := ds.QueryRow(ctx,
			`SELECT COALESCE(MAX(number), 0) FROM cards WHERE board_id = $1`, boardID).Scan(&maxNumber); err != nil {
			return err
		}

		next := maxNumber
		for _, cardID := range cardIDs {
			next++
			if _, err := ds.Exec(ctx, `UPDATE cards SET number = $1 WHERE id = $2`, next, cardID); err != nil {
				return err
			}
		}

		if _, err := ds.Exec(ctx,
			`UPDATE boards SET card_seq = (SELECT COALESCE(MAX(number), 0) FROM cards WHERE board_id = $1)
			 WHERE id = $2 AND card_seq <> (SELECT COALESCE(MAX(number), 0) FROM cards WHERE board_id = $3)`,
			boardID, boardID, boardID); err != nil {
			return err
		}
	}
	return nil
}
