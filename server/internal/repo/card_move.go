package repo

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/oceanplexian/lwts/server/internal/db"
)

func (r *CardRepository) Move(ctx context.Context, id string, version int, toColumn string, position int, opts ...MoveOption) (Card, error) {
	for attempt := 0; attempt < maxRetries; attempt++ {
		card, err := r.moveOnce(ctx, id, version, toColumn, position, opts...)
		if err == nil {
			return card, nil
		}
		if errors.Is(err, ErrConflict) || errors.Is(err, ErrNotFound) {
			return Card{}, err
		}
		if isRetryable(err) && attempt < maxRetries-1 {
			retryBackoff(attempt)
			continue
		}
		return Card{}, err
	}
	return Card{}, fmt.Errorf("move failed after %d retries", maxRetries)
}

func (r *CardRepository) moveOnce(ctx context.Context, id string, version int, toColumn string, position int, opts ...MoveOption) (Card, error) {
	tx, err := r.ds.Begin(ctx)
	if err != nil {
		return Card{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// Read card inside the transaction — no FOR UPDATE needed. We rely on the
	// version-checked UPDATE to detect conflicts and on automatic retry to
	// handle deadlocks from concurrent position shifts.
	row := tx.QueryRow(ctx,
		`SELECT board_id, version FROM cards WHERE id = $1`, id)
	var boardID string
	var curVersion int
	if err := row.Scan(&boardID, &curVersion); err != nil {
		if errors.Is(err, db.ErrNoRows) {
			return Card{}, ErrNotFound
		}
		return Card{}, err
	}
	if curVersion != version {
		return Card{}, ErrConflict
	}

	// Shift cards in the target column to make room
	_, err = tx.Exec(ctx,
		`UPDATE cards SET position = position + 1
		 WHERE board_id = $1 AND column_id = $2 AND position >= $3 AND id != $4`,
		boardID, toColumn, position, id)
	if err != nil {
		return Card{}, err
	}

	// Move the card — version check ensures no lost updates
	now := time.Now().UTC()
	var n int64
	if len(opts) > 0 && opts[0].EpicID != nil {
		n, err = tx.Exec(ctx,
			`UPDATE cards SET column_id = $1, position = $2, epic_id = $3, version = version + 1, updated_at = $4
			 WHERE id = $5 AND version = $6`,
			toColumn, position, *opts[0].EpicID, now, id, version)
	} else {
		n, err = tx.Exec(ctx,
			`UPDATE cards SET column_id = $1, position = $2, version = version + 1, updated_at = $3
			 WHERE id = $4 AND version = $5`,
			toColumn, position, now, id, version)
	}
	if err != nil {
		return Card{}, err
	}
	if n == 0 {
		return Card{}, ErrConflict
	}

	if err := tx.Commit(ctx); err != nil {
		return Card{}, err
	}

	return r.GetByID(ctx, id)
}

func (r *CardRepository) BulkMove(ctx context.Context, ids []string, toColumn string) ([]Card, error) {
	if len(ids) == 0 {
		return nil, nil
	}
	for attempt := 0; attempt < maxRetries; attempt++ {
		cards, err := r.bulkMoveOnce(ctx, ids, toColumn)
		if err == nil {
			return cards, nil
		}
		if isRetryable(err) && attempt < maxRetries-1 {
			retryBackoff(attempt)
			continue
		}
		return nil, err
	}
	return nil, fmt.Errorf("bulk move failed after %d retries", maxRetries)
}

func (r *CardRepository) bulkMoveOnce(ctx context.Context, ids []string, toColumn string) ([]Card, error) {
	tx, err := r.ds.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	row := tx.QueryRow(ctx, `SELECT board_id FROM cards WHERE id = $1`, ids[0])
	var boardID string
	if err := row.Scan(&boardID); err != nil {
		return nil, err
	}

	row = tx.QueryRow(ctx,
		`SELECT COALESCE(MAX(position), -1) FROM cards WHERE board_id = $1 AND column_id = $2`,
		boardID, toColumn)
	var maxPos int
	if err := row.Scan(&maxPos); err != nil {
		return nil, err
	}

	now := time.Now().UTC()
	for i, id := range ids {
		_, err = tx.Exec(ctx,
			`UPDATE cards SET column_id = $1, position = $2, version = version + 1, updated_at = $3 WHERE id = $4`,
			toColumn, maxPos+1+i, now, id)
		if err != nil {
			return nil, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	var result []Card
	for _, id := range ids {
		card, err := r.GetByID(ctx, id)
		if err != nil {
			continue
		}
		result = append(result, card)
	}
	return result, nil
}

// MigrateColumn moves all cards in a board from one column to another, appending them at the end.
func (r *CardRepository) MigrateColumn(ctx context.Context, boardID, fromColumn, toColumn string) (int, error) {
	// Get max position in target column
	row := r.ds.QueryRow(ctx,
		`SELECT COALESCE(MAX(position), -1) FROM cards WHERE board_id = $1 AND column_id = $2`,
		boardID, toColumn)
	var maxPos int
	if err := row.Scan(&maxPos); err != nil {
		return 0, err
	}

	// Use a subquery to assign sequential positions
	now := time.Now().UTC()
	n, err := r.ds.Exec(ctx,
		`UPDATE cards SET column_id = $1, position = $2 + position, version = version + 1, updated_at = $3
		 WHERE board_id = $4 AND column_id = $5`,
		toColumn, maxPos+1, now, boardID, fromColumn)
	return int(n), err
}
