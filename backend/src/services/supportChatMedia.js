const crypto = require('crypto');
const path = require('path');
const admin = require('../config/firebaseAdmin');
const { getDb } = require('../config/firestoreDb');

const STORAGE_PREFIX = 'support-chat';
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 5;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
const MAX_VOICE_MS = 5 * 60 * 1000;

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
  'text/log',
  'audio/webm',
  'audio/mp4',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/x-wav',
  'audio/mp4a-latm',
]);

function isMimeAllowed(mimetype = '') {
  const mime = String(mimetype || '').toLowerCase();
  if (!mime) return false;
  if (mime.startsWith('image/')) return true;
  if (ALLOWED_MIME_EXACT.has(mime)) return true;
  if (mime.startsWith('audio/webm') || mime.startsWith('audio/mp4')) return true;
  return false;
}

function kindFromMime(mimetype = '') {
  const mime = String(mimetype || '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  return 'file';
}

function safeFilename(name = 'file') {
  return String(name).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'file';
}

function mediaApiPath(conversationId, mediaId) {
  return `/api/support/conversations/${encodeURIComponent(conversationId)}/media/${encodeURIComponent(mediaId)}`;
}

function storageObjectPath(conversationId, mediaId, filename) {
  return `${STORAGE_PREFIX}/${conversationId}/${mediaId}/${safeFilename(filename)}`;
}

function getBucket() {
  if (!admin) return null;
  try {
    return admin.storage().bucket();
  } catch (err) {
    console.error('[supportChatMedia] Storage bucket unavailable:', err.message);
    return null;
  }
}

function mapStorageError(err) {
  if (err?.code === 404) {
    return Object.assign(
      new Error(
        'Firebase Storage bucket is missing or not enabled. Set FIREBASE_STORAGE_BUCKET in backend/.env and enable Storage in Firebase Console.',
      ),
      { status: 503, code: 'STORAGE_UNAVAILABLE' },
    );
  }
  return err;
}

function serializeMedia(conversationId, mediaId, data = {}) {
  const base = mediaApiPath(conversationId, mediaId);
  const hasThumb = Boolean(data.thumbPath);
  return {
    id: mediaId,
    name: data.name || 'file',
    mimeType: data.mimeType || 'application/octet-stream',
    size: Number(data.size || 0),
    kind: data.kind || kindFromMime(data.mimeType),
    durationMs: data.durationMs ? Number(data.durationMs) : null,
    url: base,
    thumbUrl: hasThumb ? `${base}?variant=thumb` : base,
    hasThumb,
  };
}

function mediaCol(conversationId) {
  return getDb().collection('supportConversations').doc(String(conversationId)).collection('media');
}

async function saveMedia(conversationId, file, { durationMs } = {}) {
  if (!admin) throw Object.assign(new Error('Database unavailable'), { status: 503 });
  const bucket = getBucket();
  if (!bucket) {
    throw Object.assign(new Error('Firebase Storage is not configured'), { status: 503, code: 'STORAGE_UNAVAILABLE' });
  }
  const mimeType = file.mimetype || 'application/octet-stream';
  if (!isMimeAllowed(mimeType)) {
    throw Object.assign(new Error(`Unsupported file type: ${mimeType}`), { status: 415 });
  }
  const size = file.buffer?.length || file.size || 0;
  if (size > MAX_FILE_BYTES) {
    throw Object.assign(
      new Error(`Each file must be ${Math.floor(MAX_FILE_BYTES / (1024 * 1024))} MB or smaller.`),
      { status: 413 },
    );
  }
  const kind = kindFromMime(mimeType);
  let duration = Number(durationMs) || 0;
  if (kind === 'audio' && duration > MAX_VOICE_MS) {
    throw Object.assign(new Error('Voice notes can be up to 5 minutes.'), { status: 413 });
  }
  if (kind !== 'audio') duration = 0;

  const mediaId = crypto.randomUUID();
  const name = file.originalname || `${mediaId}${path.extname(file.originalname || '') || ''}`;
  const storagePath = storageObjectPath(conversationId, mediaId, name);
  let thumbPath = null;

  try {
    const writes = [
      bucket.file(storagePath).save(file.buffer, {
        resumable: false,
        metadata: {
          contentType: mimeType,
          metadata: {
            conversationId: String(conversationId),
            mediaId,
            originalName: name,
          },
        },
      }),
    ];

    if (kind === 'image' && file.buffer?.length) {
      try {
        const sharp = require('sharp');
        const thumbBuf = await sharp(file.buffer)
          .rotate()
          .resize(480, 480, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 58, progressive: true, mozjpeg: true })
          .toBuffer();
        thumbPath = storageObjectPath(conversationId, mediaId, 'thumb.jpg');
        writes.push(bucket.file(thumbPath).save(thumbBuf, {
          resumable: false,
          metadata: {
            contentType: 'image/jpeg',
            metadata: {
              conversationId: String(conversationId),
              mediaId,
              variant: 'thumb',
            },
          },
        }));
      } catch (thumbErr) {
        console.warn('[supportChatMedia] thumb generate failed:', thumbErr.message);
        thumbPath = null;
      }
    }

    await Promise.all(writes);
  } catch (err) {
    console.error('[supportChatMedia] upload failed:', err.message);
    throw mapStorageError(err);
  }

  const record = {
    name,
    mimeType,
    size,
    kind,
    storagePath,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    ...(thumbPath ? { thumbPath } : {}),
    ...(duration ? { durationMs: duration } : {}),
  };
  await mediaCol(conversationId).doc(mediaId).set(record);
  return serializeMedia(conversationId, mediaId, record);
}

