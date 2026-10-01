import { apiFetch } from './apiClient';

export async function listNotes() {
  const data = await apiFetch('/api/users/me/notes', { method: 'GET' });
  return data;
}

export async function createNote() {
  return apiFetch('/api/users/me/notes', { method: 'POST', body: {} });
}

export async function deleteNote(id) {
  return apiFetch(`/api/users/me/notes/${id}`, { method: 'DELETE' });
}

export async function updateNote(id, title, text, textHtml) {
  return apiFetch(`/api/users/me/notes/${id}`, {
    method: 'PUT',
    body: { title, text, textHtml },
  });
}
