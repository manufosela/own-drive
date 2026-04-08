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

const mockGetUsers = vi.fn().mockResolvedValue({ users: [] });
const mockGetGroups = vi.fn().mockResolvedValue({ groups: [] });
const mockPreRegisterUser = vi.fn().mockResolvedValue({ user: { id: 10, email: 'new@geniova.com' } });

vi.mock('../lib/api-client.js', () => ({
  ApiClient: class MockApiClient {
    constructor() {
      this.getUsers = mockGetUsers;
      this.getGroups = mockGetGroups;
      this.preRegisterUser = mockPreRegisterUser;
    }
  },
}));

const { GdAdminUsers } = await import('./gd-admin-users.js');

describe('gd-admin-users', () => {
  /** @type {InstanceType<typeof GdAdminUsers>} */
  let el;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUsers.mockResolvedValue({
      users: [
        { id: 1, email: 'admin@geniova.com', display_name: 'Admin User', is_admin: true, is_active: true, groups: [{ id: 1, name: 'Produccion' }] },
        { id: 2, email: 'user@geniova.com', display_name: 'Regular User', is_admin: false, is_active: true, groups: [] },
        { id: 3, email: 'inactive@geniova.com', display_name: 'Inactive User', is_admin: false, is_active: false, groups: [] },
      ],
    });
    el = new GdAdminUsers();
  });

  it('should load users on init', async () => {
    await el._loadUsers();
    expect(mockGetUsers).toHaveBeenCalledOnce();
    expect(el._users).toHaveLength(3);
    expect(el._loading).toBe(false);
  });

  it('should handle error on load', async () => {
    mockGetUsers.mockRejectedValueOnce(new Error('Network error'));
    await el._loadUsers();
    expect(el._error).toBe('Network error');
    expect(el._loading).toBe(false);
  });

  it('should render read-only (no create/delete methods)', () => {
    expect(el._loadUsers).toBeDefined();
    expect(el._saveUser).toBeUndefined();
    expect(el._deleteUser).toBeUndefined();
    expect(el._createUser).toBeUndefined();
  });

  it('should include admin and non-admin users', async () => {
    await el._loadUsers();
    const admins = el._users.filter(u => u.is_admin);
    const regulars = el._users.filter(u => !u.is_admin);
    expect(admins).toHaveLength(1);
    expect(regulars).toHaveLength(2);
  });

  describe('_deriveStatus', () => {
    it('should use explicit status field when present', () => {
      expect(el._deriveStatus({ status: 'pending' })).toBe('pending');
      expect(el._deriveStatus({ status: 'active' })).toBe('active');
      expect(el._deriveStatus({ status: 'inactive' })).toBe('inactive');
    });

    it('should fall back to is_active when status is missing', () => {
      expect(el._deriveStatus({ is_active: true })).toBe('active');
      expect(el._deriveStatus({ is_active: false })).toBe('inactive');
    });

    it('should default to active when both status and is_active are missing', () => {
      expect(el._deriveStatus({})).toBe('active');
    });
  });

  describe('pre-register', () => {
    beforeEach(async () => {
      mockGetGroups.mockResolvedValue({
        groups: [
          { id: 1, name: 'Produccion', member_count: 3 },
          { id: 2, name: 'Diseno', member_count: 1 },
        ],
      });
    });

    it('should switch to create mode', () => {
      el._startCreate();
      expect(el._mode).toBe('create');
      expect(el._form.email).toBe('');
      expect(el._form.group_ids).toEqual([]);
    });

    it('should cancel and return to list mode', () => {
      el._startCreate();
      el._cancelForm();
      expect(el._mode).toBe('list');
    });

    it('should call preRegisterUser and reload', async () => {
      el._startCreate();
      el._form = { email: 'test@geniova.com', display_name: 'Test', group_ids: [1] };
      await el._savePreRegister();

      expect(mockPreRegisterUser).toHaveBeenCalledWith({
        email: 'test@geniova.com',
        display_name: 'Test',
        group_ids: [1],
      });
      expect(el._mode).toBe('list');
      expect(el._message).toBeTruthy();
    });

    it('should show error on save failure', async () => {
      mockPreRegisterUser.mockRejectedValueOnce(new Error('Duplicate email'));
      el._startCreate();
      el._form = { email: 'dup@geniova.com', display_name: '', group_ids: [1] };
      await el._savePreRegister();

      expect(el._error).toBe('Duplicate email');
      expect(el._mode).toBe('create');
    });

    it('should reject pre-register without group selected', async () => {
      el._startCreate();
      el._form = { email: 'test@geniova.com', display_name: '', group_ids: [] };
      await el._savePreRegister();

      expect(el._error).toBe('Debes seleccionar al menos un grupo');
      expect(mockPreRegisterUser).not.toHaveBeenCalled();
    });

    it('should reject pre-register with empty email', async () => {
      el._startCreate();
      el._form = { email: '', display_name: '', group_ids: [1] };
      await el._savePreRegister();

      expect(el._error).toBe('Debes introducir un email válido');
      expect(mockPreRegisterUser).not.toHaveBeenCalled();
    });

    it('should reject pre-register with whitespace-only email', async () => {
      el._startCreate();
      el._form = { email: '   ', display_name: '', group_ids: [1] };
      await el._savePreRegister();

      expect(el._error).toBe('Debes introducir un email válido');
      expect(mockPreRegisterUser).not.toHaveBeenCalled();
    });

    it('should reject pre-register with email missing @', async () => {
      el._startCreate();
      el._form = { email: 'notanemail', display_name: '', group_ids: [1] };
      await el._savePreRegister();

      expect(el._error).toBe('Debes introducir un email válido');
      expect(mockPreRegisterUser).not.toHaveBeenCalled();
    });

    it('should show error and stay in list mode when getGroups fails', async () => {
      mockGetGroups.mockRejectedValueOnce(new Error('Network error'));
      await el._startCreate();

      expect(el._mode).toBe('list');
      expect(el._error).toBe('No se pudieron cargar los grupos. Inténtalo de nuevo.');
      expect(el._groups).toEqual([]);
    });

    it('should load groups when entering create mode', async () => {
      await el._startCreate();
      expect(mockGetGroups).toHaveBeenCalledOnce();
      expect(el._groups).toHaveLength(2);
    });

    it('should send trimmed email to the API', async () => {
      el._startCreate();
      el._form = { email: '  user@geniova.com  ', display_name: '', group_ids: [2] };
      await el._savePreRegister();

      expect(mockPreRegisterUser).toHaveBeenCalledWith({
        email: 'user@geniova.com',
        display_name: '',
        group_ids: [2],
      });
    });
  });
});
