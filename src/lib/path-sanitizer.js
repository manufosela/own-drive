import path from 'node:path';
import fs from 'node:fs';

/**
 * Mount points virtuales → reales.
 * Las rutas de la API usan paths virtuales que se mapean a los mount points reales del filesystem.
 * @type {Record<string, string>}
 */
const MOUNT_MAP = {
  '/media/raid5': process.env.STORAGE_MOUNT || '/media/raid5',
};

/** @type {string[]} */
const ALLOWED_PREFIXES = Object.values(MOUNT_MAP);

/**
 * @typedef {Object} SanitizedPath
 * @property {string} virtualPath - Path virtual normalizado (/datosnas/carpeta/file.stl)
 * @property {string} realPath - Path real en el filesystem (/mnt/datosnas/carpeta/file.stl)
 * @property {string} mountPoint - Mount point virtual (/datosnas)
 * @property {string} realMountPoint - Mount point real (/mnt/datosnas)
 */

/**
 * Sanitiza y valida una ruta virtual, devolviendo el path real en el filesystem.
 * Previene path traversal, null bytes y symlinks que escapen del mount point.
 *
 * @param {string} virtualPath - Ruta virtual desde la API (ej: /datosnas/carpeta/file.stl)
 * @returns {SanitizedPath}
 * @throws {Error} Si la ruta es inválida o intenta escapar del mount point
 */
export function sanitizePath(virtualPath) {
  if (!virtualPath || typeof virtualPath !== 'string') {
    throw new PathError('Path is required', 400);
  }

  // Rechazar null bytes
  if (virtualPath.includes('\0')) {
    throw new PathError('Invalid path: null bytes not allowed', 400);
  }

  // Normalizar: quitar dobles barras, resolver . y .., quitar trailing slash
  const normalized = path.posix.normalize(virtualPath).replace(/\/+$/, '') || '/';

  // Encontrar el mount point virtual
  const mountEntry = Object.entries(MOUNT_MAP).find(([prefix]) =>
    normalized === prefix || normalized.startsWith(prefix + '/')
  );

  if (!mountEntry) {
    throw new PathError(
      `Invalid path: must start with ${Object.keys(MOUNT_MAP).join(' or ')}`,
      400
    );
  }

  const [virtualMount, realMount] = mountEntry;

  // Construir el path real
  const relativePath = normalized.slice(virtualMount.length) || '/';
  const realPath = path.join(realMount, relativePath);

  // Verificar que el path resuelto está dentro del mount point (anti-traversal)
  const resolvedReal = path.resolve(realPath);
  const resolvedMount = path.resolve(realMount);

  if (!resolvedReal.startsWith(resolvedMount)) {
    throw new PathError('Invalid path: directory traversal detected', 400);
  }

  // Si el fichero/directorio existe, verificar con realpath (anti-symlink escape)
  if (fs.existsSync(resolvedReal)) {
    const realResolved = fs.realpathSync(resolvedReal);
    const isInsideAnyMount = ALLOWED_PREFIXES.some((prefix) =>
      realResolved.startsWith(path.resolve(prefix))
    );
    if (!isInsideAnyMount) {
      throw new PathError('Invalid path: symlink escapes allowed mount points', 400);
    }
  }

  return {
    virtualPath: normalized,
    realPath: resolvedReal,
    mountPoint: virtualMount,
    realMountPoint: resolvedMount,
  };
}

/**
 * Verifica que un path virtual es válido sin resolver symlinks.
 * Útil para operaciones donde el destino aún no existe (mkdir, upload).
 *
 * @param {string} virtualPath
 * @returns {SanitizedPath}
 * @throws {Error}
 */
export function sanitizeNewPath(virtualPath) {
  if (!virtualPath || typeof virtualPath !== 'string') {
    throw new PathError('Path is required', 400);
  }

  if (virtualPath.includes('\0')) {
    throw new PathError('Invalid path: null bytes not allowed', 400);
  }

  const normalized = path.posix.normalize(virtualPath);

  const mountEntry = Object.entries(MOUNT_MAP).find(([prefix]) =>
    normalized === prefix || normalized.startsWith(prefix + '/')
  );

  if (!mountEntry) {
    throw new PathError(
      `Invalid path: must start with ${Object.keys(MOUNT_MAP).join(' or ')}`,
      400
    );
  }

  const [virtualMount, realMount] = mountEntry;
  const relativePath = normalized.slice(virtualMount.length) || '/';
  const realPath = path.join(realMount, relativePath);
  const resolvedReal = path.resolve(realPath);
  const resolvedMount = path.resolve(realMount);

  if (!resolvedReal.startsWith(resolvedMount)) {
    throw new PathError('Invalid path: directory traversal detected', 400);
  }

  return {
    virtualPath: normalized,
    realPath: resolvedReal,
    mountPoint: virtualMount,
    realMountPoint: resolvedMount,
  };
}

/**
 * Devuelve los mount points disponibles.
 * @returns {{ virtualPath: string, realPath: string }[]}
 */
export function getMountPoints() {
  return Object.entries(MOUNT_MAP).map(([virtualPath, realPath]) => ({
    virtualPath,
    realPath,
  }));
}

export class PathError extends Error {
  /** @param {string} message @param {number} statusCode */
  constructor(message, statusCode) {
    super(message);
    this.name = 'PathError';
    /** @type {number} */
    this.statusCode = statusCode;
  }
}
