let qaAudioJobRunning = false;

function isQaAudioJobRunning() {
  return qaAudioJobRunning;
}

function tryAcquireQaAudioJob(label = 'qa') {
  if (qaAudioJobRunning) return false;
  qaAudioJobRunning = true;
  console.log(`[QA] Job lock acquired (${label})`);
  return true;
}

function releaseQaAudioJob(label = 'qa') {
  qaAudioJobRunning = false;
  console.log(`[QA] Job lock released (${label})`);
}

module.exports = {
  isQaAudioJobRunning,
  tryAcquireQaAudioJob,
  releaseQaAudioJob,
};
