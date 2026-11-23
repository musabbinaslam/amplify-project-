const VALID_SIGNUP_TRACKS = new Set(['agent', 'join', 'agency']);

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function resolveAdminSignupNotifyEmail() {
  return String(process.env.ADMIN_SIGNUP_NOTIFY_EMAIL || 'admin@callsflow.io').trim();
}

function resolveWebOrigin() {
  const candidates = [
    ...String(process.env.CLIENT_URLS || '').split(',').map((v) => v.trim()),
    String(process.env.CLIENT_URL || '').trim(),
    String(process.env.APP_DASHBOARD_URL || '').trim(),
  ].filter(Boolean);

  for (const raw of candidates) {
    try {
      const parsed = new URL(raw);
      const host = String(parsed.hostname || '').toLowerCase();
      // Never embed localhost/loopback links in outbound emails (triggers SMTP spam filters).
      if (parsed.origin && parsed.origin !== 'null' && host !== 'localhost' && host !== '127.0.0.1') {
        return parsed.origin;
      }
    } catch {
      // try next candidate
    }
  }
  return 'https://www.callsflow.io';
}

/**
 * Format signup URL for email display without exposing localhost origins or raw schemes
 * that trip outbound SMTP URI spam filters.
 */
function formatSignupUrlForEmail(entryUrl, signupPath, fallbackPath = '/signup/agent') {
  const raw = String(entryUrl || '').trim();
  if (raw) {
    try {
      const parsed = new URL(raw);
      const pathAndQuery = `${parsed.pathname || fallbackPath}${parsed.search || ''}`;
      const host = String(parsed.hostname || '').toLowerCase();
      if (host === 'localhost' || host === '127.0.0.1') {
        return pathAndQuery;
      }
      return `${parsed.host}${pathAndQuery}`;
    } catch {
      return raw.replace(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i, '') || fallbackPath;
    }
  }
  return String(signupPath || fallbackPath).trim() || fallbackPath;
}

function formatSignupProvider(rawProvider) {
  const v = String(rawProvider || '').trim().toLowerCase();
  if (!v) return 'Unknown';
  if (v === 'google.com' || v === 'google') return 'Google';
  if (v === 'password' || v === 'email') return 'Email/Password';
  if (v === 'phone') return 'Phone';
  if (v === 'github.com') return 'GitHub';
  if (v === 'apple.com') return 'Apple';
  return v;
}

function formatSignupTrackLabel(track, { inviteCode } = {}) {
  const normalized = String(track || '').trim().toLowerCase();
  if (normalized === 'agency') return 'Start Agency';
  if (normalized === 'join') {
    const code = String(inviteCode || '').trim();
    return code ? `Join Agency (Invite: ${code})` : 'Join Agency';
  }
  return 'Agent (Normal Signup)';
}

function formatUtmSummary(utm) {
  if (!utm || typeof utm !== 'object') return '';
  const parts = [];
  if (utm.source) parts.push(`source=${utm.source}`);
  if (utm.medium) parts.push(`medium=${utm.medium}`);
  if (utm.campaign) parts.push(`campaign=${utm.campaign}`);
  if (utm.content) parts.push(`content=${utm.content}`);
  if (utm.term) parts.push(`term=${utm.term}`);
  if (!parts.length && utm.fbclid) parts.push('fbclid present');
  if (!parts.length && utm.gclid) parts.push('gclid present');
  return parts.join(' · ');
}

function sanitizeUtmObject(rawUtm) {
  if (!rawUtm || typeof rawUtm !== 'object' || Array.isArray(rawUtm)) return undefined;
  const allowed = ['source', 'medium', 'campaign', 'content', 'term', 'fbclid', 'gclid'];
  const cleaned = {};
  let hasAny = false;
  for (const key of allowed) {
    const val = String(rawUtm[key] || '').trim().slice(0, 120);
    if (val) {
      cleaned[key] = val;
      hasAny = true;
    }
  }
  return hasAny ? cleaned : undefined;
}

