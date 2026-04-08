#!/bin/sh
set -e

echo "[own-drive] Running database migrations..."
node src/db/migrate.js up

echo "[own-drive] Starting server..."
exec node ./dist/server/entry.mjs
