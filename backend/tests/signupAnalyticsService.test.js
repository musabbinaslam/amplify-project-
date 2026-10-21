const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  UNSPECIFIED,
  verticalsOf,
  dayKeysBetween,
  aggregateSignups,
} = require('../src/services/signupAnalyticsService');

describe('verticalsOf', () => {
  it('reads a signup string', () => {
    assert.deepEqual(verticalsOf({ onboarding: { verticals: 'Medicare' } }), ['Medicare']);
  });
  it('reads an array and de-duplicates', () => {
    assert.deepEqual(verticalsOf({ onboarding: { verticals: ['ACA', 'Medicare', 'ACA'] } }), ['ACA', 'Medicare']);
  });
  it('reads a comma-separated string', () => {
    assert.deepEqual(verticalsOf({ onboarding: { verticals: 'Final Expense, ACA' } }), ['Final Expense', 'ACA']);
  });
  it('falls back to Not specified', () => {
    assert.deepEqual(verticalsOf({ onboarding: {} }), [UNSPECIFIED]);
  });
});

describe('dayKeysBetween', () => {
  it('is inclusive', () => {
    assert.deepEqual(dayKeysBetween('2026-10-30', '2026-11-02'), ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
  });
  it('returns nothing for a reversed range', () => {
    assert.deepEqual(dayKeysBetween('2026-11-02', '2026-11-01'), []);
  });
});

describe('aggregateSignups', () => {
  const users = [
    { id: 'a', onboarding: { verticals: 'Medicare', completedAt: '2026-10-14T15:00:00.000Z' } },
    { id: 'b', onboarding: { verticals: 'Medicare', completedAt: '2026-10-15T15:00:00.000Z' } },
    { id: 'c', onboarding: { verticals: ['ACA', 'Medicare'], completedAt: '2026-10-15T16:00:00.000Z' } },
    { id: 'd', onboarding: { verticals: 'Final Expense', completedAt: '2026-10-16T15:00:00.000Z' } },
    { id: 'e', onboarding: { verticals: '', completedAt: '2026-10-16T18:00:00.000Z' } },
    { id: 'out', onboarding: { verticals: 'ACA', completedAt: '2026-10-20T15:00:00.000Z' } },
  ];
  const spendByAgent = new Map([['a', 50], ['c', 35], ['d', 25]]);
  const out = aggregateSignups({ users, spendByAgent, fromKey: '2026-10-14', toKey: '2026-10-16', tz: 'America/New_York' });

  it('summarises unique agents', () => {
    assert.equal(out.summary.signups, 5);
    assert.equal(out.summary.spendingAgents, 3);
    assert.equal(out.summary.revenue, 110);
    assert.equal(out.summary.conversionRate, 0.6);
    assert.equal(out.summary.revenuePerSignup, 22);
  });

  it('groups by vertical, counting multi-vertical agents in each', () => {
    const medicare = out.verticals.find((v) => v.vertical === 'Medicare');
    assert.equal(medicare.signups, 3);
    assert.equal(medicare.spendingAgents, 2);
    assert.equal(medicare.revenue, 85);
    const aca = out.verticals.find((v) => v.vertical === 'ACA');
    assert.equal(aca.signups, 1);
    assert.equal(aca.revenue, 35);
    assert.ok(out.verticals.find((v) => v.vertical === UNSPECIFIED));
    assert.equal(out.verticals[0].vertical, 'Medicare');
  });

  it('builds a zero-filled daily trend in the requested timezone', () => {
    assert.deepEqual(out.byDay.map((d) => d.day), ['2026-10-14', '2026-10-15', '2026-10-16']);
    assert.deepEqual(out.byDay.map((d) => d.total), [1, 2, 2]);
    assert.equal(out.byDay[1].byVertical.Medicare, 2);
    assert.equal(out.byDay[1].byVertical.ACA, 1);
  });
});
