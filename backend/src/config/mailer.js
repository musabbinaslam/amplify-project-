const nodemailer = require('nodemailer');

const SMTP_HOST = process.env.SMTP_HOST || 'smtp.titan.email';
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_SECURE = (process.env.SMTP_SECURE ?? (SMTP_PORT === 465 ? 'true' : 'false')).toString().toLowerCase() === 'true';
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';

let transporter = null;

function getTransporter() {
    if (transporter) return transporter;

    if (!SMTP_USER || !SMTP_PASS) {
        console.warn('[mailer] SMTP_USER / SMTP_PASS are not set. Outbound email is disabled.');
        return null;
    }

    transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_SECURE,
        auth: {
            user: SMTP_USER,
            pass: SMTP_PASS
        }
    });

    return transporter;
}

async function sendMail({ to, subject, text, html, replyTo, from, attachments } = {}) {
    const t = getTransporter();
    if (!t) {
        throw new Error('Mail transporter is not configured (missing SMTP credentials).');
    }

    const finalFrom = from || `"Callsflow Support" <${SMTP_USER}>`;

    const mailOptions = {
        from: finalFrom,
        to,
        subject,
        text,
        html,
        replyTo
    };

    if (Array.isArray(attachments) && attachments.length > 0) {
        mailOptions.attachments = attachments;
    }

    return t.sendMail(mailOptions);
}

async function verifyMailer() {
    const t = getTransporter();
    if (!t) {
        return { ok: false, reason: 'not_configured' };
    }
    try {
        await t.verify();
        console.log(`[mailer] SMTP connection verified (${SMTP_HOST}:${SMTP_PORT}, secure=${SMTP_SECURE})`);
        return { ok: true };
    } catch (err) {
        console.warn(`[mailer] SMTP verify failed: ${err?.message || err}`);
        return { ok: false, reason: err?.message || 'verify_failed' };
    }
}

module.exports = {
    sendMail,
    verifyMailer,
    SMTP_USER
};
