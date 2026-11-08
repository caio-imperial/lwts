-- Phase 3a-1: workspaces and identity columns (additive).
CREATE TABLE workspaces (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    slug        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_workspaces_slug ON workspaces (slug);

ALTER TABLE boards ADD COLUMN workspace_id UUID;
ALTER TABLE boards ADD COLUMN slug TEXT;
ALTER TABLE boards ADD COLUMN card_seq INT NOT NULL DEFAULT 0;
ALTER TABLE cards ADD COLUMN number INT;

CREATE UNIQUE INDEX idx_boards_workspace_slug ON boards (workspace_id, slug);
DROP INDEX idx_cards_key;
CREATE UNIQUE INDEX idx_cards_board_key ON cards (board_id, key);
CREATE UNIQUE INDEX idx_cards_board_number ON cards (board_id, number);
