const { stripe, CREDIT_TIERS } = require('../config/stripe');
const walletService = require('../services/walletService');
const referralService = require('../services/referralService');
const admin = require('../config/firebaseAdmin');
const { getDb } = require('../config/firestoreDb');

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
    // Check for active referral discount
    let finalAmountCents = amountCents;
    let referralDiscountApplied = false;
    let discountSavedCents = 0;
    let discountPercent = 0;

    try {
      const discount = await referralService.getDiscountStatus(req.user.uid);
      if (discount.hasDiscount && !discount.expired) {
        const result = referralService.calculateDiscount(amountCents, discount.percent);
        finalAmountCents = result.discountedAmountCents;
        discountSavedCents = result.savedCents;
        discountPercent = discount.percent;
        referralDiscountApplied = true;
        console.log(`[Stripe] Referral discount applied: ${discount.percent}% off ($${(amountCents / 100).toFixed(2)} → $${(finalAmountCents / 100).toFixed(2)})`);
      }
    } catch (discErr) {
      console.warn('[Stripe] Referral discount check failed (non-blocking):', discErr.message);
    }

    // Get or create Stripe Customer
    const customerId = await getOrCreateCustomer(req.user.uid, req.user.email);

    const productName = referralDiscountApplied
      ? `CallsFlow Credits — ${tier.label} (${discountPercent}% referral discount)`
      : `CallsFlow Credits — ${tier.label}`;
    const productDescription = referralDiscountApplied
      ? `Add ${tier.label} in call credits (discounted from $${(amountCents / 100).toFixed(2)})`
      : `Add ${tier.label} in call credits to your wallet`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer: customerId,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: productName,
              description: productDescription,
            },
            unit_amount: finalAmountCents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        uid: req.user.uid,
        type: 'credit_topup',
        amountCents: String(amountCents),
        chargedCents: String(finalAmountCents),
        referralDiscount: referralDiscountApplied ? 'true' : 'false',
        discountSavedCents: String(discountSavedCents),
        discountPercent: String(discountPercent),
      },
      success_url: `${CLIENT_URL}/app/billing?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${CLIENT_URL}/app/billing?payment=cancelled`,
    });

    res.json({ url: session.url, discountApplied: referralDiscountApplied, discountPercent, originalAmountCents: amountCents, chargedAmountCents: finalAmountCents });
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
      const idempotencyKey = session.payment_intent
        ? `stripe_pi_${session.payment_intent}`
        : `stripe_cs_${session.id}`;

      await walletService.addCredits(uid, amountCents, 'stripe_checkout', {
        idempotencyKey,
        sessionId: session.id,
        paymentIntentId: session.payment_intent || null,
        source: 'verify_checkout_fallback',
      });

      // ── Referral Stage 2: Advance to "qualified" on first qualifying payment ──
      try {
        await referralService.advanceToQualified(uid, amountCents);
      } catch (err) {
        console.warn('[Referral] Stage 2 advance failed (non-blocking):', err.message);
      }

      // ── Referral: Mark discount as used if this was a discounted purchase ──
      if (session.metadata?.referralDiscount === 'true') {
        const savedCents = parseInt(session.metadata.discountSavedCents) || 0;
        if (savedCents > 0) {
          try {
            await referralService.markDiscountUsed(uid, savedCents, {
              sessionId: session.id,
              paymentIntentId: session.payment_intent,
              originalAmountCents: amountCents,
              source: 'verify_checkout_fallback',
            });
          } catch (err) {
            console.error('[Referral] markDiscountUsed failed:', err.message);
          }
        }
      }

      return res.json({ success: true, credited: true });
    }

    return res.json({ success: true, credited: false });
  } catch (err) {
    console.error('[Stripe] Verify checkout error:', err.message);
    return res.status(500).json({ error: 'Failed to verify checkout session' });
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

  let handlerFailed = false;
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        await handleCheckoutCompleted(session);
        break;
      }
      default:
        console.log(`[Stripe] Unhandled event type: ${event.type}`);
    }
  } catch (err) {
    console.error(`[Stripe] Error handling ${event.type}:`, err.message);
    handlerFailed = true;
  }

  if (handlerFailed) {
    return res.status(500).send('Webhook handler failed');
  }
  return res.json({ received: true });
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

  const idempotencyKey = session.payment_intent
    ? `stripe_pi_${session.payment_intent}`
    : `stripe_cs_${session.id}`;

  await walletService.addCredits(uid, amountCents, 'stripe_checkout', {
    idempotencyKey,
    sessionId: session.id,
    paymentIntentId: session.payment_intent,
  });

  console.log(`[Stripe] ✅ Checkout completed. Added $${(amountCents / 100).toFixed(2)} credits for user ${uid}`);

  // ── Referral Stage 2: Advance to "qualified" on first qualifying payment ──
  try {
    await referralService.advanceToQualified(uid, amountCents);
  } catch (err) {
    console.warn('[Referral] Stage 2 advance failed (non-blocking):', err.message);
  }

  // ── Referral: Mark discount as used if this was a discounted purchase ──
  if (session.metadata?.referralDiscount === 'true') {
    const savedCents = parseInt(session.metadata.discountSavedCents) || 0;
    if (savedCents > 0) {
      try {
        await referralService.markDiscountUsed(uid, savedCents, {
          sessionId: session.id,
          paymentIntentId: session.payment_intent,
          originalAmountCents: amountCents,
        });
      } catch (err) {
        console.error('[Referral] markDiscountUsed failed:', err.message);
      }
    }
  }
}

async function hasCreditTransactionForSession(uid, sessionId) {
  const db = getDb();
  if (!db) return false;
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

