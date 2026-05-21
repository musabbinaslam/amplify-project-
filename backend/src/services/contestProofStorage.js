const crypto = require('crypto');
const path = require('path');
const admin = require('../config/firebaseAdmin');
const { getDb } = require('../config/firestoreDb');

/** Per-file limit for contest proofs in Firebase Storage. */
const MAX_PROOF_BYTES = 5 * 1024 * 1024;
const MAX_PROOF_TOTAL_BYTES = 12 * 1024 * 1024;
const STORAGE_PREFIX = 'contest-proofs';

function safeFilename(name = 'file') {
  return String(name).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

function proofApiPath(contestId, proofId) {
  const qs = new URLSearchParams({ contestId, proofId });
  return `/api/voice/contest-proof?${qs.toString()}`;
}

function storageObjectPath(contestId, proofId, filename) {
  return `${STORAGE_PREFIX}/${contestId}/${proofId}/${safeFilename(filename)}`;
}

function getBucket() {
  if (!admin) return null;
  try {
    return admin.storage().bucket();
  } catch (err) {
    console.error('[contestProofStorage] Storage bucket unavailable:', err.message);
    return null;
  }
}

function mapStorageError(err) {
  const code = err?.code;
  if (code === 404) {
    return Object.assign(
      new Error(
        'Firebase Storage bucket is missing or not enabled. Set FIREBASE_STORAGE_BUCKET in backend/.env and enable Storage in Firebase Console.',
      ),
      { code: 'STORAGE_UNAVAILABLE' },
    );
  }
  return err;
}

async function getContestProofFiles(contestId) {
  const db = getDb();
  const snap = await db.collection('callContests').doc(contestId).get();
  if (!snap.exists) return [];
  return snap.data()?.proofFiles || [];
}

function findProofMeta(proofFiles, proofId) {
  return proofFiles.find((f) => (f.proofId || f.id) === proofId) || null;
}

/**
 * Upload proof files to Firebase Storage and return metadata stored on the contest doc.
 */
async function saveProofsToContest(contestId, files = []) {
  if (!admin) throw Object.assign(new Error('Database unavailable'), { code: 'UNAVAILABLE' });
  const bucket = getBucket();
  if (!bucket) {
    throw Object.assign(new Error('Firebase Storage is not configured'), { code: 'STORAGE_UNAVAILABLE' });
  }

  const uploadOne = async (file) => {
    const size = file.buffer?.length || file.size || 0;
    if (size > MAX_PROOF_BYTES) {
      throw Object.assign(
        new Error(`Each proof file must be ${Math.round(MAX_PROOF_BYTES / (1024 * 1024))} MB or smaller`),
        { code: 'FILE_TOO_LARGE' },
      );
    }

    const proofId = crypto.randomUUID();
    const name = file.originalname || `${proofId}${path.extname(file.originalname || '') || '.bin'}`;
    const mimeType = file.mimetype || 'application/octet-stream';
    const storagePath = storageObjectPath(contestId, proofId, name);
    const gcsFile = bucket.file(storagePath);

    try {
      await gcsFile.save(file.buffer, {
        resumable: false,
        metadata: {
          contentType: mimeType,
          metadata: {
            contestId,
            proofId,
            originalName: name,
          },
        },
      });
    } catch (err) {
      console.error('[contestProofStorage] upload failed:', err.message);
      throw mapStorageError(err);
    }

    return {
      proofId,
      name,
      mimeType,
      sizeBytes: size,
      storageBackend: 'storage',
      storagePath,
      url: proofApiPath(contestId, proofId),
    };
  };

  return Promise.all(files.map((file) => uploadOne(file)));
}

function refreshProofUrls(contestId, proofFiles = []) {
  if (!proofFiles?.length || !contestId) return proofFiles || [];
  return proofFiles.map((f) => {
    const proofId = f.proofId || f.id;
    if (!proofId) return f;
    const backend = f.storageBackend || (f.storagePath ? 'storage' : 'firestore');
    return {
      ...f,
      storageBackend: backend,
      url: proofApiPath(contestId, proofId),
    };
  });
}

async function readProofFromStorage(meta) {
  const bucket = getBucket();
  if (!bucket || !meta?.storagePath) {
    throw Object.assign(new Error('Proof file not found'), { code: 'NOT_FOUND' });
  }
  try {
    const [buffer] = await bucket.file(meta.storagePath).download();
    return {
      buffer,
      mimeType: meta.mimeType || 'application/octet-stream',
      name: meta.name || meta.proofId,
    };
  } catch (err) {
    if (err?.code === 404) {
      throw Object.assign(new Error('Proof file not found'), { code: 'NOT_FOUND' });
    }
    throw mapStorageError(err);
  }
}

/** Legacy: proofs stored as base64 in callContests/{id}/proofs/{proofId}. */
async function readProofFromFirestore(contestId, proofId) {
  const db = getDb();
  const doc = await db.collection('callContests').doc(contestId).collection('proofs').doc(proofId).get();
  if (!doc.exists) {
    throw Object.assign(new Error('Proof file not found'), { code: 'NOT_FOUND' });
  }
  const data = doc.data() || {};
  if (!data.dataBase64) {
    throw Object.assign(new Error('Proof file not found'), { code: 'NOT_FOUND' });
  }
  return {
    buffer: Buffer.from(data.dataBase64, 'base64'),
    mimeType: data.mimeType || 'application/octet-stream',
    name: data.name || proofId,
  };
}

async function readProof(contestId, proofId) {
  if (!admin || !contestId || !proofId) {
    throw Object.assign(new Error('Proof not found'), { code: 'NOT_FOUND' });
  }

  const proofFiles = await getContestProofFiles(contestId);
  const meta = findProofMeta(proofFiles, proofId);

  if (meta?.storagePath || meta?.storageBackend === 'storage') {
    return readProofFromStorage(meta);
  }

  if (meta?.storageBackend === 'firestore') {
    return readProofFromFirestore(contestId, proofId);
  }

  // Older contests may lack proofFiles metadata — try legacy Firestore subcollection.
  try {
    return await readProofFromFirestore(contestId, proofId);
  } catch (err) {
    if (err.code === 'NOT_FOUND' && meta) {
      return readProofFromStorage(meta);
    }
    throw err;
  }
}

async function getContestAgentId(contestId) {
  const db = getDb();
  const snap = await db.collection('callContests').doc(contestId).get();
  if (!snap.exists) return null;
  return snap.data()?.agentId || null;
}

module.exports = {
  saveProofsToContest,
  refreshProofUrls,
  readProof,
  getContestAgentId,
  proofApiPath,
  MAX_PROOF_BYTES,
  MAX_PROOF_TOTAL_BYTES,
};
