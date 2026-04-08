import { describe, it, expect } from 'vitest';
import { generateCsv } from './csv-generator.js';

describe('generateCsv', () => {
  it('should generate a valid CSV with headers and rows', () => {
    const columns = [
      { name: 'name' },
      { name: 'email' },
      { name: 'age' },
    ];
    const rows = [
      ['Alice', 'alice@example.com', '30'],
      ['Bob', 'bob@test.org', '25'],
    ];

    const csv = generateCsv(columns, rows, ',');
    const lines = csv.split('\n');
    expect(lines[0]).toBe('name,email,age');
    expect(lines[1]).toBe('Alice,alice@example.com,30');
    expect(lines[2]).toBe('Bob,bob@test.org,25');
  });

  it('should use specified delimiter', () => {
    const columns = [{ name: 'a' }, { name: 'b' }];
    const rows = [['1', '2']];

    const csv = generateCsv(columns, rows, ';');
    expect(csv).toContain('a;b');
    expect(csv).toContain('1;2');
  });

  it('should quote fields containing delimiter', () => {
    const columns = [{ name: 'name' }, { name: 'address' }];
    const rows = [['Alice', '123 Main St, Apt 4']];

    const csv = generateCsv(columns, rows, ',');
    expect(csv).toContain('"123 Main St, Apt 4"');
  });

  it('should quote fields containing newlines', () => {
    const columns = [{ name: 'name' }, { name: 'note' }];
    const rows = [['Alice', 'Line 1\nLine 2']];

    const csv = generateCsv(columns, rows, ',');
    expect(csv).toContain('"Line 1\nLine 2"');
  });

  it('should escape double quotes in values', () => {
    const columns = [{ name: 'name' }, { name: 'quote' }];
    const rows = [['Alice', 'She said "hello"']];

    const csv = generateCsv(columns, rows, ',');
    expect(csv).toContain('"She said ""hello"""');
  });

  it('should handle empty values', () => {
    const columns = [{ name: 'a' }, { name: 'b' }, { name: 'c' }];
    const rows = [['1', '', '3']];

    const csv = generateCsv(columns, rows, ',');
    expect(csv).toContain('1,,3');
  });

  it('should handle null values as empty', () => {
    const columns = [{ name: 'a' }, { name: 'b' }];
    const rows = [['1', null]];

    const csv = generateCsv(columns, rows, ',');
    expect(csv).toContain('1,');
  });

  it('should default to comma delimiter', () => {
    const columns = [{ name: 'x' }];
    const rows = [['val']];

    const csv = generateCsv(columns, rows);
    expect(csv).toBe('x\nval\n');
  });
});
