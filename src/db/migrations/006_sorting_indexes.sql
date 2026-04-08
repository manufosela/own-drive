-- Composite indexes for efficient sorted directory listings

-- Sort by modified date: global sort (no file_type prefix) so first page
-- shows the most recent items regardless of type (file vs directory).
-- Includes name_lower + virtual_path tiebreaker for deterministic pagination.
CREATE INDEX IF NOT EXISTS idx_file_index_parent_modified
  ON file_index (parent_path, modified DESC, name_lower ASC, virtual_path ASC);

-- Sort by size: global sort for same reason.
-- Includes name_lower + virtual_path tiebreaker for deterministic pagination.
CREATE INDEX IF NOT EXISTS idx_file_index_parent_size
  ON file_index (parent_path, size DESC, name_lower ASC, virtual_path ASC);

-- Sort by name: directories first + alphabetical (file_type needed for dirs-first ordering).
-- Includes virtual_path tiebreaker for deterministic pagination.
CREATE INDEX IF NOT EXISTS idx_file_index_parent_name
  ON file_index (parent_path, file_type, name_lower, virtual_path);
