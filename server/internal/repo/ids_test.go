package repo

import (
	"context"
	"errors"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"
)

func TestIsRetryable(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want bool
	}{
		{"nil", nil, false},
		{"deadlock", &pgconn.PgError{Code: "40P01"}, true},
		{"serialization", &pgconn.PgError{Code: "40001"}, true},
		{"key unique no longer retried", &pgconn.PgError{Code: "23505", ConstraintName: "idx_cards_board_key"}, false},
		{"other unique", &pgconn.PgError{Code: "23505", ConstraintName: "idx_boards_slug"}, false},
		{"sqlite busy", errors.New("database is locked"), true},
		{"sqlite key unique no longer retried", errors.New("constraint failed: UNIQUE constraint failed: cards.key (2067)"), false},
		{"sqlite other unique", errors.New("constraint failed: UNIQUE constraint failed: boards.slug (2067)"), false},
		{"plain", errors.New("boom"), false},
	}

	for _, tt := range tests {
		if got := isRetryable(tt.err); got != tt.want {
			t.Errorf("%s: isRetryable(%v) = %v, want %v", tt.name, tt.err, got, tt.want)
		}
	}
}

func TestRepositoriesRejectNonUUIDIDs(t *testing.T) {
	ds := setupTestDB(t)
	users := NewUserRepository(ds)
	boards := NewBoardRepository(ds)
	cards := NewCardRepository(ds)
	ctx := context.Background()

	owner, err := users.Create(ctx, "Owner", "owner@test.com", "hash")
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	board, err := boards.Create(ctx, "Board", "LWTS", owner.ID)
	if err != nil {
		t.Fatalf("create board: %v", err)
	}

	if _, err := boards.GetByID(ctx, "not-a-uuid"); err != ErrNotFound {
		t.Errorf("GetByID(non-uuid) error = %v, want ErrNotFound", err)
	}
	if _, err := boards.GetByID(ctx, board.ID); err != nil {
		t.Errorf("GetByID(uuid) error = %v, want nil", err)
	}
	if _, err := cards.GetByID(ctx, "not-a-uuid"); err != ErrNotFound {
		t.Errorf("card GetByID(non-uuid) error = %v, want ErrNotFound", err)
	}
	if list, err := cards.ListByBoard(ctx, "not-a-uuid"); err != nil || len(list) != 0 {
		t.Errorf("ListByBoard(non-uuid) = (%d cards, %v), want (0, nil)", len(list), err)
	}
}
