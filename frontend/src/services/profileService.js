import { apiFetch } from './apiClient';

const MAX_AVATAR_SIZE = 256;
const AVATAR_QUALITY = 0.8;

/** Document is resolved from the ID token; `uid` kept for call-site compatibility. */
export async function getProfile(uid) {
  void uid;
  return apiFetch('/api/users/me', { method: 'GET' });
}

export async function saveProfile(uid, data) {
  void uid;
  return apiFetch('/api/users/me', { method: 'PATCH', body: data });
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
  void uid;
  const data = await apiFetch('/api/users/me/api-key', { method: 'POST' });
  if (typeof data?.apiKey !== 'string') {
    throw new Error('Invalid API key response');
  }
  return data.apiKey;
}
