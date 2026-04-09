import useAuthStore from '../store/authStore';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

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
    if (!res.ok) throw new Error('Failed to fetch wallet');
    return res.json();
  },
  createCheckout: async (amountCents) => {
    const res = await fetch(`${API_URL}/api/stripe/create-checkout`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ amountCents })
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to create checkout');
    }
    return res.json();
  },
  createSubscription: async (planId) => {
    const res = await fetch(`${API_URL}/api/stripe/create-subscription`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ planId })
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to create subscription');
    }
    return res.json();
  },
  cancelSubscription: async () => {
    const res = await fetch(`${API_URL}/api/stripe/cancel-subscription`, {
      method: 'POST',
      headers: getHeaders()
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to cancel subscription');
    }
    return res.json();
  }
};
