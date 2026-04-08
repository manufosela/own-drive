/**
 * SQL output generator.
 * Reconstructs a MySQL-compatible dump from table definitions + anonymized rows.
 *
 * @module generators/sql-generator
 */

const INSERT_BATCH_SIZE = 100;

/**
 * Generate a MySQL-compatible SQL dump string.
 *
 * @param {Array<{name: string, columns: Array<{name: string, type: string, nullable: boolean}>, rows: Array<Array<string|null>>}>} tables
 * @returns {string}
 */
export function generateSql(tables) {
  const parts = [];

  parts.push('-- Anonymized SQL dump');
  parts.push(`-- Generated: ${new Date().toISOString()}`);
  parts.push('');

  for (const table of tables) {
    // CREATE TABLE
    parts.push(`CREATE TABLE \`${table.name}\` (`);
    const colDefs = table.columns.map((col) => {
      const nullStr = col.nullable ? 'DEFAULT NULL' : 'NOT NULL';
      return `  \`${col.name}\` ${col.type} ${nullStr}`;
    });
    parts.push(colDefs.join(',\n'));
    parts.push(');');
    parts.push('');

    // INSERT INTO (batched)
    if (table.rows.length > 0) {
      for (let i = 0; i < table.rows.length; i += INSERT_BATCH_SIZE) {
        const batch = table.rows.slice(i, i + INSERT_BATCH_SIZE);
        const valuesStr = batch.map((row) => {
          const vals = row.map((v) => formatValue(v));
          return `(${vals.join(',')})`;
        }).join(',');
        parts.push(`INSERT INTO \`${table.name}\` VALUES ${valuesStr};`);
      }
      parts.push('');
    }
  }

  return parts.join('\n');
}

/**
 * Format a single value for SQL output.
 * @param {string|null} value
 * @returns {string}
 */
function formatValue(value) {
  if (value === null || value === undefined) return 'NULL';
  // If it looks numeric, output without quotes
  if (/^-?\d+(\.\d+)?$/.test(value)) return value;
  // Escape single quotes and backslashes
  const escaped = value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  return `'${escaped}'`;
}
