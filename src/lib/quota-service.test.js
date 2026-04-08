import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();
vi.mock('./db.js', () => ({
  query: mockQuery,
}));

const { getQuota, checkQuota, updateUsedBytes } = await import('./quota-service.js');

describe('quota-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getQuota', () => {
    it('should return quota for a user', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          user_id: 10,
          max_bytes: 5368709120,
          used_bytes: 1073741824,
        }],
      });

      const quota = await getQuota(10);
      expect(quota).toEqual({
        userId: 10,
        maxBytes: 5368709120,
        usedBytes: 1073741824,
        availableBytes: 5368709120 - 1073741824,
        percentUsed: expect.any(Number),
      });
      expect(quota.percentUsed).toBeCloseTo(20, 0);
    });

    it('should return null for user without quota', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const quota = await getQuota(999);
      expect(quota).toBeNull();
    });
  });

  describe('checkQuota', () => {
    it('should return allowed when under quota', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          user_id: 10,
          max_bytes: 5368709120,
          used_bytes: 1073741824,
        }],
      });

      const result = await checkQuota(10, 50000000); // 50MB upload
      expect(result.allowed).toBe(true);
    });

    it('should return denied when upload exceeds quota', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          user_id: 10,
          max_bytes: 5368709120, // 5GB
          used_bytes: 5368709100, // almost full
        }],
      });

      const result = await checkQuota(10, 50000000); // 50MB upload
      expect(result.allowed).toBe(false);
      expect(result.availableBytes).toBe(20);
    });

    it('should allow when no quota is set for user', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await checkQuota(10, 50000000);
      expect(result.allowed).toBe(true);
    });
  });

  describe('updateUsedBytes', () => {
    it('should increment used_bytes by the given amount', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ used_bytes: 100000 }] });

      const result = await updateUsedBytes(10, 50000);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE quotas'),
        [50000, 10],
      );
      expect(result).toBe(100000);
    });

    it('should return null when user has no quota row', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await updateUsedBytes(10, 50000);
      expect(result).toBeNull();
    });
  });
});