async function getMediaRecord(conversationId, mediaId) {
  const snap = await mediaCol(conversationId).doc(String(mediaId)).get();
  if (!snap.exists) {
    throw Object.assign(new Error('Media not found'), { status: 404 });
  }
  return { id: snap.id, ...snap.data() };
}

async function readMediaBuffer(conversationId, mediaId, { variant } = {}) {
  const meta = await getMediaRecord(conversationId, mediaId);
  const bucket = getBucket();
  const wantThumb = String(variant || '') === 'thumb';
  const storagePath = wantThumb && meta.thumbPath ? meta.thumbPath : meta.storagePath;
  if (!bucket || !storagePath) {
    throw Object.assign(new Error('Media not found'), { status: 404 });
  }
  try {
    const [buffer] = await bucket.file(storagePath).download();
    const mimeType = wantThumb && meta.thumbPath
      ? 'image/jpeg'
      : (meta.mimeType || 'application/octet-stream');
    const name = wantThumb && meta.thumbPath
      ? `thumb-${meta.name || mediaId}.jpg`
      : (meta.name || mediaId);
    return {
      buffer,
      mimeType,
      name,
      size: buffer.length,
      etag: `"${mediaId}-${wantThumb ? 't' : 'f'}-${meta.size || buffer.length}"`,
    };
  } catch (err) {
    if (err?.code === 404) {
      throw Object.assign(new Error('Media not found'), { status: 404 });
    }
    throw mapStorageError(err);
  }
}

async function resolveAttachments(conversationId, raw = []) {
  if (!Array.isArray(raw) || !raw.length) return [];
  const ids = raw
    .map((item) => String(item?.id || item || '').trim())
    .filter(Boolean)
    .slice(0, MAX_FILES);
  const unique = [...new Set(ids)];
  const snaps = await Promise.all(unique.map((id) => mediaCol(conversationId).doc(id).get()));
  const out = [];
  snaps.forEach((snap) => {
    if (!snap.exists) return;
    out.push(serializeMedia(conversationId, snap.id, snap.data()));
  });
  if (raw.length && !out.length) {
    throw Object.assign(new Error('Attachments were not found. Upload them again.'), { status: 400 });
  }
  return out;
}

function inferMessageType(attachments = [], text = '') {
  if (!attachments.length) return 'text';
  const kinds = new Set(attachments.map((a) => a.kind));
  if (kinds.size === 1 && kinds.has('audio') && !String(text || '').trim()) return 'audio';
  if (kinds.size === 1 && kinds.has('image')) return 'image';
  if (kinds.has('file') || kinds.size > 1) return 'file';
  if (kinds.has('audio')) return 'audio';
  return 'image';
}

function previewForMessage(text, attachments = [], type = 'text') {
  const caption = String(text || '').replace(/\s+/g, ' ').trim();
  if (caption) return caption.length > 140 ? `${caption.slice(0, 137)}…` : caption;
  if (type === 'audio' || attachments.some((a) => a.kind === 'audio')) return 'Voice message';
  if (type === 'image' || attachments.some((a) => a.kind === 'image')) return 'Photo';
  const file = attachments[0];
  return file?.name || 'Attachment';
}

function sendMediaResponse(req, res, { buffer, mimeType, name, etag }) {
  const size = buffer.length;
  const range = req.headers.range;
  const tag = etag || `"${size}-${Buffer.from(String(name || 'file')).toString('base64url').slice(0, 24)}"`;
  if (req.headers['if-none-match'] === tag) {
    res.status(304);
    return res.end();
  }
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', mimeType || 'application/octet-stream');
  res.setHeader('Cache-Control', 'private, max-age=3600, immutable');
  res.setHeader('ETag', tag);
  const safeName = String(name || 'file').replace(/"/g, '');
  res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
  if (range) {
    const match = String(range).match(/bytes=(\d+)-(\d*)/);
    if (match) {
      const start = Number(match[1]);
      const end = match[2] ? Number(match[2]) : size - 1;
      if (start < size && end >= start) {
        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
        res.setHeader('Content-Length', end - start + 1);
        return res.end(buffer.subarray(start, end + 1));
      }
    }
  }
  res.setHeader('Content-Length', size);
  return res.end(buffer);
}

module.exports = {
  MAX_FILE_BYTES,
  MAX_FILES,
  MAX_TOTAL_BYTES,
  MAX_VOICE_MS,
  isMimeAllowed,
  kindFromMime,
  saveMedia,
  readMediaBuffer,
  resolveAttachments,
  inferMessageType,
  previewForMessage,
  sendMediaResponse,
  serializeMedia,
};
