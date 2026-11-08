package db

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/oceanplexian/lwts/server/migrations"
)

func setupBackfillDB(t *testing.T) Datasource {
	t.Helper()
	ds, err := NewSQLiteDatasource("sqlite://:memory:")
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	t.Cleanup(func() { ds.Close() })

	if err := Migrate(context.Background(), ds, migrations.FS); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	return ds
}

// backfillSnapshot renders the values the backfill is responsible for so two
// runs can be compared byte for byte.
func backfillSnapshot(t *testing.T, ds Datasource) string {
	t.Helper()
	ctx := context.Background()

	boardRows, err := ds.Query(ctx,
		`SELECT id, COALESCE(workspace_id, ''), COALESCE(slug, ''), card_seq FROM boards ORDER BY id`)
	if err != nil {
		t.Fatalf("query boards: %v", err)
	}
	var out string
	for boardRows.Next() {
		var id, workspaceID, boardSlug string
		var cardSeq int
		if err := boardRows.Scan(&id, &workspaceID, &boardSlug, &cardSeq); err != nil {
			boardRows.Close()
			t.Fatalf("scan board: %v", err)
		}
		out += fmt.Sprintf("board %s ws=%s slug=%s seq=%d\n", id, workspaceID, boardSlug, cardSeq)
	}
	boardRows.Close()

	cardRows, err := ds.Query(ctx,
		`SELECT id, COALESCE(number, 0) FROM cards ORDER BY id`)
	if err != nil {
		t.Fatalf("query cards: %v", err)
	}
	for cardRows.Next() {
		var id string
		var number int
		if err := cardRows.Scan(&id, &number); err != nil {
			cardRows.Close()
			t.Fatalf("scan card: %v", err)
		}
		out += fmt.Sprintf("card %s number=%d\n", id, number)
	}
	cardRows.Close()

	return out
}

