import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'node:path';

// Mock fs
vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn(() => false),
    realpathSync: vi.fn((p) => p),
  },
}));

// Mock db to provide volumes
vi.mock('./db.js', () => ({
  query: vi.fn(),
}));

import fs from 'node:fs';
import { query as mockQuery } from './db.js';
import { sanitizePath, sanitizeNewPath, getMountPoints, invalidateMountMap, PathError } from './path-sanitizer.js';

describe('path-sanitizer', () => {
  beforeEach(() => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.realpathSync).mockImplementation((p) => /** @type {string} */ (p));
    invalidateMountMap();
    // Default: one active volume
    mockQuery.mockResolvedValue({
      rows: [{ mount_path: '/data/vol1' }],
    });
  });

  describe('sanitizePath', () => {
    it('should resolve a valid path', async () => {
      const result = await sanitizePath('/data/vol1/folder/file.txt');
      expect(result.virtualPath).toBe('/data/vol1/folder/file.txt');
      expect(result.realPath).toBe(path.resolve('/data/vol1/folder/file.txt'));
      expect(result.mountPoint).toBe('/data/vol1');
    });

    it('should resolve mount point root', async () => {
      const result = await sanitizePath('/data/vol1');
      expect(result.virtualPath).toBe('/data/vol1');
      expect(result.realPath).toBe(path.resolve('/data/vol1/'));
    });

    it('should normalize double slashes', async () => {
      const result = await sanitizePath('/data/vol1//folder///file.txt');
      expect(result.virtualPath).toBe('/data/vol1/folder/file.txt');
    });

    it('should normalize trailing slashes', async () => {
      const result = await sanitizePath('/data/vol1/folder/');
      expect(result.virtualPath).toBe('/data/vol1/folder');
    });

    it('should reject empty path', async () => {
      await expect(sanitizePath('')).rejects.toThrow(PathError);
      await expect(sanitizePath('')).rejects.toThrow('Path is required');
    });

    it('should reject null/undefined path', async () => {
      await expect(sanitizePath(/** @type {any} */ (null))).rejects.toThrow(PathError);
      await expect(sanitizePath(/** @type {any} */ (undefined))).rejects.toThrow(PathError);
    });

    it('should reject non-string path', async () => {
      await expect(sanitizePath(/** @type {any} */ (123))).rejects.toThrow(PathError);
    });

    it('should reject null bytes', async () => {
      await expect(sanitizePath('/data/vol1/file\0.txt')).rejects.toThrow('null bytes');
    });

    it('should reject path traversal with ../', async () => {
      await expect(sanitizePath('/data/vol1/../../etc/passwd')).rejects.toThrow(PathError);
    });

    it('should reject path traversal normalized by posix.normalize', async () => {
      await expect(sanitizePath('/data/vol1/folder/../../..')).rejects.toThrow(PathError);
    });

    it('should reject paths not starting with a valid mount point', async () => {
      await expect(sanitizePath('/etc/passwd')).rejects.toThrow('must start with');
    });

    it('should reject paths starting with unknown mount', async () => {
      await expect(sanitizePath('/other/folder')).rejects.toThrow('must start with');
    });

    it('should check symlinks when file exists', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.realpathSync).mockReturnValue('/data/vol1/real-file.txt');

      const result = await sanitizePath('/data/vol1/link.txt');
      expect(result.realPath).toBe(path.resolve('/data/vol1/link.txt'));
    });

    it('should reject symlinks that escape mount points', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.realpathSync).mockReturnValue('/etc/shadow');

      await expect(sanitizePath('/data/vol1/evil-link')).rejects.toThrow('symlink escapes');
    });

    it('should return correct mountPoint and realMountPoint', async () => {
      const result = await sanitizePath('/data/vol1/test');
      expect(result.mountPoint).toBe('/data/vol1');
      expect(result.realMountPoint).toBe(path.resolve('/data/vol1'));
    });

    it('should work with multiple volumes', async () => {
      mockQuery.mockResolvedValue({
        rows: [{ mount_path: '/data/vol1' }, { mount_path: '/mnt/backup' }],
      });
      invalidateMountMap();

      const r1 = await sanitizePath('/data/vol1/file.txt');
      expect(r1.mountPoint).toBe('/data/vol1');

      const r2 = await sanitizePath('/mnt/backup/file.txt');
      expect(r2.mountPoint).toBe('/mnt/backup');
    });

    it('should show "No volumes configured" when DB has no volumes', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      invalidateMountMap();

      await expect(sanitizePath('/anything')).rejects.toThrow('No volumes configured');
    });

    it('should have statusCode on PathError', async () => {
      try {
        await sanitizePath('');
      } catch (err) {
        expect(err).toBeInstanceOf(PathError);
        expect(/** @type {PathError} */ (err).statusCode).toBe(400);
      }
    });
  });

  describe('sanitizeNewPath', () => {
    it('should resolve a valid new path', async () => {
      const result = await sanitizeNewPath('/data/vol1/new-folder/file.txt');
      expect(result.virtualPath).toBe('/data/vol1/new-folder/file.txt');
      expect(result.realPath).toBe(path.resolve('/data/vol1/new-folder/file.txt'));
    });

    it('should reject traversal on new paths', async () => {
      await expect(sanitizeNewPath('/data/vol1/../../etc')).rejects.toThrow(PathError);
    });

    it('should reject null bytes on new paths', async () => {
      await expect(sanitizeNewPath('/data/vol1/file\0.txt')).rejects.toThrow('null bytes');
    });

    it('should reject empty new path', async () => {
      await expect(sanitizeNewPath('')).rejects.toThrow('Path is required');
    });

    it('should reject invalid mount on new paths', async () => {
      await expect(sanitizeNewPath('/random/path')).rejects.toThrow('must start with');
    });

    it('should not check symlinks (file does not exist yet)', async () => {
      vi.mocked(fs.existsSync).mockClear();
      const result = await sanitizeNewPath('/data/vol1/new-dir/new-file.txt');
      expect(fs.existsSync).not.toHaveBeenCalled();
      expect(result.realPath).toBe(path.resolve('/data/vol1/new-dir/new-file.txt'));
    });
  });

  describe('getMountPoints', () => {
    it('should return all configured mount points from DB', async () => {
      mockQuery.mockResolvedValue({
        rows: [{ mount_path: '/data/vol1' }, { mount_path: '/mnt/backup' }],
      });
      invalidateMountMap();

      const mounts = await getMountPoints();
      expect(mounts).toHaveLength(2);
      expect(mounts[0].virtualPath).toBe('/data/vol1');
      expect(mounts[1].virtualPath).toBe('/mnt/backup');
    });

    it('should return empty array when no volumes', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      invalidateMountMap();

      const mounts = await getMountPoints();
      expect(mounts).toHaveLength(0);
    });
  });

  describe('PathError', () => {
    it('should have name, message and statusCode', () => {
      const err = new PathError('test error', 403);
      expect(err.name).toBe('PathError');
      expect(err.message).toBe('test error');
      expect(err.statusCode).toBe(403);
      expect(err).toBeInstanceOf(Error);
    });
  });
});
