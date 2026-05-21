const multer = require('multer');
const { MAX_PROOF_BYTES, MAX_PROOF_TOTAL_BYTES } = require('../services/contestProofStorage');

const MAX_FILES = 3;

function formatByteLimit(bytes) {
  if (bytes >= 1024 * 1024) {
    const mb = bytes / (1024 * 1024);
    return Number.isInteger(mb) ? `${mb} MB` : `${mb.toFixed(1)} MB`;
  }
  return `${Math.round(bytes / 1024)} KB`;
}

const ALLOWED_MIME_PREFIXES = ['image/'];
const ALLOWED_MIME_EXACT = new Set(['application/pdf']);

function isMimeAllowed(mimetype = '') {
  if (!mimetype) return false;
  if (ALLOWED_MIME_EXACT.has(mimetype)) return true;
  return ALLOWED_MIME_PREFIXES.some((p) => mimetype.startsWith(p));
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_PROOF_BYTES,
    files: MAX_FILES,
    fieldSize: 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    if (!isMimeAllowed(file.mimetype)) {
      const err = new Error(`Unsupported file type: ${file.mimetype || 'unknown'}`);
      err.code = 'UNSUPPORTED_FILE_TYPE';
      return cb(err, false);
    }
    cb(null, true);
  },
});

const contestUploadMiddleware = upload.array('proof', MAX_FILES);

function handleContestUpload(req, res, next) {
  contestUploadMiddleware(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          error: `Each file must be ${formatByteLimit(MAX_PROOF_BYTES)} or smaller.`,
        });
      }
      if (err.code === 'LIMIT_FILE_COUNT') {
        return res.status(413).json({ error: `You can attach up to ${MAX_FILES} files.` });
      }
      if (err.code === 'UNSUPPORTED_FILE_TYPE') {
        return res.status(415).json({ error: err.message });
      }
      console.error('[contestUpload] multer error:', err?.message || err);
      return res.status(400).json({ error: 'Could not read proof files. Please try again.' });
    }

    const files = Array.isArray(req.files) ? req.files : [];
    const totalSize = files.reduce((sum, f) => sum + (f.size || 0), 0);
    if (totalSize > MAX_PROOF_TOTAL_BYTES) {
      return res.status(413).json({
        error: `Total attachment size must be ${formatByteLimit(MAX_PROOF_TOTAL_BYTES)} or less.`,
      });
    }

    next();
  });
}

module.exports = {
  handleContestUpload,
  MAX_FILES,
};
