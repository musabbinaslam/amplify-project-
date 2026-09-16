const multer = require('multer');
const {
  MAX_FILE_BYTES,
  MAX_FILES,
  isMimeAllowed,
} = require('../services/supportChatMedia');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_BYTES,
    files: 1,
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

const chatUpload = upload.single('file');

function handleSupportChatUpload(req, res, next) {
  chatUpload(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          error: `Each file must be ${Math.floor(MAX_FILE_BYTES / (1024 * 1024))} MB or smaller.`,
        });
      }
      if (err.code === 'UNSUPPORTED_FILE_TYPE') {
        return res.status(415).json({ error: err.message });
      }
      console.error('[supportChatUpload]', err.message);
      return res.status(400).json({ error: 'Could not read file. Please try again.' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    next();
  });
}

module.exports = {
  handleSupportChatUpload,
  MAX_FILES,
};
