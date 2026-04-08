import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSetPresence = vi.fn();
const mockRemovePresence = vi.fn();
const mockGetPresence = vi.fn();
const mockGetPresenceChildren = vi.fn();

vi.mock('../../lib/presence-store.js', () => ({
  setPresence: (...args) => mockSetPresence(...args),
  removePresence: (...args) => mockRemovePresence(...args),
  getPresence: (...args) => mockGetPresence(...args),
  getPresenceChildren: (...args) => mockGetPresenceChildren(...args),
}));

const { GET, POST, DELETE: DEL } = await import('./presence.js');

function createContext(overrides = {}) {
  return {
    locals: { user: { id: 10, display_name: 'Test User', is_admin: false }, ...overrides.locals },
    request: {
      url: overrides.url || 'http://localhost/api/presence',
      json: overrides.json || (() => Promise.resolve(overrides.body || {})),
    },
  };
}

describe('/api/presence', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('POST — heartbeat', () => {
    it('should return 401 when no user', async () => {
      const res = await POST(createContext({ locals: { user: null } }));
      expect(res.status).toBe(401);
    });

    it('should return 400 when path is missing', async () => {
      const res = await POST(createContext({ body: {} }));
      expect(res.status).toBe(400);
    });

    it('should register presence', async () => {
      const res = await POST(createContext({ body: { path: '/datosnas/stls' } }));
      expect(res.status).toBe(200);
      expect(mockSetPresence).toHaveBeenCalledWith(10, 'Test User', '/datosnas/stls');
    });
  });

  describe('GET — query', () => {
    it('should return 400 when path is missing', async () => {
      const res = await GET(createContext());
      expect(res.status).toBe(400);
    });

    it('should return users in path, excluding requester', async () => {
      mockGetPresence.mockReturnValueOnce([
        { user_id: 5, display_name: 'Alice', since: '2026-02-19T10:00:00Z' },
      ]);

      const res = await GET(createContext({ url: 'http://localhost/api/presence?path=/datosnas/stls' }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.users).toHaveLength(1);
      expect(mockGetPresence).toHaveBeenCalledWith('/datosnas/stls', 10);
    });

    it('should return children grouped by path when children=true', async () => {
      mockGetPresenceChildren.mockReturnValueOnce({
        '/datosnas/stls/proj1': [{ user_id: 5, display_name: 'Alice', since: '2026-02-19T10:00:00Z' }],
      });

      const res = await GET(createContext({ url: 'http://localhost/api/presence?path=/datosnas/stls&children=true' }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.children['/datosnas/stls/proj1']).toHaveLength(1);
      expect(mockGetPresenceChildren).toHaveBeenCalledWith('/datosnas/stls', 10);
    });
  });

  describe('DELETE — leave', () => {
    it('should remove presence', async () => {
      const res = await DEL(createContext());
      expect(res.status).toBe(200);
      expect(mockRemovePresence).toHaveBeenCalledWith(10);
    });
  });
});
