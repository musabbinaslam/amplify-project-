import { apiFetch } from './apiClient';
import { auth } from '../config/firebase';
import { getApiBaseUrl } from '../config/apiBase';

export function getMySupportConversation() {
  let suffix = '';
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) suffix = `?tz=${encodeURIComponent(tz)}`;
  } catch {
    /* noop */
  }
  return apiFetch(`/api/support/conversations/me${suffix}`, { method: 'GET' });
}

export function getSupportMessages(conversationId, { cursor, limit, markRead } = {}) {
  const qs = new URLSearchParams();
  if (cursor) qs.set('cursor', cursor);
  if (limit) qs.set('limit', String(limit));
  if (markRead) qs.set('markRead', '1');
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return apiFetch(`/api/support/conversations/${encodeURIComponent(conversationId)}/messages${suffix}`, {
    method: 'GET',
  });
}

export function postSupportMessage(conversationId, text, { replyTo, attachments } = {}) {
  return apiFetch(`/api/support/conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: 'POST',
    body: {
      text,
      ...(replyTo ? { replyTo } : {}),
      ...(attachments?.length ? { attachments } : {}),
    },
  });
}

export function markSupportRead(conversationId) {
  return apiFetch(`/api/support/conversations/${encodeURIComponent(conversationId)}/read`, {
    method: 'POST',
  });
}

export function markSupportDeskRead(conversationId) {
  return apiFetch(`/api/support-desk/conversations/${encodeURIComponent(conversationId)}/read`, {
    method: 'POST',
  });
}

export function listSupportDeskConversations({ status, assigned } = {}) {
  const qs = new URLSearchParams();
  if (status) qs.set('status', status);
  if (assigned) qs.set('assigned', assigned);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return apiFetch(`/api/support-desk/conversations${suffix}`, { method: 'GET' });
}

export function getSupportDeskKpis({ from, to, lite = false } = {}) {
  const qs = new URLSearchParams();
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  if (lite) qs.set('lite', '1');
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return apiFetch(`/api/support-desk/kpis${suffix}`, { method: 'GET' });
}

export function getSupportDeskMessages(conversationId, { cursor, limit, markRead } = {}) {
  const qs = new URLSearchParams();
  if (cursor) qs.set('cursor', cursor);
  if (limit) qs.set('limit', String(limit));
  if (markRead) qs.set('markRead', '1');
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return apiFetch(`/api/support-desk/conversations/${encodeURIComponent(conversationId)}/messages${suffix}`, {
    method: 'GET',
  });
}

export function postSupportDeskMessage(conversationId, text, { replyTo, attachments } = {}) {
  return apiFetch(`/api/support-desk/conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: 'POST',
    body: {
      text,
      ...(replyTo ? { replyTo } : {}),
      ...(attachments?.length ? { attachments } : {}),
    },
  });
}

export function searchSupportDeskUsers({ q, limit = 20 } = {}) {
  const qs = new URLSearchParams();
  if (q) qs.set('q', q);
  if (limit) qs.set('limit', String(limit));
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return apiFetch(`/api/support-desk/users/search${suffix}`, { method: 'GET' });
}

export function startSupportDeskOutbound({ userId, text, replyTo, attachments } = {}) {
  return apiFetch('/api/support-desk/conversations/outbound', {
    method: 'POST',
    body: {
      userId,
      text,
      ...(replyTo ? { replyTo } : {}),
      ...(attachments?.length ? { attachments } : {}),
    },
  });
}

export const CHAT_MEDIA_LIMITS = {
  maxFiles: 5,
  maxFileBytes: 10 * 1024 * 1024,
  maxTotalBytes: 20 * 1024 * 1024,
  maxVoiceMs: 5 * 60 * 1000,
  accept: 'image/*,.pdf,.zip,.doc,.docx,.xls,.xlsx,.txt,.csv,.json,audio/webm,audio/mp4,audio/mpeg',
};

export function uploadSupportMedia(conversationId, file, { durationMs, desk = false } = {}) {
  const form = new FormData();
  form.append('file', file, file.name || 'upload');
  if (durationMs) form.append('durationMs', String(durationMs));
  const root = desk ? '/api/support-desk' : '/api/support';
  return apiFetch(`${root}/conversations/${encodeURIComponent(conversationId)}/media`, {
    method: 'POST',
    body: form,
  });
}

export function supportMediaPath(conversationId, mediaId, { desk = false } = {}) {
  const root = desk ? '/api/support-desk' : '/api/support';
  return `${root}/conversations/${encodeURIComponent(conversationId)}/media/${encodeURIComponent(mediaId)}`;
}

let mediaToken = '';
let mediaTokenAt = 0;
const MEDIA_TOKEN_TTL_MS = 45 * 60 * 1000;
const mediaSrcCache = new Map();

export async function warmSupportMediaToken(force = false) {
  const fresh = mediaToken && !force && (Date.now() - mediaTokenAt) < MEDIA_TOKEN_TTL_MS;
  if (fresh) return mediaToken;
  try {
    const token = await auth.currentUser?.getIdToken(force);
    mediaToken = token || '';
    mediaTokenAt = Date.now();
  } catch {
    mediaToken = '';
  }
  return mediaToken;
}

