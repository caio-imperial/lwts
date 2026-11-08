package repo

import (
	"context"
	"strconv"
	"strings"
	"time"
)

func (r *CardRepository) Update(ctx context.Context, id string, version int, fields CardUpdate) (Card, error) {
	var sets []string
	var args []any
	argN := 1

	if fields.Title != nil {
		sets = append(sets, "title = $"+strconv.Itoa(argN))
		args = append(args, *fields.Title)
		argN++
	}
	if fields.Description != nil {
		sets = append(sets, "description = $"+strconv.Itoa(argN))
		args = append(args, *fields.Description)
		argN++
	}
	if fields.Tag != nil {
		sets = append(sets, "tag = $"+strconv.Itoa(argN))
		args = append(args, *fields.Tag)
		argN++
	}
	if fields.Priority != nil {
		sets = append(sets, "priority = $"+strconv.Itoa(argN))
		args = append(args, *fields.Priority)
		argN++
	}
	if fields.AssigneeID != nil {
		sets = append(sets, "assignee_id = $"+strconv.Itoa(argN))
		args = append(args, *fields.AssigneeID)
		argN++
	}
	if fields.ReporterID != nil {
		sets = append(sets, "reporter_id = $"+strconv.Itoa(argN))
		args = append(args, *fields.ReporterID)
		argN++
	}
	if fields.Points != nil {
		sets = append(sets, "points = $"+strconv.Itoa(argN))
		args = append(args, *fields.Points)
		argN++
	}
	if fields.DueDate != nil {
		sets = append(sets, "due_date = $"+strconv.Itoa(argN))
		args = append(args, *fields.DueDate)
		argN++
	}
	if fields.RelatedCardIDs != nil {
		sets = append(sets, "related_card_ids = $"+strconv.Itoa(argN))
		args = append(args, *fields.RelatedCardIDs)
		argN++
	}
	if fields.BlockedCardIDs != nil {
		sets = append(sets, "blocked_card_ids = $"+strconv.Itoa(argN))
		args = append(args, *fields.BlockedCardIDs)
		argN++
	}
	if fields.EpicID != nil {
		sets = append(sets, "epic_id = $"+strconv.Itoa(argN))
		args = append(args, *fields.EpicID)
		argN++
	}
	if fields.CustomFields != nil {
		customFieldsJSON, err := MarshalCustomFieldsJSON(*fields.CustomFields)
		if err != nil {
			return Card{}, err
		}
		sets = append(sets, "custom_fields = $"+strconv.Itoa(argN))
		args = append(args, customFieldsJSON)
		argN++
	}

	if len(sets) == 0 {
		return r.GetByID(ctx, id)
	}

	now := time.Now().UTC()
	sets = append(sets, "updated_at = $"+strconv.Itoa(argN))
	args = append(args, now)
	argN++

	sets = append(sets, "version = version + 1")

	// Optimistic lock: WHERE id = $N AND version = $N+1
	args = append(args, id)
	idArg := strconv.Itoa(argN)
	argN++
	args = append(args, version)
	verArg := strconv.Itoa(argN)

	query := "UPDATE cards SET " + strings.Join(sets, ", ") + " WHERE id = $" + idArg + " AND version = $" + verArg

	n, err := r.ds.Exec(ctx, query, args...)
	if err != nil {
		return Card{}, err
	}
	if n == 0 {
		// Check if card exists at all
		_, err := r.GetByID(ctx, id)
		if err == ErrNotFound {
			return Card{}, ErrNotFound
		}
		return Card{}, ErrConflict
	}

	return r.GetByID(ctx, id)
}
