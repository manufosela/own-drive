import fs from 'node:fs';
import path from 'node:path';
import { sanitizePath, PathError } from '../../../lib/path-sanitizer.js';
import { requirePermission } from '../../../lib/permission-middleware.js';
import { parseMysqlDump } from '../../../lib/parsers/mysql-parser.js';
import { parseCsv } from '../../../lib/parsers/csv-parser.js';

const DEFAULT_SAMPLE_ROWS = 5;
const MAX_PARSE_SIZE = 500 * 1024 * 1024; // 500MB

/**
 * POST /api/files/parse-data  { path: string, sampleRows?: number }
 *
 * Parses a SQL or CSV file and returns its structure + sample data.
 * Requires read ('r') permission.
 */
export async function POST(context) {
  const body = await context.request.json();
  const { path: filePath, sampleRows = DEFAULT_SAMPLE_ROWS } = body;

  if (!filePath) {
    return jsonResponse({ error: 'Field "path" is required' }, 400);
  }

  let sanitized;
  try {
    sanitized = sanitizePath(filePath);
  } catch (err) {
    if (err instanceof PathError || err.name === 'PathError') {
      return jsonResponse({ error: err.message }, err.statusCode);
    }
    throw err;
  }

  const perm = await requirePermission(context, sanitized.virtualPath, 'r');
  if (!perm.granted) {
    return jsonResponse({ error: 'Access denied' }, perm.status);
  }

  if (!fs.existsSync(sanitized.realPath)) {
    return jsonResponse({ error: 'File not found' }, 404);
  }

  const stat = fs.statSync(sanitized.realPath);
  if (stat.isDirectory()) {
    return jsonResponse({ error: 'Path is a directory, not a file' }, 400);
  }
  if (stat.size > MAX_PARSE_SIZE) {
    return jsonResponse({ error: `File too large (max ${MAX_PARSE_SIZE / 1024 / 1024}MB)` }, 400);
  }

  const ext = path.extname(sanitized.realPath).toLowerCase();
  if (ext !== '.sql' && ext !== '.csv') {
    return jsonResponse({ error: 'Unsupported format. Only .sql and .csv files are supported' }, 400);
  }

  try {
    const content = fs.readFileSync(sanitized.realPath, 'utf-8');
    const options = { sampleRows };

    if (ext === '.sql') {
      const parsed = parseMysqlDump(content, options);
      return jsonResponse({
        format: 'sql',
        tables: parsed.tables.map((t) => ({
          name: t.name,
          columns: t.columns,
          sampleRows: t.rows,
          totalRowsEstimate: countInsertRows(content, t.name),
        })),
      });
    }

    // CSV
    const parsed = parseCsv(content, options);
    const totalLines = content.split('\n').filter((l) => l.trim()).length - 1;
    return jsonResponse({
      format: 'csv',
      delimiter: parsed.delimiter,
      columns: parsed.columns,
      sampleRows: parsed.rows,
      totalRowsEstimate: Math.max(0, totalLines),
    });
  } catch (err) {
    return jsonResponse({ error: `Parse error: ${err.message}` }, 500);
  }
}

/**
 * Estimate total rows for a table by counting tuples in INSERT statements.
 * @param {string} content
 * @param {string} tableName
 * @returns {number}
 */
function countInsertRows(content, tableName) {
  let count = 0;
  const regex = new RegExp(`INSERT\\s+INTO\\s+\`?${tableName}\`?`, 'gi');
  let match;
  while ((match = regex.exec(content)) !== null) {
    const rest = content.slice(match.index + match[0].length);
    const endIdx = rest.indexOf(';');
    const stmt = endIdx >= 0 ? rest.slice(0, endIdx) : rest;
    // Count tuples by counting opening parens after VALUES
    const valuesIdx = stmt.toUpperCase().indexOf('VALUES');
    if (valuesIdx >= 0) {
      const valuesStr = stmt.slice(valuesIdx + 6);
      count += (valuesStr.match(/\(/g) || []).length;
    }
  }
  return count;
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