function sanitizeOnboardingAttribution(onboarding) {
  if (!onboarding || typeof onboarding !== 'object' || Array.isArray(onboarding)) {
    return onboarding;
  }
  const next = { ...onboarding };

  if ('signupTrack' in next) {
    const t = String(next.signupTrack || '').trim().toLowerCase();
    if (VALID_SIGNUP_TRACKS.has(t)) next.signupTrack = t;
    else delete next.signupTrack;
  }
  if ('entryTrack' in next) {
    const t = String(next.entryTrack || '').trim().toLowerCase();
    if (VALID_SIGNUP_TRACKS.has(t)) next.entryTrack = t;
    else delete next.entryTrack;
  }
  if ('signupPath' in next) {
    const p = String(next.signupPath || '').trim().slice(0, 160);
    if (p) next.signupPath = p;
    else delete next.signupPath;
  }
  if ('entryUrl' in next) {
    const u = String(next.entryUrl || '').trim().slice(0, 500);
    if (u) next.entryUrl = u;
    else delete next.entryUrl;
  }
  if ('utm' in next) {
    const cleanedUtm = sanitizeUtmObject(next.utm);
    if (cleanedUtm) next.utm = cleanedUtm;
    else delete next.utm;
  }
  if ('inviteCode' in next) {
    const c = String(next.inviteCode || '').trim().toUpperCase().slice(0, 40);
    if (c) next.inviteCode = c;
    else delete next.inviteCode;
  }
  if ('agencyName' in next) {
    const n = String(next.agencyName || '').trim().slice(0, 120);
    if (n) next.agencyName = n;
    else delete next.agencyName;
  }
  if ('agencyWebsite' in next) {
    const w = String(next.agencyWebsite || '').trim().slice(0, 200);
    if (w) next.agencyWebsite = w;
    else delete next.agencyWebsite;
  }

  return next;
}

function renderFieldRows(rows, { INK, INK_SOFT, MUTED, BORDER }) {
  const filtered = rows.filter(
    (r) => r && r.value !== undefined && r.value !== null && String(r.value).trim() !== '',
  );
  return filtered
    .map((row, idx) => {
      const topStyle = idx === 0 ? '' : ` border-top:1px solid ${BORDER}; padding-top:14px;`;
      const valueStyle = row.mono
        ? `padding-bottom:${idx === filtered.length - 1 ? '0' : '14px'}; font-size:13px; color:${INK_SOFT}; font-family:'SFMono-Regular',Menlo,Consolas,monospace; word-break:break-all;`
        : `padding-bottom:${idx === filtered.length - 1 ? '0' : '14px'}; font-size:14px; font-weight:${row.subtle ? '400' : '600'}; color:${row.subtle ? INK_SOFT : INK}; word-break:break-word;`;
      return `
                            <tr>
                              <td style="padding-bottom:10px; font-size:11px; font-weight:700; letter-spacing:1.2px; text-transform:uppercase; color:${MUTED};${topStyle}">
                                ${escapeHtml(row.label)}
                              </td>
                            </tr>
                            <tr>
                              <td style="${valueStyle}">
                                ${escapeHtml(String(row.value))}
                              </td>
                            </tr>`;
    })
    .join('');
}

