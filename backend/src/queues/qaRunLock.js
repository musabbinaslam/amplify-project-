const DEFAULT_LOCK_TTL_MS = 12 * 60 * 1000; // 12 min — stuck scans/batches must not block forever

let qaAudioJobRunning = false;
let qaAudioJobLabel = null;
let qaAudioJobAcquiredAt = 0;
let lockTimer = null;

function clearLockTimer() {
  if (lockTimer) {
    clearTimeout(lockTimer);
    lockTimer = null;
  }
}

function armLockTimer(ttlMs) {
  clearLockTimer();
  lockTimer = setTimeout(() => {
    if (!qaAudioJobRunning) return;
    console.warn(
      `[QA] Job lock auto-released after ${Math.round(ttlMs / 1000)}s (was: ${qaAudioJobLabel || 'qa'})`,
    );
    qaAudioJobRunning = false;
    qaAudioJobLabel = null;
    qaAudioJobAcquiredAt = 0;
    lockTimer = null;
  }, ttlMs);
  if (typeof lockTimer.unref === 'function') lockTimer.unref();
}

function isQaAudioJobRunning() {
  if (!qaAudioJobRunning) return false;
  const ttlMs = Number(process.env.QA_JOB_LOCK_TTL_MS) || DEFAULT_LOCK_TTL_MS;
  if (qaAudioJobAcquiredAt > 0 && Date.now() - qaAudioJobAcquiredAt > ttlMs) {
    console.warn(
      `[QA] Stale job lock detected (was: ${qaAudioJobLabel || 'qa'}) — clearing`,
    );
    forceReleaseQaAudioJob('stale');
    return false;
  }
  return true;
}

function tryAcquireQaAudioJob(label = 'qa') {
  if (isQaAudioJobRunning()) return false;
  const ttlMs = Math.max(Number(process.env.QA_JOB_LOCK_TTL_MS) || DEFAULT_LOCK_TTL_MS, 60_000);
  qaAudioJobRunning = true;
  qaAudioJobLabel = label;
  qaAudioJobAcquiredAt = Date.now();
  armLockTimer(ttlMs);
  console.log(`[QA] Job lock acquired (${label})`);
  return true;
}

function releaseQaAudioJob(label = 'qa') {
  if (!qaAudioJobRunning) return;
  clearLockTimer();
  qaAudioJobRunning = false;
  qaAudioJobLabel = null;
  qaAudioJobAcquiredAt = 0;
  console.log(`[QA] Job lock released (${label})`);
}

function forceReleaseQaAudioJob(reason = 'force') {
  clearLockTimer();
  const prev = qaAudioJobLabel;
  qaAudioJobRunning = false;
  qaAudioJobLabel = null;
  qaAudioJobAcquiredAt = 0;
  console.warn(`[QA] Job lock force-released (${reason}${prev ? `, was: ${prev}` : ''})`);
}

function getQaAudioJobLockStatus() {
  return {
    running: isQaAudioJobRunning(),
    label: qaAudioJobLabel,
    acquiredAt: qaAudioJobAcquiredAt || null,
    heldMs: qaAudioJobAcquiredAt ? Date.now() - qaAudioJobAcquiredAt : 0,
  };
}

module.exports = {
  isQaAudioJobRunning,
  tryAcquireQaAudioJob,
  releaseQaAudioJob,
  forceReleaseQaAudioJob,
  getQaAudioJobLockStatus,
};
