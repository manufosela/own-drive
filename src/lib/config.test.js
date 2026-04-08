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

  it('should have storage section with mount points array', () => {
    expect(config.storage).toBeDefined();
    expect(config.storage.mountPoints).toBeInstanceOf(Array);
    expect(config.storage.mountPoints.length).toBe(1);
  });

  it('should have auth section with Google OAuth fields', () => {
    expect(config.auth).toBeDefined();
    expect(config.auth).toHaveProperty('googleClientId');
    expect(config.auth).toHaveProperty('googleClientSecret');
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
