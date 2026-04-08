/**
 * CSV parser with delimiter auto-detection and type inference.
 * Compliant with RFC 4180 for quoted fields.
 *
 * @module parsers/csv-parser
 */

/**
 * @typedef {object} CsvColumn
 * @property {string} name
 * @property {'string'|'number'} inferredType
 */

/**
 * @typedef {object} CsvParseResult
 * @property {'csv'} format
 * @property {string} delimiter
 * @property {CsvColumn[]} columns
 * @property {string[][]} rows
 */

/**
 * Parse a CSV string.
 *
 * @param {string} content - Raw CSV content
 * @param {object} [options]
 * @param {number} [options.sampleRows] - Limit rows returned (for preview)
 * @returns {CsvParseResult}
 */
export function parseCsv(content, options = {}) {
  const { sampleRows } = options;

  // Strip BOM
  let text = content;
  if (text.charCodeAt(0) === 0xFEFF) {
    text = text.slice(1);
  }

  // Normalize line endings
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Detect delimiter from first line
  const delimiter = detectDelimiter(text);

  // Parse all rows (including header)
  const allRows = parseRows(text, delimiter);

  // Remove trailing empty row if present
  if (allRows.length > 0) {
    const lastRow = allRows[allRows.length - 1];
    if (lastRow.length === 1 && lastRow[0] === '') {
      allRows.pop();
    }
  }

  if (allRows.length === 0) {
    return { format: 'csv', delimiter, columns: [], rows: [] };
  }

  const headerRow = allRows[0];
  let dataRows = allRows.slice(1);

  // Infer column types from data
  const columns = headerRow.map((name, colIndex) => ({
    name,
    inferredType: inferType(dataRows, colIndex),
  }));

  // Limit sample rows
  if (sampleRows && dataRows.length > sampleRows) {
    dataRows = dataRows.slice(0, sampleRows);
  }

  return { format: 'csv', delimiter, columns, rows: dataRows };
}

/**
 * Detect the most likely delimiter by counting occurrences in the first line.
 * @param {string} text
 * @returns {string}
 */
function detectDelimiter(text) {
  const firstLine = text.split('\n')[0];
  const candidates = [',', ';', '\t', '|'];
  let best = ',';
  let bestCount = 0;

  for (const d of candidates) {
    // Count occurrences outside of quoted fields
    let count = 0;
    let inQuote = false;
    for (const ch of firstLine) {
      if (ch === '"') inQuote = !inQuote;
      else if (ch === d && !inQuote) count++;
    }
    if (count > bestCount) {
      bestCount = count;
      best = d;
    }
  }

  return best;
}

/**
 * Parse CSV text into rows, respecting RFC 4180 quoting.
 * @param {string} text
 * @param {string} delimiter
 * @returns {string[][]}
 */
function parseRows(text, delimiter) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuote = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (inQuote) {
      if (ch === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          // Escaped quote
          field += '"';
          i += 2;
        } else {
          // End of quoted field
          inQuote = false;
          i++;
        }
      } else {
        field += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuote = true;
        i++;
      } else if (ch === delimiter) {
        row.push(field);
        field = '';
        i++;
      } else if (ch === '\n') {
        row.push(field);
        field = '';
        rows.push(row);
        row = [];
        i++;
      } else {
        field += ch;
        i++;
      }
    }
  }

  // Push last field/row
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

/**
 * Infer the type of a column by inspecting its values.
 * @param {string[][]} rows
 * @param {number} colIndex
 * @returns {'string'|'number'}
 */
function inferType(rows, colIndex) {
  const numericPattern = /^-?\d+(\.\d+)?$/;
  let numericCount = 0;
  let total = 0;

  for (const row of rows) {
    const val = row[colIndex];
    if (val === undefined || val === '') continue;
    total++;
    if (numericPattern.test(val)) numericCount++;
  }

  // Consider numeric if > 80% of non-empty values are numeric
  return total > 0 && numericCount / total > 0.8 ? 'number' : 'string';
}
