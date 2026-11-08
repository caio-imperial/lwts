package workspace

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/oceanplexian/lwts/server/internal/db"
	"github.com/oceanplexian/lwts/server/internal/repo"
	"github.com/oceanplexian/lwts/server/migrations"
)

func setup(t *testing.T) (*Handler, *repo.WorkspaceRepository, *repo.BoardRepository, *repo.CardRepository, repo.Workspace, repo.Board) {
	t.Helper()
	ds, err := db.NewSQLiteDatasource("sqlite://:memory:")
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	ctx := context.Background()
	if err := db.Migrate(ctx, ds, migrations.FS); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	t.Cleanup(func() { ds.Close() })

	users := repo.NewUserRepository(ds)
	workspaces := repo.NewWorkspaceRepository(ds)
	boards := repo.NewBoardRepository(ds)
	cards := repo.NewCardRepository(ds)

	owner, err := users.Create(ctx, "Owner", "owner@test.com", "hash")
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	ws, err := workspaces.GetDefault(ctx)
	if err != nil {
		t.Fatalf("default workspace: %v", err)
	}
	board, err := boards.CreateInWorkspace(ctx, ws.ID, "My Board", "TEST", owner.ID)
	if err != nil {
		t.Fatalf("create board: %v", err)
	}
	if _, err := cards.Create(ctx, board.ID, repo.CardCreate{ColumnID: "todo", Title: "First"}); err != nil {
		t.Fatalf("create card: %v", err)
	}

	return NewHandler(workspaces, boards, cards), workspaces, boards, cards, ws, board
}

func serve(h *Handler, method, target string) *httptest.ResponseRecorder {
	mux := http.NewServeMux()
	noop := func(next http.Handler) http.Handler { return next }
	h.RegisterRoutes(mux, noop)
	req := httptest.NewRequest(method, target, nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	return rec
}

func TestWorkspaceRoutes(t *testing.T) {
	h, _, _, _, ws, board := setup(t)

	rec := serve(h, "GET", "/api/v1/workspaces")
	if rec.Code != http.StatusOK {
		t.Fatalf("list workspaces status = %d, body %s", rec.Code, rec.Body)
	}
	var workspaces []repo.Workspace
	if err := json.Unmarshal(rec.Body.Bytes(), &workspaces); err != nil {
		t.Fatalf("decode workspaces: %v", err)
	}
	if len(workspaces) != 1 || workspaces[0].Slug != ws.Slug {
		t.Fatalf("workspaces = %+v, want default %q", workspaces, ws.Slug)
	}

	rec = serve(h, "GET", "/api/v1/workspaces/"+ws.Slug+"/boards")
	if rec.Code != http.StatusOK {
		t.Fatalf("list boards status = %d, body %s", rec.Code, rec.Body)
	}
	var boards []repo.Board
	if err := json.Unmarshal(rec.Body.Bytes(), &boards); err != nil {
		t.Fatalf("decode boards: %v", err)
	}
	if len(boards) != 1 || boards[0].ID != board.ID {
		t.Fatalf("boards = %+v, want %s", boards, board.ID)
	}

	rec = serve(h, "GET", "/api/v1/workspaces/"+ws.Slug+"/boards/"+board.Slug+"/cards")
	if rec.Code != http.StatusOK {
		t.Fatalf("list cards status = %d, body %s", rec.Code, rec.Body)
	}
	var grouped map[string][]repo.Card
	if err := json.Unmarshal(rec.Body.Bytes(), &grouped); err != nil {
		t.Fatalf("decode cards: %v", err)
	}
	if len(grouped["todo"]) != 1 || grouped["todo"][0].Number != 1 {
		t.Fatalf("grouped = %+v", grouped)
	}

	rec = serve(h, "GET", "/api/v1/workspaces/"+ws.Slug+"/boards/"+board.Slug+"/cards/1")
	if rec.Code != http.StatusOK {
		t.Fatalf("get card status = %d, body %s", rec.Code, rec.Body)
	}
	var cardBody struct {
		Card repo.Card `json:"card"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &cardBody); err != nil {
		t.Fatalf("decode card: %v", err)
	}
	if cardBody.Card.Number != 1 || cardBody.Card.Key != "TEST-1" {
		t.Fatalf("card = %+v", cardBody.Card)
	}
}

func TestWorkspaceRouteNotFound(t *testing.T) {
	h, _, _, _, ws, board := setup(t)

	cases := []string{
		"/api/v1/workspaces/nope/boards",
		"/api/v1/workspaces/" + ws.Slug + "/boards/nope",
		"/api/v1/workspaces/" + ws.Slug + "/boards/" + board.Slug + "/cards/99",
	}
	for _, target := range cases {
		rec := serve(h, "GET", target)
		if rec.Code != http.StatusNotFound {
			t.Errorf("%s status = %d, want 404", target, rec.Code)
		}
	}
}
