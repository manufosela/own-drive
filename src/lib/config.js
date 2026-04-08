/** @param {string} key @param {string} [fallback] @returns {string} */
function env(key, fallback = '') {
  return process.env[key] || fallback;
}

export const config = {
  postgres: {
    host: env('POSTGRES_HOST', 'localhost'),
    port: parseInt(env('POSTGRES_PORT', '5432')),
    database: env('POSTGRES_DB', 'own_drive'),
    user: env('POSTGRES_USER', 'manu'),
    password: env('POSTGRES_PASSWORD'),
  },
  auth: {
    googleClientId: env('GOOGLE_CLIENT_ID'),
    googleClientSecret: env('GOOGLE_CLIENT_SECRET'),
  },
  app: {
    port: parseInt(env('APP_PORT', '3000')),
    publicUrl: env('PUBLIC_URL', 'http://localhost:3000'),
  },
};
