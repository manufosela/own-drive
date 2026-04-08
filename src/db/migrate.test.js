import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('migrate', () => {
  describe('migration SQL files validation', () => {
    it('001_initial_schema.sql should contain all required tables', async () => {
      const fs = await vi.importActual('node:fs');
      const content = /** @type {typeof import('node:fs')} */ (fs).readFileSync(
        path.join(__dirname, 'migrations', '001_initial_schema.sql'),
        'utf-8'
      );
      const requiredTables = ['users', 'groups', 'user_groups', 'permissions', 'quotas', 'audit_log'];
      for (const table of requiredTables) {
        expect(content).toContain(`CREATE TABLE ${table}`);
      }
    });

    it('permissions table should have UNIX rwxd columns', async () => {
      const fs = await vi.importActual('node:fs');
      const content = /** @type {typeof import('node:fs')} */ (fs).readFileSync(
        path.join(__dirname, 'migrations', '001_initial_schema.sql'),
        'utf-8'
      );
      expect(content).toContain('owner_perms');
      expect(content).toContain('group_perms');
      expect(content).toContain('others_perms');
      expect(content).toContain('inherit');
      expect(content).toContain('mount_point');
      expect(content).toContain("DEFAULT 'rwxd'");
      expect(content).toContain('UNIQUE(path)');
    });

    it('quotas table should have max_bytes and used_bytes', async () => {
      const fs = await vi.importActual('node:fs');
      const content = /** @type {typeof import('node:fs')} */ (fs).readFileSync(
        path.join(__dirname, 'migrations', '001_initial_schema.sql'),
        'utf-8'
      );
      expect(content).toContain('max_bytes');
      expect(content).toContain('used_bytes');
    });

    it('should have performance indexes', async () => {
      const fs = await vi.importActual('node:fs');
      const content = /** @type {typeof import('node:fs')} */ (fs).readFileSync(
        path.join(__dirname, 'migrations', '001_initial_schema.sql'),
        'utf-8'
      );
      expect(content).toContain('CREATE INDEX idx_permissions_path');
      expect(content).toContain('CREATE INDEX idx_audit_user');
      expect(content).toContain('CREATE INDEX idx_audit_created');
      expect(content).toContain('CREATE INDEX idx_users_email');
    });

    it('should have updated_at triggers', async () => {
      const fs = await vi.importActual('node:fs');
      const content = /** @type {typeof import('node:fs')} */ (fs).readFileSync(
        path.join(__dirname, 'migrations', '001_initial_schema.sql'),
        'utf-8'
      );
      expect(content).toContain('update_updated_at');
      expect(content).toContain('CREATE TRIGGER trg_users_updated');
      expect(content).toContain('CREATE TRIGGER trg_permissions_updated');
    });

    it('002_seed_data.sql should have initial data', async () => {
      const fs = await vi.importActual('node:fs');
      const content = /** @type {typeof import('node:fs')} */ (fs).readFileSync(
        path.join(__dirname, 'migrations', '002_seed_data.sql'),
        'utf-8'
      );
      expect(content).toContain('INSERT INTO groups');
      expect(content).toContain('admins');
      expect(content).toContain('produccion');
      expect(content).toContain('diseno');
      expect(content).toContain('mfosela@geniova.com');
      expect(content).toContain('/datosnas');
      expect(content).toContain('/no-comun');
      expect(content).toContain('INSERT INTO quotas');
    });

    it('migration files should be sequentially numbered', async () => {
      const fs = await vi.importActual('node:fs');
      const files = /** @type {typeof import('node:fs')} */ (fs).readdirSync(
        path.join(__dirname, 'migrations')
      )
        .filter((/** @type {string} */ f) => f.endsWith('.sql'))
        .sort();

      expect(files.length).toBeGreaterThanOrEqual(2);
      expect(files[0]).toMatch(/^001_/);
      expect(files[1]).toMatch(/^002_/);
    });
  });

  describe('exported functions', () => {
    /** @type {any} */
    let mockPool;
    /** @type {any} */
    let mockClient;

    beforeEach(() => {
      vi.clearAllMocks();
      mockClient = {
        query: vi.fn(),
        release: vi.fn(),
      };
      mockPool = {
        query: vi.fn(),
        connect: vi.fn(() => mockClient),
      };
    });

    it('ensureMigrationsTable should create schema_migrations table', async () => {
      const { ensureMigrationsTable } = await import('./migrate.js');
      await ensureMigrationsTable(mockPool);
      expect(mockPool.query).toHaveBeenCalledOnce();
      expect(mockPool.query.mock.calls[0][0]).toContain('CREATE TABLE IF NOT EXISTS schema_migrations');
    });

    it('getAppliedMigrations should return a Set of filenames', async () => {
      const { getAppliedMigrations } = await import('./migrate.js');
      mockPool.query.mockResolvedValueOnce({
        rows: [{ filename: '001_initial.sql' }, { filename: '002_seed.sql' }],
      });
      const result = await getAppliedMigrations(mockPool);
      expect(result).toBeInstanceOf(Set);
      expect(result.has('001_initial.sql')).toBe(true);
      expect(result.has('002_seed.sql')).toBe(true);
      expect(result.size).toBe(2);
    });

    it('getAppliedMigrations should return empty Set when no migrations', async () => {
      const { getAppliedMigrations } = await import('./migrate.js');
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      const result = await getAppliedMigrations(mockPool);
      expect(result.size).toBe(0);
    });

    it('getMigrationFiles should return sorted SQL files', async () => {
      const { getMigrationFiles } = await import('./migrate.js');
      const files = getMigrationFiles();
      expect(files.length).toBeGreaterThanOrEqual(2);
      expect(files[0]).toBe('001_initial_schema.sql');
      expect(files[1]).toBe('002_seed_data.sql');
      expect(files.every((/** @type {string} */ f) => f.endsWith('.sql'))).toBe(true);
    });

    it('runMigrations should skip when all migrations applied', async () => {
      const { runMigrations, getMigrationFiles } = await import('./migrate.js');
      const files = getMigrationFiles();
      // ensureMigrationsTable
      mockPool.query.mockResolvedValueOnce({});
      // getAppliedMigrations - all already applied
      mockPool.query.mockResolvedValueOnce({
        rows: files.map((f) => ({ filename: f })),
      });

      const result = await runMigrations(mockPool);
      expect(result.applied).toHaveLength(0);
      expect(result.skipped).toHaveLength(files.length);
    });

    it('runMigrations should apply pending migrations in transaction', async () => {
      const { runMigrations } = await import('./migrate.js');
      // ensureMigrationsTable
      mockPool.query.mockResolvedValueOnce({});
      // getAppliedMigrations - none applied
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await runMigrations(mockPool);
      expect(result.applied.length).toBeGreaterThanOrEqual(2);

      // Verify transaction pattern: BEGIN, sql, INSERT, COMMIT per migration
      const calls = mockClient.query.mock.calls;
      expect(calls[0][0]).toBe('BEGIN');
      expect(calls[2][0]).toContain('INSERT INTO schema_migrations');
      expect(calls[3][0]).toBe('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('runMigrations should ROLLBACK on error', async () => {
      const { runMigrations } = await import('./migrate.js');
      mockPool.query.mockResolvedValueOnce({});
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      // Make the SQL execution fail
      mockClient.query.mockResolvedValueOnce({}); // BEGIN
      mockClient.query.mockRejectedValueOnce(new Error('SQL error')); // sql fails

      await expect(runMigrations(mockPool)).rejects.toThrow('SQL error');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('getStatus should return file list with applied flag', async () => {
      const { getStatus } = await import('./migrate.js');
      mockPool.query.mockResolvedValueOnce({});
      mockPool.query.mockResolvedValueOnce({
        rows: [{ filename: '001_initial_schema.sql' }],
      });

      const statuses = await getStatus(mockPool);
      expect(statuses.length).toBeGreaterThanOrEqual(2);
      expect(statuses[0]).toEqual({ file: '001_initial_schema.sql', applied: true });
      expect(statuses[1]).toEqual({ file: '002_seed_data.sql', applied: false });
    });

    it('createPool should return a Pool with default or custom options', async () => {
      const { createPool } = await import('./migrate.js');
      const pool = createPool({ host: 'testhost', port: 1234 });
      expect(pool).toBeDefined();
    });
  });
});
