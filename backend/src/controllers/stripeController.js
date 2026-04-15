const { stripe, CREDIT_TIERS, PLANS } = require('../config/stripe');
const walletService = require('../services/walletService');
const admin = require('../config/firebaseAdmin');

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

/**
 * POST /api/stripe/create-checkout
 * Creates a Stripe Checkout session for a one-time credit top-up.
 */
exports.createCheckout = async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });

  const { amountCents } = req.body;
  if (!amountCents || typeof amountCents !== 'number' || amountCents < 100) {
    return res.status(400).json({ error: 'Invalid amount' });
  }

  // Validate against allowed tiers
  const tier = CREDIT_TIERS.find((t) => t.amountCents === amountCents);
  if (!tier) {
    return res.status(400).json({ error: 'Invalid credit tier' });
  }

  try {
    // Get or create Stripe Customer
    const customerId = await getOrCreateCustomer(req.user.uid, req.user.email);

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer: customerId,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `AgentCalls Credits — ${tier.label}`,
              description: `Add ${tier.label} in call credits to your wallet`,
            },
            unit_amount: amountCents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        uid: req.user.uid,
        type: 'credit_topup',
        amountCents: String(amountCents),
      },
      success_url: `${CLIENT_URL}/app/billing?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${CLIENT_URL}/app/billing?payment=cancelled`,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('[Stripe] Checkout error:', err.message);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
};

/**
 * POST /api/stripe/verify-checkout
 * Verifies a checkout session and credits wallet if webhook has not done so yet.
 * This is a safety net for delayed/missed webhook deliveries.
 */
exports.verifyCheckout = async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });

  const { sessionId } = req.body || {};
  if (!sessionId || typeof sessionId !== 'string' || !sessionId.startsWith('cs_')) {
    return res.status(400).json({ error: 'Invalid sessionId' });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (!session) return res.status(404).json({ error: 'Checkout session not found' });

    if (session.mode !== 'payment' || session.metadata?.type !== 'credit_topup') {
      return res.status(400).json({ error: 'Session is not a credit top-up payment' });
    }

    const uid = session.metadata?.uid;
    const amountCents = parseInt(session.metadata?.amountCents, 10);
    if (!uid || !amountCents) {
      return res.status(400).json({ error: 'Missing credit metadata on checkout session' });
    }

    if (uid !== req.user.uid) {
      return res.status(403).json({ error: 'Session does not belong to current user' });
    }

    if (session.payment_status !== 'paid') {
      return res.status(409).json({ error: 'Payment not completed yet' });
    }

    const alreadyCredited = await hasCreditTransactionForSession(uid, session.id);
    if (!alreadyCredited) {
      await walletService.addCredits(uid, amountCents, 'stripe_checkout', {
        sessionId: session.id,
        paymentIntentId: session.payment_intent || null,
        source: 'verify_checkout_fallback',
      });
      return res.json({ success: true, credited: true });
    }

    return res.json({ success: true, credited: false });
  } catch (err) {
    console.error('[Stripe] Verify checkout error:', err.message);
    return res.status(500).json({ error: 'Failed to verify checkout session' });
  }
};

/**
 * POST /api/stripe/create-subscription
 * Creates a Stripe Checkout session in subscription mode.
 */
exports.createSubscription = async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });

  const { planId } = req.body; // 'silver' or 'gold'
  const plan = PLANS[planId];
  if (!plan) {
    return res.status(400).json({ error: 'Invalid plan. Must be "silver" or "gold".' });
  }

  if (!plan.stripePriceId) {
    return res.status(503).json({ error: `Stripe Price ID not configured for ${plan.name}. Set STRIPE_PRICE_${planId.toUpperCase()} in .env` });
  }

  try {
    // Check if user already has an active subscription
    const wallet = await walletService.getWallet(req.user.uid);
    if (wallet.stripeSubscriptionId) {
      return res.status(400).json({ error: 'You already have an active subscription. Cancel it first before switching plans.' });
    }

    const customerId = await getOrCreateCustomer(req.user.uid, req.user.email);

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: plan.stripePriceId, quantity: 1 }],
      metadata: {
        uid: req.user.uid,
        type: 'subscription',
        planId,
      },
      subscription_data: {
        metadata: {
          uid: req.user.uid,
          planId,
        },
      },
      success_url: `${CLIENT_URL}/app/billing?subscription=success`,
      cancel_url: `${CLIENT_URL}/app/billing?subscription=cancelled`,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('[Stripe] Subscription error:', err.message);
    res.status(500).json({ error: 'Failed to create subscription session' });
  }
};

/**
 * POST /api/stripe/cancel-subscription
 * Cancels the user's active subscription at period end.
 */
exports.cancelSubscription = async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });

  try {
    const wallet = await walletService.getWallet(req.user.uid);
    if (!wallet.stripeSubscriptionId) {
      return res.status(400).json({ error: 'No active subscription found' });
    }

    await stripe.subscriptions.update(wallet.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });

    res.json({ success: true, message: 'Subscription will cancel at the end of the current billing period.' });
  } catch (err) {
    console.error('[Stripe] Cancel subscription error:', err.message);
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
};

/**
 * GET /api/stripe/wallet
 * Returns wallet balance + recent transactions for the authenticated user.
 */
