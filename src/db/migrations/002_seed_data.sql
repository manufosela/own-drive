-- 002_seed_data.sql
-- Datos iniciales: admin, grupos base y permisos raíz

-- ============================================
-- Grupos base
-- ============================================
INSERT INTO groups (name, description) VALUES
  ('admins', 'Administradores con acceso total'),
  ('produccion', 'Equipo de producción dental'),
  ('diseno', 'Equipo de diseño 3D'),
  ('comercial', 'Equipo comercial'),
  ('it', 'Departamento IT');

-- ============================================
-- Usuario admin inicial (Mánu Fosela)
-- ============================================
INSERT INTO users (external_id, email, display_name, is_admin) VALUES
  ('auth_admin', 'mfosela@geniova.com', 'Mánu Fosela', TRUE);

-- Admin pertenece al grupo admins e IT
INSERT INTO user_groups (user_id, group_id)
SELECT u.id, g.id
FROM users u, groups g
WHERE u.email = 'mfosela@geniova.com'
  AND g.name IN ('admins', 'it');

-- ============================================
-- Permisos raíz de los mount points
-- ============================================
INSERT INTO permissions (path, mount_point, owner_id, group_id, owner_perms, group_perms, others_perms, inherit)
SELECT
  '/datosnas',
  '/datosnas',
  u.id,
  g.id,
  'rwxd',
  'rx',
  '',
  TRUE
FROM users u, groups g
WHERE u.email = 'mfosela@geniova.com' AND g.name = 'admins';

INSERT INTO permissions (path, mount_point, owner_id, group_id, owner_perms, group_perms, others_perms, inherit)
SELECT
  '/no-comun',
  '/no-comun',
  u.id,
  g.id,
  'rwxd',
  'rx',
  '',
  TRUE
FROM users u, groups g
WHERE u.email = 'mfosela@geniova.com' AND g.name = 'admins';

-- ============================================
-- Cuota para admin (50GB)
-- ============================================
INSERT INTO quotas (user_id, max_bytes)
SELECT id, 53687091200 FROM users WHERE email = 'mfosela@geniova.com';
