const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  userHasMedicareVertical,
  isDueForEmail2,
  EMAIL_GAP_MS,
} = require('../src/services/medicareRetargetService');

describe('userHasMedicareVertical', () => {
  it('matches a signup string', () => {
    assert.equal(userHasMedicareVertical({ onboarding: { verticals: 'Medicare' } }), true);
  });
  it('matches a profile array', () => {
    assert.equal(userHasMedicareVertical({ onboarding: { verticals: ['ACA', 'Medicare'] } }), true);
  });
  it('rejects other verticals', () => {
    assert.equal(userHasMedicareVertical({ onboarding: { verticals: 'Final Expense' } }), false);
  });
});

describe('isDueForEmail2', () => {
  it('waits two days after email 1', () => {
    const now = Date.now();
    assert.equal(isDueForEmail2({ status: 'email1_sent', email1SentAt: new Date(now - EMAIL_GAP_MS + 60_000).toISOString() }, now), false);
    assert.equal(isDueForEmail2({ status: 'email1_sent', email1SentAt: new Date(now - EMAIL_GAP_MS - 1).toISOString() }, now), true);
  });
  it('honors ignoreGap', () => {
    assert.equal(isDueForEmail2({ status: 'email1_sent', email1SentAt: new Date().toISOString() }, Date.now(), true), true);
  });
});
