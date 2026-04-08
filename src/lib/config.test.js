import { describe, it, expect } from 'vitest';
import { config } from './config.js';

describe('config', () => {
  it('should export a config object', () => {
    expect(config).toBeDefined();
    expect(typeof config).toBe('object');
  });

  it('should have postgres section with required fields', () => {
    expect(config.postgres).toBeDefined();
    expect(config.postgres.host).toBeDefined();
    expect(config.postgres.port).toBeTypeOf('number');
    expect(config.postgres.database).toBeDefined();
    expect(config.postgres.user).toBeDefined();
  });

  it('should have nas section with mount points array', () => {
    expect(config.nas).toBeDefined();
    expect(config.nas.mountPoints).toBeInstanceOf(Array);
    expect(config.nas.mountPoints.length).toBe(2);
  });

  it('should have auth section', () => {
    expect(config.auth).toBeDefined();
    expect(config.auth.url).toBeDefined();
  });

  it('should have app section', () => {
    expect(config.app).toBeDefined();
    expect(config.app.port).toBeTypeOf('number');
    expect(config.app.publicUrl).toBeDefined();
  });

  it('should use default values when env vars not set', () => {
    expect(config.postgres.port).toBe(5432);
    expect(config.app.port).toBe(3000);
  });
});
