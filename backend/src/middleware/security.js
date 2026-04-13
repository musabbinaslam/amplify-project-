const rateLimit = require('express-rate-limit');
const twilio = require('twilio');

function envInt(name, fallback) {
    const raw = process.env[name];
    const parsed = Number.parseInt(String(raw ?? ''), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getRequestKey(req, prefix) {
    const uid = req.user?.uid ? `uid:${req.user.uid}` : null;
    const identity = req.body?.identity ? `identity:${String(req.body.identity).trim().toLowerCase()}` : null;
    const from = req.body?.From ? `from:${String(req.body.From).trim()}` : null;
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    return `${prefix}|${uid || identity || from || `ip:${ip}`}`;
}

const LIMIT_GLOBAL_WINDOW_MS = envInt('RATE_LIMIT_GLOBAL_WINDOW_MS', 60 * 1000);
const LIMIT_GLOBAL_MAX = envInt('RATE_LIMIT_GLOBAL_MAX', 200);
const LIMIT_AI_READ_WINDOW_MS = envInt('RATE_LIMIT_AI_READ_WINDOW_MS', 60 * 1000);
const LIMIT_AI_READ_MAX = envInt('RATE_LIMIT_AI_READ_MAX', 60);
const LIMIT_AI_WRITE_WINDOW_MS = envInt('RATE_LIMIT_AI_WRITE_WINDOW_MS', 60 * 1000);
const LIMIT_AI_WRITE_MAX = envInt('RATE_LIMIT_AI_WRITE_MAX', 20);
const LIMIT_SUPPORT_CHAT_WINDOW_MS = envInt('RATE_LIMIT_SUPPORT_CHAT_WINDOW_MS', 60 * 1000);
const LIMIT_SUPPORT_CHAT_MAX = envInt('RATE_LIMIT_SUPPORT_CHAT_MAX', 12);
const LIMIT_VOICE_TOKEN_WINDOW_MS = envInt('RATE_LIMIT_VOICE_TOKEN_WINDOW_MS', 60 * 1000);
const LIMIT_VOICE_TOKEN_MAX = envInt('RATE_LIMIT_VOICE_TOKEN_MAX', 30);
const LIMIT_TWILIO_WEBHOOK_WINDOW_MS = envInt('RATE_LIMIT_TWILIO_WEBHOOK_WINDOW_MS', 60 * 1000);
const LIMIT_TWILIO_WEBHOOK_MAX = envInt('RATE_LIMIT_TWILIO_WEBHOOK_MAX', 120);

const globalRateLimiter = rateLimit({
    windowMs: LIMIT_GLOBAL_WINDOW_MS,
    max: LIMIT_GLOBAL_MAX,
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    message: { error: 'Too many requests from this IP, please try again after a minute' }
});

const aiTrainingReadLimiter = rateLimit({
    windowMs: LIMIT_AI_READ_WINDOW_MS,
    max: LIMIT_AI_READ_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => getRequestKey(req, 'ai-read'),
    message: { error: 'AI training requests are temporarily rate-limited. Please try again shortly.' }
});

const aiTrainingWriteLimiter = rateLimit({
    windowMs: LIMIT_AI_WRITE_WINDOW_MS,
    max: LIMIT_AI_WRITE_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => getRequestKey(req, 'ai-write'),
    message: { error: 'Too many AI training updates. Please wait a minute before retrying.' }
});

const supportChatLimiter = rateLimit({
    windowMs: LIMIT_SUPPORT_CHAT_WINDOW_MS,
    max: LIMIT_SUPPORT_CHAT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => getRequestKey(req, 'support-chat'),
    message: { error: 'Support AI rate limit reached. Please slow down and retry in a minute.' }
});

const voiceTokenLimiter = rateLimit({
    windowMs: LIMIT_VOICE_TOKEN_WINDOW_MS,
    max: LIMIT_VOICE_TOKEN_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => getRequestKey(req, 'voice-token'),
    message: { error: 'Too many token requests. Please wait before requesting a new token.' }
});

const webhookCallLimiter = rateLimit({
    windowMs: LIMIT_TWILIO_WEBHOOK_WINDOW_MS,
    max: LIMIT_TWILIO_WEBHOOK_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => getRequestKey(req, 'twilio-webhook'),
    message: 'Too many webhook requests',
});

const validateTwilioWebhook = (req, res, next) => {
    // Bypass validation in local dev unless explicitly enabled (so ngrok testing works seamlessly)
    if (process.env.NODE_ENV !== 'production' && process.env.TWILIO_VALIDATE_WEBHOOKS !== 'true') {
        return next();
    }

    const twilioSignature = req.headers['x-twilio-signature'];
    
    // In production, Twilio signatures MUST exist
    if (!twilioSignature) {
        console.warn(`[Security] Dropping unsigned webhook request to ${req.originalUrl}`);
        return res.status(403).send('Forbidden: Missing Twilio Signature');
    }

    // Mathematically construct the absolute URL that Twilio POSTed to
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers.host;
    const url = `${protocol}://${host}${req.originalUrl}`;

    try {
        const isValid = twilio.validateRequest(
            process.env.TWILIO_AUTH_TOKEN,
            twilioSignature,
            url,
            req.body || {}
        );

        if (isValid) {
            next();
        } else {
            console.error(`[Security] Invalid Twilio Signature detected for URL: ${url}`);
            res.status(403).send('Forbidden: Invalid Signature');
        }
    } catch (e) {
        console.error(`[Security] Twilio Signature validation crashed:`, e.message);
        res.status(500).send('Internal Server Error: Signature Validation Error');
    }
};

module.exports = {
    globalRateLimiter,
    aiTrainingReadLimiter,
    aiTrainingWriteLimiter,
    supportChatLimiter,
    voiceTokenLimiter,
    webhookCallLimiter,
    validateTwilioWebhook
};
