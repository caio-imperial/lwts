package repo

import (
	"context"

	"github.com/oceanplexian/lwts/server/internal/db"
)

func (r *CardRepository) GetByID(ctx context.Context, id string) (Card, error) {
	if !isUUID(id) {
		return Card{}, ErrNotFound
	}
	row := r.ds.QueryRow(ctx,
		`SELECT `+cardSelectColumns+`
		 FROM cards WHERE id = $1`, id)

	c, err := scanCard(row)
	if err == db.ErrNoRows {
		return Card{}, ErrNotFound
	}
	return c, err
}

// GetByKey looks up a card by its human-readable key (e.g. "FNAI-245") rather
// than its UUID. Used by handlers that accept either form in the path.
func (r *CardRepository) GetByKey(ctx context.Context, key string) (Card, error) {
	row := r.ds.QueryRow(ctx,
		`SELECT `+cardSelectColumns+`
		 FROM cards WHERE key = $1`, key)

	c, err := scanCard(row)
	if err == db.ErrNoRows {
		return Card{}, ErrNotFound
	}
	return c, err
}

func (r *CardRepository) ListByBoard(ctx context.Context, boardID string) ([]Card, error) {
	if !isUUID(boardID) {
		return []Card{}, nil
	}
	rows, err := r.ds.Query(ctx,
		`SELECT `+cardSelectColumns+`
		 FROM cards WHERE board_id = $1
		 ORDER BY column_id, position`, boardID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cards []Card
	for rows.Next() {
		c, err := scanCard(rows)
		if err != nil {
			return nil, err
		}
		cards = append(cards, c)
	}
	return cards, rows.Err()
}
