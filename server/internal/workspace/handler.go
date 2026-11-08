// Package workspace exposes workspace-scoped read routes. The URL hierarchy is
// workspace -> board -> card, matching the frontend contract.
package workspace

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/google/uuid"
	"github.com/oceanplexian/lwts/server/internal/auth"
	"github.com/oceanplexian/lwts/server/internal/repo"
)

// Handler serves workspace-scoped read endpoints.
type Handler struct {
	workspaces *repo.WorkspaceRepository
	boards     *repo.BoardRepository
	cards      *repo.CardRepository
}

func NewHandler(workspaces *repo.WorkspaceRepository, boards *repo.BoardRepository, cards *repo.CardRepository) *Handler {
	return &Handler{workspaces: workspaces, boards: boards, cards: cards}
}

func (h *Handler) RegisterRoutes(mux *http.ServeMux, authMW func(http.Handler) http.Handler) {
	mux.Handle("GET /api/v1/workspaces", authMW(http.HandlerFunc(h.List)))
	mux.Handle("POST /api/v1/workspaces", authMW(http.HandlerFunc(h.Create)))
	mux.Handle("PATCH /api/v1/workspaces/{workspace}", authMW(http.HandlerFunc(h.Rename)))
	mux.Handle("GET /api/v1/workspaces/{workspace}/boards", authMW(http.HandlerFunc(h.ListBoards)))
	mux.Handle("POST /api/v1/workspaces/{workspace}/boards", authMW(http.HandlerFunc(h.CreateBoard)))
	mux.Handle("GET /api/v1/workspaces/{workspace}/boards/{board}", authMW(http.HandlerFunc(h.GetBoard)))
	mux.Handle("GET /api/v1/workspaces/{workspace}/boards/{board}/cards", authMW(http.HandlerFunc(h.ListCards)))
	mux.Handle("GET /api/v1/workspaces/{workspace}/boards/{board}/cards/{card}", authMW(http.HandlerFunc(h.GetCard)))
}

type createWorkspaceReq struct {
	Name string `json:"name"`
}

// Create adds a workspace. Slugs are derived from the name and are globally
// unique.
func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	var req createWorkspaceReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		writeErr(w, http.StatusBadRequest, "name is required")
		return
	}

	ws, err := h.workspaces.Create(r.Context(), name)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "internal server error")
		return
	}
	writeJSON(w, http.StatusCreated, ws)
}

type createBoardReq struct {
	Name       string `json:"name"`
	ProjectKey string `json:"project_key"`
}

type renameWorkspaceReq struct {
	Name string `json:"name"`
}

// Rename changes the workspace name and recomputes its slug.
func (h *Handler) Rename(w http.ResponseWriter, r *http.Request) {
	ws, err := h.resolveWorkspace(r.Context(), r.PathValue("workspace"))
	if err != nil {
		writeResolveErr(w, err)
		return
	}

	var req renameWorkspaceReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		writeErr(w, http.StatusBadRequest, "name is required")
		return
	}

	updated, err := h.workspaces.UpdateName(r.Context(), ws.ID, name)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "internal server error")
		return
	}
	writeJSON(w, http.StatusOK, updated)
} // CreateBoard adds a board inside the workspace. The authenticated user becomes
// the board owner and the project key defaults to LWTS.
func (h *Handler) CreateBoard(w http.ResponseWriter, r *http.Request) {
	ws, err := h.resolveWorkspace(r.Context(), r.PathValue("workspace"))
	if err != nil {
		writeResolveErr(w, err)
		return
	}
	user := auth.UserFromContext(r.Context())
	if user == nil {
		writeErr(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req createBoardReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		writeErr(w, http.StatusBadRequest, "name is required")
		return
	}
	projectKey := strings.TrimSpace(req.ProjectKey)
	if projectKey == "" {
		projectKey = "LWTS"
	}

	board, err := h.boards.CreateInWorkspace(r.Context(), ws.ID, name, projectKey, user.ID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "internal server error")
		return
	}
	writeJSON(w, http.StatusCreated, board)
}

