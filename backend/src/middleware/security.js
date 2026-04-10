const rateLimit = require('express-rate-limit');
const twilio = require('twilio');

const globalRateLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 200, // Limit each IP to 200 requests per minute
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    message: { error: 'Too many requests from this IP, please try again after a minute' }
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
    validateTwilioWebhook
};
