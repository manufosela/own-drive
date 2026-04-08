import { describe, it, expect, vi, beforeEach } from 'vitest';

globalThis.customElements = globalThis.customElements || { define: vi.fn() };

vi.mock('lit', () => {
  class MockLitElement {
    static properties = {};
    static styles = '';
    constructor() {}
    connectedCallback() {}
    requestUpdate() {}
    dispatchEvent() {}
  }
  const html = (strings, ...values) => ({ _$litType$: true, strings, values });
  const css = (strings, ...values) => strings.join('');
  const nothing = Symbol('nothing');
  return { LitElement: MockLitElement, html, css, nothing };
});

const mockGetVersion = vi.fn().mockResolvedValue({
  version: '1.0.0',
  changelog: '# Changelog\n\n## v1.0.0 (2026-02-20)\n\n### Nuevas funcionalidades\n\n- Initial release (abc1234)',
});

vi.mock('../lib/api-client.js', () => ({
  ApiClient: class MockApiClient {
    constructor() {
      this.getVersion = mockGetVersion;
    }
  },
}));

const { GdChangelog } = await import('./gd-changelog.js');

describe('gd-changelog', () => {
  /** @type {InstanceType<typeof GdChangelog>} */
  let el;

  beforeEach(() => {
    vi.clearAllMocks();
    el = new GdChangelog();
  });

  it('should initialize with default values', () => {
    expect(el.open).toBe(false);
    expect(el._version).toBe('');
    expect(el._changelog).toBe('');
    expect(el._loading).toBe(false);
  });

  it('should load version and changelog', async () => {
    await el._load();
    expect(mockGetVersion).toHaveBeenCalledOnce();
    expect(el._version).toBe('1.0.0');
    expect(el._changelog).toContain('# Changelog');
    expect(el._loading).toBe(false);
  });

  it('should handle load error', async () => {
    mockGetVersion.mockRejectedValueOnce(new Error('Network error'));
    await el._load();
    expect(el._changelog).toBe('Error al cargar el changelog.');
    expect(el._loading).toBe(false);
  });

  it('should close and dispatch event', () => {
    el.open = true;
    el.dispatchEvent = vi.fn();
    el._close();
    expect(el.open).toBe(false);
    expect(el.dispatchEvent).toHaveBeenCalledWith(expect.any(CustomEvent));
  });
});
