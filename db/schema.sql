CREATE TABLE IF NOT EXISTS taxonomy_nodes (
  id TEXT PRIMARY KEY,
  parent_id TEXT NULL,
  rank TEXT NOT NULL,
  scientific_name TEXT NOT NULL DEFAULT '',
  common_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT taxonomy_nodes_parent_fk
    FOREIGN KEY (parent_id)
    REFERENCES taxonomy_nodes(id)
    DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX IF NOT EXISTS idx_taxonomy_nodes_parent_id ON taxonomy_nodes(parent_id);
CREATE INDEX IF NOT EXISTS idx_taxonomy_nodes_rank ON taxonomy_nodes(rank);
CREATE INDEX IF NOT EXISTS idx_taxonomy_nodes_scientific_name ON taxonomy_nodes(scientific_name);

CREATE TABLE IF NOT EXISTS taxon_media (
  taxon_id TEXT PRIMARY KEY,
  image_url TEXT NOT NULL DEFAULT '',
  image_credit TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT taxon_media_taxon_fk
    FOREIGN KEY (taxon_id)
    REFERENCES taxonomy_nodes(id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_taxon_media_image_url_nonempty
  ON taxon_media(taxon_id)
  WHERE image_url <> '';
