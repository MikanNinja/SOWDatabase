export const SQLITE_SCHEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS entities (
  id         TEXT PRIMARY KEY,
  slug       TEXT NOT NULL UNIQUE,
  type       TEXT NOT NULL CHECK (type IN ('person','place','faction')),
  name       TEXT NOT NULL,
  intro      TEXT NOT NULL DEFAULT '',
  note       TEXT NOT NULL DEFAULT '',
  race       TEXT NOT NULL DEFAULT '',
  parent_id  TEXT,
  status     TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS entity_aliases (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  alias     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_entity_aliases_alias ON entity_aliases(alias);
CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type);
CREATE INDEX IF NOT EXISTS idx_entities_status ON entities(status);
CREATE INDEX IF NOT EXISTS idx_entities_parent ON entities(parent_id);

CREATE TABLE IF NOT EXISTS entity_factions (
  id         TEXT PRIMARY KEY,
  entity_id  TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  faction_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT '',
  ordinal    INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_entity_factions_entity ON entity_factions(entity_id, ordinal);
CREATE INDEX IF NOT EXISTS idx_entity_factions_faction ON entity_factions(faction_id);

CREATE TABLE IF NOT EXISTS person_relations (
  id           TEXT PRIMARY KEY,
  from_id      TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  to_id        TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL,
  reverse_kind TEXT NOT NULL DEFAULT '',
  note         TEXT NOT NULL DEFAULT '',
  ordinal      INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_person_relations_from ON person_relations(from_id, ordinal);
CREATE INDEX IF NOT EXISTS idx_person_relations_to ON person_relations(to_id, ordinal);

CREATE TABLE IF NOT EXISTS text_entity_associations (
  id        TEXT PRIMARY KEY,
  entry_id  TEXT NOT NULL REFERENCES text_entries(id) ON DELETE CASCADE,
  target_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  note      TEXT NOT NULL DEFAULT '',
  ordinal   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_text_entity_assoc_entry ON text_entity_associations(entry_id, ordinal);
CREATE INDEX IF NOT EXISTS idx_text_entity_assoc_target ON text_entity_associations(target_id);

CREATE TABLE IF NOT EXISTS text_entries (
  id                TEXT PRIMARY KEY,
  slug              TEXT NOT NULL UNIQUE,
  title             TEXT NOT NULL,
  source_category   TEXT NOT NULL DEFAULT '其他',
  source_name       TEXT NOT NULL DEFAULT '',
  ingame_location   TEXT NOT NULL DEFAULT '',
  trigger_condition TEXT NOT NULL DEFAULT '',
  note              TEXT NOT NULL DEFAULT '',
  body              TEXT NOT NULL DEFAULT '',
  status            TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  deleted           INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_text_entries_status ON text_entries(status);
CREATE INDEX IF NOT EXISTS idx_text_entries_category ON text_entries(source_category);

CREATE TABLE IF NOT EXISTS text_blocks (
  id       TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL REFERENCES text_entries(id) ON DELETE CASCADE,
  ordinal  INTEGER NOT NULL,
  kind     TEXT NOT NULL DEFAULT 'paragraph',
  content  TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_text_blocks_entry ON text_blocks(entry_id, ordinal);

CREATE TABLE IF NOT EXISTS content_links (
  id           TEXT PRIMARY KEY,
  block_id     TEXT NOT NULL REFERENCES text_blocks(id) ON DELETE CASCADE,
  target_kind  TEXT NOT NULL CHECK (target_kind IN ('entity','text')),
  target_id    TEXT NOT NULL,
  source       TEXT NOT NULL CHECK (source IN ('inline','manual')),
  display_text TEXT NOT NULL DEFAULT '',
  raw          TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_content_links_target ON content_links(target_kind, target_id);
CREATE INDEX IF NOT EXISTS idx_content_links_block ON content_links(block_id);
`