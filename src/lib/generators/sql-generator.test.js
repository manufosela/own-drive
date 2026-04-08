import { describe, it, expect } from 'vitest';
import { generateSql } from './sql-generator.js';

describe('generateSql', () => {
  it('should generate valid SQL with CREATE TABLE and INSERT INTO', () => {
    const table = {
      name: 'users',
      columns: [
        { name: 'id', type: 'int', nullable: false },
        { name: 'name', type: 'varchar', nullable: false },
        { name: 'email', type: 'varchar', nullable: true },
      ],
      rows: [
        ['1', 'Alice', 'alice@example.com'],
        ['2', 'Bob', null],
      ],
    };

    const sql = generateSql([table]);
    expect(sql).toContain('CREATE TABLE `users`');
    expect(sql).toContain('`id` int NOT NULL');
    expect(sql).toContain('`name` varchar NOT NULL');
    expect(sql).toContain('`email` varchar DEFAULT NULL');
    expect(sql).toContain("INSERT INTO `users` VALUES");
    expect(sql).toContain("(1,'Alice','alice@example.com')");
    expect(sql).toContain("(2,'Bob',NULL)");
  });

  it('should handle multiple tables', () => {
    const tables = [
      {
        name: 'a',
        columns: [{ name: 'id', type: 'int', nullable: false }],
        rows: [['1'], ['2']],
      },
      {
        name: 'b',
        columns: [{ name: 'val', type: 'varchar', nullable: true }],
        rows: [['hello']],
      },
    ];

    const sql = generateSql(tables);
    expect(sql).toContain('CREATE TABLE `a`');
    expect(sql).toContain('CREATE TABLE `b`');
    expect(sql).toContain("INSERT INTO `a` VALUES");
    expect(sql).toContain("INSERT INTO `b` VALUES");
  });

  it('should escape single quotes in values', () => {
    const table = {
      name: 't',
      columns: [{ name: 'text', type: 'varchar', nullable: false }],
      rows: [["It's a test"]],
    };

    const sql = generateSql([table]);
    expect(sql).toContain("'It\\'s a test'");
  });

  it('should handle empty rows', () => {
    const table = {
      name: 't',
      columns: [{ name: 'id', type: 'int', nullable: false }],
      rows: [],
    };

    const sql = generateSql([table]);
    expect(sql).toContain('CREATE TABLE `t`');
    expect(sql).not.toContain('INSERT INTO');
  });

  it('should batch INSERT rows (max 100 per statement)', () => {
    const rows = Array.from({ length: 150 }, (_, i) => [String(i)]);
    const table = {
      name: 't',
      columns: [{ name: 'id', type: 'int', nullable: false }],
      rows,
    };

    const sql = generateSql([table]);
    const insertCount = (sql.match(/INSERT INTO/g) || []).length;
    expect(insertCount).toBe(2);
  });
});
