import { describe, it, expect } from 'vitest';
import { parseCsv } from './csv-parser.js';

describe('parseCsv', () => {
  it('should parse a simple comma-delimited CSV', () => {
    const csv = `name,email,age
Alice,alice@example.com,30
Bob,bob@test.org,25`;
    const result = parseCsv(csv);
    expect(result.format).toBe('csv');
    expect(result.columns).toEqual([
      { name: 'name', inferredType: 'string' },
      { name: 'email', inferredType: 'string' },
      { name: 'age', inferredType: 'number' },
    ]);
    expect(result.rows).toEqual([
      ['Alice', 'alice@example.com', '30'],
      ['Bob', 'bob@test.org', '25'],
    ]);
  });

  it('should detect semicolon delimiter', () => {
    const csv = `name;age;city
Alice;30;Madrid
Bob;25;Barcelona`;
    const result = parseCsv(csv);
    expect(result.delimiter).toBe(';');
    expect(result.columns).toHaveLength(3);
    expect(result.rows).toHaveLength(2);
  });

  it('should detect tab delimiter', () => {
    const csv = `name\tage\tcity
Alice\t30\tMadrid`;
    const result = parseCsv(csv);
    expect(result.delimiter).toBe('\t');
    expect(result.rows[0]).toEqual(['Alice', '30', 'Madrid']);
  });

  it('should handle quoted fields with commas', () => {
    const csv = `name,address,city
"Smith, John","123 Main St, Apt 4",Madrid`;
    const result = parseCsv(csv);
    expect(result.rows[0]).toEqual(['Smith, John', '123 Main St, Apt 4', 'Madrid']);
  });

  it('should handle quoted fields with newlines', () => {
    const csv = `name,note
"Alice","Line 1\nLine 2"
"Bob","Simple"`;
    const result = parseCsv(csv);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0][1]).toBe('Line 1\nLine 2');
  });

  it('should handle escaped quotes (double-quote)', () => {
    const csv = `name,quote
"Alice","She said ""hello"""`;
    const result = parseCsv(csv);
    expect(result.rows[0][1]).toBe('She said "hello"');
  });

  it('should handle empty fields', () => {
    const csv = `a,b,c
1,,3
,,`;
    const result = parseCsv(csv);
    expect(result.rows[0]).toEqual(['1', '', '3']);
    expect(result.rows[1]).toEqual(['', '', '']);
  });

  it('should infer number type for numeric columns', () => {
    const csv = `id,amount,name
1,99.50,Alice
2,150,Bob
3,0.5,Charlie`;
    const result = parseCsv(csv);
    expect(result.columns[0].inferredType).toBe('number');
    expect(result.columns[1].inferredType).toBe('number');
    expect(result.columns[2].inferredType).toBe('string');
  });

  it('should return sample rows when option is set', () => {
    const csv = `id,name
1,A
2,B
3,C
4,D
5,E`;
    const result = parseCsv(csv, { sampleRows: 3 });
    expect(result.rows).toHaveLength(3);
  });

  it('should handle Windows line endings (CRLF)', () => {
    const csv = `name,age\r\nAlice,30\r\nBob,25\r\n`;
    const result = parseCsv(csv);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual(['Alice', '30']);
  });

  it('should handle trailing newline', () => {
    const csv = `a,b
1,2
3,4
`;
    const result = parseCsv(csv);
    expect(result.rows).toHaveLength(2);
  });

  it('should handle CSV with BOM', () => {
    const csv = `\uFEFFname,age
Alice,30`;
    const result = parseCsv(csv);
    expect(result.columns[0].name).toBe('name');
  });
});
