import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Polyfill customElements for Node environment
globalThis.customElements = globalThis.customElements || { define: vi.fn() };

// Mock lit — LitElement needs a DOM; we only test business logic here.
vi.mock('lit', () => {
  class MockLitElement {
    static properties = {};
    static styles = '';
    constructor() {}
    connectedCallback() {}
    requestUpdate() {}
    updated() {}
    dispatchEvent(e) { this._lastEvent = e; }
  }
  const html = (strings, ...values) => ({ _$litType$: true, strings, values });
  const css = (strings, ...values) => strings.join('');
  const nothing = Symbol('nothing');
  return { LitElement: MockLitElement, html, css, nothing };
});

// Mock ApiClient — must be a real function/class so `new ApiClient()` works
const mockListDirectory = vi.fn();
const mockGetDownloadUrl = vi.fn((p) => `/api/files/download?path=${encodeURIComponent(p)}`);
const mockSendHeartbeat = vi.fn().mockResolvedValue({ ok: true });
const mockGetPresenceChildren = vi.fn().mockResolvedValue({ path: '', children: {} });
const mockLeavePresence = vi.fn().mockResolvedValue({ ok: true });

vi.mock('../lib/api-client.js', () => ({
  ApiClient: class MockApiClient {
    constructor() {
      this.listDirectory = mockListDirectory;
      this.getDownloadUrl = mockGetDownloadUrl;
      this.sendHeartbeat = mockSendHeartbeat;
      this.getPresenceChildren = mockGetPresenceChildren;
      this.leavePresence = mockLeavePresence;
    }
  },
}));

// Import after mocks are set up
const { GdFileExplorer } = await import('./gd-file-explorer.js');

/** @returns {GdFileExplorer} */
function createExplorer() {
  const el = new GdFileExplorer();
  // Provide a working dispatchEvent for navigation tests
  el.dispatchEvent = vi.fn();
  return el;
}

/** Helper directory item */
function dirItem(name, parentPath = '/datosnas') {
  return { name, type: 'directory', size: 0, modified: '2026-01-15T10:00:00Z', path: `${parentPath}/${name}` };
}

/** Helper file item */
function fileItem(name, parentPath = '/datosnas') {
  return { name, type: 'file', size: 1024, modified: '2026-01-20T14:30:00Z', path: `${parentPath}/${name}` };
}

