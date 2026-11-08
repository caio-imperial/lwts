package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/oceanplexian/lwts/server/internal/auth"
	"github.com/oceanplexian/lwts/server/internal/db"
	"github.com/oceanplexian/lwts/server/internal/repo"
	"github.com/oceanplexian/lwts/server/migrations"
)

// ── Users ────────────────────────────────────────────────────────────────────

func runUsers() error {
	ctx := context.Background()
	ds, err := openDS(ctx)
	if err != nil {
		return err
	}
	defer ds.Close()

	users := repo.NewUserRepository(ds)
	list, err := users.List(ctx)
	if err != nil {
		return fmt.Errorf("list users: %w", err)
	}

	fmt.Printf("%-36s  %-20s  %-30s  %-8s  %s\n", "ID", "NAME", "EMAIL", "ROLE", "CREATED")
	fmt.Printf("%s\n", strings.Repeat("-", 130))
	for _, u := range list {
		fmt.Printf("%-36s  %-20s  %-30s  %-8s  %s\n",
			u.ID, truncate(u.Name, 20), truncate(u.Email, 30), u.Role, u.CreatedAt.Format("2006-01-02 15:04"))
	}
	fmt.Printf("\n%d user(s)\n", len(list))
	return nil
}

func runUserCreate() error {
	if len(os.Args) < 5 {
		return errors.New("usage: lwts user-create <name> <email> <password> [--role=member]")
	}
	name := os.Args[2]
	email := os.Args[3]
	password := os.Args[4]
	role := "member"
	for _, arg := range os.Args[5:] {
		if strings.HasPrefix(arg, "--role=") {
			role = strings.TrimPrefix(arg, "--role=")
		}
	}

	ctx := context.Background()
	ds, err := openDS(ctx)
	if err != nil {
		return err
	}
	defer ds.Close()

	hash, err := auth.HashPassword(password)
	if err != nil {
		return fmt.Errorf("hash: %w", err)
	}

	users := repo.NewUserRepository(ds)
	u, err := users.Create(ctx, name, email, hash)
	if err != nil {
		return fmt.Errorf("create user: %w", err)
	}

	// Set role if not default
	if role != "member" {
		_, err = users.Update(ctx, u.ID, repo.UserUpdate{Role: &role})
		if err != nil {
			return fmt.Errorf("set role: %w", err)
		}
	}

	fmt.Printf("created user %s (%s) role=%s id=%s\n", u.Name, u.Email, role, u.ID)
	return nil
}

func runUserDelete() error {
	if len(os.Args) < 3 {
		return errors.New("usage: lwts user-delete <email>")
	}
	email := os.Args[2]

	ctx := context.Background()
	ds, err := openDS(ctx)
	if err != nil {
		return err
	}
	defer ds.Close()

	users := repo.NewUserRepository(ds)
	u, err := users.GetByEmail(ctx, email)
	if err != nil {
		return fmt.Errorf("user not found: %s", email)
	}

	if err := users.Delete(ctx, u.ID); err != nil {
		return fmt.Errorf("delete: %w", err)
	}
	fmt.Printf("deleted user %s (%s)\n", u.Name, u.Email)
	return nil
}

func runResetPassword() error {
	if len(os.Args) < 4 {
		return errors.New("usage: lwts reset-password <email> <new-password>")
	}
	email := os.Args[2]
	newPassword := os.Args[3]

	ctx := context.Background()
	ds, err := openDS(ctx)
	if err != nil {
		return err
	}
	defer ds.Close()

	hash, err := auth.HashPassword(newPassword)
	if err != nil {
		return fmt.Errorf("hash: %w", err)
	}

	affected, err := ds.Exec(ctx, "UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE LOWER(email) = LOWER($2)", hash, email)
	if err != nil {
		return fmt.Errorf("update: %w", err)
	}
	if affected == 0 {
		return fmt.Errorf("no user found with email: %s", email)
	}

	_, _ = ds.Exec(ctx, "DELETE FROM refresh_tokens WHERE user_id = (SELECT id FROM users WHERE LOWER(email) = LOWER($1))", email)
	fmt.Printf("password reset for %s\n", email)
	return nil
}

