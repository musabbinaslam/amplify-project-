import { auth } from '../config/firebase';
import { getApiBaseUrl } from '../config/apiBase';

const baseUrl = () => getApiBaseUrl();

async function getBearerToken(getIdToken) {
  if (getIdToken) {
    const t = typeof getIdToken === 'function' ? await getIdToken() : getIdToken;
    if (t) return t;
  }
  const u = auth?.currentUser;
  if (!u) return null;
  return u.getIdToken();
}

/**
 * Authenticated JSON API call to the backend.
 * @param {string} path - e.g. '/api/users/me'
 * @param {RequestInit} options
 * @param {(() => Promise<string|null>)|string|null} getIdToken
 */
export async function apiFetch(path, options = {}, getIdToken) {
  const token = await getBearerToken(getIdToken);
  if (!token) {
    throw new Error('Not signed in');
  }

  const url = `${baseUrl()}${path.startsWith('/') ? path : `/${path}`}`;
  const { headers: optHeaders, body, ...rest } = options;
  const headers = {
    Authorization: `Bearer ${token}`,
    ...optHeaders,
  };

  const isJsonBody =
    body != null &&
    typeof body === 'object' &&
    !(body instanceof FormData) &&
    !(body instanceof Blob) &&
    !(body instanceof ArrayBuffer);

  if (isJsonBody && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, {
    ...rest,
    headers,
    body: isJsonBody ? JSON.stringify(body) : body,
  });

  const contentType = res.headers.get('content-type');
  const isJson = contentType && contentType.includes('application/json');
  let data = isJson ? await res.json().catch(() => ({})) : null;

  if (!res.ok) {
    const msg =
      typeof data?.error === 'string' && data.error.trim()
        ? data.error
        : res.statusText || 'Request failed';
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }

  return data;
}

function isRetryableNetworkError(err) {
  if (!err || err.status) return false;
  const msg = String(err.message || '').toLowerCase();
  return msg.includes('failed to fetch') || msg.includes('network') || msg.includes('load failed');
}

/**
 * Same as apiFetch but retries once on transient network failures (GET only).
 */
export async function apiFetchWithRetry(path, options = {}, getIdToken) {
  const method = String(options.method || 'GET').toUpperCase();
  try {
    return await apiFetch(path, options, getIdToken);
  } catch (err) {
    if (method !== 'GET' || !isRetryableNetworkError(err)) throw err;
    await new Promise((r) => setTimeout(r, 1500));
    return apiFetch(path, options, getIdToken);
  }
}
