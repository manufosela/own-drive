-- 002_seed_data.sql
-- Datos iniciales: admin, grupos base y permisos raíz

-- ============================================
-- Grupos base
-- ============================================
INSERT INTO groups (name, description) VALUES
  ('admins', 'Administradores con acceso total'),
  ('family', 'Familia'),
  ('guests', 'Invitados con acceso limitado');

-- ============================================
-- Usuario admin inicial (Mánu Fosela)
-- ============================================
INSERT INTO users (external_id, email, display_name, is_admin) VALUES
  ('auth_admin', 'manufosela@gmail.com', 'Mánu Fosela', TRUE);

-- Admin pertenece al grupo admins
INSERT INTO user_groups (user_id, group_id)
SELECT u.id, g.id
FROM users u, groups g
WHERE u.email = 'manufosela@gmail.com'
  AND g.name IN ('admins');

-- ============================================
-- Permisos raíz de los mount points
-- ============================================
INSERT INTO permissions (path, mount_point, owner_id, group_id, owner_perms, group_perms, others_perms, inherit)
SELECT
  '/media/raid5',
  '/media/raid5',
  u.id,
  g.id,
  'rwxd',
  'rx',
  'r',
  TRUE
FROM users u, groups g
WHERE u.email = 'manufosela@gmail.com' AND g.name = 'admins';

-- ============================================
-- Cuota para admin (500GB)
-- ============================================
INSERT INTO quotas (user_id, max_bytes)
SELECT id, 536870912000 FROM users WHERE email = 'manufosela@gmail.com';
