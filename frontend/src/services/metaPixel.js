import { getApiBaseUrl } from '../config/apiBase';

const META_SCRIPT_ID = 'meta-pixel-script';
const PIXEL_ID = String(import.meta.env.VITE_META_PIXEL_ID || '').trim();

function ensureFbqStub() {
  if (window.fbq) return;
  // Standard Meta bootstrap queue.
  const fbq = function fbqProxy(...args) {
    fbq.callMethod ? fbq.callMethod.apply(fbq, args) : fbq.queue.push(args);
  };
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = '2.0';
  fbq.queue = [];
  window.fbq = fbq;
  if (!window._fbq) window._fbq = fbq;
}

function ensurePixelLoaded() {
  if (!PIXEL_ID) return false;
  ensureFbqStub();
  if (!document.getElementById(META_SCRIPT_ID)) {
    const script = document.createElement('script');
    script.id = META_SCRIPT_ID;
    script.async = true;
    script.src = 'https://connect.facebook.net/en_US/fbevents.js';
    document.head.appendChild(script);
  }
  window.fbq('init', PIXEL_ID);
  return true;
}

export function initMetaPixelOnSignupPage() {
  if (!ensurePixelLoaded()) return false;
  // PageView keeps Pixel Helper transparent/visible on signup page.
  window.fbq('track', 'PageView');
  return true;
}

function makeEventId() {
  return `signup_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

async function sendServerConversion(payload) {
  const base = getApiBaseUrl();
  try {
    await fetch(`${base}/api/public/meta/complete-registration`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    // Do not block signup on analytics failures.
    console.warn('[Meta] Server conversion failed:', err?.message || err);
  }
}

export async function trackSignupComplete({ email, phone, fullName }) {
  const eventId = makeEventId();

  if (ensurePixelLoaded()) {
    window.fbq('track', 'CompleteRegistration', {}, { eventID: eventId });
  }

  await sendServerConversion({
    eventId,
    email: email || '',
    phone: phone || '',
    fullName: fullName || '',
    eventSourceUrl: window.location.href,
  });
}
