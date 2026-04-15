import useAuthStore from '../store/authStore';

function resolveApiUrl() {
  const raw = (import.meta.env.VITE_API_URL || '').trim();
  if (!raw) return 'http://localhost:3001';

  // Production envs are sometimes configured as "api.example.com" (no protocol).
  // Prefix HTTPS so fetch targets the API host, not a relative frontend path.
  if (/^https?:\/\//i.test(raw)) return raw.replace(/\/+$/, '');
  return `https://${raw}`.replace(/\/+$/, '');
}

const API_URL = resolveApiUrl();

const getHeaders = () => {
  const token = useAuthStore.getState().token;
  return {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` })
  };
};

export const stripeService = {
  getWallet: async () => {
    const res = await fetch(`${API_URL}/api/stripe/wallet`, { headers: getHeaders() });
    if (!res.ok) {
      const message = await safeErrorMessage(res, 'Failed to fetch wallet');
      throw new Error(message);
    }
    return parseJsonOrThrow(res, 'Wallet API returned invalid JSON');
  },
  createCheckout: async (amountCents) => {
    const res = await fetch(`${API_URL}/api/stripe/create-checkout`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ amountCents })
    });
    if (!res.ok) {
      const message = await safeErrorMessage(res, 'Failed to create checkout');
      throw new Error(message);
    }
    return parseJsonOrThrow(res, 'Checkout API returned invalid JSON');
  },
  verifyCheckout: async (sessionId) => {
    const res = await fetch(`${API_URL}/api/stripe/verify-checkout`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ sessionId })
    });
    if (!res.ok) {
      const message = await safeErrorMessage(res, 'Failed to verify payment');
      throw new Error(message);
    }
    return parseJsonOrThrow(res, 'Verify checkout API returned invalid JSON');
  },
  createSubscription: async (planId) => {
    const res = await fetch(`${API_URL}/api/stripe/create-subscription`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ planId })
    });
    if (!res.ok) {
      const message = await safeErrorMessage(res, 'Failed to create subscription');
      throw new Error(message);
    }
    return parseJsonOrThrow(res, 'Subscription API returned invalid JSON');
  },
  cancelSubscription: async () => {
    const res = await fetch(`${API_URL}/api/stripe/cancel-subscription`, {
      method: 'POST',
      headers: getHeaders()
    });
    if (!res.ok) {
      const message = await safeErrorMessage(res, 'Failed to cancel subscription');
      throw new Error(message);
    }
    return parseJsonOrThrow(res, 'Cancel API returned invalid JSON');
  }
};

async function parseJsonOrThrow(res, fallbackMessage) {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const body = await res.text().catch(() => '');
    const snippet = body.slice(0, 120).trim();
    throw new Error(
      `${fallbackMessage}. Expected JSON but got "${contentType || 'unknown'}"${snippet ? ` (${snippet})` : ''}`
    );
  }
  return res.json();
}

async function safeErrorMessage(res, fallbackMessage) {
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const err = await res.json().catch(() => ({}));
    return err.error || fallbackMessage;
  }
  const text = await res.text().catch(() => '');
  const snippet = text.slice(0, 120).trim();
  return `${fallbackMessage}${snippet ? `: ${snippet}` : ''}`;
}
