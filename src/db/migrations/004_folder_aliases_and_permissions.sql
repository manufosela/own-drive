-- 004_folder_aliases_and_permissions.sql
-- Folder aliases (friendly names for NAS paths) and granular per-group permissions

-- ============================================
-- FOLDER ALIASES
-- ============================================
-- Maps user-friendly alias names to real NAS paths.
-- Only aliases marked as visible are shown to non-admin users.
CREATE TABLE folder_aliases (
  id SERIAL PRIMARY KEY,
  alias_name VARCHAR(255) UNIQUE NOT NULL,
  real_path VARCHAR(1024) NOT NULL,
  description TEXT,
  visible BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_folder_aliases_real_path ON folder_aliases(real_path);

CREATE TRIGGER trg_folder_aliases_updated
  BEFORE UPDATE ON folder_aliases
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- FOLDER PERMISSIONS (granular, per group)
-- ============================================
-- Each row grants a specific group a set of boolean permissions on an alias.
-- Replaces the UNIX-style rwxd model for alias-based access.
CREATE TABLE folder_permissions (
  id SERIAL PRIMARY KEY,
  alias_id INTEGER NOT NULL REFERENCES folder_aliases(id) ON DELETE CASCADE,
  group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  can_read BOOLEAN NOT NULL DEFAULT FALSE,
  can_write BOOLEAN NOT NULL DEFAULT FALSE,
  can_delete BOOLEAN NOT NULL DEFAULT FALSE,
  can_move BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (alias_id, group_id)
);

CREATE INDEX idx_folder_permissions_alias ON folder_permissions(alias_id);
CREATE INDEX idx_folder_permissions_group ON folder_permissions(group_id);

CREATE TRIGGER trg_folder_permissions_updated
  BEFORE UPDATE ON folder_permissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
