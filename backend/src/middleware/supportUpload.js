const multer = require('multer');

const MAX_FILES = 5;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_SIZE_BYTES = 20 * 1024 * 1024;

const ALLOWED_MIME_PREFIXES = ['image/'];
const ALLOWED_MIME_EXACT = new Set([
    'application/pdf',
    'application/zip',
    'application/x-zip-compressed',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/json',
    'text/plain',
    'text/csv',
    'text/log'
]);

function isMimeAllowed(mimetype = '') {
    if (!mimetype) return false;
    if (ALLOWED_MIME_EXACT.has(mimetype)) return true;
    return ALLOWED_MIME_PREFIXES.some((p) => mimetype.startsWith(p));
}

const storage = multer.memoryStorage();

const upload = multer({
    storage,
    limits: {
        fileSize: MAX_FILE_SIZE_BYTES,
        files: MAX_FILES,
        fieldSize: 1024 * 1024
    },
    fileFilter: (_req, file, cb) => {
        if (!isMimeAllowed(file.mimetype)) {
            const err = new Error(`Unsupported file type: ${file.mimetype || 'unknown'}`);
            err.code = 'UNSUPPORTED_FILE_TYPE';
            return cb(err, false);
        }
        cb(null, true);
    }
});

const supportUploadMiddleware = upload.array('attachments', MAX_FILES);

function handleSupportUpload(req, res, next) {
    supportUploadMiddleware(req, res, (err) => {
        if (err) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(413).json({
                    error: `Each attachment must be ${Math.floor(MAX_FILE_SIZE_BYTES / (1024 * 1024))} MB or smaller.`
                });
            }
            if (err.code === 'LIMIT_FILE_COUNT') {
                return res.status(413).json({
                    error: `You can attach up to ${MAX_FILES} files per ticket.`
                });
            }
            if (err.code === 'UNSUPPORTED_FILE_TYPE') {
                return res.status(415).json({ error: err.message });
            }
            console.error('[supportUpload] multer error:', err?.message || err);
            return res.status(400).json({ error: 'Could not read attachments. Please try again.' });
        }

        const files = Array.isArray(req.files) ? req.files : [];
        const totalSize = files.reduce((sum, f) => sum + (f.size || 0), 0);
        if (totalSize > MAX_TOTAL_SIZE_BYTES) {
            return res.status(413).json({
                error: `Total attachment size must be ${Math.floor(MAX_TOTAL_SIZE_BYTES / (1024 * 1024))} MB or less.`
            });
        }

        next();
    });
}

module.exports = {
    handleSupportUpload,
    MAX_FILES,
    MAX_FILE_SIZE_BYTES,
    MAX_TOTAL_SIZE_BYTES
};
