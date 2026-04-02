import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';

const MAX_AVATAR_SIZE = 256;
const AVATAR_QUALITY = 0.8;

export async function getProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? snap.data() : null;
}

export async function saveProfile(uid, data) {
  await setDoc(
    doc(db, 'users', uid),
    { ...data, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

export function compressAvatar(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;

      if (width > height) {
        if (width > MAX_AVATAR_SIZE) {
          height = Math.round(height * (MAX_AVATAR_SIZE / width));
          width = MAX_AVATAR_SIZE;
        }
      } else {
        if (height > MAX_AVATAR_SIZE) {
          width = Math.round(width * (MAX_AVATAR_SIZE / height));
          height = MAX_AVATAR_SIZE;
        }
      }

      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', AVATAR_QUALITY));
    };
    img.onerror = () => reject(new Error('Failed to read image'));
    img.src = URL.createObjectURL(file);
  });
}

export async function getOrCreateApiKey(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  const existing = snap.data()?.apiKey;
  if (existing) return existing;

  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  const apiKey = `ak_${hex}`;

  await setDoc(doc(db, 'users', uid), { apiKey, createdAt: serverTimestamp() }, { merge: true });
  return apiKey;
}
