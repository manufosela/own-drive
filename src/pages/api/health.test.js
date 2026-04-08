import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCheckConnection = vi.fn();
vi.mock('../../lib/db.js', () => ({
  checkConnection: mockCheckConnection,
}));

const { GET } = await import('./health.js');

describe('GET /api/health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 200 when DB is connected', async () => {
    mockCheckConnection.mockResolvedValueOnce(true);
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('ok');
    expect(body.services.database).toBe(true);
  });

  it('should return 503 when DB is disconnected', async () => {
    mockCheckConnection.mockResolvedValueOnce(false);
    const response = await GET();
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.status).toBe('degraded');
    expect(body.services.database).toBe(false);
  });
});
