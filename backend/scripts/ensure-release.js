/**
 * Writes backend/.release on server start (Hostinger runs src/server.js directly, not npm start).
 * Uses RELEASE_ID env if set, otherwise git HEAD — same logic as record-release.sh.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BACKEND_ROOT = path.join(__dirname, '..');
const RELEASE_FILE = path.join(BACKEND_ROOT, '.release');

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

function resolveReleaseId() {
  const fromEnv = String(process.env.RELEASE_ID || '').trim();
  if (fromEnv) return fromEnv;
  return readGitHead();
}

function syncReleaseFile() {
  const releaseId = resolveReleaseId();
  if (!releaseId) return null;

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
