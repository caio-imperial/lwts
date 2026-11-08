package repo

import (
	"context"
	"errors"
	"testing"
)

func TestWorkspaceScopedLookups(t *testing.T) {
	ds := setupTestDB(t)
	users := NewUserRepository(ds)
	workspaces := NewWorkspaceRepository(ds)
	boards := NewBoardRepository(ds)
	cards := NewCardRepository(ds)
	ctx := context.Background()

	owner, err := users.Create(ctx, "Owner", "owner@test.com", "hash")
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	wsOne, err := workspaces.Create(ctx, "One")
	if err != nil {
		t.Fatalf("create workspace one: %v", err)
	}
	wsTwo, err := workspaces.Create(ctx, "Two")
	if err != nil {
		t.Fatalf("create workspace two: %v", err)
	}

	boardOne, err := boards.CreateInWorkspace(ctx, wsOne.ID, "Board", "SAME", owner.ID)
	if err != nil {
		t.Fatalf("create board one: %v", err)
	}
	boardTwo, err := boards.CreateInWorkspace(ctx, wsTwo.ID, "Board", "SAME", owner.ID)
	if err != nil {
		t.Fatalf("create board two: %v", err)
	}
	if boardOne.Slug != "board" || boardTwo.Slug != "board" {
		t.Fatalf("slugs = %q / %q, want both board", boardOne.Slug, boardTwo.Slug)
	}

	gotOne, err := boards.GetBySlug(ctx, wsOne.ID, "board")
	if err != nil || gotOne.ID != boardOne.ID {
		t.Fatalf("GetBySlug one = (%+v, %v), want %s", gotOne, err, boardOne.ID)
	}
	gotTwo, err := boards.GetBySlug(ctx, wsTwo.ID, "board")
	if err != nil || gotTwo.ID != boardTwo.ID {
		t.Fatalf("GetBySlug two = (%+v, %v), want %s", gotTwo, err, boardTwo.ID)
	}

	listOne, err := boards.ListByWorkspace(ctx, wsOne.ID)
	if err != nil || len(listOne) != 1 || listOne[0].ID != boardOne.ID {
		t.Fatalf("ListByWorkspace one = (%+v, %v)", listOne, err)
	}

	cardOne, err := cards.Create(ctx, boardOne.ID, CardCreate{ColumnID: "todo", Title: "One"})
	if err != nil {
		t.Fatalf("create card one: %v", err)
	}
	cardTwo, err := cards.Create(ctx, boardTwo.ID, CardCreate{ColumnID: "todo", Title: "Two"})
	if err != nil {
		t.Fatalf("create card two: %v", err)
	}
	if cardOne.Number != 1 || cardTwo.Number != 1 {
		t.Fatalf("numbers = %d / %d, want 1 / 1", cardOne.Number, cardTwo.Number)
	}

	byNumber, err := cards.GetByNumber(ctx, boardOne.ID, 1)
	if err != nil || byNumber.ID != cardOne.ID {
		t.Fatalf("GetByNumber = (%+v, %v), want %s", byNumber, err, cardOne.ID)
	}
	byKey, err := cards.GetByKeyInBoard(ctx, boardTwo.ID, "SAME-1")
	if err != nil || byKey.ID != cardTwo.ID {
		t.Fatalf("GetByKeyInBoard = (%+v, %v), want %s", byKey, err, cardTwo.ID)
	}

	if _, err := cards.GetByNumber(ctx, boardOne.ID, 99); !errors.Is(err, ErrNotFound) {
		t.Errorf("GetByNumber(missing) error = %v, want ErrNotFound", err)
	}
	if _, err := boards.GetBySlug(ctx, wsOne.ID, "nope"); !errors.Is(err, ErrNotFound) {
		t.Errorf("GetBySlug(missing) error = %v, want ErrNotFound", err)
	}
}
