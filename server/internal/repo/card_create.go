package repo

import (
	"context"
	"errors"
	"fmt"
	"math/rand/v2"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/oceanplexian/lwts/server/internal/db"
)

// retryBackoff sleeps a small random duration to spread concurrent retries.
func retryBackoff(attempt int) {
	// 1-5ms * attempt, randomized
	ms := (1 + rand.IntN(5)) * (attempt + 1)
	time.Sleep(time.Duration(ms) * time.Millisecond)
}

const maxRetries = 5

// isRetryable returns true for database errors that resolve on retry:
//   - Postgres 40P01: deadlock_detected
//   - Postgres 40001: serialization_failure
//   - Postgres 23505 on idx_cards_key: concurrent key generation
//   - SQLite SQLITE_BUSY: database is locked (concurrent writes)
//   - SQLite unique violation on cards.key: concurrent key generation
//
// Any other unique violation is an invariant bug and must surface instead of
// being retried and hidden behind a generic 500.
func isRetryable(err error) bool {
	if err == nil {
		return false
	}

	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		switch pgErr.Code {
		case "40P01", "40001":
			return true
		case "23505":
			return pgErr.ConstraintName == "idx_cards_key"
		}
	}

	msg := err.Error()
	if strings.Contains(msg, "database is locked") || strings.Contains(msg, "SQLITE_BUSY") {
		return true
	}
	return strings.Contains(msg, "UNIQUE constraint failed: cards.key")
}

// nextKey generates the next card key. Must be called inside a transaction
// that also does the INSERT — the FOR UPDATE on the board row serializes
// key generation so no two creates get the same key number.
func (r *CardRepository) nextKey(ctx context.Context, tx db.Tx, boardID string) (string, error) {
	forUpdate := ""
	if r.ds.DBType() == "postgres" {
		forUpdate = " FOR UPDATE"
	}
	row := tx.QueryRow(ctx, `SELECT project_key FROM boards WHERE id = $1`+forUpdate, boardID)
	var projectKey string
	if err := row.Scan(&projectKey); err != nil {
		if err == db.ErrNoRows {
			return "", fmt.Errorf("board not found: %s", boardID)
		}
		return "", err
	}

	var maxKeySQL string
	var keyArgs []any
	if r.ds.DBType() == "postgres" {
		maxKeySQL = `SELECT COALESCE(MAX(CAST(SUBSTRING(key FROM '[0-9]+$') AS INTEGER)), 0) FROM cards WHERE board_id = $1`
		keyArgs = []any{boardID}
	} else {
		// Strip the "<project_key>-" prefix by its length. Using INSTR(key, '-')
		// would stop at the first dash, so a project key like "MY-BOARD"
		// ("MY-BOARD-1") would cast a non-numeric suffix to 0 and the next
		// card would reuse key 1, violating idx_cards_key (500 on create).
		// Params stay in textual order because the SQLite datasource rewrites
		// $N placeholders to positional "?" markers.
		maxKeySQL = `SELECT COALESCE(MAX(CAST(SUBSTR(key, LENGTH($1) + 2) AS INTEGER)), 0) FROM cards WHERE board_id = $2`
		keyArgs = []any{projectKey, boardID}
	}
	row = tx.QueryRow(ctx, maxKeySQL, keyArgs...)
	var maxNum int
	if err := row.Scan(&maxNum); err != nil {
		return "", err
	}

	return projectKey + "-" + strconv.Itoa(maxNum+1), nil
}

func (r *CardRepository) Create(ctx context.Context, boardID string, c CardCreate) (Card, error) {
	tag := c.Tag
	if tag == "" {
		tag = "blue"
	}
	priority := c.Priority
	if priority == "" {
		priority = "medium"
	}
	for attempt := 0; attempt < maxRetries; attempt++ {
		card, err := r.createOnce(ctx, boardID, c, tag, priority)
		if err == nil {
			return card, nil
		}
		if isRetryable(err) && attempt < maxRetries-1 {
			retryBackoff(attempt)
			continue
		}
		return Card{}, err
	}
	return Card{}, fmt.Errorf("create failed after %d retries", maxRetries)
}

func (r *CardRepository) createOnce(ctx context.Context, boardID string, c CardCreate, tag, priority string) (Card, error) {
	id := uuid.New().String()
	now := time.Now().UTC()
	customFieldsJSON, err := MarshalCustomFieldsJSON(c.CustomFields)
	if err != nil {
		return Card{}, err
	}

	tx, err := r.ds.Begin(ctx)
	if err != nil {
		return Card{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	key, err := r.nextKey(ctx, tx, boardID)
	if err != nil {
		return Card{}, fmt.Errorf("generate key: %w", err)
	}

	row := tx.QueryRow(ctx,
		`SELECT COALESCE(MAX(position), -1) FROM cards WHERE board_id = $1 AND column_id = $2`,
		boardID, c.ColumnID)
	var maxPos int
	if err := row.Scan(&maxPos); err != nil {
		return Card{}, err
	}
	position := maxPos + 1

	_, err = tx.Exec(ctx,
		`INSERT INTO cards (id, board_id, column_id, title, description, tag, priority, assignee_id, reporter_id, points, position, key, version, due_date, related_card_ids, blocked_card_ids, epic_id, custom_fields, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
		id, boardID, c.ColumnID, c.Title, c.Description, tag, priority,
		c.AssigneeID, c.ReporterID, c.Points, position, key, 1, c.DueDate, "[]", "[]", c.EpicID, customFieldsJSON, now, now,
	)
	if err != nil {
		return Card{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return Card{}, err
	}

	return Card{
		ID: id, BoardID: boardID, ColumnID: c.ColumnID,
		Title: c.Title, Description: c.Description, Tag: tag, Priority: priority,
		AssigneeID: c.AssigneeID, ReporterID: c.ReporterID, Points: c.Points,
		Position: position, Key: key, Version: 1, DueDate: c.DueDate,
		RelatedCardIDs: "[]", BlockedCardIDs: "[]", EpicID: c.EpicID,
		CustomFields: ParseCustomFieldsJSON(customFieldsJSON),
		CreatedAt:    now, UpdatedAt: now,
	}, nil
}
