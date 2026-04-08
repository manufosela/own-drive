import { authMiddleware } from './lib/auth-middleware.js';
import { initOnce } from './lib/startup.js';

/** @param {import('astro').MiddlewareContext} context */
/** @param {Function} next */
export async function onRequest(context, next) {
  initOnce().catch(() => {});
  return authMiddleware(context, next);
}
