import { getQuota } from '../../lib/quota-service.js';

/**
 * GET /api/quota
 *
 * Returns the current user's disk quota information.
 *
 * @param {object} context
 * @returns {Promise<Response>}
 */
export async function GET(context) {
  const userId = context.locals.user.id;
  const quota = await getQuota(userId);

  if (!quota) {
    return new Response(JSON.stringify({ unlimited: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify(quota), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
