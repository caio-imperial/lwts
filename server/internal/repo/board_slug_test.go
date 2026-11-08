package repo

import (
	"context"
	"testing"
)

func TestBoardCreateAssignsWorkspaceAndSlug(t *testing.T) {
	ds := setupTestDB(t)
	users := NewUserRepository(ds)
	boards := NewBoardRepository(ds)
	ctx := context.Background()

	owner, err := users.Create(ctx, "Owner", "owner@test.com", "hash")
	if err != nil {
		t.Fatalf("create owner: %v", err)
	}

	first, err := boards.Create(ctx, "Meu Board", "MB", owner.ID)
	if err != nil {
		t.Fatalf("create first board: %v", err)
	}
	second, err := boards.Create(ctx, "Meu Board", "MB2", owner.ID)
	if err != nil {
		t.Fatalf("create second board: %v", err)
	}

	var firstWorkspace, firstSlug string
	if err := ds.QueryRow(ctx,
		`SELECT workspace_id, slug FROM boards WHERE id = $1`, first.ID).
		Scan(&firstWorkspace, &firstSlug); err != nil {
		t.Fatalf("query first board: %v", err)
	}
	if firstSlug != "meu-board" {
		t.Errorf("first slug = %q, want meu-board", firstSlug)
	}

	var secondWorkspace, secondSlug string
	if err := ds.QueryRow(ctx,
		`SELECT workspace_id, slug FROM boards WHERE id = $1`, second.ID).
		Scan(&secondWorkspace, &secondSlug); err != nil {
		t.Fatalf("query second board: %v", err)
	}
	if secondSlug != "meu-board-2" {
		t.Errorf("second slug = %q, want meu-board-2", secondSlug)
	}
	if secondWorkspace != firstWorkspace {
		t.Errorf("boards belong to different workspaces: %q vs %q", firstWorkspace, secondWorkspace)
	}

	var defaultWorkspace string
	if err := ds.QueryRow(ctx,
		`SELECT id FROM workspaces ORDER BY created_at, id LIMIT 1`).Scan(&defaultWorkspace); err != nil {
		t.Fatalf("query default workspace: %v", err)
	}
	if firstWorkspace != defaultWorkspace {
		t.Errorf("board workspace = %q, want default workspace %q", firstWorkspace, defaultWorkspace)
	}
}

func TestBoardRenameUpdatesSlug(t *testing.T) {
	ds := setupTestDB(t)
	users := NewUserRepository(ds)
	boards := NewBoardRepository(ds)
	ctx := context.Background()

	owner, err := users.Create(ctx, "Owner", "rename@test.com", "hash")
	if err != nil {
		t.Fatalf("create owner: %v", err)
	}
	first, err := boards.Create(ctx, "Meu Board", "MB", owner.ID)
	if err != nil {
		t.Fatalf("create first board: %v", err)
	}
	second, err := boards.Create(ctx, "Meu Board", "MB2", owner.ID)
	if err != nil {
		t.Fatalf("create second board: %v", err)
	}

	newName := "Outro Nome"
	if _, err := boards.Update(ctx, first.ID, BoardUpdate{Name: &newName}); err != nil {
		t.Fatalf("rename first board: %v", err)
	}

	var renamedSlug string
	if err := ds.QueryRow(ctx, `SELECT slug FROM boards WHERE id = $1`, first.ID).Scan(&renamedSlug); err != nil {
		t.Fatalf("query renamed board: %v", err)
	}
	if renamedSlug != "outro-nome" {
		t.Errorf("renamed slug = %q, want outro-nome", renamedSlug)
	}

	// Renaming the second board to the same name must not steal the slug.
	if _, err := boards.Update(ctx, second.ID, BoardUpdate{Name: &newName}); err != nil {
		t.Fatalf("rename second board: %v", err)
	}
	var secondSlug string
	if err := ds.QueryRow(ctx, `SELECT slug FROM boards WHERE id = $1`, second.ID).Scan(&secondSlug); err != nil {
		t.Fatalf("query second board: %v", err)
	}
	if secondSlug != "outro-nome-2" {
		t.Errorf("second slug = %q, want outro-nome-2", secondSlug)
	}

	// Renaming to the same name keeps the current slug (does not collide with itself).
	if _, err := boards.Update(ctx, first.ID, BoardUpdate{Name: &newName}); err != nil {
		t.Fatalf("re-rename first board: %v", err)
	}
	if err := ds.QueryRow(ctx, `SELECT slug FROM boards WHERE id = $1`, first.ID).Scan(&renamedSlug); err != nil {
		t.Fatalf("query renamed board again: %v", err)
	}
	if renamedSlug != "outro-nome" {
		t.Errorf("slug after re-rename = %q, want outro-nome", renamedSlug)
	}
}
