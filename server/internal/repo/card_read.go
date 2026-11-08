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
// than its UUID. Keys are unique per board, so a key that exists in more than
// one board returns ErrAmbiguous; callers should use the card UUID or a
// board-scoped route.
func (r *CardRepository) GetByKey(ctx context.Context, key string) (Card, error) {
	rows, err := r.ds.Query(ctx,
		`SELECT `+cardSelectColumns+`
		 FROM cards WHERE key = $1 LIMIT 2`, key)
	if err != nil {
		return Card{}, err
	}
	defer rows.Close()

	var matches []Card
	for rows.Next() {
		c, err := scanCard(rows)
		if err != nil {
			return Card{}, err
		}
		matches = append(matches, c)
	}
	if err := rows.Err(); err != nil {
		return Card{}, err
	}
	if len(matches) == 0 {
		return Card{}, ErrNotFound
	}
	if len(matches) > 1 {
		return Card{}, ErrAmbiguous
	}
	return matches[0], nil
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

// GetByNumber returns the card with the given per-board number.
func (r *CardRepository) GetByNumber(ctx context.Context, boardID string, number int) (Card, error) {
	if !isUUID(boardID) || number <= 0 {
		return Card{}, ErrNotFound
	}
	row := r.ds.QueryRow(ctx,
		`SELECT `+cardSelectColumns+`
		 FROM cards WHERE board_id = $1 AND number = $2`, boardID, number)

	c, err := scanCard(row)
	if err == db.ErrNoRows {
		return Card{}, ErrNotFound
	}
	return c, err
}

// GetByKeyInBoard returns the card with the given key inside a board.
func (r *CardRepository) GetByKeyInBoard(ctx context.Context, boardID, key string) (Card, error) {
	if !isUUID(boardID) || key == "" {
		return Card{}, ErrNotFound
	}
	row := r.ds.QueryRow(ctx,
		`SELECT `+cardSelectColumns+`
		 FROM cards WHERE board_id = $1 AND key = $2`, boardID, key)

	c, err := scanCard(row)
	if err == db.ErrNoRows {
		return Card{}, ErrNotFound
	}
	return c, err
}
