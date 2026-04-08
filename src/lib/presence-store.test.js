import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setPresence, removePresence, getPresence, getPresenceChildren, clearAll } from './presence-store.js';

describe('presence-store', () => {
  beforeEach(() => {
    clearAll();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should register and retrieve user presence', () => {
    setPresence(1, 'Alice', '/datosnas/stls');
    const users = getPresence('/datosnas/stls');
    expect(users).toHaveLength(1);
    expect(users[0].user_id).toBe(1);
    expect(users[0].display_name).toBe('Alice');
  });

  it('should update path on subsequent heartbeat', () => {
    setPresence(1, 'Alice', '/datosnas/stls');
    setPresence(1, 'Alice', '/datosnas/docs');

    expect(getPresence('/datosnas/stls')).toHaveLength(0);
    expect(getPresence('/datosnas/docs')).toHaveLength(1);
  });

  it('should expire entries after 60 seconds', () => {
    setPresence(1, 'Alice', '/datosnas/stls');
    vi.advanceTimersByTime(61_000);
    expect(getPresence('/datosnas/stls')).toHaveLength(0);
  });

  it('should not expire entries within 60 seconds', () => {
    setPresence(1, 'Alice', '/datosnas/stls');
    vi.advanceTimersByTime(59_000);
    expect(getPresence('/datosnas/stls')).toHaveLength(1);
  });

  it('should exclude a specific user from results', () => {
    setPresence(1, 'Alice', '/datosnas/stls');
    setPresence(2, 'Bob', '/datosnas/stls');
    const users = getPresence('/datosnas/stls', 1);
    expect(users).toHaveLength(1);
    expect(users[0].user_id).toBe(2);
  });

  it('should remove presence explicitly', () => {
    setPresence(1, 'Alice', '/datosnas/stls');
    removePresence(1);
    expect(getPresence('/datosnas/stls')).toHaveLength(0);
  });

  it('should return multiple users in same path', () => {
    setPresence(1, 'Alice', '/datosnas/stls');
    setPresence(2, 'Bob', '/datosnas/stls');
    setPresence(3, 'Charlie', '/datosnas/docs');
    expect(getPresence('/datosnas/stls')).toHaveLength(2);
    expect(getPresence('/datosnas/docs')).toHaveLength(1);
  });

  describe('getPresenceChildren', () => {
    it('should return users grouped by child paths', () => {
      setPresence(1, 'Alice', '/datosnas/stls/project1');
      setPresence(2, 'Bob', '/datosnas/stls/project2');
      setPresence(3, 'Charlie', '/datosnas/docs/reports');

      const result = getPresenceChildren('/datosnas/stls');
      expect(Object.keys(result)).toHaveLength(2);
      expect(result['/datosnas/stls/project1']).toHaveLength(1);
      expect(result['/datosnas/stls/project2']).toHaveLength(1);
    });

    it('should not include the parent path itself', () => {
      setPresence(1, 'Alice', '/datosnas/stls');
      setPresence(2, 'Bob', '/datosnas/stls/sub');

      const result = getPresenceChildren('/datosnas/stls');
      expect(Object.keys(result)).toHaveLength(1);
      expect(result['/datosnas/stls/sub']).toHaveLength(1);
    });

    it('should exclude specified user', () => {
      setPresence(1, 'Alice', '/datosnas/stls/sub');
      setPresence(2, 'Bob', '/datosnas/stls/sub');

      const result = getPresenceChildren('/datosnas/stls', 1);
      expect(result['/datosnas/stls/sub']).toHaveLength(1);
      expect(result['/datosnas/stls/sub'][0].user_id).toBe(2);
    });

    it('should return empty object when no children have presence', () => {
      setPresence(1, 'Alice', '/datosnas/docs');
      const result = getPresenceChildren('/datosnas/stls');
      expect(Object.keys(result)).toHaveLength(0);
    });
  });
});
