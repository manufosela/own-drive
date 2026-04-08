-- Extension pg_trgm for trigram-based search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Main file index table
CREATE TABLE file_index (
  id BIGSERIAL PRIMARY KEY,
  virtual_path VARCHAR(2048) UNIQUE NOT NULL,
  name VARCHAR(512) NOT NULL,
  name_lower VARCHAR(512) NOT NULL,
  file_type VARCHAR(16) NOT NULL CHECK (file_type IN ('file', 'directory')),
  size BIGINT NOT NULL DEFAULT 0,
  modified TIMESTAMPTZ,
  parent_path VARCHAR(2048) NOT NULL,
  mount_point VARCHAR(255) NOT NULL,
  indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- GIN index with pg_trgm for fast LIKE '%query%' searches
CREATE INDEX idx_file_index_name_trgm ON file_index USING gin (name_lower gin_trgm_ops);
-- Index for parent_path filtering (directory listings)
CREATE INDEX idx_file_index_parent ON file_index(parent_path);
-- Index for mount_point filtering
CREATE INDEX idx_file_index_mount ON file_index(mount_point);

-- Indexation status tracking table
CREATE TABLE index_status (
  id SERIAL PRIMARY KEY,
  mount_point VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'running', 'done', 'error')),
  total_files BIGINT NOT NULL DEFAULT 0,
  indexed_files BIGINT NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO index_status (mount_point) VALUES ('/media/raid5');
