// Verify the CRT overlay animates (two frames differ) and the Projects hotspot
// still receives clicks through the decorative overlay.
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const pwRoot = execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(pwRoot, 'playwright'));

const REPO = path.resolve(__dirname, '..');
const fileUrl = 'file://' + encodeURI(path.join(REPO, 'index.html').replace(/\\/g, '/'));

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.goto(fileUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  // read the scroll transform at two times -> confirms motion
  const readY = () => page.evaluate(() => {
    const el = document.querySelector('.screen-fx-scroll');
    const t = getComputedStyle(el).transform;
    return t;
  });
  const t1 = await readY();
  await page.waitForTimeout(1200);
  const t2 = await readY();

  // click the Projects hotspot (the screen) and see if the window opens
  await page.locator('.spot-screen').click();
  await page.waitForTimeout(300);
  const windowOpen = await page.evaluate(() => {
    const layer = document.getElementById('windowLayer');
    if (!layer) return { found: false };
    const visible = layer.offsetParent !== null ||
      getComputedStyle(layer).display !== 'none' && getComputedStyle(layer).visibility !== 'hidden';
    const active = document.querySelector('.panel.is-active');
    return { found: true, visible, activePanel: active ? active.getAttribute('data-window') || active.id || active.className : null };
  });

  console.log(JSON.stringify({ transformFrame1: t1, transformFrame2: t2, moved: t1 !== t2, click: windowOpen }, null, 2));
  await browser.close();
})();
