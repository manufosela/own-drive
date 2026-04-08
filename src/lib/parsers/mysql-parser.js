/**
 * MySQL/MariaDB dump parser.
 * Extracts CREATE TABLE definitions and INSERT INTO rows line-by-line.
 *
 * @module parsers/mysql-parser
 */

/**
 * @typedef {object} ColumnDef
 * @property {string} name
 * @property {string} type
 * @property {boolean} nullable
 */

/**
 * @typedef {object} TableData
 * @property {string} name
 * @property {ColumnDef[]} columns
 * @property {Array<Array<string|null>>} rows
 */

/**
 * @typedef {object} MysqlParseResult
 * @property {'sql'} format
 * @property {TableData[]} tables
 */

/**
 * Parse a MySQL/MariaDB dump string.
 *
 * @param {string} sql - Dump content
 * @param {object} [options]
 * @param {number} [options.sampleRows] - Limit rows per table (for preview)
 * @returns {MysqlParseResult}
 */
export function parseMysqlDump(sql, options = {}) {
  const { sampleRows } = options;
  /** @type {Map<string, TableData>} */
  const tableMap = new Map();
  /** @type {string[]} insertion order */
  const tableOrder = [];

  const lines = sql.split('\n');

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();

    // Parse CREATE TABLE
    const createMatch = line.match(/^CREATE\s+TABLE\s+`?(\w+)`?\s*\(/i);
    if (createMatch) {
      const tableName = createMatch[1];
      const columns = [];
      i++;
      while (i < lines.length) {
        const colLine = lines[i].trim();
        // End of CREATE TABLE
        if (colLine.startsWith(')')) {
          i++;
          break;
        }
        const colDef = parseColumnLine(colLine);
        if (colDef) columns.push(colDef);
        i++;
      }
      if (!tableMap.has(tableName)) {
        tableMap.set(tableName, { name: tableName, columns, rows: [] });
        tableOrder.push(tableName);
      }
      continue;
    }

    // Parse INSERT INTO
    const insertMatch = line.match(/^INSERT\s+INTO\s+`?(\w+)`?\s*(?:\([^)]*\)\s*)?VALUES\s*/i);
    if (insertMatch) {
      const tableName = insertMatch[1];
      if (!tableMap.has(tableName)) {
        tableMap.set(tableName, { name: tableName, columns: [], rows: [] });
        tableOrder.push(tableName);
      }
      const table = tableMap.get(tableName);
      const valuesStr = line.slice(insertMatch[0].length);
      const rows = parseInsertValues(valuesStr);
      if (sampleRows) {
        const remaining = sampleRows - table.rows.length;
        if (remaining > 0) {
          table.rows.push(...rows.slice(0, remaining));
        }
      } else {
        table.rows.push(...rows);
      }
    }

    i++;
  }

  return {
    format: 'sql',
    tables: tableOrder.map((name) => tableMap.get(name)),
  };
}

/**
 * Parse a column definition line from CREATE TABLE.
 * @param {string} line
 * @returns {ColumnDef|null}
 */
function parseColumnLine(line) {
  // Skip PRIMARY KEY, KEY, INDEX, UNIQUE, CONSTRAINT lines
  if (/^(PRIMARY|KEY|INDEX|UNIQUE|CONSTRAINT|CHECK)\s/i.test(line)) return null;

  const match = line.match(/^`(\w+)`\s+(\w+)/);
  if (!match) return null;

  const name = match[1];
  const type = match[2].toLowerCase();
  const nullable = !line.toUpperCase().includes('NOT NULL');

  return { name, type, nullable };
}

/**
 * Parse the VALUES portion of an INSERT INTO statement.
 * Handles: (1,'text',NULL),(2,'It\'s',3.14)
 *
 * @param {string} valuesStr
 * @returns {Array<Array<string|null>>}
 */
function parseInsertValues(valuesStr) {
  const rows = [];
  let pos = 0;
  const str = valuesStr.trimEnd().replace(/;$/, '');

  while (pos < str.length) {
    // Find opening paren
    while (pos < str.length && str[pos] !== '(') pos++;
    if (pos >= str.length) break;
    pos++; // skip '('

    const row = [];
    while (pos < str.length) {
      // Skip whitespace
      while (pos < str.length && str[pos] === ' ') pos++;

      if (str[pos] === ')') {
        pos++; // skip ')'
        break;
      }

      if (str[pos] === ',') {
        pos++; // separator between values
        continue;
      }

      // NULL
      if (str.slice(pos, pos + 4).toUpperCase() === 'NULL') {
        row.push(null);
        pos += 4;
        continue;
      }

      // Quoted string
      if (str[pos] === "'") {
        pos++; // skip opening quote
        let val = '';
        while (pos < str.length) {
          if (str[pos] === '\\') {
            // Escaped character
            pos++;
            if (pos < str.length) {
              if (str[pos] === "'") val += "'";
              else if (str[pos] === '"') val += '"';
              else if (str[pos] === '\\') val += '\\';
              else if (str[pos] === 'n') val += '\n';
              else if (str[pos] === 'r') val += '\r';
              else if (str[pos] === 't') val += '\t';
              else val += str[pos];
              pos++;
            }
          } else if (str[pos] === "'") {
            pos++; // skip closing quote
            break;
          } else {
            val += str[pos];
            pos++;
          }
        }
        row.push(val);
        continue;
      }

      // Unquoted number or other value
      let val = '';
      while (pos < str.length && str[pos] !== ',' && str[pos] !== ')') {
        val += str[pos];
        pos++;
      }
      row.push(val.trim());
    }

    rows.push(row);
  }

  return rows;
}
