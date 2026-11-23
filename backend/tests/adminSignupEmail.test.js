const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  formatSignupUrlForEmail,
  sanitizeOnboardingAttribution,
  buildAdminSignupAlertHtml,
  buildAdminSignupAlertText,
  buildAdminAgencySignupSubject,
  buildAdminAgencySignupAlertHtml,
  buildAdminAgencySignupAlertText,
} = require('../src/utils/adminSignupEmail');

describe('sanitizeOnboardingAttribution', () => {
  it('keeps valid signupTrack, entryUrl, and utm fields while stripping unknown utm keys', () => {
    const cleaned = sanitizeOnboardingAttribution({
      phone: '+15551234567',
      verticals: 'Medicare',
      signupTrack: 'AGENCY',
      entryTrack: 'agent',
      signupPath: '/signup/start-agency',
      entryUrl: 'https://www.callsflow.io/signup/agent?utm_source=meta&utm_campaign=q4',
      utm: { source: 'meta', campaign: 'q4', evilKey: 'ignored' },
    });
    assert.equal(cleaned.signupTrack, 'agency');
    assert.equal(cleaned.entryTrack, 'agent');
    assert.equal(cleaned.signupPath, '/signup/start-agency');
    assert.deepEqual(cleaned.utm, { source: 'meta', campaign: 'q4' });
  });

  it('drops invalid signupTrack values instead of throwing', () => {
    const cleaned = sanitizeOnboardingAttribution({
      phone: '+15551234567',
      signupTrack: 'superadmin',
      utm: {},
    });
    assert.equal('signupTrack' in cleaned, false);
    assert.equal('utm' in cleaned, false);
    assert.equal(cleaned.phone, '+15551234567');
  });

  it('strips localhost origins from signup URLs in emails so SMTP spam filters never reject', () => {
    assert.equal(
      formatSignupUrlForEmail('http://localhost:5173/signup/start-agency?utm_source=meta', '/signup/start-agency'),
      '/signup/start-agency?utm_source=meta',
    );
    assert.equal(
      formatSignupUrlForEmail('https://www.callsflow.io/signup/agent?utm_source=meta', '/signup/agent'),
      'www.callsflow.io/signup/agent?utm_source=meta',
    );
  });
});

describe('Agent / Join-Agency signup email builders', () => {
  it('includes signup type, entry URL, switched-flow note, and UTM summary', () => {
    const payload = {
      name: 'Jane <Agent>',
      email: 'jane@example.com',
      uid: 'uid_123',
      provider: 'Google',
      completedAt: '2026-11-23T15:00:00.000Z',
      phone: '+15550001111',
      weeklySpend: '$1,000 - $2,500',
      usedInbound: 'Yes',
      verticals: 'Final Expense',
      hearAbout: 'Facebook / Instagram',
      signupTrack: 'join',
      entryTrack: 'agent',
      signupPath: '/signup/join-agency',
      entryUrl: 'https://www.callsflow.io/signup/agent?utm_source=meta&utm_campaign=fe_ads',
      utm: { source: 'meta', campaign: 'fe_ads' },
      inviteCode: 'AGENCY-XYZ123',
    };

    const html = buildAdminSignupAlertHtml(payload);
    const text = buildAdminSignupAlertText(payload);

    assert.match(html, /Join Agency \(Invite: AGENCY-XYZ123\)/);
    assert.match(html, /landed on Agent \(Normal Signup\)/);
    assert.match(html, /source=meta · campaign=fe_ads/);
    assert.match(html, /Jane &lt;Agent&gt;/);
    assert.doesNotMatch(html, /Jane <Agent>/);

    assert.match(text, /Signup Type: Join Agency \(Invite: AGENCY-XYZ123\)/);
    assert.match(text, /UTM Attribution: source=meta · campaign=fe_ads/);
  });
});

describe('Distinct Agency Signup email builders', () => {
  it('builds a spam-safe amber agency notification with defanged website and clean HTTPS admin CTA', () => {
    const subject = buildAdminAgencySignupSubject({
      agencyName: 'Apex Senior Benefits',
      founderEmail: 'founder@apex.io',
    });
    assert.equal(subject, 'New agency signup: Apex Senior Benefits (founder@apex.io)');

    const payload = {
      agencyId: 'ag_999',
      agencyName: 'Apex Senior <Benefits>',
      website: 'https://apex.io',
      founderUid: 'uid_founder',
      founderName: 'Alex Founder',
      founderEmail: 'founder@apex.io',
      provider: 'Email/Password',
      phone: '+15559998888',
      weeklySpend: '$5,000+',
      usedInbound: 'Yes',
      verticals: 'Medicare',
      hearAbout: 'Google Search',
      signupPath: '/signup/start-agency',
      entryUrl: 'http://localhost:5173/signup/start-agency?utm_source=google&utm_medium=cpc',
      entryTrack: 'agency',
      utm: { source: 'google', medium: 'cpc' },
      submittedAt: '2026-11-23T15:05:00.000Z',
      reviewUrl: 'https://www.callsflow.io/app/admin/agencies',
    };

    const html = buildAdminAgencySignupAlertHtml(payload);
    const text = buildAdminAgencySignupAlertText(payload);

    assert.match(html, /Agency signup notification/);
    assert.match(html, /Open Agencies in Admin/);
    assert.match(html, /Apex Senior &lt;Benefits&gt;/);
    assert.match(html, /source=google · medium=cpc/);
    assert.doesNotMatch(html, /localhost/);

    assert.match(text, /New CallsFlow agency signup/);
    assert.match(text, /Submitted Website: apex \. io/);
    assert.doesNotMatch(text, /localhost/);
  });
});
