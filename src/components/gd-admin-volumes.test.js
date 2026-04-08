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

const mockGetVolumes = vi.fn().mockResolvedValue({ volumes: [] });
const mockCreateVolume = vi.fn().mockResolvedValue({ id: 3, name: 'backup' });
const mockUpdateVolume = vi.fn().mockResolvedValue({ id: 1, active: false });
const mockDeleteVolume = vi.fn().mockResolvedValue({ deleted: { id: 3 } });

vi.mock('../lib/api-client.js', () => ({
  ApiClient: class MockApiClient {
    constructor() {
      this.getVolumes = mockGetVolumes;
      this.createVolume = mockCreateVolume;
      this.updateVolume = mockUpdateVolume;
      this.deleteVolume = mockDeleteVolume;
    }
  },
}));

const { GdAdminVolumes } = await import('./gd-admin-volumes.js');

describe('gd-admin-volumes', () => {
  /** @type {InstanceType<typeof GdAdminVolumes>} */
  let el;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetVolumes.mockResolvedValue({
      volumes: [
        { id: 1, name: 'datosnas', mount_path: '/mnt/datosnas', active: true, alias_count: 3 },
        { id: 2, name: 'nocomun', mount_path: '/mnt/nocomun', active: true, alias_count: 1 },
      ],
    });
    el = new GdAdminVolumes();
  });

  it('should load volumes', async () => {
    await el._loadData();
    expect(mockGetVolumes).toHaveBeenCalledOnce();
    expect(el._volumes).toHaveLength(2);
    expect(el._loading).toBe(false);
  });

  it('should create volume and reload', async () => {
    el._startCreate();
    expect(el._mode).toBe('create');

    el._form = { name: 'backup', mount_path: '/mnt/backup' };
    await el._saveVolume();

    expect(mockCreateVolume).toHaveBeenCalledWith({ name: 'backup', mount_path: '/mnt/backup' });
    expect(el._mode).toBe('list');
    expect(el._message).toContain('backup');
  });

  it('should toggle active state', async () => {
    await el._toggleActive({ id: 1, name: 'datosnas', active: true });
    expect(mockUpdateVolume).toHaveBeenCalledWith({ id: 1, active: false });
    expect(el._message).toContain('desactivado');
  });

  it('should delete volume', async () => {
    await el._confirmDelete({ id: 3, name: 'backup' });
    expect(mockDeleteVolume).toHaveBeenCalledWith(3);
    expect(el._message).toContain('eliminado');
  });

  it('should handle error on load', async () => {
    mockGetVolumes.mockRejectedValueOnce(new Error('DB error'));
    await el._loadData();
    expect(el._error).toBe('DB error');
  });
});
