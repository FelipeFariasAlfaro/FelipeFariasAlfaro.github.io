// Extract the phone's outer silhouette from room.webp by colour seed-fill, and
// build the glowing rim band. Pixel-accurate: follows the artwork's real shape.
//
//   node tools/phone-extract.js            -> writes band + composite, updates CSS
//   MODE=probe node tools/phone-extract.js -> dump colours, no writes
//
// Pipeline: classify cool/green pixels (the handset) against the warm wood and wall,
// close to bridge the keypad lines, OPEN to delete the thin cable, fill holes, keep
// the largest component, dilate to swallow the black outline, then
// band = dilate(solid,3) minus erode(solid,2).
const { chromium } = require('playwright');
const fs = require('fs');

const CSS = 'assets/css/styles.css';
const MODE = process.env.MODE || 'build';

// bbox of the phone inside the room art, in %, with slack so the handset never
// touches the crop edge (the leak guard tests border contact).
const BOX = {
  left: Number(process.env.L || 82.6),
  top: Number(process.env.T || 78.4),
  width: Number(process.env.W || 11.8),
  height: Number(process.env.H || 12.0),
};

const CLOSE_R = Number(process.env.CLOSE_R || 5);
// 10 is the value in use: it is the smallest radius that deletes the phone's
// cable. At 7 the cable survives and its outline runs off to the crop edge.
const OPEN_R = Number(process.env.OPEN_R || 10);
const KEEP = Number(process.env.KEEP || 1);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const roomB64 = fs.readFileSync('assets/images/room.webp').toString('base64');

  const result = await page.evaluate(async (args) => {
    const { roomB64, BOX, CLOSE_R, OPEN_R, KEEP, MODE } = args;
    const img = new Image();
    img.src = 'data:image/webp;base64,' + roomB64;
    await img.decode();
    const RW = img.naturalWidth, RH = img.naturalHeight;

    const cx = Math.round(BOX.left / 100 * RW);
    const cy = Math.round(BOX.top / 100 * RH);
    const W = Math.round(BOX.width / 100 * RW);
    const H = Math.round(BOX.height / 100 * RH);

    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.drawImage(img, cx, cy, W, H, 0, 0, W, H);
    const px = g.getImageData(0, 0, W, H).data;
    const at = (x, y) => (y * W + x) * 4;
    const rgb = (x, y) => { const i = at(x, y); return [px[i], px[i + 1], px[i + 2]]; };

    if (MODE === 'probe') {
      const grid = [];
      for (let fy = 10; fy <= 90; fy += 10) {
        const row = [];
        for (let fx = 10; fx <= 90; fx += 10) {
          const x = Math.round(fx / 100 * W), y = Math.round(fy / 100 * H);
          row.push(`${fx},${fy}:` + rgb(x, y).join('/'));
        }
        grid.push(row.join('  '));
      }
      return { probe: true, RW, RH, W, H, grid };
    }

    // The handset is COOL (blue >= red: greys, blue-purples) and its screen is
    // GREEN. The desk wood (127/67/57) and the maroon wall (86/33/52) are WARM
    // (red well above blue), so a hue test separates them cleanly where a
    // distance-to-seed fill could not: a light body pixel (97/91/101) sits only
    // ~58 from the wood, inside any tolerance wide enough to cover the body.
    const mask = new Uint8Array(W * H);
    const leaks = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const [r, g, b] = rgb(x, y);
      const cool = b >= r - 4;
      const green = g > r + 8 && g > b + 8;
      if (cool || green) mask[y * W + x] = 1;
    }

    const dilate = (src, r) => {
      const out = new Uint8Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (!src[y * W + x]) continue;
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < W && ny < H) out[ny * W + nx] = 1;
        }
      }
      return out;
    };
    const erode = (src, r) => {
      const out = new Uint8Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let keep = 1;
        for (let dy = -r; dy <= r && keep; dy++) for (let dx = -r; dx <= r; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H || !src[ny * W + nx]) { keep = 0; break; }
        }
        out[y * W + x] = keep;
      }
      return out;
    };
    const fillHoles = (src) => {
      const outside = new Uint8Array(W * H);
      const q = [];
      for (let x = 0; x < W; x++) {
        if (!src[x]) { outside[x] = 1; q.push([x, 0]); }
        const i = (H - 1) * W + x;
        if (!src[i]) { outside[i] = 1; q.push([x, H - 1]); }
      }
      for (let y = 0; y < H; y++) {
        const a = y * W, bq = y * W + W - 1;
        if (!src[a]) { outside[a] = 1; q.push([0, y]); }
        if (!src[bq]) { outside[bq] = 1; q.push([W - 1, y]); }
      }
      while (q.length) {
        const [x, y] = q.pop();
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const ni = ny * W + nx;
          if (src[ni] || outside[ni]) continue;
          outside[ni] = 1;
          q.push([nx, ny]);
        }
      }
      const out = new Uint8Array(W * H);
      for (let i = 0; i < W * H; i++) out[i] = src[i] || !outside[i] ? 1 : 0;
      return out;
    };
    const components = (src) => {
      const lab = new Int32Array(W * H).fill(-1);
      const comps = [];
      for (let i = 0; i < W * H; i++) {
        if (!src[i] || lab[i] !== -1) continue;
        const id = comps.length;
        const cells = [];
        const q = [i];
        lab[i] = id;
        while (q.length) {
          const j = q.pop();
          cells.push(j);
          const x = j % W, y = (j - x) / W;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            const nj = ny * W + nx;
            if (!src[nj] || lab[nj] !== -1) continue;
            lab[nj] = id;
            q.push(nj);
          }
        }
        comps.push(cells);
      }
      comps.sort((a, b) => b.length - a.length);
      return comps;
    };

    let m = erode(dilate(mask, CLOSE_R), CLOSE_R); // close: bridge keypad lines
    // OPEN (erode then dilate) deletes anything thinner than 2*OPEN_R. This is what
    // removes the phone's thin CABLE, which is attached to the handset and otherwise
    // drags the outline off to the crop edge as a stray line.
    if (OPEN_R > 0) m = dilate(erode(m, OPEN_R), OPEN_R);
    m = fillHoles(m);
    const comps = components(m);
    const kept = new Uint8Array(W * H);
    for (const cells of comps.slice(0, KEEP)) for (const i of cells) kept[i] = 1;
    let solid = fillHoles(dilate(kept, 2)); // swallow the black outline
    const band = new Uint8Array(W * H);
    const outer = dilate(solid, 3), inner = erode(solid, 2);
    for (let i = 0; i < W * H; i++) band[i] = outer[i] && !inner[i] ? 1 : 0;

    const emit = (bits, colour) => {
      const cc = document.createElement('canvas');
      cc.width = W; cc.height = H;
      const gg = cc.getContext('2d');
      const im = gg.createImageData(W, H);
      for (let i = 0; i < W * H; i++) {
        im.data[i * 4] = colour[0]; im.data[i * 4 + 1] = colour[1]; im.data[i * 4 + 2] = colour[2];
        im.data[i * 4 + 3] = bits[i] ? 255 : 0;
      }
      gg.putImageData(im, 0, 0);
      return cc.toDataURL('image/png').split(',')[1];
    };

    // composite for eyeballing: dimmed art + magenta band
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

    let solidArea = 0, bandArea = 0;
    for (let i = 0; i < W * H; i++) { if (solid[i]) solidArea++; if (band[i]) bandArea++; }

    return {
      W, H, RW, RH,
      leaks,
      comps: comps.slice(0, 6).map((c) => c.length),
      solidPct: (solidArea / (W * H) * 100).toFixed(1),
      bandPct: (bandArea / (W * H) * 100).toFixed(1),
      bandPng: emit(band, [255, 255, 255]),
      compPng: comp.toDataURL('image/png').split(',')[1],
    };
  }, { roomB64, BOX, CLOSE_R, OPEN_R, KEEP, MODE });

  await browser.close();

  if (result.probe) {
    console.log('room', result.RW, 'x', result.RH, 'crop', result.W, 'x', result.H);
    result.grid.forEach((r) => console.log(r));
    return;
  }

  console.log('crop', result.W + 'x' + result.H, 'leaks', JSON.stringify(result.leaks),
    'comps', JSON.stringify(result.comps), 'solid%', result.solidPct, 'band%', result.bandPct);

  fs.writeFileSync('tools/phone-band.png', Buffer.from(result.bandPng, 'base64'));
  fs.writeFileSync('tools/phone-composite.png', Buffer.from(result.compPng, 'base64'));

  if (process.env.APPLY === '1') {
    let css = fs.readFileSync(CSS, 'utf8');
    const geom = `left: ${BOX.left}%; top: ${BOX.top}%; width: ${BOX.width}%; height: ${BOX.height}%;`;
    const re = /(\.spot-phone\s*\{\s*)left:[^;]*;\s*top:[^;]*;\s*width:[^;]*;\s*height:[^;]*;(\s*--edge:\s*)url\("data:image\/png;base64,[^"]+"\)/s;
    if (!re.test(css)) { console.error('could not match .spot-phone block'); process.exit(1); }
    css = css.replace(re, `$1${geom}$2url("data:image/png;base64,${result.bandPng}")`);
    fs.writeFileSync(CSS, css);
    console.log('CSS updated with new bbox + mask');
  } else {
    console.log('(not applied; set APPLY=1 to write CSS)');
  }
})();
