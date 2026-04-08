import { describe, it, expect } from 'vitest';
import { parseMysqlDump } from './mysql-parser.js';

describe('parseMysqlDump', () => {
  it('should parse a simple CREATE TABLE + INSERT INTO', () => {
    const sql = `
CREATE TABLE \`users\` (
  \`id\` int(11) NOT NULL AUTO_INCREMENT,
  \`name\` varchar(100) NOT NULL,
  \`email\` varchar(255) DEFAULT NULL,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO \`users\` VALUES (1,'Alice','alice@example.com'),(2,'Bob','bob@test.org');
`;
    const result = parseMysqlDump(sql);
    expect(result.format).toBe('sql');
    expect(result.tables).toHaveLength(1);

    const table = result.tables[0];
    expect(table.name).toBe('users');
    expect(table.columns).toEqual([
      { name: 'id', type: 'int', nullable: false },
      { name: 'name', type: 'varchar', nullable: false },
      { name: 'email', type: 'varchar', nullable: true },
    ]);
    expect(table.rows).toEqual([
      ['1', 'Alice', 'alice@example.com'],
      ['2', 'Bob', 'bob@test.org'],
    ]);
  });

  it('should parse multiple tables', () => {
    const sql = `
CREATE TABLE \`orders\` (
  \`id\` int NOT NULL,
  \`user_id\` int NOT NULL,
  \`amount\` decimal(10,2) DEFAULT NULL
);

CREATE TABLE \`products\` (
  \`id\` int NOT NULL,
  \`name\` varchar(200) NOT NULL
);

INSERT INTO \`orders\` VALUES (1,1,99.50),(2,2,150.00);
INSERT INTO \`products\` VALUES (10,'Widget'),(11,'Gadget');
`;
    const result = parseMysqlDump(sql);
    expect(result.tables).toHaveLength(2);
    expect(result.tables[0].name).toBe('orders');
    expect(result.tables[0].rows).toHaveLength(2);
    expect(result.tables[1].name).toBe('products');
    expect(result.tables[1].rows).toHaveLength(2);
  });

  it('should handle NULL values in INSERT', () => {
    const sql = `
CREATE TABLE \`data\` (
  \`id\` int NOT NULL,
  \`note\` text DEFAULT NULL
);

INSERT INTO \`data\` VALUES (1,NULL),(2,'hello');
`;
    const result = parseMysqlDump(sql);
    expect(result.tables[0].rows).toEqual([
      ['1', null],
      ['2', 'hello'],
    ]);
  });

  it('should handle escaped quotes in values', () => {
    const sql = `
CREATE TABLE \`msgs\` (
  \`id\` int NOT NULL,
  \`text\` varchar(500) NOT NULL
);

INSERT INTO \`msgs\` VALUES (1,'It\\'s a test'),(2,'She said \\"hello\\"');
`;
    const result = parseMysqlDump(sql);
    expect(result.tables[0].rows[0][1]).toBe("It's a test");
    expect(result.tables[0].rows[1][1]).toBe('She said "hello"');
  });

  it('should handle multi-line INSERT statements', () => {
    const sql = `
CREATE TABLE \`items\` (
  \`id\` int NOT NULL,
  \`name\` varchar(100) NOT NULL
);

INSERT INTO \`items\` VALUES (1,'A');
INSERT INTO \`items\` VALUES (2,'B');
INSERT INTO \`items\` VALUES (3,'C');
`;
    const result = parseMysqlDump(sql);
    expect(result.tables[0].rows).toHaveLength(3);
  });

  it('should return sample rows when option is set', () => {
    const sql = `
CREATE TABLE \`big\` (
  \`id\` int NOT NULL,
  \`val\` varchar(50) NOT NULL
);

INSERT INTO \`big\` VALUES (1,'a'),(2,'b'),(3,'c'),(4,'d'),(5,'e'),(6,'f');
`;
    const result = parseMysqlDump(sql, { sampleRows: 3 });
    expect(result.tables[0].rows).toHaveLength(3);
  });

  it('should ignore non-CREATE/INSERT lines (comments, SET, etc)', () => {
    const sql = `
-- MySQL dump 10.13
/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
SET NAMES utf8mb4;

CREATE TABLE \`t\` (
  \`id\` int NOT NULL
);

LOCK TABLES \`t\` WRITE;
INSERT INTO \`t\` VALUES (1),(2);
UNLOCK TABLES;
`;
    const result = parseMysqlDump(sql);
    expect(result.tables).toHaveLength(1);
    expect(result.tables[0].rows).toEqual([['1'], ['2']]);
  });

  it('should handle INSERT with column list', () => {
    const sql = `
CREATE TABLE \`t\` (
  \`a\` int NOT NULL,
  \`b\` varchar(50) DEFAULT NULL
);

INSERT INTO \`t\` (\`a\`, \`b\`) VALUES (1,'x'),(2,'y');
`;
    const result = parseMysqlDump(sql);
    expect(result.tables[0].rows).toEqual([['1', 'x'], ['2', 'y']]);
  });

  it('should detect common column types', () => {
    const sql = `
CREATE TABLE \`typed\` (
  \`a\` bigint(20) NOT NULL,
  \`b\` text NOT NULL,
  \`c\` datetime DEFAULT NULL,
  \`d\` double NOT NULL,
  \`e\` enum('x','y') DEFAULT 'x'
);
`;
    const result = parseMysqlDump(sql);
    const cols = result.tables[0].columns;
    expect(cols[0].type).toBe('bigint');
    expect(cols[1].type).toBe('text');
    expect(cols[2].type).toBe('datetime');
    expect(cols[3].type).toBe('double');
    expect(cols[4].type).toBe('enum');
  });
});
