import { completeUpload } from '../../../../lib/upload-service.js';
import { logAudit, getClientIp } from '../../../../lib/audit-logger.js';

/**
 * POST /api/files/upload/complete
 *
 * Body: { uploadId }
 * Returns: { success, path, size }
 */
export async function POST(context) {
  let body;
  try {
    body = await context.request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 });
  }

  const { uploadId } = body;

  if (!uploadId) {
    return new Response(
      JSON.stringify({ error: 'Missing required field: uploadId' }),
      { status: 400 },
    );
  }

  const userId = context.locals.user.id;
  const result = await completeUpload(userId, uploadId);

  if (result.success) {
    logAudit({
      userId,
      action: 'upload',
      path: result.path,
      fileSize: result.size,
      ipAddress: getClientIp(context),
    });
  }

  const status = result.success ? 200 : result.status;
  return new Response(JSON.stringify(result), { status });
}