// ── Boards ───────────────────────────────────────────────────────────────────

func runBoards() error {
	ctx := context.Background()
	ds, err := openDS(ctx)
	if err != nil {
		return err
	}
	defer ds.Close()

	boards := repo.NewBoardRepository(ds)
	list, err := boards.List(ctx)
	if err != nil {
		return fmt.Errorf("list boards: %w", err)
	}

	// Get card counts per board
	users := repo.NewUserRepository(ds)

	fmt.Printf("%-36s  %-25s  %-10s  %-20s  %s\n", "ID", "NAME", "KEY", "OWNER", "CARDS")
	fmt.Printf("%s\n", strings.Repeat("-", 120))
	for _, b := range list {
		ownerName := b.OwnerID
		if u, err := users.GetByID(ctx, b.OwnerID); err == nil {
			ownerName = u.Name
		}
		var count int
		_ = ds.QueryRow(ctx, "SELECT COUNT(*) FROM cards WHERE board_id = $1", b.ID).Scan(&count)
		fmt.Printf("%-36s  %-25s  %-10s  %-20s  %d\n",
			b.ID, truncate(b.Name, 25), b.ProjectKey, truncate(ownerName, 20), count)
	}
	fmt.Printf("\n%d board(s)\n", len(list))
	return nil
}

func runBoardCreate() error {
	if len(os.Args) < 5 {
		return errors.New("usage: lwts board-create <name> <project_key> <owner_email>")
	}
	name := os.Args[2]
	projectKey := os.Args[3]
	ownerEmail := os.Args[4]

	ctx := context.Background()
	ds, err := openDS(ctx)
	if err != nil {
		return err
	}
	defer ds.Close()

	users := repo.NewUserRepository(ds)
	owner, err := users.GetByEmail(ctx, ownerEmail)
	if err != nil {
		return fmt.Errorf("owner not found: %s", ownerEmail)
	}

	boards := repo.NewBoardRepository(ds)
	b, err := boards.Create(ctx, name, projectKey, owner.ID)
	if err != nil {
		return fmt.Errorf("create board: %w", err)
	}
	fmt.Printf("created board %q key=%s id=%s\n", b.Name, b.ProjectKey, b.ID)
	return nil
}

func runBoardDelete() error {
	if len(os.Args) < 3 {
		return errors.New("usage: lwts board-delete <id>")
	}
	boardID := os.Args[2]

	ctx := context.Background()
	ds, err := openDS(ctx)
	if err != nil {
		return err
	}
	defer ds.Close()

	// Delete comments on cards in this board
	_, _ = ds.Exec(ctx, "DELETE FROM comments WHERE card_id IN (SELECT id FROM cards WHERE board_id = $1)", boardID)
	// Delete cards
	_, _ = ds.Exec(ctx, "DELETE FROM cards WHERE board_id = $1", boardID)
	// Delete the board
	boards := repo.NewBoardRepository(ds)
	if err := boards.Delete(ctx, boardID); err != nil {
		return fmt.Errorf("delete board: %w", err)
	}
	fmt.Printf("deleted board %s and all its cards/comments\n", boardID)
	return nil
}

// ── Cards ────────────────────────────────────────────────────────────────────

func resolveBoard(ctx context.Context, ds db.Datasource, idOrName string) (repo.Board, error) {
	boards := repo.NewBoardRepository(ds)

	// Try by ID first
	b, err := boards.GetByID(ctx, idOrName)
	if err == nil {
		return b, nil
	}

	// Try by name match
	list, err := boards.List(ctx)
	if err != nil {
		return repo.Board{}, err
	}
	for _, b := range list {
		if strings.EqualFold(b.Name, idOrName) || strings.EqualFold(b.ProjectKey, idOrName) {
			return b, nil
		}
	}
	return repo.Board{}, fmt.Errorf("board not found: %s", idOrName)
}

