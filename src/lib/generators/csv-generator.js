/**
 * CSV output generator.
 * Reconstructs a CSV file from column definitions + anonymized rows.
 * RFC 4180 compliant.
 *
 * @module generators/csv-generator
 */

/**
 * Generate a CSV string from columns and rows.
 *
 * @param {Array<{name: string}>} columns
 * @param {string[][]} rows
 * @param {string} [delimiter=',']
 * @returns {string}
 */
export function generateCsv(columns, rows, delimiter = ',') {
  const lines = [];

  // Header row
  lines.push(columns.map((c) => escapeField(c.name, delimiter)).join(delimiter));

  // Data rows
  for (const row of rows) {
    const fields = row.map((val) => escapeField(val, delimiter));
    lines.push(fields.join(delimiter));
  }

  return lines.join('\n') + '\n';
}

/**
 * Escape a CSV field value according to RFC 4180.
 * @param {string|null} value
 * @param {string} delimiter
 * @returns {string}
 */
function escapeField(value, delimiter) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  // Quote if field contains delimiter, newline, or double quote
  if (str.includes(delimiter) || str.includes('\n') || str.includes('\r') || str.includes('"')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}
