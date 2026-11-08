import { apiFetch } from './apiClient';

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
  // Legacy caller arg (SupportPage). Token comes from apiFetch → currentUser, never this value.
  void getIdToken;
  const hasFiles = Array.isArray(attachments) && attachments.length > 0;

  let body;
  if (hasFiles) {
    const form = new FormData();
    form.append('subject', subject);
    form.append('category', category);
    form.append('description', description);
    attachments.forEach((file) => {
      form.append('attachments', file, file.name);
    });
    body = form;
  } else {
    body = { subject, category, description };
  }

  try {
    return await apiFetch('/api/support/email', { method: 'POST', body });
  } catch (err) {
    // apiFetch already prefers JSON `error`, then HTTP statusText, then "Request failed".
    // statusText is indistinguishable from a backend `error` with the same text, so we
    // do not remap 401/413/415/429 onto the old UX strings (that would hide real messages).
    if (err?.message === 'Request failed') {
      const mapped = new Error('Could not send support email. Please try again.');
      if (err.status) mapped.status = err.status;
      throw mapped;
    }
    throw err;
  }
}
