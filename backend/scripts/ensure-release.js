/**
 * Writes backend/.release on deploy (postinstall) and server start.
 * Hostinger: git lives in public_html/.builds/last-source, not nodejs/.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BACKEND_ROOT = path.join(__dirname, '..');
const RELEASE_FILE = path.join(BACKEND_ROOT, '.release');

const GIT_CANDIDATES = [
  BACKEND_ROOT,
  path.join(BACKEND_ROOT, '..'),
  path.join(BACKEND_ROOT, '../public_html/.builds/last-source'),
  path.join(BACKEND_ROOT, '../../public_html/.builds/last-source'),
];

function readGitHead() {
  for (const cwd of GIT_CANDIDATES) {
    try {
      const sha = execSync('git rev-parse HEAD', {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      if (/^[0-9a-f]{7,40}$/i.test(sha)) return sha;
    } catch {
      // try next candidate
    }
  }
  return null;
}

function resolveReleaseId() {
  const fromEnv = [
    process.env.RELEASE_ID,
    process.env.GITHUB_SHA,
    process.env.CI_COMMIT_SHA,
  ]
    .map((v) => String(v || '').trim())
    .find(Boolean);
  if (fromEnv) return fromEnv;
  return readGitHead();
}

function syncReleaseFile() {
  const releaseId = resolveReleaseId();
  if (!releaseId) {
    console.warn('[release] No git SHA or RELEASE_ID — .release not updated');
    return null;
  }

  try {
    const current = fs.existsSync(RELEASE_FILE)
      ? fs.readFileSync(RELEASE_FILE, 'utf8').trim()
      : '';
    if (current !== releaseId) {
      fs.writeFileSync(RELEASE_FILE, `${releaseId}\n`);
      console.log(`[release] Wrote .release (${releaseId.slice(0, 7)}…)`);
    }
    return releaseId;
  } catch (err) {
    console.warn('[release] Could not write .release:', err.message);
    return null;
  }
}

module.exports = { syncReleaseFile };

if (require.main === module) {
  syncReleaseFile();
}
