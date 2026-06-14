/**
 * Runs before the server starts. Writes backend/.release from RELEASE_ID when set by CI.
 * No-op if .release already exists with the same value.
 */
const fs = require('fs');
const path = require('path');

const BACKEND_ROOT = path.join(__dirname, '..');
const RELEASE_FILE = path.join(BACKEND_ROOT, '.release');
const releaseId = String(process.env.RELEASE_ID || '').trim();

if (!releaseId) {
  process.exit(0);
}

try {
  const current = fs.existsSync(RELEASE_FILE)
    ? fs.readFileSync(RELEASE_FILE, 'utf8').trim()
    : '';
  if (current !== releaseId) {
    fs.writeFileSync(RELEASE_FILE, `${releaseId}\n`);
    console.log(`[release] Wrote RELEASE_ID to .release (${releaseId.slice(0, 7)}…)`);
  }
} catch (err) {
  console.warn('[release] Could not write .release:', err.message);
}
