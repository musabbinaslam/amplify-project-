/**
 * Absolute backend origin for Firebase config, REST APIs, and Socket.IO.
 * Vite inlines `VITE_API_URL` at build time — set it in your hosting provider for production.
 *
 * If the value has no scheme (e.g. api.example.com), https:// is prepended.
 * In development, when unset, defaults to http://localhost:3001.
 */
export function getApiBaseUrl() {
  let raw = String(import.meta.env.VITE_API_URL || '').trim().replace(/\/$/, '');
  if (!raw) {
    if (import.meta.env.DEV) {
      return 'http://localhost:3001';
    }
    throw new Error(
      'VITE_API_URL is not set. In your hosting dashboard (Netlify/Vercel/etc.), add VITE_API_URL=https://your-api-host at build time so the app can load Firebase config and call the API.',
    );
  }
  if (!/^https?:\/\//i.test(raw)) {
    raw = `https://${raw}`;
  }
  return raw;
}
