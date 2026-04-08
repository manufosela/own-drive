import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetQuota = vi.fn();
vi.mock('../../lib/quota-service.js', () => ({
  getQuota: mockGetQuota,
}));

const { GET } = await import('./quota.js');

describe('GET /api/quota', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createContext(user = { id: 10, is_admin: false }) {
    return { locals: { user } };
  }

  it('should return quota for the authenticated user', async () => {
    mockGetQuota.mockResolvedValueOnce({
      userId: 10,
      maxBytes: 5368709120,
      usedBytes: 1073741824,
      availableBytes: 4294967296,
      percentUsed: 20,
    });

    const res = await GET(createContext());
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.maxBytes).toBe(5368709120);
    expect(body.usedBytes).toBe(1073741824);
    expect(body.percentUsed).toBe(20);
  });

  it('should return null/unlimited when user has no quota', async () => {
    mockGetQuota.mockResolvedValueOnce(null);

    const res = await GET(createContext());
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.unlimited).toBe(true);
  });
});
