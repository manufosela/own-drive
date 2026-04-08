#!/usr/bin/env node
/**
 * Generates CHANGELOG.md from git history using conventional commits.
 * Groups commits by version tags and translates types to Spanish.
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const TYPE_LABELS = {
  feat: 'Nuevas funcionalidades',
  fix: 'Correcciones',
  refactor: 'Mejoras internas',
  perf: 'Rendimiento',
  docs: 'Documentacion',
  test: 'Tests',
  chore: 'Mantenimiento',
};

function git(cmd) {
  return execSync(`git ${cmd}`, { cwd: ROOT, encoding: 'utf-8' }).trim();
}

function getVersionTags() {
  try {
    const tags = git('tag -l "v*" --sort=-version:refname');
    return tags ? tags.split('\n') : [];
  } catch {
    return [];
  }
}

function getCommitsBetween(from, to) {
  const range = from ? `${from}..${to}` : to;
  try {
    const log = git(`log ${range} --pretty=format:"%H|%s|%ai" --no-merges`);
    return log ? log.split('\n').map(line => {
      const [hash, subject, date] = line.split('|');
      return { hash: hash.slice(0, 7), subject, date: date.split(' ')[0] };
    }) : [];
  } catch {
    return [];
  }
}

function parseCommit(subject) {
  const match = subject.match(/^(\w+)(?:\(.+?\))?:\s*(.+)/);
  if (!match) return { type: 'other', message: subject };
  return { type: match[1], message: match[2] };
}

function groupByType(commits) {
  const groups = {};
  for (const c of commits) {
    const { type, message } = parseCommit(c.subject);
    const label = TYPE_LABELS[type];
    if (!label) continue; // skip unlabeled types
    if (!groups[label]) groups[label] = [];
    groups[label].push({ message, hash: c.hash, date: c.date });
  }
  return groups;
}

function getTagDate(tag) {
  try {
    return git(`log -1 --format="%ai" ${tag}`).split(' ')[0];
  } catch {
    return new Date().toISOString().split('T')[0];
  }
}

function generate() {
  const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf-8'));
  const tags = getVersionTags();

  let md = '# Changelog\n\nHistorial de cambios de Geniova Drive.\n\n';

  // Current version (commits since last tag or all commits)
  const currentVersion = pkg.version;
  const latestTag = tags[0];
  const currentCommits = getCommitsBetween(latestTag || '', 'HEAD');

  if (currentCommits.length > 0) {
    const today = new Date().toISOString().split('T')[0];
    md += `## v${currentVersion} (${today})\n\n`;
    const groups = groupByType(currentCommits);
    for (const [label, items] of Object.entries(groups)) {
      md += `### ${label}\n\n`;
      for (const item of items) {
        md += `- ${item.message} (${item.hash})\n`;
      }
      md += '\n';
    }
  }

  // Previous tagged versions
  for (let i = 0; i < tags.length; i++) {
    const tag = tags[i];
    const prevTag = tags[i + 1] || '';
    const version = tag.replace(/^v/, '');
    const date = getTagDate(tag);
    const commits = getCommitsBetween(prevTag, tag);

    if (commits.length === 0) continue;

    md += `## v${version} (${date})\n\n`;
    const groups = groupByType(commits);
    for (const [label, items] of Object.entries(groups)) {
      md += `### ${label}\n\n`;
      for (const item of items) {
        md += `- ${item.message} (${item.hash})\n`;
      }
      md += '\n';
    }
  }

  writeFileSync(resolve(ROOT, 'CHANGELOG.md'), md);
  console.log(`CHANGELOG.md generated for v${currentVersion}`);
}

generate();
