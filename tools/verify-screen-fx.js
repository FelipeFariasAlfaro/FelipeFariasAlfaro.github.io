// Render index.html and screenshot the monitor region to check the live CRT
// code animation overlay sits on the black screen area.
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const pwRoot = execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(pwRoot, 'playwright'));

const REPO = path.resolve(__dirname, '..');
const fileUrl = 'file://' + encodeURI(path.join(REPO, 'index.html').replace(/\\/g, '/'));

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1800, height: 1000 }, deviceScaleFactor: 2 });
  await page.goto(fileUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  // whole scene
  await page.locator('#scene').screenshot({ path: path.join(__dirname, 'verify-screen-full.png') });

  // zoomed crop of the monitor
  const fx = page.locator('.screen-fx');
  const box = await fx.boundingBox();
  const pad = 40;
  await page.screenshot({
    path: path.join(__dirname, 'verify-screen-crop.png'),
    clip: {
      x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad),
      width: box.width + pad * 2, height: box.height + pad * 2,
    },
  });
  console.log('screen-fx box', JSON.stringify(box));
  await browser.close();
})();
