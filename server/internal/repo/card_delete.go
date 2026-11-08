package repo

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/oceanplexian/lwts/server/internal/db"
)

func (r *CardRepository) Delete(ctx context.Context, id string) error {
	for attempt := 0; attempt < maxRetries; attempt++ {
		err := r.deleteOnce(ctx, id)
		if err == nil || err == ErrNotFound {
			return err
		}
		if isRetryable(err) && attempt < maxRetries-1 {
			retryBackoff(attempt)
			continue
		}
		return err
	}
	return fmt.Errorf("delete failed after %d retries", maxRetries)
}

func (r *CardRepository) deleteOnce(ctx context.Context, id string) error {
	tx, err := r.ds.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	row := tx.QueryRow(ctx, `SELECT board_id, column_id, position FROM cards WHERE id = $1`, id)
	var boardID, colID string
	var pos int
	if err := row.Scan(&boardID, &colID, &pos); err != nil {
		if err == db.ErrNoRows {
			return ErrNotFound
		}
		return err
	}

	_, err = tx.Exec(ctx, `DELETE FROM cards WHERE id = $1`, id)
	if err != nil {
		return err
	}

	// Close the position gap
	_, err = tx.Exec(ctx,
		`UPDATE cards SET position = position - 1 WHERE board_id = $1 AND column_id = $2 AND position > $3`,
		boardID, colID, pos)
	if err != nil {
		return err
	}

	return tx.Commit(ctx)
}

// ClearDone moves every card sitting in any of doneColumnIDs to the "cleared"
// column for the given board. The update is set-based and atomic: either all
// qualifying cards move, or none do.
func (r *CardRepository) ClearDone(ctx context.Context, boardID string, doneColumnIDs []string) ([]Card, error) {
	if len(doneColumnIDs) == 0 {
		return nil, nil
	}
	for attempt := 0; attempt < maxRetries; attempt++ {
		cards, err := r.clearDoneOnce(ctx, boardID, doneColumnIDs)
		if err == nil {
			return cards, nil
		}
		if isRetryable(err) && attempt < maxRetries-1 {
			retryBackoff(attempt)
			continue
		}
		return nil, err
	}
	return nil, fmt.Errorf("clear done failed after %d retries", maxRetries)
}

func (r *CardRepository) clearDoneOnce(ctx context.Context, boardID string, doneColumnIDs []string) ([]Card, error) {
	tx, err := r.ds.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// Build placeholders for (board_id=$1 AND column_id IN ($2,$3,...))
	args := make([]any, 0, len(doneColumnIDs)+1)
	args = append(args, boardID)
	placeholders := make([]string, len(doneColumnIDs))
	for i, id := range doneColumnIDs {
		placeholders[i] = "$" + strconv.Itoa(i+2)
		args = append(args, id)
	}
	inClause := strings.Join(placeholders, ",")
	clearedBoardArg := len(args) + 1
	args = append(args, boardID)
	nowArg := len(args) + 1
	now := time.Now().UTC()
	args = append(args, now)

	rows, err := tx.Query(ctx, `
		WITH moved AS (
			SELECT id, CAST(ROW_NUMBER() OVER (ORDER BY updated_at, id) AS INTEGER) AS rn
			FROM cards
			WHERE board_id = $1 AND column_id IN (`+inClause+`)
		),
		cleared_tail AS (
			SELECT COALESCE(MAX(position), -1) AS max_pos
			FROM cards
			WHERE board_id = $`+strconv.Itoa(clearedBoardArg)+` AND column_id = 'cleared'
		)
		UPDATE cards
		SET column_id = 'cleared',
		    position = (SELECT max_pos FROM cleared_tail) + (SELECT rn FROM moved WHERE moved.id = cards.id),
		    version = version + 1,
		    updated_at = $`+strconv.Itoa(nowArg)+`
		WHERE id IN (SELECT id FROM moved)
		RETURNING `+cardSelectColumns, args...)
	if err != nil {
		return nil, err
	}
	var cards []Card
	for rows.Next() {
		c, err := scanCard(rows)
		if err != nil {
			rows.Close()
			return nil, err
		}
		cards = append(cards, c)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return cards, nil
}
