-- 001_initial_schema.sql
-- Geniova Drive: esquema inicial completo

-- ============================================
-- USERS (autenticados con Google OAuth)
-- ============================================
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  external_id VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_external_id ON users(external_id);

-- ============================================
-- GROUPS
-- ============================================
CREATE TABLE groups (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- USER_GROUPS (N:M)
-- ============================================
CREATE TABLE user_groups (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, group_id)
);

CREATE INDEX idx_user_groups_group ON user_groups(group_id);

-- ============================================
-- PERMISSIONS (UNIX-style rwxd con herencia)
-- ============================================
-- Permisos: r=read(listar/descargar), w=write(subir/renombrar),
--           x=access(navegar carpeta), d=delete(borrar)
-- ============================================
CREATE TABLE permissions (
  id SERIAL PRIMARY KEY,
  path VARCHAR(1024) NOT NULL,
  mount_point VARCHAR(255) NOT NULL,
  owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  group_id INTEGER REFERENCES groups(id) ON DELETE SET NULL,
  owner_perms VARCHAR(4) NOT NULL DEFAULT 'rwxd',
  group_perms VARCHAR(4) NOT NULL DEFAULT 'rx',
  others_perms VARCHAR(4) NOT NULL DEFAULT 'r',
  inherit BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(path)
);

CREATE INDEX idx_permissions_path ON permissions(path);
CREATE INDEX idx_permissions_mount ON permissions(mount_point);
CREATE INDEX idx_permissions_owner ON permissions(owner_id);
CREATE INDEX idx_permissions_group ON permissions(group_id);

-- ============================================
-- QUOTAS (espacio por usuario)
-- ============================================
CREATE TABLE quotas (
  id SERIAL PRIMARY KEY,
  user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  max_bytes BIGINT NOT NULL DEFAULT 5368709120,
  used_bytes BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- AUDIT_LOG (registro de operaciones)
-- ============================================
CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(50) NOT NULL,
  path VARCHAR(1024) NOT NULL,
  target_path VARCHAR(1024),
  file_size BIGINT,
  details JSONB,
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_user ON audit_log(user_id);
CREATE INDEX idx_audit_action ON audit_log(action);
CREATE INDEX idx_audit_path ON audit_log(path);
CREATE INDEX idx_audit_created ON audit_log(created_at DESC);

-- ============================================
-- Trigger para updated_at automático
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_permissions_updated
  BEFORE UPDATE ON permissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_quotas_updated
  BEFORE UPDATE ON quotas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
