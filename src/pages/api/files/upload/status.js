import { getUploadStatus } from '../../../../lib/upload-service.js';

/**
 * GET /api/files/upload/status?uploadId=xxx
 *
 * Returns: { success, fileName, totalChunks, uploadedChunks, missingChunks }
 */
export async function GET(context) {
  const uploadId = context.url.searchParams.get('uploadId');

  if (!uploadId) {
    return new Response(
      JSON.stringify({ error: 'Missing required query param: uploadId' }),
      { status: 400 },
    );
  }

  const userId = context.locals.user.id;
  const result = await getUploadStatus(userId, uploadId);

  const status = result.success ? 200 : result.status;
  return new Response(JSON.stringify(result), { status });
}
