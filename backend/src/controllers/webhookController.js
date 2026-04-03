const { redisClient } = require('../config/redis');

class WebhookController {
    async handleTrackdrivePost(req, res) {
        try {
            console.log('\n[Trackdrive Webhook] 🔔 INCOMING DATA POST SET');
            const data = req.body || req.query;
            console.log(JSON.stringify(data, null, 2));

            // Trackdrive usually sends Caller ID as 'caller_id' or 'from'. We need to normalize it.
            // When Trackdrive dials Twilio, Twilio usually sees the same Caller ID.
            const rawCallerId = data.caller_id || data.callerId || data.phone || data.from || 'unknown';
            
            // Normalize caller ID to standard E.164 (e.g. +11234567890) just in case
            let normalizedCallerId = rawCallerId;
            if (rawCallerId !== 'unknown') {
                normalizedCallerId = rawCallerId.replace(/\D/g, ''); // strip non-digits
                if (normalizedCallerId.length === 10) normalizedCallerId = '1' + normalizedCallerId;
                if (!normalizedCallerId.startsWith('+')) normalizedCallerId = '+' + normalizedCallerId;
            }

            console.log(`[Trackdrive Webhook] 🔑 Keying lead to Caller ID: ${normalizedCallerId}`);

            // Save the rich lead data to Redis
            // We set an expiration of 5 minutes (300 seconds) because the audio call should follow immediately
            if (normalizedCallerId !== 'unknown') {
                await redisClient.setEx(`lead:trackdrive:${normalizedCallerId}`, 300, JSON.stringify(data));
                console.log(`[Trackdrive Webhook] ✅ Lead data temporarily cached in Redis.`);
            } else {
                console.warn(`[Trackdrive Webhook] ⚠️ No caller_id found in payload. Could not cache lead data.`);
            }

            // Always return a 200 OK so Trackdrive knows we received it
            return res.status(200).json({ success: true, message: 'Trackdrive data received.' });
        } catch (error) {
            console.error('[Trackdrive Webhook] 🚨 Error processing data:', error);
            // Even on error, return 200 so Trackdrive doesn't retry infinitely and crash their pipeline
            return res.status(200).json({ success: false, error: 'Internal Server Error' });
        }
    }
}

module.exports = new WebhookController();
