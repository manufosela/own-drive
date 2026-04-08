import { initUpload } from '../../../../lib/upload-service.js';

/**
 * POST /api/files/upload/init
 *
 * Body: { path, fileName, totalSize, totalChunks }
 * Returns: { success, uploadId, totalChunks }
 */
export async function POST(context) {
  let body;
  try {
    body = await context.request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 });
  }

  const { path: virtualPath, fileName, totalSize, totalChunks } = body;

  if (!virtualPath || !fileName || totalSize == null || totalChunks == null) {
    return new Response(
      JSON.stringify({ error: 'Missing required fields: path, fileName, totalSize, totalChunks' }),
      { status: 400 },
    );
  }

  if (typeof totalSize !== 'number' || totalSize <= 0) {
    return new Response(
      JSON.stringify({ error: 'totalSize must be a positive number' }),
      { status: 400 },
    );
  }

  if (!Number.isInteger(totalChunks) || totalChunks <= 0) {
    return new Response(
      JSON.stringify({ error: 'totalChunks must be a positive integer' }),
      { status: 400 },
    );
  }

  const result = await initUpload(context, virtualPath, fileName, totalSize, totalChunks);

  const status = result.success ? 200 : result.status;
  return new Response(JSON.stringify(result), { status });
}
