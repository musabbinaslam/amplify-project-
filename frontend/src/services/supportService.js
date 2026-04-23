import { getApiBaseUrl } from '../config/apiBase';

export const SUPPORT_ATTACHMENT_LIMITS = {
  maxFiles: 5,
  maxFileBytes: 10 * 1024 * 1024,
  maxTotalBytes: 20 * 1024 * 1024,
  acceptList: [
    'image/*',
    'application/pdf',
    'application/zip',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/json',
    'text/plain',
    'text/csv',
    '.log',
  ],
};

function isSupportedAttachment(file) {
  if (!file) return false;
  const t = (file.type || '').toLowerCase();
  if (t.startsWith('image/')) return true;
  const allowedExact = new Set([
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
  ]);
  if (allowedExact.has(t)) return true;
  const name = (file.name || '').toLowerCase();
  return name.endsWith('.log') || name.endsWith('.txt') || name.endsWith('.csv');
}

export function validateAttachments(files = []) {
  const list = Array.from(files || []);
  if (list.length > SUPPORT_ATTACHMENT_LIMITS.maxFiles) {
    return { error: `You can attach up to ${SUPPORT_ATTACHMENT_LIMITS.maxFiles} files.` };
  }
  let total = 0;
  for (const f of list) {
    if (!isSupportedAttachment(f)) {
      return { error: `Unsupported file type: ${f.name || 'attachment'}` };
    }
    if (f.size > SUPPORT_ATTACHMENT_LIMITS.maxFileBytes) {
      return {
        error: `${f.name || 'Attachment'} is too large (max ${
          SUPPORT_ATTACHMENT_LIMITS.maxFileBytes / (1024 * 1024)
        } MB).`,
      };
    }
    total += f.size || 0;
  }
  if (total > SUPPORT_ATTACHMENT_LIMITS.maxTotalBytes) {
    return {
      error: `Total attachment size exceeds ${
        SUPPORT_ATTACHMENT_LIMITS.maxTotalBytes / (1024 * 1024)
      } MB.`,
    };
  }
  return { ok: true };
}

export async function sendSupportEmail(
  { subject, category, description, attachments = [] },
  getIdToken
) {
  const idToken = typeof getIdToken === 'function' ? await getIdToken() : getIdToken;
  if (!idToken) {
    throw new Error('Not signed in');
  }

  const url = `${getApiBaseUrl()}/api/support/email`;
  const hasFiles = Array.isArray(attachments) && attachments.length > 0;

  let res;
  if (hasFiles) {
    const form = new FormData();
    form.append('subject', subject);
    form.append('category', category);
    form.append('description', description);
    attachments.forEach((file) => {
      form.append('attachments', file, file.name);
    });

    res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
      body: form,
    });
  } else {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ subject, category, description }),
    });
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg =
      typeof data?.error === 'string' && data.error.trim()
        ? data.error
        : res.status === 401
          ? 'Session expired. Please sign in again.'
          : res.status === 413
            ? 'Attachments are too large.'
            : res.status === 415
              ? 'One or more files are not a supported type.'
              : res.status === 429
                ? 'Too many emails in a short period. Please try again in a few minutes.'
                : 'Could not send support email. Please try again.';
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }

  return data;
}
