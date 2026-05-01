require('dotenv').config();
const { createPhoneRoute } = require('../src/services/phoneRouteService');

async function run() {
  try {
    const route = await createPhoneRoute({
      phoneE164: '+18884059425',
      campaignId: 'medicare_inbound_1',
      label: 'Medicare Inbounds $35/90',
      active: true
    });
    console.log('Successfully created phone route:', route);
  } catch (err) {
    console.error('Error creating route:', err.message);
  }
  process.exit(0);
}

run();
