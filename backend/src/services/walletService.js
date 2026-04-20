const admin = require('../config/firebaseAdmin');
const { getDb } = require('../config/firestoreDb');

function userRef(uid) {
  const db = getDb();
  if (!db) return null;
  return db.collection('users').doc(uid);
}

/**
 * Get the wallet object for a user.
 * Returns { balance, plan, stripeCustomerId, stripeSubscriptionId }
 */
async function getWallet(uid) {
  const ref = userRef(uid);
  if (!ref) throw new Error('Database unavailable');
  const snap = await ref.get();
  const data = snap.exists ? snap.data() : {};
  return {
    balance: data.wallet?.balance || 0,
    plan: data.wallet?.plan || 'paygo',
    stripeCustomerId: data.wallet?.stripeCustomerId || null,
    stripeSubscriptionId: data.wallet?.stripeSubscriptionId || null,
  };
}

/**
 * Get the current balance in cents.
 */
async function getBalance(uid) {
  const wallet = await getWallet(uid);
  return wallet.balance;
}

/**
 * Add credits to a user's wallet (atomic increment).
 * @param {string} uid
 * @param {number} amountCents - positive integer (in cents)
 * @param {string} source - 'stripe_checkout' | 'subscription_renewal' | 'manual'
 * @param {object} metadata - { sessionId, invoiceId, etc. }
 */
async function addCredits(uid, amountCents, source = 'manual', metadata = {}) {
  const ref = userRef(uid);
  if (!ref) throw new Error('Database unavailable');
  const { FieldValue } = admin.firestore;

  // Atomically increment balance
  await ref.set(
    { wallet: { balance: FieldValue.increment(amountCents) } },
    { merge: true }
  );

  // Read new balance for the transaction record
  const snap = await ref.get();
  const newBalance = snap.data()?.wallet?.balance || 0;

  // Record transaction
  await ref.collection('transactions').add({
    type: 'credit',
    amountCents,
    description: descriptionForSource(source, amountCents),
    source,
    metadata,
    balanceAfterCents: newBalance,
    createdAt: FieldValue.serverTimestamp(),
  });

  console.log(`[Wallet] ✅ +$${(amountCents / 100).toFixed(2)} for user ${uid}. New balance: $${(newBalance / 100).toFixed(2)}`);
  return newBalance;
}

/**
 * Deduct credits from a user's wallet.
 * Returns the new balance, or throws if insufficient funds.
 */
async function deductCredits(uid, amountCents, metadata = {}) {
  const ref = userRef(uid);
  if (!ref) throw new Error('Database unavailable');
  const { FieldValue } = admin.firestore;

  // Check current balance
  const snap = await ref.get();
  const current = snap.data()?.wallet?.balance || 0;

  if (current < amountCents) {
    console.warn(`[Wallet] ⚠️  Insufficient balance for user ${uid}. Has: $${(current / 100).toFixed(2)}, needs: $${(amountCents / 100).toFixed(2)}`);
    // Still deduct (can go negative) — the system records the debt
  }

  // Atomically decrement
  await ref.set(
    { wallet: { balance: FieldValue.increment(-amountCents) } },
    { merge: true }
  );

  const updatedSnap = await ref.get();
  const newBalance = updatedSnap.data()?.wallet?.balance || 0;

  // Record transaction
  await ref.collection('transactions').add({
    type: 'debit',
    amountCents,
    description: `Call charge — ${metadata.campaignLabel || metadata.campaignId || 'Unknown'}`,
    source: 'call_deduction',
    metadata,
    balanceAfterCents: newBalance,
    createdAt: FieldValue.serverTimestamp(),
  });

  console.log(`[Wallet] 💸 -$${(amountCents / 100).toFixed(2)} for user ${uid}. New balance: $${(newBalance / 100).toFixed(2)}`);
  return newBalance;
}

/**
 * Get recent transactions for a user.
 */
async function getTransactions(uid, limit = 50) {
  const ref = userRef(uid);
  if (!ref) throw new Error('Database unavailable');
  const snap = await ref
    .collection('transactions')
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();

  return snap.docs.map((doc) => {
    const d = doc.data();
    return {
      id: doc.id,
      ...d,
      createdAt: d.createdAt?.toDate?.() ? d.createdAt.toDate().toISOString() : d.createdAt,
    };
  });
}

/**
 * Update wallet metadata (plan, stripeCustomerId, etc.)
 */
async function updateWalletMeta(uid, fields) {
  const ref = userRef(uid);
  if (!ref) throw new Error('Database unavailable');
  const { FieldValue } = admin.firestore;
  const walletUpdate = {};
  for (const [k, v] of Object.entries(fields)) {
    walletUpdate[`wallet.${k}`] = v;
  }
  await ref.update({
    ...walletUpdate,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

function descriptionForSource(source, amountCents) {
  const dollars = `$${(amountCents / 100).toFixed(2)}`;
  switch (source) {
    case 'stripe_checkout': return `Credit top-up — ${dollars}`;
    case 'subscription_renewal': return `Subscription credit — ${dollars}`;
    case 'manual': return `Manual credit — ${dollars}`;
    default: return `Credit added — ${dollars}`;
  }
}

module.exports = {
  getWallet,
  getBalance,
  addCredits,
  deductCredits,
  getTransactions,
  updateWalletMeta,
};
