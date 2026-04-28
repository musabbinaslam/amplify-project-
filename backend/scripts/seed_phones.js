const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const phoneRouteService = require('../src/services/phoneRouteService');

const routes = [
  {
    phoneE164: '+18339918333',
    campaignId: 'fe_transfers',
    label: 'FE Transfers (Main)',
  },
  {
    phoneE164: '+18557793019',
    campaignId: 'fe_inbounds',
    label: 'FE Inbounds (Main)',
  },
  {
    phoneE164: '+18775429001',
    campaignId: 'aca_transfers',
    label: 'ACA Transfers (Main)',
  }
];

async function main() {
  console.log('🚀 Seeding phone routes...');
  for (const route of routes) {
    try {
      const created = await phoneRouteService.createPhoneRoute(route);
      console.log(`✅ Added: ${created.phoneE164} -> ${created.campaignId}`);
    } catch (err) {
      if (err.message.includes('already exists')) {
        console.warn(`⚠️  Skipping ${route.phoneE164}: Already exists`);
      } else {
        console.error(`❌ Failed ${route.phoneE164}:`, err.message);
      }
    }
  }
  console.log('🏁 Done.');
  process.exit(0);
}

main().catch(err => {
  console.error('💥 Fatal error:', err);
  process.exit(1);
});
