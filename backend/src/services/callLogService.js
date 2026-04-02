const fs = require('fs');
const path = require('path');
const { CAMPAIGN_CONFIG } = require('../config/pricing');

const LOG_FILE = path.join(__dirname, '../../data/call-logs.json');

// Ensure data directory exists
if (!fs.existsSync(path.dirname(LOG_FILE))) {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
}

class CallLogService {
    /**
     * Records a completed call and determines if it was a 'Sale' based on buffers.
     */
    async logCall(data) {
        const { 
            from, 
            to, 
            duration, 
            campaignId, 
            agentId, 
            status, 
            callSid 
        } = data;

        const config = CAMPAIGN_CONFIG[campaignId] || { buffer: 0, price: 0 };
        const durationSec = parseInt(duration) || 0;
        
        // AUTOMATED BILLING LOGIC
        const isBillable = durationSec >= config.buffer && status === 'completed';
        const cost = isBillable ? config.price : 0;

        const newLog = {
            id: Date.now().toString(),
            callSid,
            timestamp: new Date().toISOString(),
            from,
            to,
            duration: durationSec,
            campaign: campaignId,
            campaignLabel: config.label || campaignId,
            agentId,
            status,
            isBillable,
            cost,
            type: campaignId.includes('transfer') ? 'Transfer' : 'Inbound'
        };

        // Persist to file
        const logs = this.getLogs();
        logs.unshift(newLog); // Newest first
        fs.writeFileSync(LOG_FILE, JSON.stringify(logs.slice(0, 500), null, 2));

        console.log(`[Billing] 💸 Call ${callSid}: ${durationSec}s. Billable: ${isBillable} ($${cost})`);
        return newLog;
    }

    getLogs() {
        if (!fs.existsSync(LOG_FILE)) return [];
        try {
            return JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
        } catch (e) {
            return [];
        }
    }
}

module.exports = new CallLogService();
