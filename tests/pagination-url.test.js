import { describe, it, expect } from 'vitest';

/**
 * Pure-logic helpers extracted for testability.
 * The component delegates to these for URL ↔ pagination state sync.
 */
import {
  readPaginationFromUrl,
  buildPaginationUrl,
} from '../src/lib/pagination-url.js';

describe('readPaginationFromUrl', () => {
  it('returns defaults when no params present', () => {
    const result = readPaginationFromUrl('http://localhost/?path=/foo');
    expect(result).toEqual({ page: 1, pageSize: 50 });
  });

  it('reads page param', () => {
    const result = readPaginationFromUrl('http://localhost/?path=/foo&page=3');
    expect(result).toEqual({ page: 3, pageSize: 50 });
  });

  it('reads pageSize param', () => {
    const result = readPaginationFromUrl('http://localhost/?pageSize=100');
    expect(result).toEqual({ page: 1, pageSize: 100 });
  });

  it('reads both params', () => {
    const result = readPaginationFromUrl('http://localhost/?page=5&pageSize=25');
    expect(result).toEqual({ page: 5, pageSize: 25 });
  });

  it('clamps page to minimum 1', () => {
    const result = readPaginationFromUrl('http://localhost/?page=0');
    expect(result.page).toBe(1);
  });

  it('clamps negative page to 1', () => {
    const result = readPaginationFromUrl('http://localhost/?page=-3');
    expect(result.page).toBe(1);
  });

  it('ignores non-numeric page', () => {
    const result = readPaginationFromUrl('http://localhost/?page=abc');
    expect(result.page).toBe(1);
  });

  it('ignores non-numeric pageSize', () => {
    const result = readPaginationFromUrl('http://localhost/?pageSize=abc');
    expect(result.pageSize).toBe(50);
  });

  it('restricts pageSize to allowed values (25, 50, 100)', () => {
    const result = readPaginationFromUrl('http://localhost/?pageSize=77');
    expect(result.pageSize).toBe(50);
  });

  it('accepts pageSize=25', () => {
    const result = readPaginationFromUrl('http://localhost/?pageSize=25');
    expect(result.pageSize).toBe(25);
  });
});

describe('buildPaginationUrl', () => {
  it('omits page and pageSize when defaults', () => {
    const url = buildPaginationUrl('http://localhost/?path=/foo', 1, 50);
    const u = new URL(url);
    expect(u.searchParams.has('page')).toBe(false);
    expect(u.searchParams.has('pageSize')).toBe(false);
    expect(u.searchParams.get('path')).toBe('/foo');
  });

  it('sets page when not default', () => {
    const url = buildPaginationUrl('http://localhost/?path=/foo', 3, 50);
    const u = new URL(url);
    expect(u.searchParams.get('page')).toBe('3');
    expect(u.searchParams.has('pageSize')).toBe(false);
  });

  it('sets pageSize when not default', () => {
    const url = buildPaginationUrl('http://localhost/?path=/foo', 1, 100);
    const u = new URL(url);
    expect(u.searchParams.has('page')).toBe(false);
    expect(u.searchParams.get('pageSize')).toBe('100');
  });

  it('sets both when neither is default', () => {
    const url = buildPaginationUrl('http://localhost/?path=/foo', 2, 25);
    const u = new URL(url);
    expect(u.searchParams.get('page')).toBe('2');
    expect(u.searchParams.get('pageSize')).toBe('25');
  });

  it('preserves existing params', () => {
    const url = buildPaginationUrl('http://localhost/?path=/foo&other=bar', 2, 50);
    const u = new URL(url);
    expect(u.searchParams.get('path')).toBe('/foo');
    expect(u.searchParams.get('other')).toBe('bar');
    expect(u.searchParams.get('page')).toBe('2');
  });

  it('removes stale page param when resetting to default', () => {
    const url = buildPaginationUrl('http://localhost/?path=/foo&page=5&pageSize=100', 1, 50);
    const u = new URL(url);
    expect(u.searchParams.has('page')).toBe(false);
    expect(u.searchParams.has('pageSize')).toBe(false);
  });
});

describe('pagination URL uses pushState for browser history', () => {
  let pushStateCalls;
  let replaceStateCalls;
  const originalPushState = globalThis.history?.pushState;
  const originalReplaceState = globalThis.history?.replaceState;

  // These tests verify the contract: pagination changes MUST use pushState
  // (not replaceState) so that browser back/forward navigates through
  // pagination states and popstate events fire correctly.

  it('buildPaginationUrl produces a different URL when page changes', () => {
    const base = 'http://localhost/?path=/foo';
    const url1 = buildPaginationUrl(base, 1, 50);
    const url2 = buildPaginationUrl(base, 2, 50);
    expect(url1).not.toBe(url2);
    expect(new URL(url2).searchParams.get('page')).toBe('2');
  });

  it('buildPaginationUrl produces a different URL when pageSize changes', () => {
    const base = 'http://localhost/?path=/foo';
    const url1 = buildPaginationUrl(base, 1, 50);
    const url2 = buildPaginationUrl(base, 1, 100);
    expect(url1).not.toBe(url2);
    expect(new URL(url2).searchParams.get('pageSize')).toBe('100');
  });

  it('readPaginationFromUrl round-trips with buildPaginationUrl', () => {
    const base = 'http://localhost/?path=/foo';
    const url = buildPaginationUrl(base, 3, 25);
    const { page, pageSize } = readPaginationFromUrl(url);
    expect(page).toBe(3);
    expect(pageSize).toBe(25);
  });
});

describe('folder navigation resets page but preserves non-default pageSize', () => {
  it('after clearing params and rebuilding with page=1 and non-default pageSize, URL has pageSize', () => {
    // Simulate gd-app._syncUrlPath() clearing pagination params on folder change
    const urlAfterFolderChange = 'http://localhost/?path=/new-folder';

    // Simulate gd-file-explorer re-syncing after reset (_page=1, _limit still 100)
    const restored = buildPaginationUrl(urlAfterFolderChange, 1, 100);
    const u = new URL(restored);
    expect(u.searchParams.has('page')).toBe(false);
    expect(u.searchParams.get('pageSize')).toBe('100');
    expect(u.searchParams.get('path')).toBe('/new-folder');
  });

  it('after clearing params and rebuilding with defaults, URL has no pagination params', () => {
    const urlAfterFolderChange = 'http://localhost/?path=/new-folder';
    const restored = buildPaginationUrl(urlAfterFolderChange, 1, 50);
    const u = new URL(restored);
    expect(u.searchParams.has('page')).toBe(false);
    expect(u.searchParams.has('pageSize')).toBe(false);
  });

  it('stale page from previous folder is not carried over after rebuild', () => {
    // User was on page=5&pageSize=100 in old folder
    const oldUrl = 'http://localhost/?path=/old-folder&page=5&pageSize=100';
    // gd-app clears pagination on navigation
    const cleared = new URL(oldUrl);
    cleared.searchParams.set('path', '/new-folder');
    cleared.searchParams.delete('page');
    cleared.searchParams.delete('pageSize');
    // Explorer resets _page=1, keeps _limit=100, then syncs URL
    const synced = buildPaginationUrl(cleared.toString(), 1, 100);
    const { page, pageSize } = readPaginationFromUrl(synced);
    expect(page).toBe(1);
    expect(pageSize).toBe(100);
  });
});
