/**
 * Client-side API wrapper for Geniova Drive endpoints.
 *
 * All methods return parsed JSON. On non-ok responses, they throw
 * with the server's error message.
 *
 * @module api-client
 */

/**
 * @typedef {object} FileItem
 * @property {string} name
 * @property {'file'|'directory'} type
 * @property {number} size
 * @property {string} modified
 * @property {string} path
 */

/**
 * @typedef {object} DirectoryListing
 * @property {string} path
 * @property {FileItem[]} items
 * @property {number} total
 * @property {number} page
 * @property {number} limit
 * @property {number} pages
 */

export class ApiClient {
  /** @type {typeof globalThis.fetch} */
  #fetch;

  /**
   * @param {object} [options]
   * @param {typeof globalThis.fetch} [options.fetch]
   */
  constructor(options = {}) {
    this.#fetch = options.fetch || globalThis.fetch.bind(globalThis);
  }

  /**
   * @param {Response} res
   * @returns {Promise<never>}
   */
  async #throwOnError(res) {
    const body = await res.json();
    throw new Error(body.error || `HTTP ${res.status}`);
  }

  /**
   * List directory contents.
   *
   * @param {string} virtualPath
   * @param {object} [options]
   * @param {number} [options.page]
   * @param {number} [options.limit]
   * @param {'name'|'size'|'modified'} [options.sortBy]
   * @param {'asc'|'desc'} [options.sortDir]
   * @returns {Promise<DirectoryListing>}
   */
  async listDirectory(virtualPath, options = {}) {
    const { page = 1, limit = 50, sortBy, sortDir } = options;
    const params = new URLSearchParams({
      path: virtualPath,
      page: String(page),
      limit: String(limit),
    });
    if (sortBy) params.set('sortBy', sortBy);
    if (sortDir) params.set('sortDir', sortDir);

    const res = await this.#fetch(`/api/files?${params}`);
    if (!res.ok) return this.#throwOnError(res);
    return res.json();
  }

  /**
   * Delete a file or directory (moves to recycle bin).
   *
   * @param {string} virtualPath
   * @returns {Promise<{success: boolean, message?: string}>}
   */
  async deleteItem(virtualPath) {
    const params = new URLSearchParams({ path: virtualPath });
    const res = await this.#fetch(`/api/files?${params}`, { method: 'DELETE' });
    if (!res.ok) return this.#throwOnError(res);
    return res.json();
  }

  /**
   * Create a new directory.
   *
   * @param {string} virtualPath
   * @returns {Promise<{success: boolean, path?: string}>}
   */
  async createDirectory(virtualPath) {
    const res = await this.#fetch('/api/files/mkdir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: virtualPath }),
    });
    if (!res.ok) return this.#throwOnError(res);
    return res.json();
  }

  /**
   * Rename a file or directory.
   *
   * @param {string} virtualPath
   * @param {string} newName
   * @returns {Promise<{success: boolean, path?: string}>}
   */
  async renameItem(virtualPath, newName) {
    const res = await this.#fetch('/api/files/rename', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: virtualPath, newName }),
    });
    if (!res.ok) return this.#throwOnError(res);
    return res.json();
  }

  /**
   * Move a file or directory to another location.
   *
   * @param {string} source
   * @param {string} destination
   * @returns {Promise<{success: boolean, path?: string}>}
   */
  async moveItem(source, destination) {
    const res = await this.#fetch('/api/files/move', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source, destination }),
    });
    if (!res.ok) return this.#throwOnError(res);
    return res.json();
  }

  /**
   * Search for files/directories by name within a specific path.
   *
   * @param {string} virtualPath - root path to search in
   * @param {string} query - search term (min 2 chars)
   * @param {object} [options]
   * @param {'contains'|'starts'|'ends'} [options.mode] - match mode (default: contains)
   * @returns {Promise<{query: string, path: string, results: FileItem[], total: number}>}
   */
  async searchFiles(virtualPath, query, options = {}) {
    const params = new URLSearchParams({ path: virtualPath, q: query });
    if (options.mode) params.set('mode', options.mode);
    const res = await this.#fetch(`/api/files/search?${params}`);
    if (!res.ok) return this.#throwOnError(res);
    return res.json();
  }

  /**
   * Search for files/directories globally across all accessible aliases.
   *
   * @param {string} query - search term (min 2 chars)
   * @returns {Promise<{query: string, results: Array<FileItem & {aliasName: string, aliasRoot: string}>, total: number}>}
   */
  async searchGlobal(query) {
    const params = new URLSearchParams({ q: query });
    const res = await this.#fetch(`/api/files/search-global?${params}`);
    if (!res.ok) return this.#throwOnError(res);
    return res.json();
  }

  /**
   * Get the download URL for a file.
   *
   * @param {string} virtualPath
   * @returns {string}
   */
  getDownloadUrl(virtualPath) {
    const params = new URLSearchParams({ path: virtualPath });
    return `/api/files/download?${params}`;
  }

  /**
   * Get the inline preview URL for a file (opens in browser).
   *
   * @param {string} virtualPath
   * @returns {string}
   */
  getPreviewUrl(virtualPath) {
    const params = new URLSearchParams({ path: virtualPath, inline: 'true' });
    return `/api/files/download?${params}`;
  }

  /**
   * Get all users (admin-only).
   * @returns {Promise<{users: Array}>}
   */
  async getUsers() {
    const res = await this.#fetch('/api/admin/users');
    if (!res.ok) return this.#throwOnError(res);
    return res.json();
  }

  /**
   * Pre-register a user with email and optional group assignments (admin-only).
   * @param {object} data - { email, display_name?, group_ids? }
   * @returns {Promise<{user: object}>}
   */
  async preRegisterUser(data) {
    const res = await this.#fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) return this.#throwOnError(res);
    return res.json();
  }

  /**
   * Get all groups (admin-only).
   * @returns {Promise<{groups: Array}>}
   */
  async getGroups() {
    const res = await this.#fetch('/api/admin/groups');
    if (!res.ok) return this.#throwOnError(res);
    return res.json();
  }

  /**
   * Get a single group with its members (admin-only).
   * @param {number} id
   * @returns {Promise<{id: number, name: string, description: string|null, members: Array}>}
   */
  async getGroup(id) {
    const res = await this.#fetch(`/api/admin/groups?id=${id}`);
    if (!res.ok) return this.#throwOnError(res);
    return res.json();
  }

  /**
   * Create a new group (admin-only).
   * @param {object} data - { name, description? }
   * @returns {Promise<object>}
   */
  async createGroup(data) {
    const res = await this.#fetch('/api/admin/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) return this.#throwOnError(res);
    return res.json();
  }

  /**
   * Update a group (admin-only).
   * @param {object} data - { id, name?, description? }
   * @returns {Promise<object>}
   */
  async updateGroup(data) {
    const res = await this.#fetch('/api/admin/groups', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) return this.#throwOnError(res);
    return res.json();
  }

  /**
   * Delete a group (admin-only).
   * @param {number} id
   * @returns {Promise<object>}
   */
  async deleteGroup(id) {
    const res = await this.#fetch('/api/admin/groups', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) return this.#throwOnError(res);
    return res.json();
  }

  /**
   * Add a user to a group (admin-only).
   * @param {number} groupId
   * @param {number} userId
   * @returns {Promise<object>}
   */
  async addGroupMember(groupId, userId) {
    const res = await this.#fetch('/api/admin/groups/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ group_id: groupId, user_id: userId }),
    });
    if (!res.ok) return this.#throwOnError(res);
    return res.json();
  }

  /**
   * Remove a user from a group (admin-only).
   * @param {number} groupId
   * @param {number} userId
   * @returns {Promise<object>}
   */
  async removeGroupMember(groupId, userId) {
    const res = await this.#fetch('/api/admin/groups/members', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ group_id: groupId, user_id: userId }),
    });
    if (!res.ok) return this.#throwOnError(res);
    return res.json();
  }

  /**
   * Get visible aliases the current user has access to.
   * @returns {Promise<{aliases: Array<{id: number, alias_name: string, real_path: string, description: string|null}>}>}
   */
  async getAliases() {
    const res = await this.#fetch('/api/aliases');
    if (!res.ok) return this.#throwOnError(res);
    return res.json();
  }

  // ── Admin: Audit Log ────────────────────────────────

  /**
   * @param {object} [filters]
   * @param {number} [filters.page]
   * @param {number} [filters.limit]
   * @param {number} [filters.user_id]
   * @param {string} [filters.action]
   * @param {string} [filters.from]
   * @param {string} [filters.to]
   */
  async getAuditLog(filters = {}) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) {
      if (v !== undefined && v !== '') params.set(k, String(v));
    }
    const res = await this.#fetch(`/api/admin/audit?${params}`);
    if (!res.ok) return this.#throwOnError(res);
    return res.json();
  }

  // ── Admin: Aliases ─────────────────────────────────

  /** @returns {Promise<{aliases: Array}>} */
  async getAdminAliases() {
    const res = await this.#fetch('/api/admin/aliases');
    if (!res.ok) return this.#throwOnError(res);
    return res.json();
  }

  /** @param {object} data - { alias_name, real_path, description?, visible? } */
  async createAlias(data) {
    const res = await this.#fetch('/api/admin/aliases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) return this.#throwOnError(res);
    return res.json();
  }

  /** @param {object} data - { id, alias_name?, real_path?, description?, visible? } */
  async updateAlias(data) {
    const res = await this.#fetch('/api/admin/aliases', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) return this.#throwOnError(res);
    return res.json();
  }

  /** @param {number} id */
  async deleteAlias(id) {
    const res = await this.#fetch('/api/admin/aliases', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) return this.#throwOnError(res);
    return res.json();
  }

  // ── Admin: Folder Permissions ──────────────────────

  /** @param {number} aliasId */
  async getFolderPermissions(aliasId) {
    const res = await this.#fetch(`/api/admin/folder-permissions?alias_id=${aliasId}`);
    if (!res.ok) return this.#throwOnError(res);
    return res.json();
  }

  /** @param {object} data - { alias_id, group_id, can_read?, can_write?, can_delete?, can_move? } */
  async setFolderPermission(data) {
    const res = await this.#fetch('/api/admin/folder-permissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) return this.#throwOnError(res);
    return res.json();
  }

  /**
   * @param {number} aliasId
   * @param {number} groupId
   */
  async deleteFolderPermission(aliasId, groupId) {
    const res = await this.#fetch('/api/admin/folder-permissions', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alias_id: aliasId, group_id: groupId }),
    });
    if (!res.ok) return this.#throwOnError(res);
    return res.json();
  }

  // ── Presence ────────────────────────────────────────

  /**
   * Send a heartbeat to register presence in a folder.
   * @param {string} path
   * @returns {Promise<{ok: boolean}>}
   */
  async sendHeartbeat(path) {
    const res = await this.#fetch('/api/presence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });
    if (!res.ok) return this.#throwOnError(res);
    return res.json();
  }

  /**
   * Get active users in a folder (excluding the requester).
   * @param {string} path
   * @returns {Promise<{path: string, users: Array<{user_id: number, display_name: string, since: string}>}>}
   */
  async getPresence(path) {
    const params = new URLSearchParams({ path });
    const res = await this.#fetch(`/api/presence?${params}`);
    if (!res.ok) return this.#throwOnError(res);
    return res.json();
  }

  /**
   * Get active users in child paths of a folder (for showing badges).
   * @param {string} path
   * @returns {Promise<{path: string, children: Object<string, Array<{user_id: number, display_name: string, since: string}>>}>}
   */
  async getPresenceChildren(path) {
    const params = new URLSearchParams({ path, children: 'true' });
    const res = await this.#fetch(`/api/presence?${params}`);
    if (!res.ok) return this.#throwOnError(res);
    return res.json();
  }

  /**
   * Explicitly remove presence (e.g. on tab close).
   * @returns {Promise<{ok: boolean}>}
   */
  async leavePresence() {
    const res = await this.#fetch('/api/presence', { method: 'DELETE' });
    if (!res.ok) return this.#throwOnError(res);
    return res.json();
  }

  // ── Admin: Volumes ─────────────────────────────────

  /** @returns {Promise<{volumes: Array}>} */
  async getVolumes() {
    const res = await this.#fetch('/api/admin/volumes');
    if (!res.ok) return this.#throwOnError(res);
    return res.json();
  }

  /** @param {object} data - { name, mount_path } */
  async createVolume(data) {
    const res = await this.#fetch('/api/admin/volumes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) return this.#throwOnError(res);
    return res.json();
  }

  /** @param {object} data - { id, name?, mount_path?, active? } */
  async updateVolume(data) {
    const res = await this.#fetch('/api/admin/volumes', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) return this.#throwOnError(res);
    return res.json();
  }

  /** @param {number} id */
  async deleteVolume(id) {
    const res = await this.#fetch('/api/admin/volumes', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) return this.#throwOnError(res);
    return res.json();
  }

  // ── Admin: Recycle Bin ──────────────────────────────

  /** Get recycle bin summary for all mount points. */
  async getRecycleMounts() {
    const res = await this.#fetch('/api/admin/recycle');
    if (!res.ok) return this.#throwOnError(res);
    return res.json();
  }

  /** Get recycle bin items for a specific mount. @param {string} mount */
  async getRecycleItems(mount) {
    const params = new URLSearchParams({ mount });
    const res = await this.#fetch(`/api/admin/recycle?${params}`);
    if (!res.ok) return this.#throwOnError(res);
    return res.json();
  }

  /**
   * Restore a recycled item to a destination.
   * @param {string} mount
   * @param {string} recycledName
   * @param {string} destination
   */
  async restoreRecycleItem(mount, recycledName, destination) {
    const res = await this.#fetch('/api/admin/recycle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mount, recycledName, destination }),
    });
    if (!res.ok) return this.#throwOnError(res);
    return res.json();
  }

  /**
   * Permanently delete a recycled item.
   * @param {string} mount
   * @param {string} recycledName
   */
  async deleteRecycleItem(mount, recycledName) {
    const res = await this.#fetch('/api/admin/recycle', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mount, recycledName }),
    });
    if (!res.ok) return this.#throwOnError(res);
    return res.json();
  }

  // ── Data Anonymization ─────────────────────────────

  /**
   * Parse a SQL or CSV file and return its structure + sample data.
   * @param {string} virtualPath
   * @param {number} [sampleRows]
   * @returns {Promise<{format: 'sql'|'csv', tables?: Array, columns?: Array, sampleRows?: Array, delimiter?: string, totalRowsEstimate?: number}>}
   */
  async parseData(virtualPath, sampleRows) {
    const body = { path: virtualPath };
    if (sampleRows) body.sampleRows = sampleRows;
    const res = await this.#fetch('/api/files/parse-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return this.#throwOnError(res);
    return res.json();
  }

  /**
   * Anonymize a SQL or CSV file and write the result as {name}_anonymized.{ext}.
   * @param {string} virtualPath
   * @param {Array<{name: string, strategy: string, fakerType?: string}>} config
   * @param {string} [tableName] - For SQL: which table to anonymize
   * @returns {Promise<{success: boolean, outputPath: string, stats: object}>}
   */
  async anonymizeData(virtualPath, config, tableName) {
    const body = { path: virtualPath, config };
    if (tableName) body.tableName = tableName;
    const res = await this.#fetch('/api/files/anonymize-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return this.#throwOnError(res);
    return res.json();
  }

  // ── Version ──────────────────────────────────────────

  /**
   * Get app version and changelog.
   * @returns {Promise<{version: string, changelog: string}>}
   */
  async getVersion() {
    const res = await this.#fetch('/api/version');
    if (!res.ok) return this.#throwOnError(res);
    return res.json();
  }
}
