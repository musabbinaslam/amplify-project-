const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeCustomCopy,
  fillTokens,
  renderCustomEmail,
  previewCustomEmail,
  pickRows,
  statusBlocked,
  listAudiences,
} = require('../src/services/medicareRetargetBroadcastService');

describe('normalizeCustomCopy', () => {
  it('requires subject, headline and some copy', () => {
    const { errors } = normalizeCustomCopy({});
    assert.equal(errors.length, 3);
  });
  it('rejects non-https button links', () => {
    const { errors } = normalizeCustomCopy({ subject: 's', headline: 'h', body: 'b', ctaUrl: 'javascript:alert(1)' });
    assert.equal(errors.length, 1);
  });
  it('splits next steps from newline text and drops blanks', () => {
    const { copy } = normalizeCustomCopy({ subject: 's', headline: 'h', body: 'b', next: 'one\n\n two \n' });
    assert.deepEqual(copy.next, ['one', 'two']);
  });
});

describe('fillTokens', () => {
  it('fills name and first name tokens', () => {
    assert.equal(fillTokens('Hi {firstName} / {{name}}', 'Sam Lee'), 'Hi Sam / Sam Lee');
  });
  it('falls back to there', () => {
    assert.equal(fillTokens('Hi {first_name}', 'there'), 'Hi there');
  });
});

describe('previewCustomEmail', () => {
  it('escapes custom copy inside the branded template', () => {
    const out = previewCustomEmail({ subject: 's', headline: '{name}!', body: '<b>x</b>' }, { name: 'Sam' });
    assert.ok(out.html.includes('Sam!'));
    assert.ok(out.html.includes('&lt;b&gt;x&lt;/b&gt;'));
    assert.ok(out.html.includes('CALLSFLOW'));
  });
});

describe('preview matches real sends', () => {
  const input = { subject: 'Hi {firstName}', headline: '{name}, news', body: 'b', intro: '', eyebrow: '', sub: '', cta: '', next: [] };
  it('returns exactly the HTML a send produces', () => {
    const { copy } = normalizeCustomCopy(input);
    const sent = renderCustomEmail(copy, 'Sam Lee');
    const preview = previewCustomEmail(input, { name: 'Sam Lee' });
    assert.equal(preview.html, sent.html);
    assert.equal(preview.subject, sent.subject);
  });
  it('has no editor markers or placeholders', () => {
    const { html } = previewCustomEmail(input, { name: 'Sam Lee' });
    assert.ok(!html.includes('data-field'));
    assert.ok(!html.includes('+ Add'));
  });
});

describe('pickRows', () => {
  const rows = [{ uid: 'a', email: 'a@x.io' }, { uid: 'b', email: 'b@x.io' }, { uid: 'c', email: 'c@x.io' }];
  it('keeps only the picked people who are still eligible', () => {
    assert.deepEqual(pickRows(rows, ['c', 'a', 'gone']).map((r) => r.uid), ['a', 'c']);
  });
  it('ignores blanks, duplicates and non-arrays', () => {
    assert.deepEqual(pickRows(rows, ['b', ' b ', '', null]).map((r) => r.uid), ['b']);
    assert.deepEqual(pickRows(rows, 'a'), []);
    assert.deepEqual(pickRows(rows, undefined), []);
  });
});

describe('who can be emailed', () => {
  it('never emails opted-out agents', () => {
    assert.equal(statusBlocked('suppressed'), true);
    assert.equal(statusBlocked('suppressed', true), true);
  });
  it('leaves out converted agents unless everyone was asked for', () => {
    assert.equal(statusBlocked('converted'), true);
    assert.equal(statusBlocked('converted', true), false);
  });
  it('allows every other status, exhausted included', () => {
    for (const status of ['queued', 'pending', 'email1_sent', 'email2_sent', 'exhausted', null]) {
      assert.equal(statusBlocked(status), false);
    }
  });
  it('offers an everyone group that is the only one including paid agents', () => {
    const paid = listAudiences().filter((a) => a.includesPaid).map((a) => a.key);
    assert.deepEqual(paid, ['everyone']);
  });
});
