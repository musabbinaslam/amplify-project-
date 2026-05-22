function isFirestoreQuotaError(err) {
  if (!err) return false;
  const code = err.code;
  if (code === 8 || code === 'RESOURCE_EXHAUSTED' || code === 'resource-exhausted') {
    return true;
  }
  return /quota exceeded|resource_exhausted/i.test(String(err.message || ''));
}

/**
 * @returns {boolean} true if a 503 quota response was sent
 */
function respondIfFirestoreQuota(res, err) {
  if (!isFirestoreQuotaError(err)) return false;
  res.status(503).json({
    error:
      'Database is temporarily unavailable due to usage limits. If you recently upgraded billing, wait a few minutes and refresh.',
    code: 'FIRESTORE_QUOTA_EXCEEDED',
  });
  return true;
}

module.exports = { isFirestoreQuotaError, respondIfFirestoreQuota };
