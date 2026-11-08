package repo

import (
	"context"
	"errors"
	"fmt"
	"testing"
)

func TestCardNumbersAndBoardScopedKeys(t *testing.T) {
	ds := setupTestDB(t)
	users := NewUserRepository(ds)
	boards := NewBoardRepository(ds)
	cards := NewCardRepository(ds)
	ctx := context.Background()

	owner, err := users.Create(ctx, "Owner", "owner@test.com", "hash")
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	alpha, err := boards.Create(ctx, "Alpha", "SAME", owner.ID)
	if err != nil {
		t.Fatalf("create board alpha: %v", err)
	}
	beta, err := boards.Create(ctx, "Beta", "SAME", owner.ID)
	if err != nil {
		t.Fatalf("create board beta: %v", err)
	}

	for i := 1; i <= 3; i++ {
		card, err := cards.Create(ctx, alpha.ID, CardCreate{ColumnID: "todo", Title: fmt.Sprintf("Alpha %d", i)})
		if err != nil {
			t.Fatalf("create alpha card %d: %v", i, err)
		}
		if card.Number != i {
			t.Errorf("alpha card %d number = %d, want %d", i, card.Number, i)
		}
		if want := fmt.Sprintf("SAME-%d", i); card.Key != want {
			t.Errorf("alpha card %d key = %q, want %q", i, card.Key, want)
		}
	}

	// Same project_key in another board is allowed and restarts numbering.
	betaCard, err := cards.Create(ctx, beta.ID, CardCreate{ColumnID: "todo", Title: "Beta 1"})
	if err != nil {
		t.Fatalf("create beta card: %v", err)
	}
	if betaCard.Number != 1 {
		t.Errorf("beta card number = %d, want 1", betaCard.Number)
	}
	if betaCard.Key != "SAME-1" {
		t.Errorf("beta card key = %q, want SAME-1", betaCard.Key)
	}

	stored, err := boards.GetByID(ctx, alpha.ID)
	if err != nil {
		t.Fatalf("get board: %v", err)
	}
	if stored.CardSeq != 3 {
		t.Errorf("card_seq = %d, want 3", stored.CardSeq)
	}
	if stored.WorkspaceID == "" || stored.Slug == "" {
		t.Errorf("board identity missing: workspace=%q slug=%q", stored.WorkspaceID, stored.Slug)
	}

	// The same key in two boards makes the global lookup ambiguous.
	if _, err := cards.GetByKey(ctx, "SAME-1"); !errors.Is(err, ErrAmbiguous) {
		t.Errorf("GetByKey(SAME-1) error = %v, want ErrAmbiguous", err)
	}
	if _, err := cards.GetByID(ctx, betaCard.ID); err != nil {
		t.Errorf("GetByID by UUID failed: %v", err)
	}
}

func TestGetByKeyUniqueBoard(t *testing.T) {
	ds := setupTestDB(t)
	users := NewUserRepository(ds)
	boards := NewBoardRepository(ds)
	cards := NewCardRepository(ds)
	ctx := context.Background()

	owner, _ := users.Create(ctx, "Owner", "owner@test.com", "hash")
	board, _ := boards.Create(ctx, "Board", "UNIQ", owner.ID)
	card, err := cards.Create(ctx, board.ID, CardCreate{ColumnID: "todo", Title: "Only"})
	if err != nil {
		t.Fatalf("create card: %v", err)
	}

	got, err := cards.GetByKey(ctx, card.Key)
	if err != nil {
		t.Fatalf("GetByKey: %v", err)
	}
	if got.ID != card.ID || got.Number != 1 {
		t.Errorf("GetByKey returned %+v, want id=%s number=1", got, card.ID)
	}

	if _, err := cards.GetByKey(ctx, "UNIQ-999"); !errors.Is(err, ErrNotFound) {
		t.Errorf("GetByKey(missing) error = %v, want ErrNotFound", err)
	}
}