function buildAdminSignupAlertHtml({
  name,
  email,
  uid,
  provider,
  completedAt,
  phone,
  weeklySpend,
  usedInbound,
  verticals,
  hearAbout,
  signupTrack,
  entryTrack,
  signupPath,
  entryUrl,
  utm,
  inviteCode,
}) {
  const BRAND = '#25f425';
  const BRAND_DARK = '#18a818';
  const BG = '#f4f6f5';
  const CARD = '#ffffff';
  const INK = '#0e0e0e';
  const INK_SOFT = '#4b5563';
  const MUTED = '#6b7280';
  const BORDER = '#e5e7eb';
  const HEADER_BG = '#0e0e0e';

  const trackLabel = formatSignupTrackLabel(signupTrack, { inviteCode });
  const switchedNote = entryTrack && signupTrack && entryTrack !== signupTrack
    ? `${trackLabel} (landed on ${formatSignupTrackLabel(entryTrack)})`
    : trackLabel;
  const utmSummary = formatUtmSummary(utm);
  const urlDisplay = formatSignupUrlForEmail(entryUrl, signupPath, '/signup/agent');

  const rows = [
    { label: 'Signup Type', value: switchedNote },
    { label: 'Signup Path', value: urlDisplay, mono: true },
    ...(utmSummary ? [{ label: 'UTM Attribution', value: utmSummary }] : []),
    { label: 'Name', value: name || 'N/A' },
    { label: 'Email', value: email || 'N/A' },
    { label: 'Provider', value: provider || 'Unknown' },
    { label: 'Phone', value: phone || 'N/A' },
    { label: 'Selected Campaign', value: verticals || 'N/A' },
    { label: 'Weekly Spend', value: weeklySpend || 'N/A' },
    { label: 'Used Inbound Before', value: usedInbound || 'N/A' },
    { label: 'Hear About Source', value: hearAbout || 'N/A' },
    { label: 'UID', value: uid || 'N/A', mono: true },
    { label: 'Completed', value: completedAt || new Date().toISOString(), subtle: true },
  ];

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>New CallsFlow Signup</title>
</head>
<body style="margin:0; padding:0; background:${BG}; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; color:${INK}; -webkit-font-smoothing:antialiased;">
  <div style="display:none; font-size:0; line-height:0; max-height:0; max-width:0; opacity:0; overflow:hidden;">
    New CallsFlow signup: ${escapeHtml(name)} (${escapeHtml(email)}).
  </div>

  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:${BG}; padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width:600px; width:100%;">
          <tr>
            <td style="padding:0 4px 18px 4px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td align="left" style="font-size:0; line-height:0;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="display:inline-block; vertical-align:middle;">
                      <tr>
                        <td style="width:34px; height:34px; background:${BRAND}; border-radius:9px; vertical-align:middle; text-align:center; line-height:34px;">
                          <span style="display:inline-block; width:0; height:0; border-top:7px solid transparent; border-bottom:7px solid transparent; border-left:11px solid ${INK}; vertical-align:middle; margin-left:2px;"></span>
                        </td>
                        <td style="padding-left:10px; vertical-align:middle; font-size:17px; font-weight:800; letter-spacing:1.5px; color:${INK};">
                          CALLSFLOW
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background:${CARD}; border-radius:18px; overflow:hidden; box-shadow:0 4px 24px rgba(14,14,14,0.06); border:1px solid ${BORDER};">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:${HEADER_BG};">
                <tr>
                  <td style="padding:36px 40px 28px 40px; color:#ffffff;">
                    <div style="font-size:12px; font-weight:700; letter-spacing:2px; text-transform:uppercase; color:${BRAND}; margin-bottom:12px;">
                      ${escapeHtml(signupTrack === 'join' ? 'Agency member signup' : 'Signup notification')}
                    </div>
                    <div style="font-size:26px; line-height:1.25; font-weight:700; color:#ffffff; margin-bottom:6px;">
                      ${escapeHtml(signupTrack === 'join' ? 'New agency member signed up' : 'New user just signed up')}
                    </div>
                    <div style="font-size:14px; line-height:1.55; color:#adaaaa;">
                      A new account was created on CallsFlow.
                    </div>
                  </td>
                </tr>
              </table>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="padding:30px 40px 0 40px;">
                    <p style="margin:0 0 18px 0; font-size:15px; color:${INK_SOFT};">
                      Signup details:
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 40px 0 40px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:${BG}; border:1px solid ${BORDER}; border-left:3px solid ${BRAND_DARK}; border-radius:10px;">
                      <tr>
                        <td style="padding:18px 20px;">
                          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                            ${renderFieldRows(rows, { INK, INK_SOFT, MUTED, BORDER })}
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:24px 40px 36px 40px; font-size:14px; line-height:1.6; color:${INK_SOFT};">
                    This is an automated signup alert from CallsFlow.<br/>
                    <strong style="color:${INK};">— CallsFlow System</strong>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 8px 0 8px; text-align:center; font-size:12px; line-height:1.6; color:${MUTED};">
              You are receiving this because you're configured for CallsFlow signup alerts.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildAdminSignupAlertText({
  name,
  email,
  uid,
  provider,
  completedAt,
  phone,
  weeklySpend,
  usedInbound,
  verticals,
  hearAbout,
  signupTrack,
  entryTrack,
  signupPath,
  entryUrl,
  utm,
  inviteCode,
}) {
  const trackLabel = formatSignupTrackLabel(signupTrack, { inviteCode });
  const switchedNote = entryTrack && signupTrack && entryTrack !== signupTrack
    ? `${trackLabel} (landed on ${formatSignupTrackLabel(entryTrack)})`
    : trackLabel;
  const utmSummary = formatUtmSummary(utm);
  const urlDisplay = formatSignupUrlForEmail(entryUrl, signupPath, '/signup/agent');

  return [
    'New CallsFlow signup',
    '',
    `Signup Type: ${switchedNote}`,
    `Signup Path: ${urlDisplay}`,
    ...(utmSummary ? [`UTM Attribution: ${utmSummary}`] : []),
    `Name: ${name}`,
    `Email: ${email}`,
    `UID: ${uid}`,
    `Provider: ${provider}`,
    `Phone: ${phone || 'N/A'}`,
    `Selected Vertical: ${verticals || 'N/A'}`,
    `Weekly Spend: ${weeklySpend || 'N/A'}`,
    `Used Inbound: ${usedInbound || 'N/A'}`,
    `Hear About: ${hearAbout || 'N/A'}`,
    `Completed: ${completedAt}`,
  ].join('\n');
}

