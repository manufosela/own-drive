import { describe, it, expect, vi, beforeEach } from 'vitest';

globalThis.customElements = globalThis.customElements || { define: vi.fn() };

vi.mock('lit', () => {
  class MockLitElement {
    static properties = {};
    static styles = '';
    constructor() {}
    connectedCallback() {}
    requestUpdate() {}
    renderRoot = { querySelector: vi.fn() };
  }
  const html = (strings, ...values) => ({ _$litType$: true, strings, values });
  const css = (strings, ...values) => strings.join('');
  const nothing = Symbol('nothing');
  return { LitElement: MockLitElement, html, css, nothing };
});

const mockGetGroups = vi.fn().mockResolvedValue({ groups: [] });
const mockGetGroup = vi.fn().mockResolvedValue({ id: 1, name: 'admins', members: [] });
const mockGetUsers = vi.fn().mockResolvedValue({ users: [] });
const mockCreateGroup = vi.fn().mockResolvedValue({ id: 6, name: 'nuevo' });
const mockUpdateGroup = vi.fn().mockResolvedValue({ id: 1, name: 'updated' });
const mockDeleteGroup = vi.fn().mockResolvedValue({ deleted: { id: 1 } });
const mockAddGroupMember = vi.fn().mockResolvedValue({ added: { group_id: 1, user_id: 5 } });
const mockRemoveGroupMember = vi.fn().mockResolvedValue({ removed: { group_id: 1, user_id: 5 } });

vi.mock('../lib/api-client.js', () => ({
  ApiClient: class MockApiClient {
    constructor() {
      this.getGroups = mockGetGroups;
      this.getGroup = mockGetGroup;
      this.getUsers = mockGetUsers;
      this.createGroup = mockCreateGroup;
      this.updateGroup = mockUpdateGroup;
      this.deleteGroup = mockDeleteGroup;
      this.addGroupMember = mockAddGroupMember;
      this.removeGroupMember = mockRemoveGroupMember;
    }
  },
}));

const { GdAdminGroups } = await import('./gd-admin-groups.js');

describe('gd-admin-groups', () => {
  /** @type {InstanceType<typeof GdAdminGroups>} */
  let el;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetGroups.mockResolvedValue({
      groups: [
        { id: 1, name: 'admins', description: 'Admins', member_count: 2 },
        { id: 2, name: 'produccion', description: null, member_count: 0 },
      ],
    });
    mockGetUsers.mockResolvedValue({
      users: [
        { id: 10, email: 'admin@test.com', display_name: 'Admin' },
        { id: 20, email: 'user@test.com', display_name: 'User' },
      ],
    });
    el = new GdAdminGroups();
  });

  describe('_loadData', () => {
    it('should load groups and users', async () => {
      await el._loadData();
      expect(mockGetGroups).toHaveBeenCalledTimes(1);
      expect(mockGetUsers).toHaveBeenCalledTimes(1);
      expect(el._groups).toHaveLength(2);
      expect(el._users).toHaveLength(2);
      expect(el._loading).toBe(false);
    });

    it('should set error on failure', async () => {
      mockGetGroups.mockRejectedValueOnce(new Error('DB error'));
      await el._loadData();
      expect(el._error).toBe('DB error');
      expect(el._loading).toBe(false);
    });
  });

  describe('create group', () => {
    it('should call createGroup and reload', async () => {
      el._startCreate();
      expect(el._mode).toBe('create');

      el._form = { id: 0, name: 'nuevo', description: 'Desc' };
      await el._saveGroup();

      expect(mockCreateGroup).toHaveBeenCalledWith({ name: 'nuevo', description: 'Desc' });
      expect(el._mode).toBe('list');
      expect(el._message).toContain('nuevo');
    });
  });

  describe('edit group', () => {
    it('should populate form and call updateGroup', async () => {
      el._startEdit({ id: 1, name: 'admins', description: 'Admins' });
      expect(el._mode).toBe('edit');
      expect(el._form.id).toBe(1);
      expect(el._form.name).toBe('admins');

      el._form = { ...el._form, name: 'super-admins' };
      await el._saveGroup();

      expect(mockUpdateGroup).toHaveBeenCalledWith({ id: 1, name: 'super-admins', description: 'Admins' });
      expect(el._mode).toBe('list');
    });
  });

  describe('delete group', () => {
    it('should show confirmation and delete on confirm', async () => {
      el._confirmDelete({ id: 2, name: 'family' });
      expect(el._pendingDelete).toEqual({ id: 2, name: 'family' });
      expect(mockDeleteGroup).not.toHaveBeenCalled();

      await el._executeDelete();
      expect(mockDeleteGroup).toHaveBeenCalledWith(2);
      expect(el._message).toContain('family');
      expect(el._pendingDelete).toBeNull();
    });
  });

  describe('members', () => {
    it('should toggle and load members', async () => {
      mockGetGroup.mockResolvedValueOnce({
        id: 1,
        name: 'admins',
        members: [{ id: 10, display_name: 'Admin', email: 'admin@test.com', joined_at: '2026-01-01' }],
      });

      await el._toggleMembers({ id: 1 });
      expect(el._expandedGroup).toBe(1);
      expect(mockGetGroup).toHaveBeenCalledWith(1);
      expect(el._members).toHaveLength(1);

      // Toggle off
      await el._toggleMembers({ id: 1 });
      expect(el._expandedGroup).toBe(null);
    });

    it('should add member', async () => {
      el.renderRoot.querySelector = vi.fn().mockReturnValue({ value: '20' });
      mockGetGroup.mockResolvedValue({ id: 1, members: [{ id: 10 }, { id: 20 }] });

      await el._addMember(1);
      expect(mockAddGroupMember).toHaveBeenCalledWith(1, 20);
      expect(mockGetGroup).toHaveBeenCalledWith(1);
    });

    it('should remove member', async () => {
      mockGetGroup.mockResolvedValue({ id: 1, members: [] });

      await el._removeMember(1, 10);
      expect(mockRemoveGroupMember).toHaveBeenCalledWith(1, 10);
      expect(mockGetGroup).toHaveBeenCalledWith(1);
    });
  });
});
