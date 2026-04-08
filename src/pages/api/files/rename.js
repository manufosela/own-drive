import { renameItem } from '../../../lib/file-operations.js';
import { logAudit, getClientIp } from '../../../lib/audit-logger.js';

/** PUT /api/files/rename  { path: string, newName: string } */
export async function PUT(context) {
  const body = await context.request.json();
  const { path: filePath, newName } = body;

  if (!filePath || !newName) {
    return jsonResponse({ error: 'Fields "path" and "newName" are required' }, 400);
  }

  const result = await renameItem(context, filePath, newName);

  if (!result.success) {
    return jsonResponse({ error: result.error }, result.status);
  }

  logAudit({
    userId: context.locals.user?.id,
    action: 'rename',
    path: filePath,
    targetPath: result.newPath,
    ipAddress: getClientIp(context),
  });

  return jsonResponse({ path: result.newPath });
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
