const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  UNSPECIFIED,
  signupTrackOf,
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

describe('signupTrackOf and tracks breakdown', () => {
  it('resolves explicit signupTrack values and legacy fallbacks', () => {
    assert.equal(signupTrackOf({ onboarding: { signupTrack: 'agent' } }), 'Agent');
    assert.equal(signupTrackOf({ onboarding: { signupTrack: 'join' } }), 'Join agency');
    assert.equal(signupTrackOf({ onboarding: { signupTrack: 'agency' } }), 'Start agency');
    assert.equal(signupTrackOf({ agencyRole: 'agency_admin', onboarding: {} }), 'Start agency');
    assert.equal(signupTrackOf({ agencyId: 'ag_1', agencyRole: 'agency_agent', onboarding: {} }), 'Join agency');
    assert.equal(signupTrackOf({ onboarding: {} }), 'Agent');
  });

  it('aggregates all three canonical signup tracks with paths, spend, and byTrack daily counts', () => {
    const users = [
      { id: 'u1', onboarding: { verticals: 'Medicare', signupTrack: 'agent', completedAt: '2026-11-10T15:00:00.000Z' } },
      { id: 'u2', onboarding: { verticals: 'ACA', signupTrack: 'join', completedAt: '2026-11-10T16:00:00.000Z' } },
      { id: 'u3', onboarding: { verticals: 'Final Expense', signupTrack: 'agency', completedAt: '2026-11-11T15:00:00.000Z' } },
      { id: 'u4', onboarding: { verticals: 'Medicare', signupTrack: 'agent', completedAt: '2026-11-11T17:00:00.000Z' } },
    ];
    const spendByAgent = new Map([['u1', 40], ['u2', 60]]);
    const out = aggregateSignups({
      users,
      spendByAgent,
      fromKey: '2026-11-10',
      toKey: '2026-11-11',
      tz: 'America/New_York',
    });

    assert.equal(out.tracks.length, 3);
    const agentRow = out.tracks.find((t) => t.key === 'agent');
    const joinRow = out.tracks.find((t) => t.key === 'join');
    const agencyRow = out.tracks.find((t) => t.key === 'agency');

    assert.equal(agentRow.path, '/signup/agent');
    assert.equal(agentRow.signups, 2);
    assert.equal(agentRow.spendingAgents, 1);
    assert.equal(agentRow.revenue, 40);
    assert.equal(agentRow.share, 0.5);

    assert.equal(joinRow.path, '/signup/join-agency');
    assert.equal(joinRow.signups, 1);
    assert.equal(joinRow.revenue, 60);

    assert.equal(agencyRow.path, '/signup/start-agency');
    assert.equal(agencyRow.signups, 1);
    assert.equal(agencyRow.revenue, 0);

    assert.deepEqual(out.byDay[0].byTrack, { Agent: 1, 'Join agency': 1 });
    assert.deepEqual(out.byDay[1].byTrack, { 'Start agency': 1, Agent: 1 });
  });
});
