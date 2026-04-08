import { describe, it, expect, vi, beforeEach } from 'vitest';

globalThis.customElements = globalThis.customElements || { define: vi.fn() };

vi.mock('lit', () => {
  class MockLitElement {
    static properties = {};
    static styles = '';
    constructor() {}
    connectedCallback() {}
    requestUpdate() {}
  }
  const html = (strings, ...values) => ({ _$litType$: true, strings, values });
  const css = (strings, ...values) => strings.join('');
  const nothing = Symbol('nothing');
  return { LitElement: MockLitElement, html, css, nothing };
});

const mockGetAuditLog = vi.fn().mockResolvedValue({ entries: [], total: 0, page: 1, pages: 0 });
const mockGetUsers = vi.fn().mockResolvedValue({ users: [] });
const mockGetAdminAliases = vi.fn().mockResolvedValue({ aliases: [] });

vi.mock('../lib/api-client.js', () => ({
  ApiClient: class MockApiClient {
    constructor() {
      this.getAuditLog = mockGetAuditLog;
      this.getUsers = mockGetUsers;
      this.getAdminAliases = mockGetAdminAliases;
    }
  },
}));

const { GdAdminAudit } = await import('./gd-admin-audit.js');

describe('gd-admin-audit', () => {
  /** @type {InstanceType<typeof GdAdminAudit>} */
  let el;

  beforeEach(() => {
    vi.clearAllMocks();
    el = new GdAdminAudit();
  });

  it('should default to today', () => {
    const today = new Date().toISOString().split('T')[0];
    expect(el._day).toBe(today);
  });

  it('should load entries with day filter', async () => {
    await el._loadEntries();
    expect(mockGetAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      from: el._day,
      to: el._day,
    }));
  });

  it('should navigate days', () => {
    const today = el._day;
    el._changeDay(-1);
    expect(el._day).not.toBe(today);
    expect(el._page).toBe(1);
  });

  it('should format path using aliases', async () => {
    el._aliases = [
      { alias_name: 'Produccion', real_path: '/mnt/datosnas/produccion' },
    ];
    expect(el._formatPath('/mnt/datosnas/produccion/archivo.stl')).toBe('Produccion/archivo.stl');
    expect(el._formatPath('/mnt/datosnas/produccion')).toBe('Produccion/');
    expect(el._formatPath('/mnt/other/path')).toBe('/mnt/other/path');
  });

  it('should handle load error', async () => {
    mockGetAuditLog.mockRejectedValueOnce(new Error('DB error'));
    await el._loadEntries();
    expect(el._error).toBe('DB error');
  });
});
