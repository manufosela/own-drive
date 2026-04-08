-- 005_volumes.sql
-- Registered NAS mount points (volumes) that can host aliases.
-- Deactivating a volume cascades visibility to all its aliases.

CREATE TABLE volumes (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) UNIQUE NOT NULL,
  mount_path VARCHAR(1024) UNIQUE NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_volumes_updated
  BEFORE UPDATE ON volumes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Seed existing volumes from docker-compose mounts
INSERT INTO volumes (name, mount_path) VALUES
  ('datosnas', '/mnt/datosnas'),
  ('nocomun', '/mnt/nocomun')
ON CONFLICT DO NOTHING;
