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
//   - SQLite SQLITE_BUSY: database is locked (concurrent writes)
func isRetryable(err error) bool {
	if err == nil {
		return false
	}

	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		switch pgErr.Code {
		case "40P01", "40001":
			return true
		}
	}

	msg := err.Error()
	return strings.Contains(msg, "database is locked") || strings.Contains(msg, "SQLITE_BUSY")
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

	// Allocate the card number from the persisted board counter. The UPDATE
	// locks the board row on Postgres and the single writer serializes on
	// SQLite, so concurrent creates get distinct numbers. A rollback undoes
	// the increment, so no number is leaked.
	row := tx.QueryRow(ctx,
		`UPDATE boards SET card_seq = card_seq + 1 WHERE id = $1 RETURNING project_key, card_seq`, boardID)
	var projectKey string
	var number int
	if err := row.Scan(&projectKey, &number); err != nil {
		if errors.Is(err, db.ErrNoRows) {
			return Card{}, fmt.Errorf("board not found: %s", boardID)
		}
		return Card{}, err
	}
	key := projectKey + "-" + strconv.Itoa(number)

	row = tx.QueryRow(ctx,
		`SELECT COALESCE(MAX(position), -1) FROM cards WHERE board_id = $1 AND column_id = $2`,
		boardID, c.ColumnID)
	var maxPos int
	if err := row.Scan(&maxPos); err != nil {
		return Card{}, err
	}
	position := maxPos + 1

	_, err = tx.Exec(ctx,
		`INSERT INTO cards (id, board_id, column_id, title, description, tag, priority, assignee_id, reporter_id, points, position, key, number, version, due_date, related_card_ids, blocked_card_ids, epic_id, custom_fields, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)`,
		id, boardID, c.ColumnID, c.Title, c.Description, tag, priority,
		c.AssigneeID, c.ReporterID, c.Points, position, key, number, 1, c.DueDate, "[]", "[]", c.EpicID, customFieldsJSON, now, now,
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
		Position: position, Key: key, Number: number, Version: 1, DueDate: c.DueDate,
		RelatedCardIDs: "[]", BlockedCardIDs: "[]", EpicID: c.EpicID,
		CustomFields: ParseCustomFieldsJSON(customFieldsJSON),
		CreatedAt:    now, UpdatedAt: now,
	}, nil
}
