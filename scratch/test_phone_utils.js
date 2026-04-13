const phoneUtils = require('../backend/src/utils/phoneUtils');

const testPhones = [
  { phone: '7025551234', expected: 'NV' },
  { phone: '+13055551234', expected: 'FL' },
  { phone: '12125551234', expected: 'NY' },
  { phone: '(415) 555-1111', expected: 'CA' },
  { phone: 'unknown', expected: null },
  { phone: '9999999999', expected: null }
];

console.log('--- Testing Area Code to State Mapping ---');
testPhones.forEach(({ phone, expected }) => {
  const result = phoneUtils.getStateFromPhone(phone);
  console.log(`Phone: ${phone.padEnd(15)} | Expected: ${String(expected).padEnd(5)} | Result: ${String(result).padEnd(5)} | ${result === expected ? '✅' : '❌'}`);
});
