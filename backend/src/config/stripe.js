const Stripe = require('stripe');

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

if (!STRIPE_SECRET_KEY) {
  console.warn('[Stripe] ⚠️  STRIPE_SECRET_KEY not set in .env — Stripe features will not work.');
}

const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;

// Top-up credit tiers (amounts in cents)
const CREDIT_TIERS = [
  { id: 'tier_50',   label: '$50',   amountCents: 5000 },
  { id: 'tier_100',  label: '$100',  amountCents: 10000 },
  { id: 'tier_250',  label: '$250',  amountCents: 25000 },
  { id: 'tier_500',  label: '$500',  amountCents: 50000 },
  { id: 'tier_1000', label: '$1,000', amountCents: 100000 },
];

// Subscription plan config
const PLANS = {
  silver: {
    name: 'Silver Plan',
    stripePriceId: process.env.STRIPE_PRICE_SILVER || null,
    weeklyAmountCents: 50000,   // $500 worth of credits per cycle
    callRate: 50,               // $50/call
  },
  gold: {
    name: 'Gold Plan',
    stripePriceId: process.env.STRIPE_PRICE_GOLD || null,
    weeklyAmountCents: 100000,  // $1000 worth of credits per cycle
    callRate: 45,               // $45/call
  },
};

module.exports = { stripe, CREDIT_TIERS, PLANS };
