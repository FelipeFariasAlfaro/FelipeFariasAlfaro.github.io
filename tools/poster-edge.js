// Rebuild the Cursos poster hotspot (.spot-posters) from measured edges.
//
//   node tools/poster-edge.js             -> band + composite, no CSS write
//   APPLY=1 node tools/poster-edge.js     -> also rewrite the CSS block
//
// The poster is a genuinely rectangular framed object, so its silhouette is
// declared as a rect instead of being colour-extracted: the wall behind it is
// dark maroon but the neighbouring green poster and the filing cabinet are the
// same light grey as this poster's frame, so no colour fill can separate them.
//
// RECT = outer edges of the grey frame, in room %, measured by scanline probe
// (constant across scanlines: top 34.70 on 4 columns, right bar 71.79% of the
// probe crop on 5 rows).
const { chromium } = require('playwright');
const fs = require('fs');

const CSS = 'assets/css/styles.css';
const RECT = {
  left: Number(process.env.RL || 87.5000),
  top: Number(process.env.RT || 34.7005),
  right: Number(process.env.RR || 93.5665),
  bottom: Number(process.env.RB || 49.1536),
};
// slack so the rect never touches the crop edge and the rim has room to glow
const SLACK_X = Number(process.env.SX || 0.55);
const SLACK_Y = Number(process.env.SY || 0.50);

const BOX = {
  left: RECT.left - SLACK_X,
  top: RECT.top - SLACK_Y,
  width: (RECT.right + SLACK_X) - (RECT.left - SLACK_X),
  height: (RECT.bottom + SLACK_Y) - (RECT.top - SLACK_Y),
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const roomB64 = fs.readFileSync('assets/images/room.webp').toString('base64');

  const out = await page.evaluate(async ({ roomB64, BOX, RECT }) => {
    const img = new Image();
    img.src = 'data:image/webp;base64,' + roomB64;
    await img.decode();
    const RW = img.naturalWidth, RH = img.naturalHeight;

    const cx = Math.round(BOX.left / 100 * RW);
    const cy = Math.round(BOX.top / 100 * RH);
    const W = Math.round(BOX.width / 100 * RW);
    const H = Math.round(BOX.height / 100 * RH);

    // the rect's position inside the crop, in crop pixels
    const x0 = Math.round(RECT.left / 100 * RW) - cx;
    const y0 = Math.round(RECT.top / 100 * RH) - cy;
    const x1 = Math.round(RECT.right / 100 * RW) - cx;
    const y1 = Math.round(RECT.bottom / 100 * RH) - cy;

    const solid = new Uint8Array(W * H);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (x >= 0 && y >= 0 && x < W && y < H) solid[y * W + x] = 1;
    }

    const dilate = (src, r) => {
      const o = new Uint8Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (!src[y * W + x]) continue;
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < W && ny < H) o[ny * W + nx] = 1;
        }
      }
      return o;
    };
    const erode = (src, r) => {
      const o = new Uint8Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let k = 1;
        for (let dy = -r; dy <= r && k; dy++) for (let dx = -r; dx <= r; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H || !src[ny * W + nx]) { k = 0; break; }
        }
        o[y * W + x] = k;
      }
      return o;
    };

    // same rim recipe as the other hotspots
    const outer = dilate(solid, 3), inner = erode(solid, 2);
    const band = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) band[i] = outer[i] && !inner[i] ? 1 : 0;

    const bandCanvas = document.createElement('canvas');
    bandCanvas.width = W; bandCanvas.height = H;
    const bg = bandCanvas.getContext('2d');
    const bi = bg.createImageData(W, H);
    for (let i = 0; i < W * H; i++) {
      bi.data[i * 4] = 255; bi.data[i * 4 + 1] = 255; bi.data[i * 4 + 2] = 255;
      bi.data[i * 4 + 3] = band[i] ? 255 : 0;
    }
    bg.putImageData(bi, 0, 0);

    // composite: dimmed art + magenta rim, to check the rim sits on the frame
    const comp = document.createElement('canvas');
    comp.width = W; comp.height = H;
    const cg = comp.getContext('2d');
    cg.drawImage(img, cx, cy, W, H, 0, 0, W, H);
    const ci = cg.getImageData(0, 0, W, H);
    for (let i = 0; i < W * H; i++) {
      if (band[i]) { ci.data[i * 4] = 255; ci.data[i * 4 + 1] = 0; ci.data[i * 4 + 2] = 200; }
      else { ci.data[i * 4] *= 0.55; ci.data[i * 4 + 1] *= 0.55; ci.data[i * 4 + 2] *= 0.55; }
    }
    cg.putImageData(ci, 0, 0);

    return {
      W, H, rect: [x0, y0, x1, y1],
      bandPng: bandCanvas.toDataURL('image/png').split(',')[1],
      compPng: comp.toDataURL('image/png').split(',')[1],
    };
  }, { roomB64, BOX, RECT });

  await browser.close();

  console.log('crop', out.W + 'x' + out.H, 'rect in crop', JSON.stringify(out.rect));
  console.log('bbox', JSON.stringify({
    left: +BOX.left.toFixed(4), top: +BOX.top.toFixed(4),
    width: +BOX.width.toFixed(4), height: +BOX.height.toFixed(4),
  }));
  fs.writeFileSync('tools/poster-band.png', Buffer.from(out.bandPng, 'base64'));
  fs.writeFileSync('tools/poster-composite.png', Buffer.from(out.compPng, 'base64'));

  if (process.env.APPLY === '1') {
    let css = fs.readFileSync(CSS, 'utf8');
    const geom = `left: ${BOX.left.toFixed(4)}%; top: ${BOX.top.toFixed(4)}%; width: ${BOX.width.toFixed(4)}%; height: ${BOX.height.toFixed(4)}%;`;
    const re = /(\.spot-posters\s*\{\s*)left:[^;]*;\s*top:[^;]*;\s*width:[^;]*;\s*height:[^;]*;(\s*--edge:\s*)url\("data:image\/png;base64,[^"]+"\)/s;
    if (!re.test(css)) { console.error('could not match .spot-posters block'); process.exit(1); }
    css = css.replace(re, `$1${geom}$2url("data:image/png;base64,${out.bandPng}")`);
    fs.writeFileSync(CSS, css);
    console.log('CSS updated');
  } else {
    console.log('(not applied; set APPLY=1)');
  }
})();
