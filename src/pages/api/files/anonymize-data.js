import fs from 'node:fs';
import path from 'node:path';
import { sanitizePath, PathError } from '../../../lib/path-sanitizer.js';
import { requirePermission } from '../../../lib/permission-middleware.js';
import { logAudit, getClientIp } from '../../../lib/audit-logger.js';
import { parseMysqlDump } from '../../../lib/parsers/mysql-parser.js';
import { parseCsv } from '../../../lib/parsers/csv-parser.js';
import { anonymize } from '../../../lib/anonymizer/anonymizer-engine.js';
import { generateSql } from '../../../lib/generators/sql-generator.js';
import { generateCsv } from '../../../lib/generators/csv-generator.js';

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB

/**
 * POST /api/files/anonymize-data
 * Body: {
 *   path: string,
 *   config: Array<{ name: string, strategy: string, fakerType?: string }>,
 *   tableName?: string  // For SQL: which table to anonymize. If omitted, all tables.
 * }
 *
 * Anonymizes a SQL or CSV file and writes the result as {name}_anonymized.{ext}
 * Requires write ('w') permission.
 */
export async function POST(context) {
  const body = await context.request.json();
  const { path: filePath, config, tableName } = body;

  if (!filePath) {
    return jsonResponse({ error: 'Field "path" is required' }, 400);
  }
  if (!config || !Array.isArray(config) || config.length === 0) {
    return jsonResponse({ error: 'Field "config" must be a non-empty array' }, 400);
  }

  let sanitized;
  try {
    sanitized = await sanitizePath(filePath);
  } catch (err) {
    if (err instanceof PathError || err.name === 'PathError') {
      return jsonResponse({ error: err.message }, err.statusCode);
    }
    throw err;
  }

  // Require write permission (creates output file in same directory)
  const parentVirtual = path.posix.dirname(sanitized.virtualPath);
  const perm = await requirePermission(context, parentVirtual, 'w');
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
  if (stat.size > MAX_FILE_SIZE) {
    return jsonResponse({ error: `File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)` }, 400);
  }

  const ext = path.extname(sanitized.realPath).toLowerCase();
  if (ext !== '.sql' && ext !== '.csv') {
    return jsonResponse({ error: 'Unsupported format. Only .sql and .csv files are supported' }, 400);
  }

  try {
    const content = fs.readFileSync(sanitized.realPath, 'utf-8');
    let outputContent;
    let stats;

    if (ext === '.sql') {
      const result = processSql(content, config, tableName);
      outputContent = result.output;
      stats = result.stats;
    } else {
      const result = processCsv(content, config);
      outputContent = result.output;
      stats = result.stats;
    }

    // Write output file
    const baseName = path.basename(sanitized.realPath, ext);
    const outputName = `${baseName}_anonymized${ext}`;
    const outputRealPath = path.join(path.dirname(sanitized.realPath), outputName);
    const outputVirtualPath = `${parentVirtual}/${outputName}`;

    fs.writeFileSync(outputRealPath, outputContent, 'utf-8');

    logAudit({
      userId: context.locals.user?.id,
      action: 'anonymize',
      path: sanitized.virtualPath,
      targetPath: outputVirtualPath,
      ipAddress: getClientIp(context),
      details: { format: ext.slice(1), ...stats },
    });

    return jsonResponse({
      success: true,
      outputPath: outputVirtualPath,
      stats,
    });
  } catch (err) {
    return jsonResponse({ error: `Anonymization error: ${err.message}` }, 500);
  }
}

/**
 * Process and anonymize a SQL file.
 */
function processSql(content, config, tableName) {
  const parsed = parseMysqlDump(content);
  const consistencyMap = new Map();
  let rowsProcessed = 0;
  let columnsAnonymized = 0;

  const tables = parsed.tables.map((table) => {
    // If tableName specified, only anonymize that table
    if (tableName && table.name !== tableName) {
      rowsProcessed += table.rows.length;
      return table;
    }

    const tableConfig = config.filter((c) =>
      table.columns.some((col) => col.name === c.name)
    );
    const activeConfig = tableConfig.filter((c) => c.strategy !== 'preserve');
    columnsAnonymized += activeConfig.length;

    const anonymizedRows = anonymize(table.rows, table.columns, tableConfig, { consistencyMap });
    rowsProcessed += anonymizedRows.length;

    return { ...table, rows: anonymizedRows };
  });

  return {
    output: generateSql(tables),
    stats: { rowsProcessed, columnsAnonymized, tablesProcessed: tables.length },
  };
}

/**
 * Process and anonymize a CSV file.
 */
function processCsv(content, config) {
  const parsed = parseCsv(content);
  const columns = parsed.columns.map((c) => ({ ...c, type: c.inferredType }));
  const anonymizedRows = anonymize(parsed.rows, columns, config);

  const activeConfig = config.filter((c) => c.strategy !== 'preserve');

  return {
    output: generateCsv(parsed.columns, anonymizedRows, parsed.delimiter),
    stats: {
      rowsProcessed: anonymizedRows.length,
      columnsAnonymized: activeConfig.length,
    },
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
