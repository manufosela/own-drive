#!/usr/bin/env bash
set -euo pipefail

REMOTE_USER="manu"
REMOTE_HOST="192.168.1.7"
REMOTE_DIR="/home/manu/own-drive"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[deploy]${NC} $*"; }
warn()  { echo -e "${YELLOW}[deploy]${NC} $*"; }
error() { echo -e "${RED}[deploy]${NC} $*" >&2; }

cd "$PROJECT_DIR"

# ── Auto version bump ────────────────────────────────
LAST_TAG=$(git tag -l "v*" --sort=-version:refname | head -1 || echo "")
if [ -n "$LAST_TAG" ]; then
  COMMITS_SINCE=$(git log "${LAST_TAG}..HEAD" --pretty=format:"%s" --no-merges)
else
  COMMITS_SINCE=$(git log --pretty=format:"%s" --no-merges)
fi

BUMP="patch"
if echo "$COMMITS_SINCE" | grep -qE "^feat(\(.+\))?:"; then
  BUMP="minor"
fi

CURRENT_VERSION=$(node -p "require('./package.json').version")
info "Current version: v${CURRENT_VERSION}"
info "Detected bump type: ${BUMP}"

# Bump version (no git tag, we'll tag after changelog)
npm version "$BUMP" --no-git-tag-version > /dev/null
NEW_VERSION=$(node -p "require('./package.json').version")
info "New version: v${NEW_VERSION}"

# ── Generate changelog ───────────────────────────────
info "Generating CHANGELOG.md..."
node scripts/generate-changelog.js

# ── Commit version + changelog ───────────────────────
git add package.json package-lock.json CHANGELOG.md 2>/dev/null || git add package.json CHANGELOG.md
git commit -m "chore: bump version to v${NEW_VERSION}" > /dev/null
git tag "v${NEW_VERSION}"
info "Tagged v${NEW_VERSION}"

# ── Check SSH connectivity ───────────────────────────
info "Checking SSH connection to ${REMOTE_USER}@${REMOTE_HOST}..."
if ! ssh -o ConnectTimeout=5 -o BatchMode=yes "${REMOTE_USER}@${REMOTE_HOST}" "echo ok" > /dev/null 2>&1; then
  error "Cannot connect to ${REMOTE_USER}@${REMOTE_HOST}. Check SSH key and network."
  exit 1
fi

# ── Sync project files ──────────────────────────────
info "Syncing project files to ${REMOTE_HOST}:${REMOTE_DIR}..."
rsync -az --delete \
  --exclude='node_modules/' \
  --exclude='dist/' \
  --exclude='.astro/' \
  --exclude='.env' \
  --exclude='.git/' \
  --exclude='coverage/' \
  --exclude='pgdata/' \
  --exclude='.DS_Store' \
  --exclude='*.log' \
  "${PROJECT_DIR}/" \
  "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/"

# ── Rebuild and restart containers ───────────────────
info "Rebuilding and restarting containers on ${REMOTE_HOST}..."
ssh "${REMOTE_USER}@${REMOTE_HOST}" "cd ${REMOTE_DIR} && docker compose up -d --build"

info "Deploy complete. v${NEW_VERSION} running at http://servidorix:3000"
