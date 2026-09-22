const axios = require('axios');
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

            // 2. Fetch the agent's details from Firestore
            const agentDoc = await getDb().collection('users').doc(callLog.agentId).get();
            const agentData = agentDoc.exists ? agentDoc.data() : {};
            
            const repName = agentData.name || `Agent ${callLog.agentId}`;
            const repEmail = agentData.email || `${callLog.agentId}@callsflow-agent.local`;

            // 3. Prepare the exact payload Objectionly requires
            const payload = {
                title: `Inbound Call - ${callLog.from}`,
                repEmail: repEmail,
                repName: repName,
                callDate: callLog.timestamp || new Date().toISOString(),
                mediaUrl: callLog.recordingUrl,
                callDuration: Math.max(1, Math.round(Number(callLog.duration || 0) / 60)), // Objectionly expects duration in minutes
                externalMeetingId: callLog.callSid,
                source: "custom_api",
                forceImport: true,
                attendees: [
                    {
                        phone: callLog.from,
                        uniqueId: callLog.from
                    }
                ]
            };

            // 4. Send to Objectionly
            console.log(`[Objectionly] Dispatching Call ${callLog.callSid} to Objectionly queue...`);
            
            const response = await axios.post(
                'https://api.objectionly.com/api/call-processing/queue',
                payload,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Workspace-API-Key': apiKey
                    },
                    timeout: 10000 // 10 second timeout so we don't hang
                }
            );

            console.log(`[Objectionly] Successfully queued Call ${callLog.callSid}. Response:`, response.data);

        } catch (error) {
            console.error(`[Objectionly] Failed to send Call ${callLog.callSid} to Objectionly:`, error.response?.data || error.message);
        }
    }
}

module.exports = new IntegrationService();