func runCards() error {
	if len(os.Args) < 3 {
		return errors.New("usage: lwts cards <board_id_or_name>")
	}

	ctx := context.Background()
	ds, err := openDS(ctx)
	if err != nil {
		return err
	}
	defer ds.Close()

	board, err := resolveBoard(ctx, ds, os.Args[2])
	if err != nil {
		return err
	}

	cards := repo.NewCardRepository(ds)
	list, err := cards.ListByBoard(ctx, board.ID)
	if err != nil {
		return fmt.Errorf("list cards: %w", err)
	}

	// Build user lookup
	users := repo.NewUserRepository(ds)
	userList, _ := users.List(ctx)
	userMap := make(map[string]string)
	for _, u := range userList {
		userMap[u.ID] = u.Name
	}

	// Parse columns from board
	type col struct {
		ID    string `json:"id"`
		Label string `json:"label"`
	}
	var cols []col
	_ = json.Unmarshal([]byte(board.Columns), &cols)

	// Build column label map
	colLabels := make(map[string]string)
	for _, c := range cols {
		colLabels[c.ID] = c.Label
	}

	// Group cards by column
	grouped := make(map[string][]repo.Card)
	for _, c := range list {
		grouped[c.ColumnID] = append(grouped[c.ColumnID], c)
	}

	fmt.Printf("Board: %s (%s)  —  %d cards\n\n", board.Name, board.ProjectKey, len(list))

	for _, c := range cols {
		cards := grouped[c.ID]
		fmt.Printf("── %s (%d) ──\n", c.Label, len(cards))
		if len(cards) == 0 {
			fmt.Printf("  (empty)\n")
		}
		for _, card := range cards {
			assignee := "-"
			if card.AssigneeID != nil {
				if name, ok := userMap[*card.AssigneeID]; ok {
					assignee = name
				}
			}
			pts := "-"
			if card.Points != nil {
				pts = fmt.Sprintf("%d", *card.Points)
			}
			fmt.Printf("  %-10s  %-45s  %-8s  %-15s  %s pts\n",
				card.Key, truncate(card.Title, 45), card.Priority, truncate(assignee, 15), pts)
		}
		fmt.Println()
	}
	return nil
}

func resolveCard(ctx context.Context, ds db.Datasource, keyOrID string) (repo.Card, error) {
	cards := repo.NewCardRepository(ds)

	// Try by ID
	c, err := cards.GetByID(ctx, keyOrID)
	if err == nil {
		return c, nil
	}

	// Try by key — search all boards
	upper := strings.ToUpper(keyOrID)
	boards := repo.NewBoardRepository(ds)
	blist, err := boards.List(ctx)
	if err != nil {
		return repo.Card{}, err
	}
	for _, b := range blist {
		clist, err := cards.ListByBoard(ctx, b.ID)
		if err != nil {
			continue
		}
		for _, c := range clist {
			if strings.EqualFold(c.Key, upper) {
				return c, nil
			}
		}
	}
	return repo.Card{}, fmt.Errorf("card not found: %s", keyOrID)
}

