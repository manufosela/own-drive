import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readVersion() {
  const pkg = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf-8'));
  return pkg.version;
}

function readChangelog() {
  try {
    return readFileSync(resolve(process.cwd(), 'CHANGELOG.md'), 'utf-8');
  } catch {
    return '# Changelog\n\nNo hay changelog disponible.';
  }
}

/** @type {import('astro').APIRoute} */
export const GET = async () => {
  const version = readVersion();
  const changelog = readChangelog();

  return new Response(JSON.stringify({ version, changelog }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
