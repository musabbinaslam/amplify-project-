const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BACKEND_ROOT = path.join(__dirname, '../..');

function readReleaseFile(filePath) {
  try {
    const value = fs.readFileSync(filePath, 'utf8').trim();
    return value || null;
  } catch {
    return null;
  }
}

function readGitHead() {
  const candidates = [BACKEND_ROOT, path.join(BACKEND_ROOT, '..')];
  for (const cwd of candidates) {
    try {
      const sha = execSync('git rev-parse HEAD', {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      if (sha) return sha;
    } catch {
      // try next candidate
    }
  }
  return null;
}

/**
 * Git commit SHA for this backend instance.
 * Checks .release in app root and parent (Hostinger nodejs layouts vary).
 */
function getReleaseId() {
  const releaseCandidates = [
    path.join(BACKEND_ROOT, '.release'),
    path.join(BACKEND_ROOT, '..', '.release'),
    process.env.RELEASE_FILE_PATH,
  ].filter(Boolean);

  for (const filePath of releaseCandidates) {
    const fromFile = readReleaseFile(filePath);
    if (fromFile) return fromFile;
  }

  const fromGit = readGitHead();
  if (fromGit) return fromGit;

  const fromEnv =
    process.env.RELEASE_ID ||
    process.env.GIT_COMMIT_SHA ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.HEROKU_SLUG_COMMIT;

  if (fromEnv) return String(fromEnv).trim();

  if (process.env.NODE_ENV !== 'production') {
    return 'dev';
  }

  return 'unknown';
}

const SHA_PATTERN = /^[0-9a-f]{7,40}$/i;

function writeReleaseId(releaseId) {
  const id = String(releaseId || '').trim();
  if (!SHA_PATTERN.test(id)) {
    throw new Error('Invalid release id');
  }
  const releaseFile = path.join(BACKEND_ROOT, '.release');
  fs.writeFileSync(releaseFile, `${id}\n`);
  return id;
}

module.exports = { getReleaseId, writeReleaseId, BACKEND_ROOT };
