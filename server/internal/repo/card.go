package repo

import (
	"context"
	"strconv"
	"strings"

	"github.com/oceanplexian/lwts/server/internal/db"
)

type CardRepository struct {
	ds db.Datasource
}

func NewCardRepository(ds db.Datasource) *CardRepository {
	return &CardRepository{ds: ds}
}

type CardCreate struct {
	ColumnID     string
	Title        string
	Description  string
	Tag          string
	Priority     string
	AssigneeID   *string
	ReporterID   *string
	Points       *int
	DueDate      *string
	EpicID       *string
	CustomFields map[string]string
}

const cardSelectColumns = `id, board_id, column_id, title, description, tag, priority, assignee_id, reporter_id,
		        points, position, key, COALESCE(number, 0), version, CAST(due_date AS TEXT), related_card_ids, blocked_card_ids, epic_id, custom_fields, created_at, updated_at`

type cardScanner interface {
	Scan(dest ...any) error
}

func scanCard(scanner cardScanner) (Card, error) {
	var c Card
	var customFieldsJSON string
	err := scanner.Scan(&c.ID, &c.BoardID, &c.ColumnID, &c.Title, &c.Description, &c.Tag, &c.Priority,
		&c.AssigneeID, &c.ReporterID, &c.Points, &c.Position, &c.Key, &c.Number, &c.Version, &c.DueDate,
		&c.RelatedCardIDs, &c.BlockedCardIDs, &c.EpicID, &customFieldsJSON, &c.CreatedAt, &c.UpdatedAt)
	if err != nil {
		return Card{}, err
	}
	c.CustomFields = ParseCustomFieldsJSON(customFieldsJSON)
	return c, nil
}

type CardUpdate struct {
	Title          *string
	Description    *string
	Tag            *string
	Priority       *string
	AssigneeID     **string // double pointer: nil = don't update, non-nil = set (inner can be nil to clear)
	ReporterID     **string
	Points         **int
	DueDate        **string
	RelatedCardIDs *string
	BlockedCardIDs *string
	EpicID         **string
	CustomFields   *map[string]string
}

type MoveOption struct {
	EpicID **string // nil = don't change, non-nil = set (inner can be nil to clear)
}

// ListByIDs fetches a batch of cards by their IDs in a single query.
func (r *CardRepository) ListByIDs(ctx context.Context, ids []string) ([]Card, error) {
	if len(ids) == 0 {
		return nil, nil
	}
	args := make([]any, len(ids))
	placeholders := make([]string, len(ids))
	for i, id := range ids {
		placeholders[i] = "$" + strconv.Itoa(i+1)
		args[i] = id
	}
	rows, err := r.ds.Query(ctx,
		`SELECT `+cardSelectColumns+`
		 FROM cards WHERE id IN (`+strings.Join(placeholders, ",")+`)`, args...)
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