describe('gd-file-explorer tree view', () => {
  /** @type {GdFileExplorer} */
  let el;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    el = createExplorer();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('_toggleExpand', () => {
    it('should expand a collapsed directory and load children', async () => {
      const folder = dirItem('stls');
      mockListDirectory.mockResolvedValueOnce({
        path: '/datosnas/stls',
        items: [fileItem('model.stl', '/datosnas/stls')],
        total: 1,
        page: 1,
        limit: 200,
        pages: 1,
      });

      await el._toggleExpand(folder);

      expect(el._expandedDirs.has('/datosnas/stls')).toBe(true);
      expect(mockListDirectory).toHaveBeenCalledWith('/datosnas/stls', { limit: 200 });
      expect(el._treeChildren.get('/datosnas/stls')).toHaveLength(1);
      expect(el._treeTotals.get('/datosnas/stls')).toBe(1);
    });

    it('should collapse an expanded directory', async () => {
      const folder = dirItem('stls');
      // First expand
      mockListDirectory.mockResolvedValueOnce({
        path: '/datosnas/stls',
        items: [fileItem('model.stl', '/datosnas/stls')],
        total: 1,
        page: 1,
        limit: 200,
        pages: 1,
      });
      await el._toggleExpand(folder);
      expect(el._expandedDirs.has('/datosnas/stls')).toBe(true);

      // Then collapse
      await el._toggleExpand(folder);
      expect(el._expandedDirs.has('/datosnas/stls')).toBe(false);
    });

    it('should set loading state while fetching children', async () => {
      const folder = dirItem('stls');
      let resolveListDir;
      mockListDirectory.mockReturnValueOnce(new Promise((resolve) => {
        resolveListDir = resolve;
      }));

      const expandPromise = el._toggleExpand(folder);

      // While loading
      expect(el._loadingDirs.has('/datosnas/stls')).toBe(true);

      resolveListDir({
        path: '/datosnas/stls',
        items: [],
        total: 0,
        page: 1,
        limit: 200,
        pages: 0,
      });
      await expandPromise;

      // After loading
      expect(el._loadingDirs.has('/datosnas/stls')).toBe(false);
    });

    it('should collapse directory and clear loading on API error', async () => {
      const folder = dirItem('secret');
      mockListDirectory.mockRejectedValueOnce(new Error('Access denied'));

      await el._toggleExpand(folder);

      expect(el._expandedDirs.has('/datosnas/secret')).toBe(false);
      expect(el._loadingDirs.has('/datosnas/secret')).toBe(false);
    });
  });

  describe('caching', () => {
    it('should not fetch children again on second expand', async () => {
      const folder = dirItem('stls');
      mockListDirectory.mockResolvedValueOnce({
        path: '/datosnas/stls',
        items: [fileItem('model.stl', '/datosnas/stls')],
        total: 1,
        page: 1,
        limit: 200,
        pages: 1,
      });

      // Expand
      await el._toggleExpand(folder);
      expect(mockListDirectory).toHaveBeenCalledTimes(1);

      // Collapse
      await el._toggleExpand(folder);

      // Expand again — should use cache
      await el._toggleExpand(folder);
      expect(mockListDirectory).toHaveBeenCalledTimes(1);
      expect(el._expandedDirs.has('/datosnas/stls')).toBe(true);
    });
  });

  describe('treeTotals and "more" indicator', () => {
    it('should track total when more items exist than returned', async () => {
      const folder = dirItem('big-folder');
      const items = Array.from({ length: 200 }, (_, i) =>
        fileItem(`file-${i}.stl`, '/datosnas/big-folder'),
      );

      mockListDirectory.mockResolvedValueOnce({
        path: '/datosnas/big-folder',
        items,
        total: 350,
        page: 1,
        limit: 200,
        pages: 2,
      });

      await el._toggleExpand(folder);

      const children = el._treeChildren.get('/datosnas/big-folder');
      const total = el._treeTotals.get('/datosnas/big-folder');

      expect(children).toHaveLength(200);
      expect(total).toBe(350);
      expect(total > children.length).toBe(true);
    });
  });

  describe('folder name click', () => {
    it('should navigate when clicking folder name', () => {
      el._navigateTo('/datosnas/stls');

      expect(el.dispatchEvent).toHaveBeenCalledTimes(1);
      const event = el.dispatchEvent.mock.calls[0][0];
      expect(event.type).toBe('navigate');
      expect(event.detail.path).toBe('/datosnas/stls');
    });
  });

  describe('_sortItems', () => {
    it('should sort directories before files', () => {
      const items = [
        fileItem('b.txt'),
        dirItem('alpha'),
        fileItem('a.txt'),
        dirItem('beta'),
      ];

      el._sortBy = 'name';
      el._sortDir = 'asc';
      const sorted = el._sortItems(items);

      expect(sorted[0].name).toBe('alpha');
      expect(sorted[1].name).toBe('beta');
      expect(sorted[2].name).toBe('a.txt');
      expect(sorted[3].name).toBe('b.txt');
    });

    it('should sort by name descending', () => {
      const items = [dirItem('alpha'), dirItem('beta')];

      el._sortBy = 'name';
      el._sortDir = 'desc';
      const sorted = el._sortItems(items);

      expect(sorted[0].name).toBe('beta');
      expect(sorted[1].name).toBe('alpha');
    });
  });

  describe('_hasFolders', () => {
    it('should return true when items contain directories', () => {
      el._items = [dirItem('stls'), fileItem('readme.txt')];
      expect(el._hasFolders).toBe(true);
    });

    it('should return false when items contain only files', () => {
      el._items = [fileItem('a.txt'), fileItem('b.txt')];
      expect(el._hasFolders).toBe(false);
    });

    it('should return false when items are empty', () => {
      el._items = [];
      expect(el._hasFolders).toBe(false);
    });
  });

  describe('_allExpanded', () => {
    it('should return true when all directories are expanded', () => {
      el._items = [dirItem('stls'), dirItem('docs'), fileItem('readme.txt')];
      el._expandedDirs = new Set(['/datosnas/stls', '/datosnas/docs']);
      expect(el._allExpanded).toBe(true);
    });

    it('should return false when some directories are collapsed', () => {
      el._items = [dirItem('stls'), dirItem('docs')];
      el._expandedDirs = new Set(['/datosnas/stls']);
      expect(el._allExpanded).toBe(false);
    });

    it('should return false when no directories exist', () => {
      el._items = [fileItem('a.txt')];
      expect(el._allExpanded).toBe(false);
    });
  });

  describe('_expandAll', () => {
    it('should expand all top-level directories', async () => {
      el._items = [dirItem('stls'), dirItem('docs'), fileItem('readme.txt')];

      mockListDirectory.mockResolvedValue({
        path: '',
        items: [fileItem('child.txt', '/datosnas/stls')],
        total: 1,
        page: 1,
        limit: 200,
        pages: 1,
      });

      await el._expandAll();

      expect(el._expandedDirs.has('/datosnas/stls')).toBe(true);
      expect(el._expandedDirs.has('/datosnas/docs')).toBe(true);
      expect(mockListDirectory).toHaveBeenCalledTimes(2);
    });

    it('should not re-fetch already cached directories', async () => {
      el._items = [dirItem('stls'), dirItem('docs')];
      el._treeChildren = new Map([['/datosnas/stls', [fileItem('model.stl', '/datosnas/stls')]]]);
      el._treeTotals = new Map([['/datosnas/stls', 1]]);

      mockListDirectory.mockResolvedValueOnce({
        path: '/datosnas/docs',
        items: [],
        total: 0,
        page: 1,
        limit: 200,
        pages: 0,
      });

      await el._expandAll();

      // Only docs should trigger a fetch, stls is cached
      expect(mockListDirectory).toHaveBeenCalledTimes(1);
      expect(mockListDirectory).toHaveBeenCalledWith('/datosnas/docs', { limit: 200 });
      expect(el._expandedDirs.has('/datosnas/stls')).toBe(true);
      expect(el._expandedDirs.has('/datosnas/docs')).toBe(true);
    });

    it('should do nothing when no directories exist', async () => {
      el._items = [fileItem('a.txt')];
      await el._expandAll();
      expect(el._expandedDirs.size).toBe(0);
      expect(mockListDirectory).not.toHaveBeenCalled();
    });
  });

  describe('_collapseAll', () => {
    it('should collapse all expanded directories', () => {
      el._expandedDirs = new Set(['/datosnas/stls', '/datosnas/docs']);
      el._collapseAll();
      expect(el._expandedDirs.size).toBe(0);
    });

    it('should work when nothing is expanded', () => {
      el._expandedDirs = new Set();
      el._collapseAll();
      expect(el._expandedDirs.size).toBe(0);
    });
  });

  describe('_buildCrumbs — alias context', () => {
    it('should show alias name as root crumb at alias root', () => {
      el.path = '/datosnas/dept/stls';
      el.aliasRoot = '/datosnas/dept/stls';
      el.aliasName = 'Proyectos STL';

      const crumbs = el._buildCrumbs();
      expect(crumbs).toEqual([
        { label: 'Proyectos STL', path: '/datosnas/dept/stls' },
      ]);
    });

    it('should show relative subpath breadcrumbs under alias', () => {
      el.path = '/datosnas/dept/stls/models/2026';
      el.aliasRoot = '/datosnas/dept/stls';
      el.aliasName = 'Proyectos STL';

      const crumbs = el._buildCrumbs();
      expect(crumbs).toEqual([
        { label: 'Proyectos STL', path: '/datosnas/dept/stls' },
        { label: 'models', path: '/datosnas/dept/stls/models' },
        { label: '2026', path: '/datosnas/dept/stls/models/2026' },
      ]);
    });

    it('should fall back to full path segments when no alias', () => {
      el.path = '/datosnas/stls';
      el.aliasRoot = '';
      el.aliasName = '';

      const crumbs = el._buildCrumbs();
      expect(crumbs).toEqual([
        { label: 'datosnas', path: '/datosnas' },
        { label: 'stls', path: '/datosnas/stls' },
      ]);
    });
  });

  describe('_navigateTo — alias guard', () => {
    it('should block navigation above alias root', () => {
      el.aliasRoot = '/datosnas/dept/stls';
      el._navigateTo('/datosnas/dept');

      expect(el.path).toBe('/datosnas/dept/stls');
      expect(el.dispatchEvent).toHaveBeenCalledTimes(1);
      expect(el.dispatchEvent.mock.calls[0][0].detail.path).toBe('/datosnas/dept/stls');
    });

    it('should allow navigation within alias scope', () => {
      el.aliasRoot = '/datosnas/dept/stls';
      el._navigateTo('/datosnas/dept/stls/models');

      expect(el.path).toBe('/datosnas/dept/stls/models');
      expect(el.dispatchEvent.mock.calls[0][0].detail.path).toBe('/datosnas/dept/stls/models');
    });

    it('should allow any navigation when no alias set', () => {
      el.aliasRoot = '';
      el._navigateTo('/no-comun');

      expect(el.path).toBe('/no-comun');
      expect(el.dispatchEvent.mock.calls[0][0].detail.path).toBe('/no-comun');
    });
  });

  describe('state reset on path change', () => {
    it('should clear tree state when path changes', () => {
      // Simulate having some tree state
      el._expandedDirs = new Set(['/datosnas/stls']);
      el._treeChildren = new Map([['/datosnas/stls', [fileItem('model.stl', '/datosnas/stls')]]]);
      el._loadingDirs = new Set();
      el._treeTotals = new Map([['/datosnas/stls', 1]]);

      // Simulate path change via updated()
      const changed = new Map([['path', '/datosnas']]);
      // Mock _loadDirectory to prevent actual API call
      el._loadDirectory = vi.fn();
      el._sendHeartbeat = vi.fn();
      el.updated(changed);

      expect(el._expandedDirs.size).toBe(0);
      expect(el._treeChildren.size).toBe(0);
      expect(el._treeTotals.size).toBe(0);
      expect(el._loadDirectory).toHaveBeenCalled();
    });
  });

  describe('presence badges', () => {
    it('_getPresenceForFolder should aggregate users from child paths', () => {
      el._presenceMap = {
        '/datosnas/stls/proj1': [{ user_id: 1, display_name: 'Alice' }],
        '/datosnas/stls/proj1/sub': [{ user_id: 2, display_name: 'Bob' }],
        '/datosnas/docs/report': [{ user_id: 3, display_name: 'Charlie' }],
      };

      const users = el._getPresenceForFolder('/datosnas/stls/proj1');
      expect(users).toHaveLength(2);
      expect(users.map(u => u.user_id)).toContain(1);
      expect(users.map(u => u.user_id)).toContain(2);
    });

    it('_getPresenceForFolder should return empty for folders without presence', () => {
      el._presenceMap = {
        '/datosnas/docs/report': [{ user_id: 3, display_name: 'Charlie' }],
      };

      expect(el._getPresenceForFolder('/datosnas/stls')).toHaveLength(0);
    });

    it('_getPresenceForFolder should deduplicate users across sub-paths', () => {
      el._presenceMap = {
        '/datosnas/stls/proj1': [{ user_id: 1, display_name: 'Alice' }],
        '/datosnas/stls/proj1/sub': [{ user_id: 1, display_name: 'Alice' }],
      };

      expect(el._getPresenceForFolder('/datosnas/stls/proj1')).toHaveLength(1);
    });

    it('_presenceLabel should show initials for 1-2 users', () => {
      expect(el._presenceLabel([{ display_name: 'Alice Martin' }])).toBe('AM');
      expect(el._presenceLabel([
        { display_name: 'Alice Martin' },
        { display_name: 'Bob Smith' },
      ])).toBe('AM, BS');
    });

    it('_presenceLabel should show count for 3+ users', () => {
      const users = [
        { display_name: 'Alice' },
        { display_name: 'Bob' },
        { display_name: 'Charlie' },
      ];
      expect(el._presenceLabel(users)).toBe('3 usuarios');
    });

    it('_getInitials should extract initials from name', () => {
      expect(el._getInitials('Alice Martin')).toBe('AM');
      expect(el._getInitials('Bob')).toBe('B');
      expect(el._getInitials('Ana María García')).toBe('AM');
    });
  });

  describe('dual STL button visibility', () => {
    it('canDualStl should be true when exactly 2 STL files are selected', () => {
      const stl1 = fileItem('model1.stl');
      const stl2 = fileItem('model2.stl');
      el._items = [stl1, stl2, fileItem('readme.txt')];
      el._selectedPaths = new Set([stl1.path, stl2.path]);

      // Reproduce the logic from _renderActionToolbar
      const count = el._selectedPaths.size;
      const selectedStls = count === 2
        ? el._items.filter(i => el._selectedPaths.has(i.path) && i.name.toLowerCase().endsWith('.stl'))
        : [];
      const canDualStl = selectedStls.length === 2;

      expect(canDualStl).toBe(true);
    });

    it('canDualStl should be false when only 1 STL is selected', () => {
      const stl1 = fileItem('model1.stl');
      el._items = [stl1, fileItem('readme.txt')];
      el._selectedPaths = new Set([stl1.path]);

      const count = el._selectedPaths.size;
      const selectedStls = count === 2
        ? el._items.filter(i => el._selectedPaths.has(i.path) && i.name.toLowerCase().endsWith('.stl'))
        : [];
      expect(selectedStls.length === 2).toBe(false);
    });

    it('canDualStl should be false when 2 files selected but not both STL', () => {
      const stl1 = fileItem('model1.stl');
      const txt = fileItem('readme.txt');
      el._items = [stl1, txt];
      el._selectedPaths = new Set([stl1.path, txt.path]);

      const count = el._selectedPaths.size;
      const selectedStls = count === 2
        ? el._items.filter(i => el._selectedPaths.has(i.path) && i.name.toLowerCase().endsWith('.stl'))
        : [];
      expect(selectedStls.length === 2).toBe(false);
    });

    it('canDualStl should be false when 3 STLs are selected', () => {
      const stl1 = fileItem('a.stl');
      const stl2 = fileItem('b.stl');
      const stl3 = fileItem('c.stl');
      el._items = [stl1, stl2, stl3];
      el._selectedPaths = new Set([stl1.path, stl2.path, stl3.path]);

      const count = el._selectedPaths.size;
      const selectedStls = count === 2
        ? el._items.filter(i => el._selectedPaths.has(i.path) && i.name.toLowerCase().endsWith('.stl'))
        : [];
      expect(selectedStls.length === 2).toBe(false);
    });

    it('canDualStl should handle case-insensitive STL extension', () => {
      const stl1 = fileItem('model1.STL');
      const stl2 = fileItem('model2.Stl');
      el._items = [stl1, stl2];
      el._selectedPaths = new Set([stl1.path, stl2.path]);

      const count = el._selectedPaths.size;
      const selectedStls = count === 2
        ? el._items.filter(i => el._selectedPaths.has(i.path) && i.name.toLowerCase().endsWith('.stl'))
        : [];
      expect(selectedStls.length === 2).toBe(true);
    });
  });

  describe('_openDualStl', () => {
    it('should set dual STL preview state with both files', () => {
      const stl1 = fileItem('model1.stl');
      const stl2 = fileItem('model2.stl');

      el._openDualStl([stl1, stl2]);

      expect(el._stlDualFiles).toEqual([stl1, stl2]);
      expect(el._previewFile).toEqual({
        name: 'model1.stl + model2.stl',
        path: '__dual-stl__',
        type: 'file',
      });
    });
  });

  describe('heartbeat', () => {
    it('_startHeartbeat should send initial heartbeat and set interval', () => {
      el._sendHeartbeat = vi.fn();
      el._startHeartbeat();

      expect(el._sendHeartbeat).toHaveBeenCalledTimes(1);
      expect(el._heartbeatTimer).not.toBeNull();

      vi.advanceTimersByTime(30_000);
      expect(el._sendHeartbeat).toHaveBeenCalledTimes(2);

      el._stopHeartbeat();
    });

    it('_stopHeartbeat should clear interval', () => {
      el._sendHeartbeat = vi.fn();
      el._startHeartbeat();
      expect(el._heartbeatTimer).not.toBeNull();

      el._stopHeartbeat();
      expect(el._heartbeatTimer).toBeNull();

      vi.advanceTimersByTime(60_000);
      expect(el._sendHeartbeat).toHaveBeenCalledTimes(1);
    });
  });
});