exports.getWalletInfo = async (req, res) => {
  try {
    const wallet = await walletService.getWallet(req.user.uid);
    const transactions = await walletService.getTransactions(req.user.uid, 50);
    res.json({
      balance: wallet.balance,
      plan: wallet.plan,
      stripeSubscriptionId: wallet.stripeSubscriptionId || null,
      transactions,
    });
  } catch (err) {
    console.error('[Stripe] Wallet info error:', err.message);
    res.status(500).json({ error: 'Failed to load wallet' });
  }
};

/**
 * POST /api/stripe/webhook
 * Handles Stripe webhook events. Must receive raw body.
 *
 * Two modes:
 * - PRODUCTION: Set STRIPE_WEBHOOK_SECRET in .env (get it from Stripe Dashboard → Webhooks → Signing secret).
 *               The secret is permanent and never changes.
 * - DEV/TEST:   Leave STRIPE_WEBHOOK_SECRET empty. Signature verification is skipped.
 *               Works with `stripe listen --forward-to ...` without needing to copy the whsec_ key.
 */
exports.handleWebhook = async (req, res) => {
  if (!stripe) return res.status(503).send('Stripe not configured');

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    if (webhookSecret) {
      // PRODUCTION mode: verify the signature using the Dashboard signing secret
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } else {
      // DEV mode: skip signature verification so any `stripe listen` session works
      event = JSON.parse(req.body.toString());
      console.warn('[Stripe] ⚠️  DEV MODE — Webhook signature not verified (STRIPE_WEBHOOK_SECRET is empty)');
    }
  } catch (err) {
    console.error('[Stripe] Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log(`[Stripe] 📩 Webhook event: ${event.type}`);

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        await handleCheckoutCompleted(session);
        break;
      }
      case 'invoice.paid': {
        const invoice = event.data.object;
        await handleInvoicePaid(invoice);
        break;
      }
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        await handleSubscriptionUpdated(subscription);
        break;
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        await handleSubscriptionDeleted(subscription);
        break;
      }
      default:
        console.log(`[Stripe] Unhandled event type: ${event.type}`);
    }
  } catch (err) {
    console.error(`[Stripe] Error handling ${event.type}:`, err.message);
  }

  res.json({ received: true });
};

// ─── Internal helpers ──────────────────────────────────────────────────────

async function getOrCreateCustomer(uid, email) {
  const wallet = await walletService.getWallet(uid);
  if (wallet.stripeCustomerId) return wallet.stripeCustomerId;

  const customer = await stripe.customers.create({
    email,
    metadata: { firebaseUid: uid },
  });

  await walletService.updateWalletMeta(uid, { stripeCustomerId: customer.id });
  console.log(`[Stripe] Created Stripe customer ${customer.id} for user ${uid}`);
  return customer.id;
}

async function handleCheckoutCompleted(session) {
  // Only handle one-time credit top-ups here
  if (session.mode !== 'payment') return;
  if (session.metadata?.type !== 'credit_topup') return;

  const uid = session.metadata.uid;
  const amountCents = parseInt(session.metadata.amountCents);
  if (!uid || !amountCents) {
    console.error('[Stripe] Missing uid or amountCents in checkout metadata');
    return;
  }

  await walletService.addCredits(uid, amountCents, 'stripe_checkout', {
    sessionId: session.id,
    paymentIntentId: session.payment_intent,
  });

  console.log(`[Stripe] ✅ Checkout completed. Added $${(amountCents / 100).toFixed(2)} credits for user ${uid}`);
}

async function hasCreditTransactionForSession(uid, sessionId) {
  if (!admin) return false;
  const db = admin.firestore();
  const snap = await db
    .collection('users')
    .doc(uid)
    .collection('transactions')
    .where('metadata.sessionId', '==', sessionId)
    .where('source', '==', 'stripe_checkout')
    .limit(1)
    .get();
  return !snap.empty;
}

async function handleInvoicePaid(invoice) {
  // Subscription renewal — add credits
  const subscriptionId = invoice.subscription;
  if (!subscriptionId) return;

  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const uid = subscription.metadata?.uid;
    const planId = subscription.metadata?.planId;

    if (!uid || !planId) {
      console.warn('[Stripe] invoice.paid: Missing uid/planId in subscription metadata');
      return;
    }

    const plan = PLANS[planId];
    if (!plan) return;

    await walletService.addCredits(uid, plan.weeklyAmountCents, 'subscription_renewal', {
      invoiceId: invoice.id,
      subscriptionId,
      planId,
    });

    console.log(`[Stripe] ✅ Subscription invoice paid. Added $${(plan.weeklyAmountCents / 100).toFixed(2)} credits for user ${uid} (${plan.name})`);
  } catch (err) {
    console.error('[Stripe] Error processing invoice.paid:', err.message);
  }
}

async function handleSubscriptionUpdated(subscription) {
  const uid = subscription.metadata?.uid;
  const planId = subscription.metadata?.planId;
  if (!uid) return;

  await walletService.updateWalletMeta(uid, {
    plan: planId || 'paygo',
    stripeSubscriptionId: subscription.id,
  });

  console.log(`[Stripe] Subscription updated for user ${uid}: ${planId || 'unknown'}`);
}

async function handleSubscriptionDeleted(subscription) {
  const uid = subscription.metadata?.uid;
  if (!uid) return;

  await walletService.updateWalletMeta(uid, {
    plan: 'paygo',
    stripeSubscriptionId: null,
  });

  console.log(`[Stripe] Subscription deleted for user ${uid} — reverted to pay-as-you-go`);
}