func runCardShow() error {
	if len(os.Args) < 3 {
		return errors.New("usage: lwts card-show <key_or_id>")
	}

	ctx := context.Background()
	ds, err := openDS(ctx)
	if err != nil {
		return err
	}
	defer ds.Close()

	card, err := resolveCard(ctx, ds, os.Args[2])
	if err != nil {
		return err
	}

	users := repo.NewUserRepository(ds)
	userMap := make(map[string]string)
	userList, _ := users.List(ctx)
	for _, u := range userList {
		userMap[u.ID] = u.Name
	}

	assignee := "-"
	if card.AssigneeID != nil {
		if name, ok := userMap[*card.AssigneeID]; ok {
			assignee = name
		}
	}
	reporter := "-"
	if card.ReporterID != nil {
		if name, ok := userMap[*card.ReporterID]; ok {
			reporter = name
		}
	}
	pts := "-"
	if card.Points != nil {
		pts = fmt.Sprintf("%d", *card.Points)
	}
	due := "-"
	if card.DueDate != nil {
		due = *card.DueDate
	}

	fmt.Printf("Key:         %s\n", card.Key)
	fmt.Printf("Title:       %s\n", card.Title)
	fmt.Printf("Board:       %s\n", card.BoardID)
	fmt.Printf("Column:      %s\n", card.ColumnID)
	fmt.Printf("Priority:    %s\n", card.Priority)
	fmt.Printf("Tag:         %s\n", card.Tag)
	fmt.Printf("Assignee:    %s\n", assignee)
	fmt.Printf("Reporter:    %s\n", reporter)
	fmt.Printf("Points:      %s\n", pts)
	fmt.Printf("Due:         %s\n", due)
	fmt.Printf("Version:     %d\n", card.Version)
	fmt.Printf("Created:     %s\n", card.CreatedAt.Format("2006-01-02 15:04"))
	fmt.Printf("Updated:     %s\n", card.UpdatedAt.Format("2006-01-02 15:04"))

	if card.Description != "" {
		fmt.Printf("\n── Description ──\n%s\n", card.Description)
	}

	// Comments
	comments := repo.NewCommentRepository(ds)
	clist, err := comments.ListByCard(ctx, card.ID)
	if err == nil && len(clist) > 0 {
		fmt.Printf("\n── Comments (%d) ──\n", len(clist))
		for _, c := range clist {
			author := c.AuthorID
			if name, ok := userMap[c.AuthorID]; ok {
				author = name
			}
			fmt.Printf("  [%s] %s:\n    %s\n\n", c.CreatedAt.Format("2006-01-02 15:04"), author, c.Body)
		}
	}
	return nil
}

func runCardDelete() error {
	if len(os.Args) < 3 {
		return errors.New("usage: lwts card-delete <key_or_id>")
	}

	ctx := context.Background()
	ds, err := openDS(ctx)
	if err != nil {
		return err
	}
	defer ds.Close()

	card, err := resolveCard(ctx, ds, os.Args[2])
	if err != nil {
		return err
	}

	// Delete comments first
	_, _ = ds.Exec(ctx, "DELETE FROM comments WHERE card_id = $1", card.ID)

	cards := repo.NewCardRepository(ds)
	if err := cards.Delete(ctx, card.ID); err != nil {
		return fmt.Errorf("delete: %w", err)
	}
	fmt.Printf("deleted card %s (%s)\n", card.Key, card.Title)
	return nil
}

// ── System ───────────────────────────────────────────────────────────────────

func runSeedTest() error {
	ctx := context.Background()
	ds, err := openDS(ctx)
	if err != nil {
		return err
	}
	defer ds.Close()

	if err := db.Migrate(ctx, ds, migrations.FS); err != nil {
		return fmt.Errorf("migrate: %w", err)
	}

	// Create or find a test owner
	users := repo.NewUserRepository(ds)
	list, err := users.List(ctx)
	if err != nil {
		return fmt.Errorf("list users: %w", err)
	}

	var ownerID string
	for _, u := range list {
		if u.Email == "testowner@test.dev" {
			ownerID = u.ID
			break
		}
	}
	if ownerID == "" {
		u, err := users.Create(ctx, "Test Owner", "testowner@test.dev",
			// bcrypt hash of "testpass123"
			"$2b$10$G1Gt3Zvd76mWYPu8TDXrn.hU5c33FaVkkwDfu8b0FWZmlTmCRUgZW")
		if err != nil {
			return fmt.Errorf("create test owner: %w", err)
		}
		ownerID = u.ID
		fmt.Printf("created test owner: %s\n", u.Email)
	}

	if err := repo.SeedTestData(ctx, ds, ownerID); err != nil {
		return fmt.Errorf("seed-test: %w", err)
	}
	return nil
}

