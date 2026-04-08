import { checkConnection } from '../../lib/db.js';

/** @type {import('astro').APIRoute} */
export const GET = async () => {
  const dbConnected = await checkConnection();

  const status = {
    status: dbConnected ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    services: {
      app: true,
      database: dbConnected,
    },
  };

  return new Response(JSON.stringify(status), {
    status: dbConnected ? 200 : 503,
    headers: { 'Content-Type': 'application/json' },
  });
};
