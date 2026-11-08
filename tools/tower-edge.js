// Rebuild the Habilidades PC-tower hotspot (.spot-tower) from the artwork.
//
//   node tools/tower-edge.js           -> band + composite, no CSS write
//   APPLY=1 node tools/tower-edge.js   -> also rewrite the CSS block
//
// Classifier, from a colour probe of the crop:
//   front face 134/120/143, side face 67/65/105  -> blue-leaning (b >= r+4)
//   top face   194/190/165                       -> warm cream, caught by lum>150
//   wall       40/10/34, 33/9/33                 -> excluded (b < r+4, dark)
//   desk       128/68/58                         -> excluded (warm, lum 85)
// The mouse (196/181/162) and the Playwright poster frame are the same brightness
// as the tower's top face and are deliberately NOT separable by colour, so they
// are dropped by keeping only the largest connected component.
const { chromium } = require('playwright');
const fs = require('fs');

const CSS = 'assets/css/styles.css';
// generous working bbox with slack; the extractor reports the tight bbox it used
const BOX = {
  left: Number(process.env.L || 67.0),
  top: Number(process.env.T || 33.0),
  width: Number(process.env.W || 23.0),
  height: Number(process.env.H || 52.0),
};
const CLOSE_R = Number(process.env.CLOSE_R || 6);
const OPEN_R = Number(process.env.OPEN_R || 8);
const KEEP = Number(process.env.KEEP || 1);
const LUM = Number(process.env.LUM || 100);      // clearly-lit case pixels
const LUM_LO = Number(process.env.LUM_LO || 60);  // dimmer, but only if cool
const COOL = Number(process.env.COOL || 20);     // b-r needed for the side face
// shrink-wrap the emitted mask to the object plus this much slack, in crop px
const PAD = Number(process.env.PAD || 8);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const roomB64 = fs.readFileSync('assets/images/room.webp').toString('base64');

  const out = await page.evaluate(async (args) => {
    const { roomB64, BOX, CLOSE_R, OPEN_R, KEEP, LUM, LUM_LO, COOL, PAD } = args;
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
    const d = g.getImageData(0, 0, W, H).data;

    const mask = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) {
      const r = d[i * 4], gg = d[i * 4 + 1], b = d[i * 4 + 2];
      const lum = (r + gg + b) / 3;
      // The case is LIGHT, the wall is DARK, so brightness carries the signal.
      // A plain "blue-leaning" test fails here: the brick wall's mortar and
      // shadows are blue-ish too and leaked into a blob covering 75% of the crop.
      // The darker left side face (lum 79) still needs the cool clause, which the
      // warm desk (128/68/58, lum 85) cannot satisfy.
      if (lum > LUM || (lum > LUM_LO && b - r >= COOL)) mask[i] = 1;
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
    const fillHoles = (src) => {
      const outside = new Uint8Array(W * H);
      const q = [];
      const push = (x, y) => { const i = y * W + x; if (!src[i] && !outside[i]) { outside[i] = 1; q.push([x, y]); } };
      for (let x = 0; x < W; x++) { push(x, 0); push(x, H - 1); }
      for (let y = 0; y < H; y++) { push(0, y); push(W - 1, y); }
      while (q.length) {
        const [x, y] = q.pop();
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          push(nx, ny);
        }
      }
      const o = new Uint8Array(W * H);
      for (let i = 0; i < W * H; i++) o[i] = src[i] || !outside[i] ? 1 : 0;
      return o;
    };
    const comps = (src) => {
      const lab = new Int32Array(W * H).fill(-1);
      const list = [];
      for (let i = 0; i < W * H; i++) {
        if (!src[i] || lab[i] !== -1) continue;
        const id = list.length, cells = [], q = [i];
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
        list.push(cells);
      }
      list.sort((a, b) => b.length - a.length);
      return list;
    };

    let m = erode(dilate(mask, CLOSE_R), CLOSE_R); // bridge the drive bays and vents
    // OPEN severs thin attachments: the cables lying behind the case touch its
    // right edge and otherwise hang off the outline as small tabs.
    if (OPEN_R > 0) m = dilate(erode(m, OPEN_R), OPEN_R);
    m = fillHoles(m);
    const cs = comps(m);
    const kept = new Uint8Array(W * H);
    for (const cells of cs.slice(0, KEEP)) for (const i of cells) kept[i] = 1;
    const solid = fillHoles(dilate(kept, 2)); // swallow the black outline

    // tight bounds of the object inside the working crop
    let minX = W, minY = H, maxX = -1, maxY = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!solid[y * W + x]) continue;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    const touches = minX === 0 || minY === 0 || maxX === W - 1 || maxY === H - 1;

    // re-crop to the object + PAD so the emitted mask is tight
    const ox = Math.max(0, minX - PAD), oy = Math.max(0, minY - PAD);
    const ow = Math.min(W, maxX + PAD + 1) - ox, oh = Math.min(H, maxY + PAD + 1) - oy;

    const sub = (src) => {
      const o = new Uint8Array(ow * oh);
      for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) o[y * ow + x] = src[(y + oy) * W + (x + ox)];
      return o;
    };
    const s2 = sub(solid);
    const dil2 = (src, r) => {
      const o = new Uint8Array(ow * oh);
      for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) {
        if (!src[y * ow + x]) continue;
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < ow && ny < oh) o[ny * ow + nx] = 1;
        }
      }
      return o;
    };
    const ero2 = (src, r) => {
      const o = new Uint8Array(ow * oh);
      for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) {
        let k = 1;
        for (let dy = -r; dy <= r && k; dy++) for (let dx = -r; dx <= r; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= ow || ny >= oh || !src[ny * ow + nx]) { k = 0; break; }
        }
        o[y * ow + x] = k;
      }
      return o;
    };
    const outer = dil2(s2, 3), inner = ero2(s2, 2);
    const band = new Uint8Array(ow * oh);
    for (let i = 0; i < ow * oh; i++) band[i] = outer[i] && !inner[i] ? 1 : 0;

    const bc = document.createElement('canvas');
    bc.width = ow; bc.height = oh;
    const bg = bc.getContext('2d');
    const bi = bg.createImageData(ow, oh);
    for (let i = 0; i < ow * oh; i++) {
      bi.data[i * 4] = 255; bi.data[i * 4 + 1] = 255; bi.data[i * 4 + 2] = 255;
      bi.data[i * 4 + 3] = band[i] ? 255 : 0;
    }
    bg.putImageData(bi, 0, 0);

    const comp = document.createElement('canvas');
    comp.width = ow; comp.height = oh;
    const cg = comp.getContext('2d');
    cg.drawImage(img, cx + ox, cy + oy, ow, oh, 0, 0, ow, oh);
    const ci = cg.getImageData(0, 0, ow, oh);
    for (let i = 0; i < ow * oh; i++) {
      if (band[i]) { ci.data[i * 4] = 255; ci.data[i * 4 + 1] = 0; ci.data[i * 4 + 2] = 200; }
      else { ci.data[i * 4] *= 0.55; ci.data[i * 4 + 1] *= 0.55; ci.data[i * 4 + 2] *= 0.55; }
    }
    cg.putImageData(ci, 0, 0);

    return {
      W, H, ow, oh, touches,
      comps: cs.slice(0, 5).map((x) => x.length),
      tight: [minX, minY, maxX, maxY],
      // emitted mask's bbox back in room %
      bbox: {
        left: (cx + ox) / RW * 100,
        top: (cy + oy) / RH * 100,
        width: ow / RW * 100,
        height: oh / RH * 100,
      },
      bandPng: bc.toDataURL('image/png').split(',')[1],
      compPng: comp.toDataURL('image/png').split(',')[1],
    };
  }, { roomB64, BOX, CLOSE_R, OPEN_R, KEEP, LUM, LUM_LO, COOL, PAD });

  await browser.close();

  console.log('work crop', out.W + 'x' + out.H, 'tight', JSON.stringify(out.tight),
    'touches border:', out.touches, 'comps', JSON.stringify(out.comps));
  console.log('emit crop', out.ow + 'x' + out.oh, 'bbox', JSON.stringify({
    left: +out.bbox.left.toFixed(4), top: +out.bbox.top.toFixed(4),
    width: +out.bbox.width.toFixed(4), height: +out.bbox.height.toFixed(4),
  }));
  if (out.touches) console.error('WARNING: object touches the working bbox edge; widen L/T/W/H');

  fs.writeFileSync('tools/tower-band.png', Buffer.from(out.bandPng, 'base64'));
  fs.writeFileSync('tools/tower-composite.png', Buffer.from(out.compPng, 'base64'));

  if (process.env.APPLY === '1') {
    let css = fs.readFileSync(CSS, 'utf8');
    const b = out.bbox;
    const geom = `left: ${b.left.toFixed(4)}%; top: ${b.top.toFixed(4)}%; width: ${b.width.toFixed(4)}%; height: ${b.height.toFixed(4)}%;`;
    const re = /(\.spot-tower\s*\{\s*)left:[^;]*;\s*top:[^;]*;\s*width:[^;]*;\s*height:[^;]*;(\s*--edge:\s*)url\("data:image\/png;base64,[^"]+"\)/s;
    if (!re.test(css)) { console.error('could not match .spot-tower block'); process.exit(1); }
    css = css.replace(re, `$1${geom}$2url("data:image/png;base64,${out.bandPng}")`);
    fs.writeFileSync(CSS, css);
    console.log('CSS updated');
  } else {
    console.log('(not applied; set APPLY=1)');
  }
})();
