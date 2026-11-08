-- Symmetry only: the migrator never executes .down files.
DROP INDEX idx_cards_board_number;
DROP INDEX idx_cards_board_key;
CREATE UNIQUE INDEX idx_cards_key ON cards (key);
DROP INDEX idx_boards_workspace_slug;

ALTER TABLE cards DROP COLUMN number;
ALTER TABLE boards DROP COLUMN card_seq;
ALTER TABLE boards DROP COLUMN slug;
ALTER TABLE boards DROP COLUMN workspace_id;

DROP INDEX idx_workspaces_slug;
DROP TABLE workspaces;
