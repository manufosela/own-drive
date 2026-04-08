import { createDirectory } from '../../../lib/file-operations.js';
import { logAudit, getClientIp } from '../../../lib/audit-logger.js';

/** POST /api/files/mkdir  { path: string } */
export async function POST(context) {
  const body = await context.request.json();
  const { path: dirPath } = body;

  if (!dirPath) {
    return jsonResponse({ error: 'Field "path" is required' }, 400);
  }

  const result = await createDirectory(context, dirPath);

  if (!result.success) {
    return jsonResponse({ error: result.error }, result.status);
  }

  logAudit({
    userId: context.locals.user?.id,
    action: 'mkdir',
    path: result.path,
    ipAddress: getClientIp(context),
  });

  return jsonResponse({ path: result.path }, 201);
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
