package repo

import (
	"context"
	"testing"
)

func TestWorkspaceCreateListGet(t *testing.T) {
	ds := setupTestDB(t)
	workspaces := NewWorkspaceRepository(ds)
	ctx := context.Background()

	created, err := workspaces.Create(ctx, "Acme")
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if created.Slug != "acme" {
		t.Errorf("slug = %q, want acme", created.Slug)
	}
	if created.Name != "Acme" {
		t.Errorf("name = %q, want Acme", created.Name)
	}

	byID, err := workspaces.GetByID(ctx, created.ID)
	if err != nil {
		t.Fatalf("get by id: %v", err)
	}
	if byID.Slug != "acme" {
		t.Errorf("get by id slug = %q, want acme", byID.Slug)
	}

	bySlug, err := workspaces.GetBySlug(ctx, "acme")
	if err != nil {
		t.Fatalf("get by slug: %v", err)
	}
	if bySlug.ID != created.ID {
		t.Errorf("get by slug id = %q, want %q", bySlug.ID, created.ID)
	}

	// Migrate creates the default workspace, so Acme is the second one.
	list, err := workspaces.List(ctx)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(list) != 2 {
		t.Fatalf("len(list) = %d, want 2", len(list))
	}
	if list[0].Slug != "default" {
		t.Errorf("list[0].slug = %q, want default", list[0].Slug)
	}

	def, err := workspaces.GetDefault(ctx)
	if err != nil {
		t.Fatalf("get default: %v", err)
	}
	if def.Slug != "default" {
		t.Errorf("default slug = %q, want default", def.Slug)
	}
}

func TestWorkspaceCreateSameNameUniqueSlug(t *testing.T) {
	ds := setupTestDB(t)
	workspaces := NewWorkspaceRepository(ds)
	ctx := context.Background()

	first, err := workspaces.Create(ctx, "Work")
	if err != nil {
		t.Fatalf("create first: %v", err)
	}
	second, err := workspaces.Create(ctx, "Work")
	if err != nil {
		t.Fatalf("create second: %v", err)
	}

	if first.Slug != "work" {
		t.Errorf("first slug = %q, want work", first.Slug)
	}
	if second.Slug != "work-2" {
		t.Errorf("second slug = %q, want work-2", second.Slug)
	}
	if first.ID == second.ID {
		t.Error("workspace ids must differ")
	}
}

func TestWorkspaceNotFound(t *testing.T) {
	ds := setupTestDB(t)
	workspaces := NewWorkspaceRepository(ds)
	ctx := context.Background()

	if _, err := workspaces.GetByID(ctx, "not-a-uuid"); err != ErrNotFound {
		t.Errorf("GetByID err = %v, want ErrNotFound", err)
	}
	if _, err := workspaces.GetBySlug(ctx, "missing"); err != ErrNotFound {
		t.Errorf("GetBySlug err = %v, want ErrNotFound", err)
	}
}

func TestWorkspaceRename(t *testing.T) {
	ds := setupTestDB(t)
	workspaces := NewWorkspaceRepository(ds)
	ctx := context.Background()

	first, err := workspaces.Create(ctx, "Original")
	if err != nil {
		t.Fatalf("create first: %v", err)
	}
	second, err := workspaces.Create(ctx, "Other")
	if err != nil {
		t.Fatalf("create second: %v", err)
	}

	renamed, err := workspaces.UpdateName(ctx, first.ID, "Renamed")
	if err != nil {
		t.Fatalf("rename: %v", err)
	}
	if renamed.Name != "Renamed" || renamed.Slug != "renamed" {
		t.Fatalf("renamed = %+v", renamed)
	}
	if _, err := workspaces.GetBySlug(ctx, "original"); err != ErrNotFound {
		t.Errorf("old slug error = %v, want ErrNotFound", err)
	}
	if _, err := workspaces.GetBySlug(ctx, "renamed"); err != nil {
		t.Errorf("new slug error = %v", err)
	}

	// Renaming to the same name keeps the slug (self is excluded).
	again, err := workspaces.UpdateName(ctx, first.ID, "Renamed")
	if err != nil || again.Slug != "renamed" {
		t.Fatalf("self rename = (%+v, %v)", again, err)
	}

	// Collision with another workspace gets a suffix.
	collision, err := workspaces.UpdateName(ctx, first.ID, "Other")
	if err != nil {
		t.Fatalf("collision rename: %v", err)
	}
	if collision.Slug != "other-2" {
		t.Errorf("collision slug = %q, want other-2", collision.Slug)
	}
	if _, err := workspaces.GetByID(ctx, second.ID); err != nil {
		t.Errorf("second workspace disappeared: %v", err)
	}

	if _, err := workspaces.UpdateName(ctx, "not-a-uuid", "X"); err != ErrNotFound {
		t.Errorf("rename unknown id error = %v, want ErrNotFound", err)
	}
}