func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	workspaces, err := h.workspaces.List(r.Context())
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if workspaces == nil {
		workspaces = []repo.Workspace{}
	}
	writeJSON(w, http.StatusOK, workspaces)
}

func (h *Handler) ListBoards(w http.ResponseWriter, r *http.Request) {
	ws, err := h.resolveWorkspace(r.Context(), r.PathValue("workspace"))
	if err != nil {
		writeResolveErr(w, err)
		return
	}
	boards, err := h.boards.ListByWorkspace(r.Context(), ws.ID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if boards == nil {
		boards = []repo.Board{}
	}
	writeJSON(w, http.StatusOK, boards)
}

func (h *Handler) GetBoard(w http.ResponseWriter, r *http.Request) {
	ws, err := h.resolveWorkspace(r.Context(), r.PathValue("workspace"))
	if err != nil {
		writeResolveErr(w, err)
		return
	}
	board, err := h.resolveBoard(r.Context(), ws.ID, r.PathValue("board"))
	if err != nil {
		writeResolveErr(w, err)
		return
	}

	cards, _ := h.cards.ListByBoard(r.Context(), board.ID)
	counts := map[string]int{}
	for _, c := range cards {
		counts[c.ColumnID]++
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"board":       board,
		"card_counts": counts,
	})
}

func (h *Handler) ListCards(w http.ResponseWriter, r *http.Request) {
	ws, err := h.resolveWorkspace(r.Context(), r.PathValue("workspace"))
	if err != nil {
		writeResolveErr(w, err)
		return
	}
	board, err := h.resolveBoard(r.Context(), ws.ID, r.PathValue("board"))
	if err != nil {
		writeResolveErr(w, err)
		return
	}

	cards, err := h.cards.ListByBoard(r.Context(), board.ID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "internal server error")
		return
	}
	grouped := map[string][]repo.Card{}
	for _, c := range cards {
		grouped[c.ColumnID] = append(grouped[c.ColumnID], c)
	}
	writeJSON(w, http.StatusOK, grouped)
}

func (h *Handler) GetCard(w http.ResponseWriter, r *http.Request) {
	ws, err := h.resolveWorkspace(r.Context(), r.PathValue("workspace"))
	if err != nil {
		writeResolveErr(w, err)
		return
	}
	board, err := h.resolveBoard(r.Context(), ws.ID, r.PathValue("board"))
	if err != nil {
		writeResolveErr(w, err)
		return
	}
	card, err := h.resolveCard(r.Context(), board.ID, r.PathValue("card"))
	if err != nil {
		writeResolveErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"card": card})
}

func (h *Handler) resolveWorkspace(ctx context.Context, ref string) (repo.Workspace, error) {
	if _, err := uuid.Parse(ref); err == nil {
		return h.workspaces.GetByID(ctx, ref)
	}
	return h.workspaces.GetBySlug(ctx, ref)
}

func (h *Handler) resolveBoard(ctx context.Context, workspaceID, ref string) (repo.Board, error) {
	if _, err := uuid.Parse(ref); err == nil {
		board, err := h.boards.GetByID(ctx, ref)
		if err != nil {
			return repo.Board{}, err
		}
		if board.WorkspaceID != workspaceID {
			return repo.Board{}, repo.ErrNotFound
		}
		return board, nil
	}
	return h.boards.GetBySlug(ctx, workspaceID, ref)
}

func (h *Handler) resolveCard(ctx context.Context, boardID, ref string) (repo.Card, error) {
	if number, err := strconv.Atoi(ref); err == nil {
		return h.cards.GetByNumber(ctx, boardID, number)
	}
	if _, err := uuid.Parse(ref); err == nil {
		card, err := h.cards.GetByID(ctx, ref)
		if err != nil {
			return repo.Card{}, err
		}
		if card.BoardID != boardID {
			return repo.Card{}, repo.ErrNotFound
		}
		return card, nil
	}
	return h.cards.GetByKeyInBoard(ctx, boardID, strings.ToUpper(ref))
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func writeResolveErr(w http.ResponseWriter, err error) {
	if errors.Is(err, repo.ErrNotFound) {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	writeErr(w, http.StatusInternalServerError, "internal server error")
}
