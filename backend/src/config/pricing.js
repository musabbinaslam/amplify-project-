/**
 * Official Campaign Pricing & Duration Buffers
 * 
 * Rules:
 * - Buffer: Minimum seconds required for the call to be considered a 'Sale'
 * - Price: The cost deducted from budget if buffer is met
 */

const CAMPAIGN_CONFIG = {
  // FE (Final Expense)
  fe_transfers: {
    label: 'FE Transfers',
    buffer: 120, // seconds
    price: 35.00
  },
  fe_inbounds: {
    label: 'FE Inbounds',
    buffer: 30, // seconds
    price: 25.00
  },

  // Medicare
  medicare_transfers: {
    label: 'Medicare Transfers',
    buffer: 120, // seconds
    price: 25.00
  },
  medicare_inbound_1: {
    label: 'Medicare Inbounds (1)',
    buffer: 90, // seconds
    price: 35.00
  },
  medicare_inbound_2: {
    label: 'Medicare Inbounds (2)',
    buffer: 15, // seconds
    price: 18.00
  },

  // ACA
  aca_transfers: {
    label: 'ACA Transfers',
    buffer: 120, // seconds
    price: 30.00
  }
};

module.exports = { CAMPAIGN_CONFIG };