function toDeskMediaRel(rel) {
  return String(rel || '').replace(/^\/api\/support\//, '/api/support-desk/');
}

export function supportMediaSrcSync(conversationId, mediaOrId, { desk = false, variant = 'full' } = {}) {
  if (!conversationId || !mediaToken) return '';
  const id = typeof mediaOrId === 'string' ? mediaOrId : mediaOrId?.id;
  if (!id) return '';
  const wantThumb = variant === 'thumb';
  const cacheKey = `${desk ? 'd' : 'u'}:${conversationId}:${id}:${wantThumb ? 't' : 'f'}:${mediaTokenAt}`;
  const cached = mediaSrcCache.get(cacheKey);
  if (cached) return cached;

  // Prefer desk/user path builder so agents never hit customer media routes.
  let rel = supportMediaPath(conversationId, id, { desk });
  if (wantThumb) {
    if (
      mediaOrId
      && typeof mediaOrId === 'object'
      && typeof mediaOrId.thumbUrl === 'string'
      && mediaOrId.thumbUrl.includes('variant=thumb')
    ) {
      rel = desk ? toDeskMediaRel(mediaOrId.thumbUrl) : mediaOrId.thumbUrl;
    } else {
      // Backend falls back to full image when no thumb exists.
      rel = `${rel}${rel.includes('?') ? '&' : '?'}variant=thumb`;
    }
  } else if (!desk && mediaOrId && typeof mediaOrId === 'object' && mediaOrId.url) {
    rel = mediaOrId.url;
  }

  const base = getApiBaseUrl();
  const sep = String(rel).includes('?') ? '&' : '?';
  const src = `${base}${rel}${sep}token=${encodeURIComponent(mediaToken)}`;
  mediaSrcCache.set(cacheKey, src);
  if (mediaSrcCache.size > 200) {
    const first = mediaSrcCache.keys().next().value;
    mediaSrcCache.delete(first);
  }
  return src;
}

export async function supportMediaSrc(conversationId, mediaOrId, { desk = false, variant = 'full' } = {}) {
  await warmSupportMediaToken();
  return supportMediaSrcSync(conversationId, mediaOrId, { desk, variant });
}

const mediaBlobCache = new Map();

function mediaRelPath(conversationId, mediaOrId, { desk = false, variant = 'full' } = {}) {
  const id = typeof mediaOrId === 'string' ? mediaOrId : mediaOrId?.id;
  if (!conversationId || !id) return '';
  let rel = supportMediaPath(conversationId, id, { desk });
  if (variant === 'thumb') {
    if (
      mediaOrId
      && typeof mediaOrId === 'object'
      && typeof mediaOrId.thumbUrl === 'string'
      && mediaOrId.thumbUrl.includes('variant=thumb')
    ) {
      rel = desk ? toDeskMediaRel(mediaOrId.thumbUrl) : mediaOrId.thumbUrl;
    } else {
      rel = `${rel}${rel.includes('?') ? '&' : '?'}variant=thumb`;
    }
  } else if (!desk && mediaOrId && typeof mediaOrId === 'object' && mediaOrId.url) {
    rel = mediaOrId.url;
  }
  return rel;
}

/**
 * Load chat media via Authorization header and return a blob: URL.
 * Avoids query-token &lt;img&gt; loads that can hang indefinitely in some browsers.
 */
export async function fetchSupportMediaObjectUrl(
  conversationId,
  mediaOrId,
  { desk = false, variant = 'full', signal } = {},
) {
  const id = typeof mediaOrId === 'string' ? mediaOrId : mediaOrId?.id;
  if (!conversationId || !id) return '';

  const cacheKey = `${desk ? 'd' : 'u'}:${conversationId}:${id}:${variant === 'thumb' ? 't' : 'f'}`;
  const cached = mediaBlobCache.get(cacheKey);
  if (cached) return cached;

  const token = await warmSupportMediaToken();
  if (!token) throw new Error('Not signed in');

  const rel = mediaRelPath(conversationId, mediaOrId, { desk, variant });
  if (!rel) throw new Error('Invalid media path');

  const url = `${getApiBaseUrl()}${rel}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
    signal,
    cache: 'force-cache',
  });
  if (!res.ok) {
    throw new Error(`Media HTTP ${res.status}`);
  }
  const blob = await res.blob();
  if (!blob || !blob.size) throw new Error('Empty media');
  if (blob.type && /json|text\/html/i.test(blob.type)) {
    throw new Error('Unexpected media response');
  }
  const objectUrl = URL.createObjectURL(blob);
  mediaBlobCache.set(cacheKey, objectUrl);
  if (mediaBlobCache.size > 80) {
    const first = mediaBlobCache.keys().next().value;
    const old = mediaBlobCache.get(first);
    mediaBlobCache.delete(first);
    if (old && String(old).startsWith('blob:')) {
      try { URL.revokeObjectURL(old); } catch { /* noop */ }
    }
  }
  return objectUrl;
}

export function claimSupportConversation(conversationId) {
  return apiFetch(`/api/support-desk/conversations/${encodeURIComponent(conversationId)}/claim`, {
    method: 'POST',
  });
}

export function closeSupportConversation(conversationId) {
  return apiFetch(`/api/support-desk/conversations/${encodeURIComponent(conversationId)}/close`, {
    method: 'POST',
  });
}
