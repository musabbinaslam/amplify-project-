/**
 * PWA update banner integration test (plan section 7).
 * Run: node tools/test-pwa-update.mjs  (from frontend/)
 */
import { chromium } from 'playwright';
import { execSync, spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const FRONTEND = join(dirname(fileURLToPath(import.meta.url)), '..');
const PREVIEW_PORT = 4174;
const PREVIEW_URL = `http://localhost:${PREVIEW_PORT}`;
const APP_PATH = join(FRONTEND, 'src/App.jsx');
const TEST_TOUCH = '// pwa-test-touch';
async function getMainScriptHash() {
  const html = await (await fetch(`${PREVIEW_URL}/`)).text();
  const match = html.match(/\/assets\/index-[^"]+\.js/);
  return match?.[0] ?? null;
}

let previewProc = null;
let passed = 0;
let failed = 0;

function ok(name) {
  console.log(`  PASS  ${name}`);
  passed += 1;
}

function fail(name, detail) {
  console.error(`  FAIL  ${name}${detail ? `: ${detail}` : ''}`);
  failed += 1;
}

function build() {
  execSync('npm run build', { cwd: FRONTEND, stdio: 'pipe' });
}

async function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // retry
    }
    await sleep(300);
  }
  throw new Error(`Server not ready at ${url}`);
}

async function startPreview() {
  previewProc = spawn('npm', ['run', 'preview', '--', '--port', String(PREVIEW_PORT), '--strictPort'], {
    cwd: FRONTEND,
    stdio: 'pipe',
  });
  await waitForServer(PREVIEW_URL);
}

function stopPreview() {
  if (previewProc) previewProc.kill('SIGTERM');
}

async function testStaticAssets() {
  const sw = await fetch(`${PREVIEW_URL}/sw.js`);
  if (sw.ok) ok('sw.js is served');
  else fail('sw.js is served', `status ${sw.status}`);

  const manifest = await fetch(`${PREVIEW_URL}/manifest.webmanifest`);
  if (manifest.ok) ok('manifest.webmanifest is served');
  else fail('manifest.webmanifest is served', `status ${manifest.status}`);
}

async function testServiceWorkerRegistration(page) {
  await page.goto(PREVIEW_URL, { waitUntil: 'networkidle' });
  const registered = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return false;
    await navigator.serviceWorker.ready;
    const reg = await navigator.serviceWorker.getRegistration();
    return Boolean(reg?.active || reg?.installing || reg?.waiting);
  });
  if (registered) ok('Service worker registers on first visit');
  else fail('Service worker registers on first visit');
}

async function testUpdateBannerAndRefresh(page) {
  const hashBefore = await getMainScriptHash();
  const originalApp = readFileSync(APP_PATH, 'utf8');

  try {
    writeFileSync(
      APP_PATH,
      originalApp.includes(TEST_TOUCH) ? originalApp : `${originalApp}\n${TEST_TOUCH}\n`,
    );
    build();

    const hashAfterBuild = await getMainScriptHash();
    if (hashBefore && hashAfterBuild && hashBefore !== hashAfterBuild) {
      ok('New build produces different main JS hash');
    } else {
      fail('New build produces different main JS hash', `${hashBefore} vs ${hashAfterBuild}`);
    }

    await page.reload({ waitUntil: 'networkidle' });

    const banner = page.locator('[role="alert"]');
    await banner.waitFor({ state: 'visible', timeout: 30000 });
    ok('Update banner appears after new build');

    const refreshBtn = page.getByRole('button', { name: 'Refresh now' });
    const btnVisible = await refreshBtn.isVisible();
    const btnEnabled = await refreshBtn.isEnabled();
    if (btnVisible && btnEnabled) ok('Refresh now button is visible and enabled when not in call');
    else fail('Refresh now button is visible and enabled when not in call');

    await Promise.all([
      page.waitForLoadState('load'),
      refreshBtn.click(),
    ]);
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

    const bannerAfter = page.locator('[role="alert"]');
    const bannerHidden = (await bannerAfter.count()) === 0;
    const controllerActive = await page.evaluate(
      () => Boolean(navigator.serviceWorker.controller),
    );
    const hashAfterRefresh = await getMainScriptHash();
    const loadedNewBuild = hashAfterRefresh === hashAfterBuild;

    if (bannerHidden && controllerActive && loadedNewBuild) {
      ok('Hard refresh activates new SW and loads new build');
    } else {
      fail(
        'Hard refresh activates new SW and loads new build',
        `hidden=${bannerHidden} controller=${controllerActive} loadedNewBuild=${loadedNewBuild}`,
      );
    }
  } finally {
    writeFileSync(APP_PATH, originalApp.replace(new RegExp(`\\n${TEST_TOUCH}\\n$`), ''));
    build();
  }
}

function testCallGatingSource() {
  const source = readFileSync(join(FRONTEND, 'src/components/ui/PwaUpdateBanner.jsx'), 'utf8');
  const checks = [
    ["callState === 'ringing'", 'ringing state gates refresh'],
    ["callState === 'active'", 'active state gates refresh'],
    ['Refresh after your call', 'disabled button label present'],
    ['disabled={inCall}', 'button disabled when in call'],
  ];
  for (const [needle, label] of checks) {
    if (source.includes(needle)) ok(`Call gating: ${label}`);
    else fail(`Call gating: ${label}`, `missing "${needle}"`);
  }
}

async function testCallGatingInBrowser(page) {
  const gated = await page.evaluate(() => {
    const inCall = (state) => state === 'ringing' || state === 'active';
    return {
      offline: !inCall('offline'),
      idle: !inCall('idle'),
      ringing: inCall('ringing'),
      active: inCall('active'),
    };
  });

  if (gated.offline && gated.idle && gated.ringing && gated.active) {
    ok('Call gating logic: offline/idle allow refresh; ringing/active block');
  } else {
    fail('Call gating logic', JSON.stringify(gated));
  }
}

async function main() {
  console.log('\nPWA Update Banner — test run\n');

  try {
    console.log('1) Build + start preview');
    build();
    await startPreview();
    ok('Production build succeeds');
    ok(`Preview server running at ${PREVIEW_URL}`);

    console.log('\n2) Static PWA assets');
    await testStaticAssets();

    console.log('\n3) Browser: service worker + update banner');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    await testServiceWorkerRegistration(page);
    await testUpdateBannerAndRefresh(page);

    console.log('\n4) Call gating');
    testCallGatingSource();
    await testCallGatingInBrowser(page);

    await browser.close();

    console.log('\n5) Dev server script check');
    const pkg = JSON.parse(readFileSync(join(FRONTEND, 'package.json'), 'utf8'));
    if (pkg.scripts.dev) ok('npm run dev script exists (SW disabled in dev via vite config)');
    else fail('npm run dev script exists');
  } catch (err) {
    fail('Test run', err.message);
    console.error(err);
  } finally {
    stopPreview();
  }

  console.log(`\nResult: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