function buildAdminAgencySignupSubject({ agencyName, founderEmail }) {
  const cleanAgency = String(agencyName || 'New agency').trim();
  const cleanEmail = String(founderEmail || '').trim();
  return cleanEmail
    ? `New agency signup: ${cleanAgency} (${cleanEmail})`
    : `New agency signup: ${cleanAgency}`;
}

/**
 * Format user-entered website so arbitrary external/unverified domains in test or
 * spammy submissions don't trip outbound SMTP URI blocklists.
 */
function formatSubmittedWebsite(rawWebsite) {
  const trimmed = String(rawWebsite || '').trim();
  if (!trimmed) return 'Not provided';
  return trimmed.replace(/^https?:\/\//i, '').replace(/\./g, ' . ');
}

function buildAdminAgencySignupAlertHtml({
  agencyId,
  agencyName,
  website,
  founderUid,
  founderName,
  founderEmail,
  provider,
  phone,
  weeklySpend,
  usedInbound,
  verticals,
  hearAbout,
  signupPath,
  entryUrl,
  entryTrack,
  utm,
  submittedAt,
  reviewUrl,
}) {
  const ACCENT = '#f59e0b';
  const ACCENT_DARK = '#d97706';
  const ACCENT_SOFT_BG = '#fffbeb';
  const ACCENT_SOFT_BORDER = '#fde68a';
  const BG = '#f4f6f5';
  const CARD = '#ffffff';
  const INK = '#0e0e0e';
  const INK_SOFT = '#4b5563';
  const MUTED = '#6b7280';
  const BORDER = '#e5e7eb';
  const HEADER_BG = '#0e0e0e';

  // Use a clean CallsFlow HTTPS link (matching Welcome email) so outbound SMTP filters trust the CTA.
  const safeReviewUrl = (() => {
    const candidate = String(reviewUrl || '').trim();
    if (candidate && /^https:\/\//i.test(candidate) && !/localhost|127\.0\.0\.1/i.test(candidate)) {
      return candidate;
    }
    return `${resolveWebOrigin()}/app/admin/agencies`;
  })();

  const utmSummary = formatUtmSummary(utm);
  const urlDisplay = formatSignupUrlForEmail(entryUrl, signupPath, '/signup/start-agency');
  const entryNote = entryTrack && entryTrack !== 'agency'
    ? `Start Agency (switched from ${formatSignupTrackLabel(entryTrack)})`
    : 'Start Agency (/signup/start-agency)';

  const agencyRows = [
    { label: 'Agency Name', value: agencyName || 'N/A' },
    { label: 'Submitted Website', value: formatSubmittedWebsite(website) },
    { label: 'Status', value: 'Pending approval' },
    ...(agencyId ? [{ label: 'Agency ID', value: agencyId, mono: true }] : []),
  ];

  const founderRows = [
    { label: 'Signup Type', value: entryNote },
    { label: 'Signup Path', value: urlDisplay, mono: true },
    ...(utmSummary ? [{ label: 'UTM Attribution', value: utmSummary }] : []),
    { label: 'Applicant Name', value: founderName || 'N/A' },
    { label: 'Applicant Email', value: founderEmail || 'N/A' },
    { label: 'Phone', value: phone || 'N/A' },
    ...(provider ? [{ label: 'Provider', value: provider }] : []),
    { label: 'Selected Vertical', value: verticals || 'N/A' },
    { label: 'Weekly Spend', value: weeklySpend || 'N/A' },
    { label: 'Used Inbound Before', value: usedInbound || 'N/A' },
    { label: 'Hear About Source', value: hearAbout || 'N/A' },
    ...(founderUid ? [{ label: 'UID', value: founderUid, mono: true }] : []),
    { label: 'Completed', value: submittedAt || new Date().toISOString(), subtle: true },
  ];

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>New CallsFlow Agency Signup</title>
</head>
<body style="margin:0; padding:0; background:${BG}; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; color:${INK}; -webkit-font-smoothing:antialiased;">
  <div style="display:none; font-size:0; line-height:0; max-height:0; max-width:0; opacity:0; overflow:hidden;">
    New CallsFlow agency signup: ${escapeHtml(agencyName || '')} (${escapeHtml(founderEmail || '')}).
  </div>

  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:${BG}; padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width:600px; width:100%;">
          <tr>
            <td style="padding:0 4px 18px 4px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td align="left" style="font-size:0; line-height:0;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="display:inline-block; vertical-align:middle;">
                      <tr>
                        <td style="width:34px; height:34px; background:${ACCENT}; border-radius:9px; vertical-align:middle; text-align:center; line-height:34px;">
                          <span style="display:inline-block; width:0; height:0; border-top:7px solid transparent; border-bottom:7px solid transparent; border-left:11px solid ${INK}; vertical-align:middle; margin-left:2px;"></span>
                        </td>
                        <td style="padding-left:10px; vertical-align:middle; font-size:17px; font-weight:800; letter-spacing:1.5px; color:${INK};">
                          CALLSFLOW
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="background:${CARD}; border-radius:18px; overflow:hidden; box-shadow:0 4px 24px rgba(14,14,14,0.06); border:1px solid ${BORDER};">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:${HEADER_BG};">
                <tr>
                  <td style="padding:36px 40px 28px 40px; color:#ffffff;">
                    <div style="font-size:12px; font-weight:700; letter-spacing:2px; text-transform:uppercase; color:${ACCENT}; margin-bottom:12px;">
                      Agency signup notification
                    </div>
                    <div style="font-size:26px; line-height:1.25; font-weight:700; color:#ffffff; margin-bottom:6px;">
                      ${escapeHtml(agencyName || 'New agency')} signed up
                    </div>
                    <div style="font-size:14px; line-height:1.55; color:#adaaaa;">
                      A new agency account was created on CallsFlow and is awaiting approval in Admin.
                    </div>
                  </td>
                </tr>
              </table>

              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="padding:28px 40px 8px 40px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td style="border-radius:10px; background:${ACCENT};">
                          <a href="${escapeHtml(safeReviewUrl)}" style="display:inline-block; padding:12px 18px; color:${INK}; text-decoration:none; font-size:14px; font-weight:800;">
                            Open Agencies in Admin
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td style="padding:18px 40px 0 40px;">
                    <p style="margin:0 0 10px 0; font-size:13px; font-weight:700; color:${INK};">
                      Agency details:
                    </p>
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:${ACCENT_SOFT_BG}; border:1px solid ${ACCENT_SOFT_BORDER}; border-left:3px solid ${ACCENT_DARK}; border-radius:10px;">
                      <tr>
                        <td style="padding:18px 20px;">
                          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                            ${renderFieldRows(agencyRows, { INK, INK_SOFT, MUTED, BORDER: ACCENT_SOFT_BORDER })}
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td style="padding:20px 40px 0 40px;">
                    <p style="margin:0 0 10px 0; font-size:13px; font-weight:700; color:${INK};">
                      Founder &amp; signup details:
                    </p>
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:${BG}; border:1px solid ${BORDER}; border-left:3px solid ${ACCENT_DARK}; border-radius:10px;">
                      <tr>
                        <td style="padding:18px 20px;">
                          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                            ${renderFieldRows(founderRows, { INK, INK_SOFT, MUTED, BORDER })}
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td style="padding:24px 40px 36px 40px; font-size:14px; line-height:1.6; color:${INK_SOFT};">
                    This is an automated agency signup alert from CallsFlow.<br/>
                    <strong style="color:${INK};">— CallsFlow System</strong>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 8px 0 8px; text-align:center; font-size:12px; line-height:1.6; color:${MUTED};">
              You are receiving this because you're configured for CallsFlow signup alerts.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildAdminAgencySignupAlertText({
  agencyId,
  agencyName,
  website,
  founderUid,
  founderName,
  founderEmail,
  provider,
  phone,
  weeklySpend,
  usedInbound,
  verticals,
  hearAbout,
  signupPath,
  entryUrl,
  entryTrack,
  utm,
  submittedAt,
  reviewUrl,
}) {
  const safeReviewUrl = (() => {
    const candidate = String(reviewUrl || '').trim();
    if (candidate && /^https:\/\//i.test(candidate) && !/localhost|127\.0\.0\.1/i.test(candidate)) {
      return candidate;
    }
    return `${resolveWebOrigin()}/app/admin/agencies`;
  })();
  const utmSummary = formatUtmSummary(utm);
  const urlDisplay = formatSignupUrlForEmail(entryUrl, signupPath, '/signup/start-agency');
  const entryNote = entryTrack && entryTrack !== 'agency'
    ? `Start Agency (switched from ${formatSignupTrackLabel(entryTrack)})`
    : 'Start Agency (/signup/start-agency)';

  return [
    'New CallsFlow agency signup',
    '',
    `Agency Name: ${agencyName || 'N/A'}`,
    `Submitted Website: ${formatSubmittedWebsite(website)}`,
    ...(agencyId ? [`Agency ID: ${agencyId}`] : []),
    'Status: Pending approval',
    '',
    `Signup Type: ${entryNote}`,
    `Signup Path: ${urlDisplay}`,
    ...(utmSummary ? [`UTM Attribution: ${utmSummary}`] : []),
    `Name: ${founderName || 'N/A'}`,
    `Email: ${founderEmail || 'N/A'}`,
    ...(founderUid ? [`UID: ${founderUid}`] : []),
    ...(provider ? [`Provider: ${provider}`] : []),
    `Phone: ${phone || 'N/A'}`,
    `Selected Vertical: ${verticals || 'N/A'}`,
    `Weekly Spend: ${weeklySpend || 'N/A'}`,
    `Used Inbound: ${usedInbound || 'N/A'}`,
    `Hear About: ${hearAbout || 'N/A'}`,
    `Completed: ${submittedAt || new Date().toISOString()}`,
    '',
    `Open Agencies in Admin: ${safeReviewUrl}`,
  ].join('\n');
}

module.exports = {
  escapeHtml,
  resolveAdminSignupNotifyEmail,
  resolveWebOrigin,
  formatSignupUrlForEmail,
  formatSignupProvider,
  formatSignupTrackLabel,
  formatUtmSummary,
  sanitizeOnboardingAttribution,
  buildAdminSignupAlertHtml,
  buildAdminSignupAlertText,
  buildAdminAgencySignupSubject,
  buildAdminAgencySignupAlertHtml,
  buildAdminAgencySignupAlertText,
};
