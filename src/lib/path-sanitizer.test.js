import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'node:path';

// Mock fs para controlar existencia de ficheros y symlinks
vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn(() => false),
    realpathSync: vi.fn((p) => p),
  },
}));

import fs from 'node:fs';
import { sanitizePath, sanitizeNewPath, getMountPoints, PathError } from './path-sanitizer.js';

describe('path-sanitizer', () => {
  beforeEach(() => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.realpathSync).mockImplementation((p) => /** @type {string} */ (p));
  });

  describe('sanitizePath', () => {
    it('should resolve a valid /datosnas path', () => {
      const result = sanitizePath('/datosnas/carpeta/fichero.stl');
      expect(result.virtualPath).toBe('/datosnas/carpeta/fichero.stl');
      expect(result.realPath).toBe(path.resolve('/mnt/datosnas/carpeta/fichero.stl'));
      expect(result.mountPoint).toBe('/datosnas');
    });

    it('should resolve a valid /no-comun path', () => {
      const result = sanitizePath('/no-comun/docs/file.pdf');
      expect(result.virtualPath).toBe('/no-comun/docs/file.pdf');
      expect(result.realPath).toBe(path.resolve('/mnt/nocomun/docs/file.pdf'));
      expect(result.mountPoint).toBe('/no-comun');
    });

    it('should resolve mount point root', () => {
      const result = sanitizePath('/datosnas');
      expect(result.virtualPath).toBe('/datosnas');
      expect(result.realPath).toBe(path.resolve('/mnt/datosnas/'));
    });

    it('should normalize double slashes', () => {
      const result = sanitizePath('/datosnas//carpeta///fichero.stl');
      expect(result.virtualPath).toBe('/datosnas/carpeta/fichero.stl');
    });

    it('should normalize trailing slashes', () => {
      const result = sanitizePath('/datosnas/carpeta/');
      expect(result.virtualPath).toBe('/datosnas/carpeta');
    });

    it('should reject empty path', () => {
      expect(() => sanitizePath('')).toThrow(PathError);
      expect(() => sanitizePath('')).toThrow('Path is required');
    });

    it('should reject null/undefined path', () => {
      expect(() => sanitizePath(/** @type {any} */ (null))).toThrow(PathError);
      expect(() => sanitizePath(/** @type {any} */ (undefined))).toThrow(PathError);
    });

    it('should reject non-string path', () => {
      expect(() => sanitizePath(/** @type {any} */ (123))).toThrow(PathError);
    });

    it('should reject null bytes', () => {
      expect(() => sanitizePath('/datosnas/file\0.stl')).toThrow('null bytes');
    });

    it('should reject path traversal with ../', () => {
      expect(() => sanitizePath('/datosnas/../../etc/passwd')).toThrow(PathError);
    });

    it('should reject path traversal normalized by posix.normalize', () => {
      expect(() => sanitizePath('/datosnas/carpeta/../../..')).toThrow(PathError);
    });

    it('should reject paths not starting with a valid mount point', () => {
      expect(() => sanitizePath('/etc/passwd')).toThrow('must start with');
    });

    it('should reject paths starting with unknown mount', () => {
      expect(() => sanitizePath('/otro-nas/carpeta')).toThrow('must start with');
    });

    it('should check symlinks when file exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      // Symlink that stays inside mount → should pass
      vi.mocked(fs.realpathSync).mockReturnValue('/mnt/datosnas/real-file.stl');

      const result = sanitizePath('/datosnas/link.stl');
      expect(result.realPath).toBe(path.resolve('/mnt/datosnas/link.stl'));
    });

    it('should reject symlinks that escape mount points', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.realpathSync).mockReturnValue('/etc/shadow');

      expect(() => sanitizePath('/datosnas/evil-link')).toThrow('symlink escapes');
    });

    it('should return correct mountPoint and realMountPoint', () => {
      const result = sanitizePath('/datosnas/test');
      expect(result.mountPoint).toBe('/datosnas');
      expect(result.realMountPoint).toBe(path.resolve('/mnt/datosnas'));
    });

    it('should have statusCode on PathError', () => {
      try {
        sanitizePath('');
      } catch (err) {
        expect(err).toBeInstanceOf(PathError);
        expect(/** @type {PathError} */ (err).statusCode).toBe(400);
      }
    });
  });

  describe('sanitizeNewPath', () => {
    it('should resolve a valid new path', () => {
      const result = sanitizeNewPath('/datosnas/nueva-carpeta/file.stl');
      expect(result.virtualPath).toBe('/datosnas/nueva-carpeta/file.stl');
      expect(result.realPath).toBe(path.resolve('/mnt/datosnas/nueva-carpeta/file.stl'));
    });

    it('should reject traversal on new paths', () => {
      expect(() => sanitizeNewPath('/datosnas/../../etc')).toThrow(PathError);
    });

    it('should reject null bytes on new paths', () => {
      expect(() => sanitizeNewPath('/datosnas/file\0.txt')).toThrow('null bytes');
    });

    it('should reject empty new path', () => {
      expect(() => sanitizeNewPath('')).toThrow('Path is required');
    });

    it('should reject invalid mount on new paths', () => {
      expect(() => sanitizeNewPath('/random/path')).toThrow('must start with');
    });

    it('should not check symlinks (file does not exist yet)', () => {
      // Clear previous calls from other tests
      vi.mocked(fs.existsSync).mockClear();
      const result = sanitizeNewPath('/datosnas/new-dir/new-file.stl');
      expect(fs.existsSync).not.toHaveBeenCalled();
      expect(result.realPath).toBe(path.resolve('/mnt/datosnas/new-dir/new-file.stl'));
    });
  });

  describe('getMountPoints', () => {
    it('should return all configured mount points', () => {
      const mounts = getMountPoints();
      expect(mounts).toHaveLength(2);
      expect(mounts[0].virtualPath).toBe('/datosnas');
      expect(mounts[1].virtualPath).toBe('/no-comun');
    });

    it('should include real paths', () => {
      const mounts = getMountPoints();
      expect(mounts[0].realPath).toContain('datosnas');
      expect(mounts[1].realPath).toContain('nocomun');
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
