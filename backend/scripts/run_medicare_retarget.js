#!/usr/bin/env node
/**
 * Medicare retarget CLI
 *
 *   node scripts/run_medicare_retarget.js --preview
 *   node scripts/run_medicare_retarget.js --dry-run --force --uid=UID
 *   node scripts/run_medicare_retarget.js --force --uid=UID
 *   node scripts/run_medicare_retarget.js --backfill-flags [--dry-run]
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const os = require('os');

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const argVal = (prefix) => {
  const hit = args.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
};

async function main() {
  const {
    buildMedicareRetargetEmailHtml,
    billingUrl,
    runMedicareRetargetTick,
    backfillMedicareUnpaidFlags,
  } = require('../src/services/medicareRetargetService');

  if (has('--preview')) {
    const payUrl = billingUrl();
    const dir = os.tmpdir();
    const one = path.join(dir, 'medicare-retarget-1.html');
    const two = path.join(dir, 'medicare-retarget-2.html');
    fs.writeFileSync(one, buildMedicareRetargetEmailHtml({
      name: 'Alex',
      step: 1,
      billingUrl: payUrl,
    }));
    fs.writeFileSync(two, buildMedicareRetargetEmailHtml({
      name: 'Alex',
      step: 2,
      billingUrl: payUrl,
    }));
    console.log(`Wrote preview HTML:\n  ${one}\n  ${two}\nOpen in Chrome to compare with the welcome email.`);
    return;
  }

  const { connectRedis } = require('../src/config/redis');
  await connectRedis();

  const dryRun = has('--dry-run');
  const force = has('--force');
  const uid = argVal('--uid=');

  if (has('--backfill-flags')) {
    const out = await backfillMedicareUnpaidFlags({ dryRun, uid });
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  const summary = await runMedicareRetargetTick({
    dryRun,
    force,
    uid,
  });
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
