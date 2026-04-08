import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn((path) => {
    if (path.includes('package.json')) {
      return JSON.stringify({ version: '1.0.0' });
    }
    if (path.includes('CHANGELOG.md')) {
      return '# Changelog\n\n## v1.0.0\n\n- Initial release';
    }
    throw new Error('File not found');
  }),
}));

const { GET } = await import('./version.js');

describe('GET /api/version', () => {
  it('should return version and changelog', async () => {
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.version).toBe('1.0.0');
    expect(data.changelog).toContain('# Changelog');
  });
});
