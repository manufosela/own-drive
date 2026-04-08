import { describe, it, expect } from 'vitest';
import { anonymize, STRATEGIES } from './anonymizer-engine.js';

describe('anonymize', () => {
  const sampleRows = [
    ['1', 'Alice Smith', 'alice@example.com', '612345678'],
    ['2', 'Bob Jones', 'bob@test.org', '698765432'],
    ['3', 'Charlie Brown', 'charlie@mail.com', '611222333'],
  ];

  const columns = [
    { name: 'id', type: 'int', nullable: false },
    { name: 'name', type: 'varchar', nullable: false },
    { name: 'email', type: 'varchar', nullable: true },
    { name: 'phone', type: 'varchar', nullable: true },
  ];

  it('should return all available strategies', () => {
    expect(STRATEGIES).toContain('fake');
    expect(STRATEGIES).toContain('shuffle');
    expect(STRATEGIES).toContain('mask');
    expect(STRATEGIES).toContain('hash');
    expect(STRATEGIES).toContain('preserve');
  });

  it('should preserve columns marked as preserve', () => {
    const config = [
      { name: 'id', strategy: 'preserve' },
      { name: 'name', strategy: 'fake', fakerType: 'name' },
      { name: 'email', strategy: 'fake', fakerType: 'email' },
      { name: 'phone', strategy: 'preserve' },
    ];
    const result = anonymize(sampleRows, columns, config);
    expect(result).toHaveLength(3);
    // ID and phone should be unchanged
    expect(result[0][0]).toBe('1');
    expect(result[0][3]).toBe('612345678');
    expect(result[1][0]).toBe('2');
    // Name and email should be different
    expect(result[0][1]).not.toBe('Alice Smith');
    expect(result[0][2]).not.toBe('alice@example.com');
  });

  it('should apply fake strategy with name type', () => {
    const config = [
      { name: 'id', strategy: 'preserve' },
      { name: 'name', strategy: 'fake', fakerType: 'name' },
      { name: 'email', strategy: 'preserve' },
      { name: 'phone', strategy: 'preserve' },
    ];
    const result = anonymize(sampleRows, columns, config);
    // Names should be strings and different from originals
    for (let i = 0; i < result.length; i++) {
      expect(typeof result[i][1]).toBe('string');
      expect(result[i][1].length).toBeGreaterThan(0);
    }
  });

  it('should apply fake strategy with email type', () => {
    const config = [
      { name: 'id', strategy: 'preserve' },
      { name: 'name', strategy: 'preserve' },
      { name: 'email', strategy: 'fake', fakerType: 'email' },
      { name: 'phone', strategy: 'preserve' },
    ];
    const result = anonymize(sampleRows, columns, config);
    for (const row of result) {
      expect(row[2]).toContain('@');
    }
  });

  it('should apply shuffle strategy', () => {
    const config = [
      { name: 'id', strategy: 'preserve' },
      { name: 'name', strategy: 'shuffle' },
      { name: 'email', strategy: 'preserve' },
      { name: 'phone', strategy: 'preserve' },
    ];
    const result = anonymize(sampleRows, columns, config);
    // Shuffled names should come from the original set
    const originalNames = new Set(sampleRows.map((r) => r[1]));
    const shuffledNames = result.map((r) => r[1]);
    for (const name of shuffledNames) {
      expect(originalNames.has(name)).toBe(true);
    }
  });

  it('should apply mask strategy', () => {
    const config = [
      { name: 'id', strategy: 'preserve' },
      { name: 'name', strategy: 'mask' },
      { name: 'email', strategy: 'preserve' },
      { name: 'phone', strategy: 'mask' },
    ];
    const result = anonymize(sampleRows, columns, config);
    // Masked values should contain asterisks
    for (const row of result) {
      expect(row[1]).toContain('***');
      expect(row[3]).toContain('***');
    }
    // Mask should preserve some characters
    expect(result[0][1].length).toBeGreaterThan(3);
  });

  it('should apply hash strategy', () => {
    const config = [
      { name: 'id', strategy: 'preserve' },
      { name: 'name', strategy: 'hash' },
      { name: 'email', strategy: 'preserve' },
      { name: 'phone', strategy: 'preserve' },
    ];
    const result = anonymize(sampleRows, columns, config);
    // Hashed values should be hex strings
    for (const row of result) {
      expect(row[1]).toMatch(/^[0-9a-f]+$/);
    }
  });

  it('should maintain hash consistency (same input = same output)', () => {
    const config = [
      { name: 'id', strategy: 'preserve' },
      { name: 'name', strategy: 'hash' },
      { name: 'email', strategy: 'preserve' },
      { name: 'phone', strategy: 'preserve' },
    ];
    const result1 = anonymize(sampleRows, columns, config);
    const result2 = anonymize(sampleRows, columns, config);
    expect(result1[0][1]).toBe(result2[0][1]);
    expect(result1[1][1]).toBe(result2[1][1]);
  });

  it('should handle null values gracefully', () => {
    const rowsWithNull = [
      ['1', 'Alice', null, '612345678'],
      ['2', null, 'bob@test.org', null],
    ];
    const config = [
      { name: 'id', strategy: 'preserve' },
      { name: 'name', strategy: 'fake', fakerType: 'name' },
      { name: 'email', strategy: 'fake', fakerType: 'email' },
      { name: 'phone', strategy: 'mask' },
    ];
    const result = anonymize(rowsWithNull, columns, config);
    expect(result[0][2]).toBeNull();
    expect(result[1][1]).toBeNull();
    expect(result[1][3]).toBeNull();
  });

  it('should maintain referential integrity with consistencyMap', () => {
    const rows1 = [
      ['1', 'Alice'],
      ['2', 'Bob'],
    ];
    const rows2 = [
      ['10', 'Alice'],
      ['20', 'Charlie'],
    ];
    const cols1 = [
      { name: 'id', type: 'int' },
      { name: 'name', type: 'varchar' },
    ];
    const config = [
      { name: 'id', strategy: 'preserve' },
      { name: 'name', strategy: 'fake', fakerType: 'name' },
    ];

    const consistencyMap = new Map();
    const result1 = anonymize(rows1, cols1, config, { consistencyMap });
    const result2 = anonymize(rows2, cols1, config, { consistencyMap });

    // "Alice" should map to same fake value in both tables
    expect(result1[0][1]).toBe(result2[0][1]);
    // "Bob" and "Charlie" should be different
    expect(result1[1][1]).not.toBe(result2[1][1]);
  });

  it('should apply fake strategy with phone type', () => {
    const config = [
      { name: 'id', strategy: 'preserve' },
      { name: 'name', strategy: 'preserve' },
      { name: 'email', strategy: 'preserve' },
      { name: 'phone', strategy: 'fake', fakerType: 'phone' },
    ];
    const result = anonymize(sampleRows, columns, config);
    for (const row of result) {
      expect(typeof row[3]).toBe('string');
      expect(row[3].length).toBeGreaterThan(0);
    }
  });

  it('should apply fake strategy with nif type', () => {
    const rows = [['1', '12345678Z']];
    const cols = [
      { name: 'id', type: 'int' },
      { name: 'nif', type: 'varchar' },
    ];
    const config = [
      { name: 'id', strategy: 'preserve' },
      { name: 'nif', strategy: 'fake', fakerType: 'nif' },
    ];
    const result = anonymize(rows, cols, config);
    // NIF should be 8 digits + 1 letter
    expect(result[0][1]).toMatch(/^\d{8}[A-Z]$/);
  });
});
