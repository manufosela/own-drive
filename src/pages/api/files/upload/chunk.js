import { writeChunk } from '../../../../lib/upload-service.js';

/**
 * PUT /api/files/upload/chunk?uploadId=xxx&chunkIndex=N
 *
 * Body: raw binary data (the chunk bytes)
 * Returns: { success, chunkIndex }
 */
export async function PUT(context) {
  const uploadId = context.url.searchParams.get('uploadId');
  const chunkIndexParam = context.url.searchParams.get('chunkIndex');

  if (!uploadId) {
    return new Response(
      JSON.stringify({ error: 'Missing required query param: uploadId' }),
      { status: 400 },
    );
  }

  if (chunkIndexParam == null) {
    return new Response(
      JSON.stringify({ error: 'Missing required query param: chunkIndex' }),
      { status: 400 },
    );
  }

  const chunkIndex = Number(chunkIndexParam);
  if (Number.isNaN(chunkIndex)) {
    return new Response(
      JSON.stringify({ error: 'chunkIndex must be a number' }),
      { status: 400 },
    );
  }

  const arrayBuf = await context.request.arrayBuffer();
  const data = Buffer.from(arrayBuf);

  const userId = context.locals.user.id;
  const result = await writeChunk(userId, uploadId, chunkIndex, data);

  const status = result.success ? 200 : result.status;
  return new Response(JSON.stringify(result), { status });
}