func runReseed() error {
	ctx := context.Background()
	ds, err := openDS(ctx)
	if err != nil {
		return err
	}
	defer ds.Close()

	// Run migrations first
	if err := db.Migrate(ctx, ds, migrations.FS); err != nil {
		return fmt.Errorf("migrate: %w", err)
	}

	// Wipe in FK order
	_, _ = ds.Exec(ctx, "DELETE FROM comments")
	_, _ = ds.Exec(ctx, "DELETE FROM cards")
	_, _ = ds.Exec(ctx, "DELETE FROM boards")
	fmt.Println("wiped all boards, cards, comments")

	// Get first user
	users := repo.NewUserRepository(ds)
	list, err := users.List(ctx)
	if err != nil || len(list) == 0 {
		return errors.New("no users exist — create a user first")
	}

	if err := repo.SeedDemo(ctx, ds, list[0].ID); err != nil {
		return fmt.Errorf("seed: %w", err)
	}
	fmt.Printf("reseeded demo data for user %s (%s)\n", list[0].Name, list[0].Email)
	return nil
}

func runStats() error {
	ctx := context.Background()
	ds, err := openDS(ctx)
	if err != nil {
		return err
	}
	defer ds.Close()

	var userCount, boardCount, cardCount, commentCount int
	_ = ds.QueryRow(ctx, "SELECT COUNT(*) FROM users").Scan(&userCount)
	_ = ds.QueryRow(ctx, "SELECT COUNT(*) FROM boards").Scan(&boardCount)
	_ = ds.QueryRow(ctx, "SELECT COUNT(*) FROM cards").Scan(&cardCount)
	_ = ds.QueryRow(ctx, "SELECT COUNT(*) FROM comments").Scan(&commentCount)

	fmt.Printf("Users:       %d\n", userCount)
	fmt.Printf("Boards:      %d\n", boardCount)
	fmt.Printf("Cards:       %d\n", cardCount)
	fmt.Printf("Comments:    %d\n", commentCount)

	// Card breakdown by column
	rows, err := ds.Query(ctx, "SELECT column_id, COUNT(*) FROM cards GROUP BY column_id ORDER BY column_id")
	if err == nil {
		defer rows.Close()
		fmt.Printf("\nCards by column:\n")
		for rows.Next() {
			var col string
			var cnt int
			_ = rows.Scan(&col, &cnt)
			fmt.Printf("  %-20s %d\n", col, cnt)
		}
	}

	// Card breakdown by priority
	rows2, err := ds.Query(ctx, "SELECT priority, COUNT(*) FROM cards GROUP BY priority ORDER BY priority")
	if err == nil {
		defer rows2.Close()
		fmt.Printf("\nCards by priority:\n")
		for rows2.Next() {
			var pri string
			var cnt int
			_ = rows2.Scan(&pri, &cnt)
			fmt.Printf("  %-20s %d\n", pri, cnt)
		}
	}
	return nil
}

// ── Backup / Restore ─────────────────────────────────────────────────────────

type backupData struct {
	ExportedAt string         `json:"exported_at"`
	Users      []backupUser   `json:"users"`
	Boards     []repo.Board   `json:"boards"`
	Cards      []repo.Card    `json:"cards"`
	Comments   []repo.Comment `json:"comments"`
}

