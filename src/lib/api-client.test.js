import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiClient } from './api-client.js';

describe('api-client', () => {
  /** @type {ApiClient} */
  let api;
  /** @type {ReturnType<typeof vi.fn>} */
  let mockFetch;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch = vi.fn();
    api = new ApiClient({ fetch: mockFetch });
  });

  describe('listDirectory', () => {
    it('should fetch directory listing with default params', async () => {
      const mockResponse = {
        path: '/datosnas',
        items: [
          { name: 'stls', type: 'directory', size: 0, modified: '2026-01-15T10:00:00Z', path: '/datosnas/stls' },
          { name: 'doc.pdf', type: 'file', size: 1024, modified: '2026-01-20T14:30:00Z', path: '/datosnas/doc.pdf' },
        ],
        total: 2,
        page: 1,
        limit: 50,
        pages: 1,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await api.listDirectory('/datosnas');

      expect(mockFetch).toHaveBeenCalledWith('/api/files?path=%2Fdatosnas&page=1&limit=50');
      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should pass page and limit params', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ path: '/datosnas', items: [], total: 0, page: 2, limit: 20, pages: 0 }),
      });

      await api.listDirectory('/datosnas', { page: 2, limit: 20 });

      expect(mockFetch).toHaveBeenCalledWith('/api/files?path=%2Fdatosnas&page=2&limit=20');
    });

    it('should throw on non-ok response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: () => Promise.resolve({ error: 'Access denied' }),
      });

      await expect(api.listDirectory('/datosnas/secret')).rejects.toThrow('Access denied');
    });

    it('should throw on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network failure'));

      await expect(api.listDirectory('/datosnas')).rejects.toThrow('Network failure');
    });
  });

  describe('deleteItem', () => {
    it('should send DELETE request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, message: 'Moved to recycle bin' }),
      });

      const result = await api.deleteItem('/datosnas/old-file.stl');

      expect(mockFetch).toHaveBeenCalledWith('/api/files?path=%2Fdatosnas%2Fold-file.stl', { method: 'DELETE' });
      expect(result.success).toBe(true);
    });

    it('should throw on error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: 'File not found' }),
      });

      await expect(api.deleteItem('/datosnas/ghost.stl')).rejects.toThrow('File not found');
    });
  });

  describe('createDirectory', () => {
    it('should POST to mkdir endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, path: '/datosnas/new-folder' }),
      });

      const result = await api.createDirectory('/datosnas/new-folder');

      expect(mockFetch).toHaveBeenCalledWith('/api/files/mkdir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: '/datosnas/new-folder' }),
      });
      expect(result.success).toBe(true);
    });
  });

  describe('renameItem', () => {
    it('should PUT to rename endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, path: '/datosnas/renamed.stl' }),
      });

      const result = await api.renameItem('/datosnas/old.stl', 'renamed.stl');

      expect(mockFetch).toHaveBeenCalledWith('/api/files/rename', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: '/datosnas/old.stl', newName: 'renamed.stl' }),
      });
      expect(result.success).toBe(true);
    });
  });

  describe('moveItem', () => {
    it('should PUT to move endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, path: '/datosnas/dest/file.stl' }),
      });

      const result = await api.moveItem('/datosnas/file.stl', '/datosnas/dest');

      expect(mockFetch).toHaveBeenCalledWith('/api/files/move', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: '/datosnas/file.stl', destination: '/datosnas/dest' }),
      });
      expect(result.success).toBe(true);
    });
  });

  describe('searchFiles', () => {
    it('should fetch search results', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          query: 'model',
          path: '/datosnas',
          results: [{ name: 'model.stl', type: 'file', size: 5000, modified: '2026-01-15', path: '/datosnas/model.stl' }],
          total: 1,
        }),
      });

      const result = await api.searchFiles('/datosnas', 'model');

      expect(mockFetch).toHaveBeenCalledWith('/api/files/search?path=%2Fdatosnas&q=model');
      expect(result.results).toHaveLength(1);
      expect(result.query).toBe('model');
    });

    it('should throw on error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: 'Query must be at least 2 characters' }),
      });

      await expect(api.searchFiles('/datosnas', 'a')).rejects.toThrow('Query must be at least 2 characters');
    });
  });

  describe('getDownloadUrl', () => {
    it('should return encoded download URL', () => {
      const url = api.getDownloadUrl('/datosnas/mi archivo.stl');
      expect(url).toBe('/api/files/download?path=%2Fdatosnas%2Fmi+archivo.stl');
    });
  });

  describe('getUsers', () => {
    it('should fetch users list', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ users: [{ id: 1, display_name: 'Admin' }] }),
      });

      const result = await api.getUsers();
      expect(mockFetch).toHaveBeenCalledWith('/api/admin/users');
      expect(result.users).toHaveLength(1);
    });
  });

  describe('getGroups', () => {
    it('should fetch groups list', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ groups: [{ id: 1, name: 'admins' }] }),
      });

      const result = await api.getGroups();
      expect(mockFetch).toHaveBeenCalledWith('/api/admin/groups');
      expect(result.groups).toHaveLength(1);
    });
  });

  describe('getAliases', () => {
    it('should fetch user aliases', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ aliases: [{ id: 1, alias_name: 'STLs', real_path: '/datosnas/stls', description: null }] }),
      });

      const result = await api.getAliases();
      expect(mockFetch).toHaveBeenCalledWith('/api/aliases');
      expect(result.aliases).toHaveLength(1);
      expect(result.aliases[0].alias_name).toBe('STLs');
    });

    it('should throw on error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: 'Not authenticated' }),
      });

      await expect(api.getAliases()).rejects.toThrow('Not authenticated');
    });
  });

  describe('getAdminAliases', () => {
    it('should fetch admin aliases', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ aliases: [{ id: 1, alias_name: 'STLs' }] }),
      });
      const result = await api.getAdminAliases();
      expect(mockFetch).toHaveBeenCalledWith('/api/admin/aliases');
      expect(result.aliases).toHaveLength(1);
    });
  });

  describe('createAlias', () => {
    it('should POST to admin aliases', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 3, alias_name: 'Docs' }),
      });
      const result = await api.createAlias({ alias_name: 'Docs', real_path: '/datosnas/docs' });
      expect(mockFetch).toHaveBeenCalledWith('/api/admin/aliases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alias_name: 'Docs', real_path: '/datosnas/docs' }),
      });
      expect(result.alias_name).toBe('Docs');
    });
  });

  describe('updateAlias', () => {
    it('should PUT to admin aliases', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 1, alias_name: 'Updated' }),
      });
      await api.updateAlias({ id: 1, alias_name: 'Updated' });
      expect(mockFetch).toHaveBeenCalledWith('/api/admin/aliases', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 1, alias_name: 'Updated' }),
      });
    });
  });

  describe('deleteAlias', () => {
    it('should DELETE with id', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ deleted: { id: 1 } }),
      });
      await api.deleteAlias(1);
      expect(mockFetch).toHaveBeenCalledWith('/api/admin/aliases', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 1 }),
      });
    });
  });

  describe('getFolderPermissions', () => {
    it('should fetch permissions by alias id', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ permissions: [{ alias_id: 1, group_id: 2, can_read: true }] }),
      });
      const result = await api.getFolderPermissions(1);
      expect(mockFetch).toHaveBeenCalledWith('/api/admin/folder-permissions?alias_id=1');
      expect(result.permissions).toHaveLength(1);
    });
  });

  describe('setFolderPermission', () => {
    it('should POST to folder-permissions', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ alias_id: 1, group_id: 2, can_read: true }),
      });
      await api.setFolderPermission({ alias_id: 1, group_id: 2, can_read: true });
      expect(mockFetch).toHaveBeenCalledWith('/api/admin/folder-permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alias_id: 1, group_id: 2, can_read: true }),
      });
    });
  });

  describe('deleteFolderPermission', () => {
    it('should DELETE folder permission', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ deleted: { alias_id: 1, group_id: 2 } }),
      });
      await api.deleteFolderPermission(1, 2);
      expect(mockFetch).toHaveBeenCalledWith('/api/admin/folder-permissions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alias_id: 1, group_id: 2 }),
      });
    });
  });

  describe('sendHeartbeat', () => {
    it('should POST to presence endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      });
      const result = await api.sendHeartbeat('/datosnas/stls');
      expect(mockFetch).toHaveBeenCalledWith('/api/presence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: '/datosnas/stls' }),
      });
      expect(result.ok).toBe(true);
    });
  });

  describe('getPresence', () => {
    it('should GET presence for a path', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ path: '/datosnas/stls', users: [{ user_id: 5, display_name: 'Alice', since: '2026-02-19T10:00:00Z' }] }),
      });
      const result = await api.getPresence('/datosnas/stls');
      expect(mockFetch).toHaveBeenCalledWith('/api/presence?path=%2Fdatosnas%2Fstls');
      expect(result.users).toHaveLength(1);
    });
  });

  describe('getPresenceChildren', () => {
    it('should GET presence with children=true', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          path: '/datosnas/stls',
          children: { '/datosnas/stls/proj1': [{ user_id: 5, display_name: 'Alice' }] },
        }),
      });
      const result = await api.getPresenceChildren('/datosnas/stls');
      expect(mockFetch).toHaveBeenCalledWith('/api/presence?path=%2Fdatosnas%2Fstls&children=true');
      expect(result.children['/datosnas/stls/proj1']).toHaveLength(1);
    });
  });

  describe('leavePresence', () => {
    it('should DELETE presence', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      });
      const result = await api.leavePresence();
      expect(mockFetch).toHaveBeenCalledWith('/api/presence', { method: 'DELETE' });
      expect(result.ok).toBe(true);
    });
  });

  describe('getGroup', () => {
    it('should GET group by id with members', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 1, name: 'admins', members: [{ id: 10, display_name: 'Test' }] }),
      });
      const result = await api.getGroup(1);
      expect(mockFetch).toHaveBeenCalledWith('/api/admin/groups?id=1');
      expect(result.name).toBe('admins');
      expect(result.members).toHaveLength(1);
    });
  });

  describe('createGroup', () => {
    it('should POST to admin groups', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 6, name: 'nuevo' }),
      });
      const result = await api.createGroup({ name: 'nuevo', description: 'Desc' });
      expect(mockFetch).toHaveBeenCalledWith('/api/admin/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'nuevo', description: 'Desc' }),
      });
      expect(result.name).toBe('nuevo');
    });
  });

  describe('updateGroup', () => {
    it('should PUT to admin groups', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 1, name: 'updated' }),
      });
      await api.updateGroup({ id: 1, name: 'updated' });
      expect(mockFetch).toHaveBeenCalledWith('/api/admin/groups', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 1, name: 'updated' }),
      });
    });
  });

  describe('deleteGroup', () => {
    it('should DELETE group by id', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ deleted: { id: 1, name: 'old' } }),
      });
      await api.deleteGroup(1);
      expect(mockFetch).toHaveBeenCalledWith('/api/admin/groups', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 1 }),
      });
    });
  });

  describe('addGroupMember', () => {
    it('should POST to admin groups members', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ added: { group_id: 1, user_id: 5 } }),
      });
      await api.addGroupMember(1, 5);
      expect(mockFetch).toHaveBeenCalledWith('/api/admin/groups/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group_id: 1, user_id: 5 }),
      });
    });
  });

  describe('removeGroupMember', () => {
    it('should DELETE group member', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ removed: { group_id: 1, user_id: 5 } }),
      });
      await api.removeGroupMember(1, 5);
      expect(mockFetch).toHaveBeenCalledWith('/api/admin/groups/members', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group_id: 1, user_id: 5 }),
      });
    });
  });
});
