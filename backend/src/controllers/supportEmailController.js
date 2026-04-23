const admin = require('../config/firebaseAdmin');
const { getDb } = require('../config/firestoreDb');
const { getUserDoc } = require('../services/userDataService');
const { sendMail } = require('../config/mailer');

const ALLOWED_CATEGORIES = new Set(['Billing', 'Technical', 'Account', 'Other']);

const MAX_SUBJECT = 150;
const MAX_DESCRIPTION = 5000;

function escapeHtml(str = '') {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function buildAckHtml({ greeting, ticketId, ticketRef, category, subject, description, supportAddress, attachments = [] }) {
    const BRAND = '#25f425';
    const BRAND_DARK = '#18a818';
    const BG = '#f4f6f5';
    const CARD = '#ffffff';
    const INK = '#0e0e0e';
    const INK_SOFT = '#4b5563';
    const MUTED = '#6b7280';
    const BORDER = '#e5e7eb';
    const HEADER_BG = '#0e0e0e';

    const greetingHtml = escapeHtml(greeting);
    const subjectHtml = escapeHtml(subject);
    const categoryHtml = escapeHtml(category);
    const descriptionHtml = escapeHtml(description);
    const ticketIdHtml = ticketId ? escapeHtml(ticketId) : '';
    const supportHtml = escapeHtml(supportAddress);

    const attachmentsBlock = attachments.length
        ? `
            <tr>
                <td style="padding-bottom:10px; font-size:11px; font-weight:700; letter-spacing:1.2px; text-transform:uppercase; color:${MUTED}; border-top:1px solid ${BORDER}; padding-top:14px;">
                    Attachments (${attachments.length})
                </td>
            </tr>
            <tr>
                <td style="font-size:13px; line-height:1.55; color:${INK_SOFT};">
                    ${attachments
                        .map(
                            (f) => `
                                <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-bottom:1px dashed ${BORDER};">
                                    <span style="color:${INK}; word-break:break-all;">${escapeHtml(f.name || 'file')}</span>
                                    <span style="color:${MUTED}; font-size:12px; white-space:nowrap; margin-left:12px;">${escapeHtml(formatFileSize(f.size || 0))}</span>
                                </div>`
                        )
                        .join('')}
                </td>
            </tr>`
        : '';

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>We received your request</title>
</head>
<body style="margin:0; padding:0; background:${BG}; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; color:${INK}; -webkit-font-smoothing:antialiased;">
    <div style="display:none; font-size:0; line-height:0; max-height:0; max-width:0; opacity:0; overflow:hidden;">
        Thanks for reaching out to Callsflow support — we've got your message${ticketRef ? ` (${escapeHtml(ticketRef)})` : ''} and will reply within 24 hours.
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
                                                <td style="padding-left:10px; vertical-align:middle; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:17px; font-weight:800; letter-spacing:1.5px; color:${INK};">
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
                                            Support ticket received
                                        </div>
                                        <div style="font-size:26px; line-height:1.25; font-weight:700; color:#ffffff; margin-bottom:6px;">
                                            We're on it.
                                        </div>
                                        <div style="font-size:14px; line-height:1.55; color:#adaaaa;">
                                            Thanks for reaching out. A teammate will get back to you within 24 hours.
                                        </div>
                                        ${ticketIdHtml ? `
                                        <div style="margin-top:20px;">
                                            <span style="display:inline-block; padding:7px 14px; background:${BRAND}; color:${INK}; font-size:12px; font-weight:700; letter-spacing:0.6px; border-radius:999px; font-family:'SFMono-Regular',Menlo,Consolas,monospace;">
                                                TICKET #${ticketIdHtml}
                                            </span>
                                        </div>` : ''}
                                    </td>
                                </tr>
                            </table>

                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                <tr>
                                    <td style="padding:32px 40px 8px 40px; font-size:15px; line-height:1.6; color:${INK};">
                                        <p style="margin:0 0 14px 0;">${greetingHtml}</p>
                                        <p style="margin:0 0 24px 0; color:${INK_SOFT};">
                                            Your request is now in our queue. Here's a copy of what you sent, for your records:
                                        </p>
                                    </td>
                                </tr>

                                <tr>
                                    <td style="padding:0 40px;">
                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:${BG}; border:1px solid ${BORDER}; border-left:3px solid ${BRAND_DARK}; border-radius:10px;">
                                            <tr>
                                                <td style="padding:18px 20px;">
                                                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                                        <tr>
                                                            <td style="padding-bottom:10px; font-size:11px; font-weight:700; letter-spacing:1.2px; text-transform:uppercase; color:${MUTED};">
                                                                Category
                                                            </td>
                                                        </tr>
                                                        <tr>
                                                            <td style="padding-bottom:14px; font-size:14px; font-weight:600; color:${INK};">
                                                                ${categoryHtml}
                                                            </td>
                                                        </tr>
                                                        <tr>
                                                            <td style="padding-bottom:10px; font-size:11px; font-weight:700; letter-spacing:1.2px; text-transform:uppercase; color:${MUTED}; border-top:1px solid ${BORDER}; padding-top:14px;">
                                                                Subject
                                                            </td>
                                                        </tr>
                                                        <tr>
                                                            <td style="padding-bottom:14px; font-size:14px; font-weight:600; color:${INK};">
                                                                ${subjectHtml}
                                                            </td>
                                                        </tr>
                                                        <tr>
                                                            <td style="padding-bottom:10px; font-size:11px; font-weight:700; letter-spacing:1.2px; text-transform:uppercase; color:${MUTED}; border-top:1px solid ${BORDER}; padding-top:14px;">
                                                                Message
                                                            </td>
                                                        </tr>
                                                        <tr>
                                                            <td style="font-size:14px; line-height:1.6; color:${INK_SOFT}; white-space:pre-wrap;">${descriptionHtml}</td>
                                                        </tr>
                                                        ${attachmentsBlock}
                                                    </table>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>

                                <tr>
                                    <td style="padding:26px 40px 4px 40px;">
                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#ecfdf5; border-radius:10px;">
                                            <tr>
                                                <td style="padding:14px 18px; font-size:13px; line-height:1.55; color:${INK};">
                                                    <strong style="color:${BRAND_DARK};">Need to add something?</strong>
                                                    Just reply to this email — your reply is attached to this ticket automatically.
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>

                                <tr>
                                    <td style="padding:24px 40px 36px 40px; font-size:14px; line-height:1.6; color:${INK_SOFT};">
                                        Thanks for being part of Callsflow.<br/>
                                        <strong style="color:${INK};">— The Callsflow Team</strong>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <tr>
                        <td style="padding:20px 8px 0 8px; text-align:center; font-size:12px; line-height:1.6; color:${MUTED};">
                            You're receiving this because you submitted a support request on
                            <a href="https://callsflow.io" style="color:${BRAND_DARK}; text-decoration:none; font-weight:600;">callsflow.io</a>.<br/>
                            Questions? Email
                            <a href="mailto:${supportHtml}" style="color:${BRAND_DARK}; text-decoration:none; font-weight:600;">${supportHtml}</a>.
                        </td>
                    </tr>

                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;
}

function formatFileSize(bytes = 0) {
    if (!bytes) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function buildNodemailerAttachments(files = []) {
    return files.map((f) => ({
        filename: f.originalname || 'attachment',
        content: f.buffer,
        contentType: f.mimetype || 'application/octet-stream'
    }));
}

function buildAttachmentSummaryText(files = []) {
    if (!files.length) return '';
    const lines = ['', `Attachments (${files.length}):`];
    files.forEach((f, i) => {
        lines.push(`  ${i + 1}. ${f.originalname || 'file'} (${formatFileSize(f.size)})`);
    });
    return lines.join('\n');
}

function buildAttachmentSummaryHtml(files = []) {
    if (!files.length) return '';
    const rows = files
        .map(
            (f) => `
                <tr>
                    <td style="padding:6px 10px; font-size:13px; color:#374151; border-top:1px solid #e5e7eb;">${escapeHtml(f.originalname || 'file')}</td>
                    <td style="padding:6px 10px; font-size:12px; color:#6b7280; border-top:1px solid #e5e7eb; text-align:right; white-space:nowrap;">${escapeHtml(formatFileSize(f.size))}</td>
                </tr>`
        )
        .join('');
    return `
        <div style="margin-top:18px;">
            <div style="font-size:12px; color:#6b7280; text-transform:uppercase; letter-spacing:0.6px; margin-bottom:6px;">
                Attachments (${files.length})
            </div>
            <table style="width:100%; border-collapse:collapse; background:#f9fafb; border-radius:6px; overflow:hidden;">
                <tbody>${rows}</tbody>
            </table>
        </div>
    `;
}

function validate(body = {}) {
    const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
    const category = typeof body.category === 'string' ? body.category.trim() : '';
    const description = typeof body.description === 'string' ? body.description.trim() : '';

    if (!subject) return { error: 'Subject is required.' };
    if (subject.length > MAX_SUBJECT) return { error: `Subject must be ${MAX_SUBJECT} characters or fewer.` };

    if (!category) return { error: 'Category is required.' };
    if (!ALLOWED_CATEGORIES.has(category)) return { error: 'Invalid category.' };

    if (!description) return { error: 'Description is required.' };
    if (description.length > MAX_DESCRIPTION) return { error: `Description must be ${MAX_DESCRIPTION} characters or fewer.` };

    return { subject, category, description };
}

async function postSupportEmail(req, res) {
    const uid = req.user?.uid;
    if (!uid) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const parsed = validate(req.body || {});
    if (parsed.error) {
        return res.status(400).json({ error: parsed.error });
    }

    const { subject, category, description } = parsed;
    const uploadedFiles = Array.isArray(req.files) ? req.files : [];
    const mailAttachments = buildNodemailerAttachments(uploadedFiles);
    const attachmentMetadata = uploadedFiles.map((f) => ({
        name: f.originalname || 'attachment',
        size: f.size || 0,
        mimetype: f.mimetype || 'application/octet-stream'
    }));

    let userDoc = null;
    try {
        userDoc = await getUserDoc(uid);
    } catch (err) {
        console.warn('[supportEmail] failed to load user doc:', err?.message || err);
    }

    const userEmail = req.user?.email || userDoc?.email || null;
    const userName =
        req.user?.name && req.user.name !== req.user?.email
            ? req.user.name
            : userDoc?.name || userDoc?.displayName || userDoc?.fullName || null;

    const userAgent = req.get('user-agent') || null;
    const ip = (req.headers['x-forwarded-for']?.split(',')[0]?.trim()) || req.ip || null;

    let ticketId = null;
    try {
        const db = getDb();
        if (db) {
            const { FieldValue } = admin.firestore;
            const ref = await db.collection('supportTickets').add({
                uid,
                email: userEmail,
                name: userName,
                subject,
                category,
                description,
                status: 'open',
                attachments: attachmentMetadata,
                userAgent,
                ip,
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp()
            });
            ticketId = ref.id;
        }
    } catch (err) {
        console.error('[supportEmail] Firestore write failed:', err?.message || err);
    }

    const to = process.env.SUPPORT_TO_EMAIL || 'admin@callsflow.io';
    const mailSubject = `[Support][${category}] ${subject}`;

    const textLines = [
        `New support request${ticketId ? ` (Ticket #${ticketId})` : ''}`,
        '',
        `From:     ${userName || 'Unknown'}${userEmail ? ` <${userEmail}>` : ''}`,
        `User ID:  ${uid}`,
        `Category: ${category}`,
        `Subject:  ${subject}`,
        '',
        'Description:',
        description,
        buildAttachmentSummaryText(uploadedFiles),
        '',
        '---',
        `User-Agent: ${userAgent || 'n/a'}`,
        `IP:         ${ip || 'n/a'}`
    ];
    const text = textLines.join('\n');

    const html = `
        <div style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; font-size: 14px; color: #1f2937; line-height: 1.5;">
            <h2 style="margin: 0 0 12px;">New support request${ticketId ? ` <small style="color:#6b7280;">#${escapeHtml(ticketId)}</small>` : ''}</h2>
            <table style="border-collapse: collapse; margin-bottom: 16px;">
                <tr><td style="padding: 4px 8px; color:#6b7280;">From</td><td style="padding: 4px 8px;">${escapeHtml(userName || 'Unknown')}${userEmail ? ` &lt;${escapeHtml(userEmail)}&gt;` : ''}</td></tr>
                <tr><td style="padding: 4px 8px; color:#6b7280;">User ID</td><td style="padding: 4px 8px; font-family: monospace;">${escapeHtml(uid)}</td></tr>
                <tr><td style="padding: 4px 8px; color:#6b7280;">Category</td><td style="padding: 4px 8px;">${escapeHtml(category)}</td></tr>
                <tr><td style="padding: 4px 8px; color:#6b7280;">Subject</td><td style="padding: 4px 8px;">${escapeHtml(subject)}</td></tr>
            </table>
            <div style="white-space: pre-wrap; padding: 12px 16px; background:#f9fafb; border-left: 3px solid #3b82f6; border-radius: 4px;">${escapeHtml(description)}</div>
            ${buildAttachmentSummaryHtml(uploadedFiles)}
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
            <p style="color:#6b7280; font-size: 12px; margin: 0;">
                User-Agent: ${escapeHtml(userAgent || 'n/a')}<br/>
                IP: ${escapeHtml(ip || 'n/a')}
            </p>
        </div>
    `;

    let mailError = null;
    try {
        await sendMail({
            to,
            subject: mailSubject,
            text,
            html,
            replyTo: userEmail || undefined,
            attachments: mailAttachments.length ? mailAttachments : undefined
        });
    } catch (err) {
        mailError = err;
        console.error('[supportEmail] SMTP send failed:', err?.message || err);
    }

    if (userEmail) {
        const supportAddress = process.env.SUPPORT_TO_EMAIL || 'admin@callsflow.io';
        const firstName = userName ? userName.split(' ')[0] : '';
        const greeting = firstName ? `Hi ${firstName},` : 'Hi there,';
        const ticketRef = ticketId ? `#${ticketId}` : '';

        const ackText = [
            greeting,
            '',
            `Thanks for reaching out to Callsflow support${ticketRef ? ` (Ticket ${ticketRef})` : ''}. We've received your request and our team will get back to you within 24 hours.`,
            '',
            'Here is a copy of what you sent:',
            '',
            `Category: ${category}`,
            `Subject:  ${subject}`,
            '',
            description,
            buildAttachmentSummaryText(uploadedFiles),
            '',
            'If you need to add anything, just reply to this email and it will be attached to your ticket.',
            '',
            '— The Callsflow Team',
            supportAddress
        ].join('\n');

        const ackHtml = buildAckHtml({
            greeting,
            ticketId,
            ticketRef,
            category,
            subject,
            description,
            supportAddress,
            attachments: attachmentMetadata
        });

        try {
            await sendMail({
                to: userEmail,
                subject: `We received your request${ticketRef ? ` (${ticketRef})` : ''}: ${subject}`,
                text: ackText,
                html: ackHtml,
                replyTo: supportAddress
            });
        } catch (err) {
            console.warn('[supportEmail] acknowledgement email failed:', err?.message || err);
        }
    }

    if (mailError && !ticketId) {
        return res.status(502).json({ error: 'Could not send support email. Please try again later.' });
    }

    if (mailError) {
        return res.status(202).json({
            ok: true,
            ticketId,
            warning: 'Ticket saved, but email delivery failed. Our team has been notified.'
        });
    }

    return res.status(200).json({ ok: true, ticketId });
}

module.exports = { postSupportEmail };
