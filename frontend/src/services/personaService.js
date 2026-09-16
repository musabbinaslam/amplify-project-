import { apiFetch } from './apiClient';

export async function confirmPersonaInquiry(inquiryId) {
  return apiFetch('/api/persona/confirm', {
    method: 'POST',
    body: { inquiryId },
  });
}
