const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BACKEND_ROOT = path.join(__dirname, '../..');
const RELEASE_FILE = path.join(BACKEND_ROOT, '.release');

function readGitHead() {
  try {
    return execSync('git rev-parse HEAD', {
      cwd: BACKEND_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Git commit SHA (or deploy id) for this backend instance.
 * Prefer RELEASE_ID env on Hostinger; otherwise .release file or live git HEAD.
 */
function getReleaseId() {
  const fromEnv =
    process.env.RELEASE_ID ||
    process.env.GIT_COMMIT_SHA ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.HEROKU_SLUG_COMMIT;

  if (fromEnv) return String(fromEnv).trim();

  try {
    const fromFile = fs.readFileSync(RELEASE_FILE, 'utf8').trim();
    if (fromFile) return fromFile;
  } catch {
    // no .release file yet
  }

  const fromGit = readGitHead();
  if (fromGit) return fromGit;

  if (process.env.NODE_ENV !== 'production') {
    return 'dev';
  }

  return 'unknown';
}

module.exports = { getReleaseId };