// backupUser includes the password hash (unlike the API model which hides it)
type backupUser struct {
	ID           string    `json:"id"`
	Email        string    `json:"email"`
	Name         string    `json:"name"`
	PasswordHash string    `json:"password_hash"`
	AvatarColor  string    `json:"avatar_color"`
	AvatarURL    string    `json:"avatar_url"`
	Initials     string    `json:"initials"`
	Role         string    `json:"role"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

func runBackup() error {
	if len(os.Args) < 3 {
		return errors.New("usage: lwts backup <output_path>")
	}
	outputPath := os.Args[2]

	ctx := context.Background()
	ds, err := openDS(ctx)
	if err != nil {
		return err
	}
	defer ds.Close()

	// Users — need password_hash included
	rows, err := ds.Query(ctx, "SELECT id, email, name, password_hash, avatar_color, avatar_url, initials, role, created_at, updated_at FROM users ORDER BY created_at")
	if err != nil {
		return fmt.Errorf("query users: %w", err)
	}
	var users []backupUser
	for rows.Next() {
		var u backupUser
		if err := rows.Scan(&u.ID, &u.Email, &u.Name, &u.PasswordHash, &u.AvatarColor, &u.AvatarURL, &u.Initials, &u.Role, &u.CreatedAt, &u.UpdatedAt); err != nil {
			return fmt.Errorf("scan user: %w", err)
		}
		users = append(users, u)
	}
	rows.Close()

	boardRepo := repo.NewBoardRepository(ds)
	boards, err := boardRepo.List(ctx)
	if err != nil {
		return fmt.Errorf("list boards: %w", err)
	}

	cardRepo := repo.NewCardRepository(ds)
	var allCards []repo.Card
	for _, b := range boards {
		cards, err := cardRepo.ListByBoard(ctx, b.ID)
		if err != nil {
			return fmt.Errorf("list cards for board %s: %w", b.ID, err)
		}
		allCards = append(allCards, cards...)
	}

	commentRepo := repo.NewCommentRepository(ds)
	var allComments []repo.Comment
	for _, c := range allCards {
		comments, err := commentRepo.ListByCard(ctx, c.ID)
		if err != nil {
			return fmt.Errorf("list comments for card %s: %w", c.ID, err)
		}
		allComments = append(allComments, comments...)
	}

	data := backupData{
		ExportedAt: time.Now().UTC().Format(time.RFC3339),
		Users:      users,
		Boards:     boards,
		Cards:      allCards,
		Comments:   allComments,
	}

	out, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal: %w", err)
	}

	if err := os.WriteFile(outputPath, out, 0644); err != nil {
		return fmt.Errorf("write: %w", err)
	}

	fmt.Printf("backed up %d users, %d boards, %d cards, %d comments to %s\n",
		len(users), len(boards), len(allCards), len(allComments), outputPath)
	return nil
}

func runRestore() error {
	if len(os.Args) < 3 {
		return errors.New("usage: lwts restore <input_path>")
	}
	inputPath := os.Args[2]

	raw, err := os.ReadFile(inputPath)
	if err != nil {
		return fmt.Errorf("read: %w", err)
	}

	var data backupData
	if err := json.Unmarshal(raw, &data); err != nil {
		return fmt.Errorf("parse: %w", err)
	}

	ctx := context.Background()
	ds, err := openDS(ctx)
	if err != nil {
		return err
	}
	defer ds.Close()

	// Run migrations first
	if err := db.Migrate(ctx, ds, migrations.FS); err != nil {
		return fmt.Errorf("migrate: %w", err)
	}

	// Wipe in FK order (comments, cards, boards — not users per spec)
	_, _ = ds.Exec(ctx, "DELETE FROM comments")
	_, _ = ds.Exec(ctx, "DELETE FROM cards")
	_, _ = ds.Exec(ctx, "DELETE FROM boards")

	// Insert boards
	for _, b := range data.Boards {
		_, err = ds.Exec(ctx,
			`INSERT INTO boards (id, name, project_key, owner_id, columns, settings, created_at, updated_at)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
			b.ID, b.Name, b.ProjectKey, b.OwnerID, b.Columns, b.Settings, b.CreatedAt, b.UpdatedAt)
		if err != nil {
			return fmt.Errorf("insert board %s: %w", b.ID, err)
		}
	}

	// Insert cards
	for _, c := range data.Cards {
		customFieldsJSON, err := repo.MarshalCustomFieldsJSON(c.CustomFields)
		if err != nil {
			return fmt.Errorf("marshal custom fields for %s: %w", c.Key, err)
		}
		_, err = ds.Exec(ctx,
			`INSERT INTO cards (id, board_id, column_id, title, description, tag, priority, assignee_id, reporter_id,
			 points, position, key, version, due_date, related_card_ids, blocked_card_ids, epic_id, custom_fields, created_at, updated_at)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
			c.ID, c.BoardID, c.ColumnID, c.Title, c.Description, c.Tag, c.Priority,
			c.AssigneeID, c.ReporterID, c.Points, c.Position, c.Key, c.Version,
			c.DueDate, c.RelatedCardIDs, c.BlockedCardIDs, c.EpicID, customFieldsJSON, c.CreatedAt, c.UpdatedAt)
		if err != nil {
			return fmt.Errorf("insert card %s: %w", c.Key, err)
		}
	}

	// Insert comments
	for _, cm := range data.Comments {
		_, err := ds.Exec(ctx,
			`INSERT INTO comments (id, card_id, author_id, body, created_at, updated_at)
			 VALUES ($1, $2, $3, $4, $5, $6)`,
			cm.ID, cm.CardID, cm.AuthorID, cm.Body, cm.CreatedAt, cm.UpdatedAt)
		if err != nil {
			return fmt.Errorf("insert comment %s: %w", cm.ID, err)
		}
	}

	// Old backups do not carry workspace/slug/number/card_seq. Rebuild the
	// identity columns after the inserts; the pass is idempotent.
	if err := db.BackfillIdentity(ctx, ds); err != nil {
		return fmt.Errorf("backfill identity after restore: %w", err)
	}

	fmt.Printf("restored %d boards, %d cards, %d comments from %s (exported %s)\n",
		len(data.Boards), len(data.Cards), len(data.Comments), inputPath, data.ExportedAt)
	return nil
}

func runAPIKey() error {
	if len(os.Args) < 3 {
		return errors.New("usage: lwts api-key <email> [name]")
	}
	email := os.Args[2]
	keyName := "CLI-generated key"
	if len(os.Args) >= 4 {
		keyName = os.Args[3]
	}

	ctx := context.Background()
	ds, err := openDS(ctx)
	if err != nil {
		return err
	}
	defer ds.Close()

	users := repo.NewUserRepository(ds)
	u, err := users.GetByEmail(ctx, email)
	if err != nil {
		return fmt.Errorf("user not found: %s", email)
	}

	rawKey := make([]byte, 32)
	_, _ = rand.Read(rawKey)
	fullKey := "lwts_sk_" + hex.EncodeToString(rawKey)
	prefix := "lwts_sk_" + "••••••••" + fullKey[len(fullKey)-4:]

	hash := sha256.Sum256([]byte(fullKey))
	keyHash := hex.EncodeToString(hash[:])

	id := uuid.New().String()
	now := time.Now().UTC()

	_, err = ds.Exec(ctx,
		`INSERT INTO api_keys (id, user_id, name, key_hash, key_prefix, key_full, permissions, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		id, u.ID, keyName, keyHash, prefix, fullKey, "{}", now)
	if err != nil {
		return fmt.Errorf("insert api_key: %w", err)
	}

	fmt.Println(fullKey)
	return nil
}

// ── Helpers ──────────────────────────────────────────────────────────────────

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max-3] + "..."
}

func printUsage() {
	fmt.Fprintf(os.Stderr, `LWTS Kanban Admin CLI

Usage: lwts <command> [args]

Commands:
  migrate                                  Run database migrations
  seed                                     Seed demo data (if no users exist)
  reseed                                   Wipe boards/cards/comments, reseed demo data

  users                                    List all users
  user-create <name> <email> <pw> [--role] Create a user
  user-delete <email>                      Delete a user
  reset-password <email> <password>        Reset a user's password

  boards                                   List all boards
  board-create <name> <key> <owner_email>  Create a board
  board-delete <id>                        Delete a board and its cards

  cards <board_id_or_name>                 List cards on a board
  card-show <key_or_id>                    Show full card detail
  card-delete <key_or_id>                  Delete a card

  stats                                    Show system statistics
  backup <output_path>                     Export DB to JSON
  restore <input_path>                     Import from JSON backup
  api-key <email>                          Generate 365-day JWT for API access
`)
}