func TestBackfillWorkspaces(t *testing.T) {
	ds := setupBackfillDB(t)
	ctx := context.Background()

	ownerID := uuid.NewString()
	if _, err := ds.Exec(ctx,
		`INSERT INTO users (id, email, name, password_hash) VALUES ($1, $2, $3, $4)`,
		ownerID, "owner@test.dev", "Owner", "hash"); err != nil {
		t.Fatalf("insert user: %v", err)
	}

	base := time.Now().UTC().Truncate(time.Second)
	board1 := uuid.NewString()
	board2 := uuid.NewString()
	for i, boardID := range []string{board1, board2} {
		if _, err := ds.Exec(ctx,
			`INSERT INTO boards (id, name, project_key, owner_id, created_at, updated_at)
			 VALUES ($1, $2, $3, $4, $5, $6)`,
			boardID, "Sprint Board", "SB", ownerID, base.Add(time.Duration(i)*time.Second), base); err != nil {
			t.Fatalf("insert board %d: %v", i, err)
		}
	}

	var cardIDs []string
	for i := 0; i < 3; i++ {
		cardID := uuid.NewString()
		cardIDs = append(cardIDs, cardID)
		if _, err := ds.Exec(ctx,
			`INSERT INTO cards (id, board_id, column_id, title, key, created_at, updated_at)
			 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
			cardID, board1, "todo", fmt.Sprintf("Card %d", i+1), fmt.Sprintf("SB-%d", i+1),
			base.Add(time.Duration(i)*time.Second), base); err != nil {
			t.Fatalf("insert card %d: %v", i, err)
		}
	}

	// First run fills everything.
	if err := backfillWorkspaces(ctx, ds); err != nil {
		t.Fatalf("first backfill: %v", err)
	}

	var workspaceID, workspaceName, workspaceSlug string
	if err := ds.QueryRow(ctx,
		`SELECT id, name, slug FROM workspaces ORDER BY created_at, id LIMIT 1`).
		Scan(&workspaceID, &workspaceName, &workspaceSlug); err != nil {
		t.Fatalf("query workspace: %v", err)
	}
	if workspaceName != "Default" || workspaceSlug != "default" {
		t.Errorf("workspace = %q/%q, want Default/default", workspaceName, workspaceSlug)
	}

	var workspaceCount int
	if err := ds.QueryRow(ctx, `SELECT COUNT(*) FROM workspaces`).Scan(&workspaceCount); err != nil {
		t.Fatalf("count workspaces: %v", err)
	}
	if workspaceCount != 1 {
		t.Errorf("workspaces = %d, want 1", workspaceCount)
	}

	wantSlugs := map[string]string{board1: "sprint-board", board2: "sprint-board-2"}
	for boardID, wantSlug := range wantSlugs {
		var gotWorkspace, gotSlug string
		var cardSeq int
		if err := ds.QueryRow(ctx,
			`SELECT workspace_id, slug, card_seq FROM boards WHERE id = $1`, boardID).
			Scan(&gotWorkspace, &gotSlug, &cardSeq); err != nil {
			t.Fatalf("query board %s: %v", boardID, err)
		}
		if gotWorkspace != workspaceID {
			t.Errorf("board %s workspace = %q, want %q", boardID, gotWorkspace, workspaceID)
		}
		if gotSlug != wantSlug {
			t.Errorf("board %s slug = %q, want %q", boardID, gotSlug, wantSlug)
		}
		if boardID == board1 && cardSeq != 3 {
			t.Errorf("board card_seq = %d, want 3", cardSeq)
		}
		if boardID == board2 && cardSeq != 0 {
			t.Errorf("empty board card_seq = %d, want 0", cardSeq)
		}
	}

	for i, cardID := range cardIDs {
		var number int
		if err := ds.QueryRow(ctx, `SELECT number FROM cards WHERE id = $1`, cardID).Scan(&number); err != nil {
			t.Fatalf("query card %s: %v", cardID, err)
		}
		if number != i+1 {
			t.Errorf("card %s number = %d, want %d", cardID, number, i+1)
		}
	}

	before := backfillSnapshot(t, ds)

	// Second run must be a no-op.
	if err := backfillWorkspaces(ctx, ds); err != nil {
		t.Fatalf("second backfill: %v", err)
	}
	if after := backfillSnapshot(t, ds); after != before {
		t.Errorf("second run changed data:\nbefore:\n%s\nafter:\n%s", before, after)
	}

	var afterCount int
	if err := ds.QueryRow(ctx, `SELECT COUNT(*) FROM workspaces`).Scan(&afterCount); err != nil {
		t.Fatalf("count workspaces after: %v", err)
	}
	if afterCount != 1 {
		t.Errorf("workspaces after second run = %d, want 1", afterCount)
	}
}

func TestBackfillWorkspacesEmptyDatabase(t *testing.T) {
	ds := setupBackfillDB(t)
	ctx := context.Background()

	if err := backfillWorkspaces(ctx, ds); err != nil {
		t.Fatalf("backfill on empty database: %v", err)
	}

	var workspaceCount int
	if err := ds.QueryRow(ctx, `SELECT COUNT(*) FROM workspaces`).Scan(&workspaceCount); err != nil {
		t.Fatalf("count workspaces: %v", err)
	}
	if workspaceCount != 1 {
		t.Errorf("workspaces = %d, want 1", workspaceCount)
	}
}

func TestBackfillCardNumbersPreservesExisting(t *testing.T) {
	ds := setupBackfillDB(t)
	ctx := context.Background()

	ownerID := uuid.NewString()
	if _, err := ds.Exec(ctx,
		`INSERT INTO users (id, email, name, password_hash) VALUES ($1, $2, $3, $4)`,
		ownerID, "num@test.dev", "Owner", "hash"); err != nil {
		t.Fatalf("insert user: %v", err)
	}

	boardID := uuid.NewString()
	if _, err := ds.Exec(ctx,
		`INSERT INTO boards (id, name, project_key, owner_id) VALUES ($1, $2, $3, $4)`,
		boardID, "Numbers", "NUM", ownerID); err != nil {
		t.Fatalf("insert board: %v", err)
	}

	existing := uuid.NewString()
	if _, err := ds.Exec(ctx,
		`INSERT INTO cards (id, board_id, column_id, title, key, number) VALUES ($1, $2, $3, $4, $5, $6)`,
		existing, boardID, "todo", "Existing", "NUM-9", 9); err != nil {
		t.Fatalf("insert numbered card: %v", err)
	}
	newCard := uuid.NewString()
	if _, err := ds.Exec(ctx,
		`INSERT INTO cards (id, board_id, column_id, title, key) VALUES ($1, $2, $3, $4, $5)`,
		newCard, boardID, "todo", "New", "NUM-1"); err != nil {
		t.Fatalf("insert unnumbered card: %v", err)
	}

	if err := backfillWorkspaces(ctx, ds); err != nil {
		t.Fatalf("backfill: %v", err)
	}

	var got int
	if err := ds.QueryRow(ctx, `SELECT number FROM cards WHERE id = $1`, existing).Scan(&got); err != nil {
		t.Fatalf("query existing: %v", err)
	}
	if got != 9 {
		t.Errorf("existing card number = %d, want 9", got)
	}
	if err := ds.QueryRow(ctx, `SELECT number FROM cards WHERE id = $1`, newCard).Scan(&got); err != nil {
		t.Fatalf("query new: %v", err)
	}
	if got != 10 {
		t.Errorf("new card number = %d, want 10", got)
	}

	var cardSeq int
	if err := ds.QueryRow(ctx, `SELECT card_seq FROM boards WHERE id = $1`, boardID).Scan(&cardSeq); err != nil {
		t.Fatalf("query card_seq: %v", err)
	}
	if cardSeq != 10 {
		t.Errorf("card_seq = %d, want 10", cardSeq)
	}
}
