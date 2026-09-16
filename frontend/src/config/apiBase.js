/**
 * Absolute backend origin for Firebase config, REST APIs, and Socket.IO.
 * Vite inlines `VITE_API_URL` at build time — set it in your hosting provider for production.
 *
 * If the value has no scheme (e.g. api.example.com), https:// is prepended.
 * In development against a local API, use the page origin so Vite proxies `/api`
 * (and media `<img>` URLs) to backend :3002 — avoids broken hard-coded ports.
 * When the page is opened via a LAN IP or tunnel (`vite --host`), same-origin
 * proxy keeps the friend's browser from calling *their* localhost.
 */
export function getApiBaseUrl() {
  let raw = String(import.meta.env.VITE_API_URL || '').trim().replace(/\/$/, '');

  if (import.meta.env.DEV && typeof window !== 'undefined') {
    const localApi = !raw || /localhost|127\.0\.0\.1/i.test(raw);
    if (localApi && window.location.hostname) {
      return window.location.origin;
    }
  }

  if (!raw) {
    if (import.meta.env.DEV) {
      return 'http://localhost:3002';
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
