/** @param {string} key @param {string} [fallback] @returns {string} */
function env(key, fallback = '') {
  return process.env[key] || fallback;
}

export const config = {
  postgres: {
    host: env('POSTGRES_HOST', 'localhost'),
    port: parseInt(env('POSTGRES_PORT', '5432')),
    database: env('POSTGRES_DB', 'geniova_drive'),
    user: env('POSTGRES_USER', 'geniova'),
    password: env('POSTGRES_PASSWORD'),
  },
  nas: {
    mountPoints: [
      env('NAS_DATOSNAS', '/mnt/datosnas'),
      env('NAS_NOCOMUN', '/mnt/nocomun'),
    ],
  },
  auth: {
    url: env('AUTH_SIGN_URL', 'https://auth.geniova.com'),
    appId: env('AUTH_APP_ID', 'geniova-drive'),
  },
  app: {
    port: parseInt(env('APP_PORT', '3000')),
    publicUrl: env('PUBLIC_URL', 'http://localhost:3000'),
  },
};
