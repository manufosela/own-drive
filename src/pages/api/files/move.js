import { moveItem } from '../../../lib/file-operations.js';
import { logAudit, getClientIp } from '../../../lib/audit-logger.js';

/** PUT /api/files/move  { source: string, destination: string } */
export async function PUT(context) {
  const body = await context.request.json();
  const { source, destination } = body;

  if (!source || !destination) {
    return jsonResponse({ error: 'Fields "source" and "destination" are required' }, 400);
  }

  const result = await moveItem(context, source, destination);

  if (!result.success) {
    return jsonResponse({ error: result.error }, result.status);
  }

  logAudit({
    userId: context.locals.user?.id,
    action: 'move',
    path: source,
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
