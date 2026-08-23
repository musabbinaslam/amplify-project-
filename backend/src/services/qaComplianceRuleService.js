const admin = require('../config/firebaseAdmin');
const { getDb } = require('../config/firestoreDb');

const SEVERITIES = new Set(['low', 'medium', 'high']);
const RULES_COLLECTION = 'qaComplianceRules';

function serializeRule(doc) {
  const data = doc.data() || {};
  return {
    id: doc.id,
    name: data.name || '',
    description: data.description || '',
    instruction: data.instruction || '',
    severity: SEVERITIES.has(data.severity) ? data.severity : 'medium',
    active: data.active !== false,
    campaignIds: Array.isArray(data.campaignIds) ? data.campaignIds.filter(Boolean) : [],
    createdBy: data.createdBy || null,
    updatedBy: data.updatedBy || null,
    createdAt: data.createdAt?.toDate?.() ? data.createdAt.toDate().toISOString() : data.createdAt || null,
    updatedAt: data.updatedAt?.toDate?.() ? data.updatedAt.toDate().toISOString() : data.updatedAt || null,
  };
}

function validateRulePayload(body, { partial = false } = {}) {
  const out = {};
  if (!partial || body.name !== undefined) {
    const name = String(body?.name || '').trim();
    if (!name) throw Object.assign(new Error('Rule name is required'), { code: 'INVALID_RULE' });
    if (name.length > 120) throw Object.assign(new Error('Rule name is too long'), { code: 'INVALID_RULE' });
    out.name = name;
  }
  if (!partial || body.description !== undefined) {
    const description = String(body?.description || '').trim();
    if (description.length > 180) {
      throw Object.assign(new Error('Rule description is too long'), { code: 'INVALID_RULE' });
    }
    out.description = description;
  }
  if (!partial || body.instruction !== undefined) {
    const instruction = String(body?.instruction || '').trim();
    if (!instruction) throw Object.assign(new Error('Rule instruction is required'), { code: 'INVALID_RULE' });
    if (instruction.length > 4000) throw Object.assign(new Error('Rule instruction is too long'), { code: 'INVALID_RULE' });
    out.instruction = instruction;
  }
  if (!partial || body.severity !== undefined) {
    const severity = String(body?.severity || 'medium').trim().toLowerCase();
    if (!SEVERITIES.has(severity)) {
      throw Object.assign(new Error('Severity must be low, medium, or high'), { code: 'INVALID_RULE' });
    }
    out.severity = severity;
  }
  if (!partial || body.active !== undefined) {
    out.active = body.active !== false;
  }
  if (!partial || body.campaignIds !== undefined) {
    const campaignIds = Array.isArray(body?.campaignIds)
      ? [...new Set(body.campaignIds.map((id) => String(id || '').trim()).filter(Boolean))]
      : [];
    out.campaignIds = campaignIds;
  }
  return out;
}

async function listRules({ activeOnly = false } = {}) {
  if (!admin) return [];
  const db = getDb();
  const snap = await db.collection(RULES_COLLECTION).get();
  const rows = snap.docs.map(serializeRule).sort((a, b) => {
    const aTs = new Date(a.createdAt || 0).getTime();
    const bTs = new Date(b.createdAt || 0).getTime();
    return (Number.isFinite(bTs) ? bTs : 0) - (Number.isFinite(aTs) ? aTs : 0);
  });
  return activeOnly ? rows.filter((r) => r.active) : rows;
}

async function listActiveRulesForCampaign(campaignId) {
  const rules = await listRules({ activeOnly: true });
  const campaign = String(campaignId || '').trim();
  if (!campaign) return rules;
  return rules.filter((rule) => !rule.campaignIds.length || rule.campaignIds.includes(campaign));
}

async function getRule(ruleId) {
  if (!admin || !ruleId) return null;
  const db = getDb();
  const doc = await db.collection(RULES_COLLECTION).doc(ruleId).get();
  if (!doc.exists) return null;
  return serializeRule(doc);
}

async function createRule(payload, actorUid) {
  if (!admin) throw Object.assign(new Error('Database unavailable'), { code: 'UNAVAILABLE' });
  const fields = validateRulePayload(payload);
  const db = getDb();
  const ref = db.collection(RULES_COLLECTION).doc();
  await ref.set({
    ...fields,
    createdBy: actorUid || null,
    updatedBy: actorUid || null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  const snap = await ref.get();
  return serializeRule(snap);
}

async function updateRule(ruleId, payload, actorUid) {
  if (!admin) throw Object.assign(new Error('Database unavailable'), { code: 'UNAVAILABLE' });
  const existing = await getRule(ruleId);
  if (!existing) throw Object.assign(new Error('Rule not found'), { code: 'NOT_FOUND' });
  const fields = validateRulePayload(payload, { partial: true });
  const db = getDb();
  await db.collection(RULES_COLLECTION).doc(ruleId).set({
    ...fields,
    updatedBy: actorUid || null,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  return getRule(ruleId);
}

async function deleteRule(ruleId) {
  if (!admin) throw Object.assign(new Error('Database unavailable'), { code: 'UNAVAILABLE' });
  const existing = await getRule(ruleId);
  if (!existing) throw Object.assign(new Error('Rule not found'), { code: 'NOT_FOUND' });
  const db = getDb();
  await db.collection(RULES_COLLECTION).doc(ruleId).delete();
  return { success: true, id: ruleId };
}

module.exports = {
  listRules,
  listActiveRulesForCampaign,
  getRule,
  createRule,
  updateRule,
  deleteRule,
};
