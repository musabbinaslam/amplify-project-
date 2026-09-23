const axios = require('axios');
const FormData = require('form-data');
const admin = require('../config/firebaseAdmin');
const { getDb } = require('../config/firestoreDb');

class IntegrationService {
    /**
     * Send call recording to Objectionly for the FIAG agency
     * @param {Object} callLog - The fully formed call log
     */
    async sendToObjectionly(callLog) {
        try {
            // 1. We need the API key from environment
            const apiKey = process.env.OBJECTIONLY_API_KEY_FIAG;
            if (!apiKey) {
                console.warn('[Objectionly] Integration skipped: OBJECTIONLY_API_KEY_FIAG is missing in .env');
                return;
            }

            if (!callLog.recordingUrl) {
                console.warn('[Objectionly] Integration skipped: No recordingUrl available.');
                return;
            }

            // 2. Fetch the agent's details from Firestore
            const agentDoc = await getDb().collection('users').doc(callLog.agentId).get();
            const agentData = agentDoc.exists ? agentDoc.data() : {};
            
            const repName = agentData.name || `Agent ${callLog.agentId}`;
            const repEmail = agentData.email || `${callLog.agentId}@callsflow-agent.local`;

            console.log(`[Objectionly] Downloading Twilio recording for Call ${callLog.callSid}...`);

            // Fetch the recording from Twilio using HTTP Basic Auth
            const audioResponse = await axios.get(callLog.recordingUrl, {
                responseType: 'stream',
                auth: {
                    username: process.env.TWILIO_ACCOUNT_SID,
                    password: process.env.TWILIO_AUTH_TOKEN
                }
            });

            // 3. Prepare the payload as FormData
            const form = new FormData();
            form.append('title', `Inbound Call - ${callLog.from}`);
            form.append('repEmail', repEmail);
            form.append('repName', repName);
            form.append('callDate', callLog.timestamp || new Date().toISOString());
            form.append('callDuration', String(Math.max(1, Math.round(Number(callLog.duration || 0) / 60))));
            form.append('externalMeetingId', callLog.callSid);
            form.append('source', 'custom_api');
            form.append('forceImport', 'true');
            form.append('attendees', JSON.stringify([{ phone: callLog.from, uniqueId: callLog.from }]));
            
            // Append the audio stream
            form.append('file', audioResponse.data, {
                filename: `${callLog.callSid}.mp3`,
                contentType: 'audio/mpeg'
            });

            // 4. Send to Objectionly
            console.log(`[Objectionly] Dispatching Call ${callLog.callSid} to Objectionly queue as multipart...`);
            
            const response = await axios.post(
                'https://api.objectionly.com/api/call-processing/queue',
                form,
                {
                    headers: {
                        ...form.getHeaders(),
                        'X-Workspace-API-Key': apiKey
                    },
                    timeout: 30000 // 30 second timeout for large uploads
                }
            );

            console.log(`[Objectionly] Successfully queued Call ${callLog.callSid}. Response:`, response.data);

        } catch (error) {
            console.error(`[Objectionly] Failed to send Call ${callLog.callSid} to Objectionly:`, error.response?.data || error.message);
        }
    }
}

module.exports = new IntegrationService();
