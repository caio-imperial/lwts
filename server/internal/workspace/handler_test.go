package workspace

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/oceanplexian/lwts/server/internal/auth"
	"github.com/oceanplexian/lwts/server/internal/db"
	"github.com/oceanplexian/lwts/server/internal/repo"
	"github.com/oceanplexian/lwts/server/migrations"
)

func setup(t *testing.T) (*Handler, *repo.WorkspaceRepository, *repo.BoardRepository, *repo.CardRepository, repo.Workspace, repo.Board, repo.User) {
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

	return NewHandler(workspaces, boards, cards), workspaces, boards, cards, ws, board, owner
}

func do(h *Handler, req *http.Request, user *repo.User) *httptest.ResponseRecorder {
	mux := http.NewServeMux()
	noop := func(next http.Handler) http.Handler { return next }
	h.RegisterRoutes(mux, noop)
	if user != nil {
		req = req.WithContext(context.WithValue(req.Context(), auth.UserContextKey, user))
	}
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	return rec
}

func serve(h *Handler, method, target string) *httptest.ResponseRecorder {
	return do(h, httptest.NewRequest(method, target, nil), nil)
}

func TestWorkspaceRoutes(t *testing.T) {
	h, _, _, _, ws, board, _ := setup(t)

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
	h, _, _, _, ws, board, _ := setup(t)

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

func TestWorkspaceWrites(t *testing.T) {
	h, workspaces, _, _, _, _, owner := setup(t)
	_ = workspaces

	rec := do(h, httptest.NewRequest("POST", "/api/v1/workspaces", strings.NewReader(`{"name":"New Workspace"}`)), &owner)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create workspace status = %d, body %s", rec.Code, rec.Body)
	}
	var ws repo.Workspace
	if err := json.Unmarshal(rec.Body.Bytes(), &ws); err != nil {
		t.Fatalf("decode workspace: %v", err)
	}
	if ws.Slug != "new-workspace" || ws.ID == "" {
		t.Fatalf("workspace = %+v", ws)
	}

	rec = do(h, httptest.NewRequest("POST", "/api/v1/workspaces/"+ws.Slug+"/boards",
		strings.NewReader(`{"name":"Board X","project_key":"WSX"}`)), &owner)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create board status = %d, body %s", rec.Code, rec.Body)
	}
	var board repo.Board
	if err := json.Unmarshal(rec.Body.Bytes(), &board); err != nil {
		t.Fatalf("decode board: %v", err)
	}
	if board.Slug != "board-x" || board.WorkspaceID != ws.ID || board.ProjectKey != "WSX" {
		t.Fatalf("board = %+v", board)
	}

	rec = serve(h, "GET", "/api/v1/workspaces/"+ws.Slug+"/boards")
	if rec.Code != http.StatusOK {
		t.Fatalf("list boards status = %d", rec.Code)
	}
	var boards []repo.Board
	if err := json.Unmarshal(rec.Body.Bytes(), &boards); err != nil {
		t.Fatalf("decode boards: %v", err)
	}
	if len(boards) != 1 || boards[0].ID != board.ID {
		t.Fatalf("boards = %+v", boards)
	}

	rec = do(h, httptest.NewRequest("POST", "/api/v1/workspaces", strings.NewReader(`{"name":"  "}`)), &owner)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("empty name status = %d, want 400", rec.Code)
	}
	rec = do(h, httptest.NewRequest("POST", "/api/v1/workspaces/nope/boards",
		strings.NewReader(`{"name":"Board"}`)), &owner)
	if rec.Code != http.StatusNotFound {
		t.Errorf("unknown workspace status = %d, want 404", rec.Code)
	}
	rec = do(h, httptest.NewRequest("POST", "/api/v1/workspaces/"+ws.Slug+"/boards",
		strings.NewReader(`{"name":"Board"}`)), nil)
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("unauthenticated status = %d, want 401", rec.Code)
	}
}

func TestWorkspaceRenameRoute(t *testing.T) {
	h, _, _, _, ws, _, _ := setup(t)

	rec := do(h, httptest.NewRequest("PATCH", "/api/v1/workspaces/"+ws.Slug,
		strings.NewReader(`{"name":"Renamed Workspace"}`)), nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("rename status = %d, body %s", rec.Code, rec.Body)
	}
	var renamed repo.Workspace
	if err := json.Unmarshal(rec.Body.Bytes(), &renamed); err != nil {
		t.Fatalf("decode workspace: %v", err)
	}
	if renamed.Slug != "renamed-workspace" || renamed.Name != "Renamed Workspace" {
		t.Fatalf("renamed = %+v", renamed)
	}

	// New slug works, old slug is gone.
	if rec := serve(h, "GET", "/api/v1/workspaces/renamed-workspace/boards"); rec.Code != http.StatusOK {
		t.Errorf("new slug status = %d, want 200", rec.Code)
	}
	if rec := serve(h, "GET", "/api/v1/workspaces/"+ws.Slug+"/boards"); rec.Code != http.StatusNotFound {
		t.Errorf("old slug status = %d, want 404", rec.Code)
	}

	rec = do(h, httptest.NewRequest("PATCH", "/api/v1/workspaces/renamed-workspace",
		strings.NewReader(`{"name":"  "}`)), nil)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("empty name status = %d, want 400", rec.Code)
	}
	rec = do(h, httptest.NewRequest("PATCH", "/api/v1/workspaces/nope",
		strings.NewReader(`{"name":"X"}`)), nil)
	if rec.Code != http.StatusNotFound {
		t.Errorf("unknown workspace status = %d, want 404", rec.Code)
	}
}
