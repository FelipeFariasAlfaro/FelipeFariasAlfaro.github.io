// Re-extract the OUTER silhouette mask for spot-figures (the three characters
// on the shelf) so the glow traces only each figure's outer outline, never the
// interior lines (arms, shirts, legs).
//
// Approach: the three figures are small, multi-coloured sprites, each wrapped in
// a dark outline, sitting on a dark wall / wood shelf. Colour seed-fill alone is
// unreliable (figures are red/green/blue/skin/hair). Instead we classify a pixel
// as "figure" when it is clearly NOT background, grow/close the result so each
// sprite becomes one solid blob, FILL INTERIOR HOLES (this is what kills the
// interior lines), keep the N largest connected components (= the figures), and
// emit the outer rim band of those solid silhouettes.
//
// Output: prints the bbox + base64 PNG band so it can be inlined into styles.css
// as the --edge of .spot-figures. Also writes a composite for visual verification.

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const pwRoot = execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(pwRoot, 'playwright'));

const REPO = path.resolve(__dirname, '..');
const IMG = path.join(REPO, 'assets/images/room.webp');

// spot-figures bbox in percent (must match styles.css .spot-figures).
const BBOX = { left: 84.4840, top: 13.9974, width: 13.9898, height: 11.9792 };
// Extra slack so a figure never touches the crop edge.
const SLACK = 1.5;
const KEEP_COMPONENTS = 3; // three figures
const BAND_OUTER = 3;      // how many px the glowing rim extends outward
const BAND_INNER = 2;      // how far it bites back into the solid silhouette
// The wood shelf starts abruptly near the bottom of the crop (profiled: the
// "wood fraction per row" jumps to ~1.0 at row ~200 of 230). Everything at or
// below this row is shelf/background and must be excluded, otherwise it forms a
// large blob that steals a component slot. Expressed as a fraction of crop height.
const FLOOR_FRAC = 0.86;   // rows below this (of ch) are shelf -> dropped

(async () => {
  const imgData = fs.readFileSync(IMG).toString('base64');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1200 } });
  const html = `<!doctype html><html><body style="margin:0;background:#111">
    <img id="im" src="data:image/webp;base64,${imgData}"><canvas id="c"></canvas>
  </body></html>`;
  await page.setContent(html);
  await page.waitForFunction(() => {
    const im = document.getElementById('im');
    return im && im.complete && im.naturalWidth > 0;
  });

  const out = await page.evaluate((args) => {
    const { BBOX, SLACK, KEEP_COMPONENTS, BAND_OUTER, BAND_INNER, FLOOR_FRAC } = args;
    const im = document.getElementById('im');
    const W = im.naturalWidth, H = im.naturalHeight;
    const c = document.getElementById('c');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    ctx.drawImage(im, 0, 0);

    const L = Math.max(0, Math.round((BBOX.left - SLACK) / 100 * W));
    const T = Math.max(0, Math.round((BBOX.top - SLACK) / 100 * H));
    const R = Math.min(W, Math.round((BBOX.left + BBOX.width + SLACK) / 100 * W));
    const B = Math.min(H, Math.round((BBOX.top + BBOX.height + SLACK) / 100 * H));
    const cw = R - L, ch = B - T;
    const img = ctx.getImageData(L, T, cw, ch);
    const d = img.data;
    const idx = (x, y) => (y * cw + x) * 4;

    // ---- 1. seed the figure bodies ---------------------------------------
    // We do NOT try to classify every figure pixel. The dark-brown hair of the
    // left figure (~[53,22,35]) is colour-indistinguishable from the wine wall
    // (~[42,15,40]), so a colour test either loses the hair or eats the wall.
    // Instead we seed only the UNAMBIGUOUS body pixels (saturated clothing,
    // bright skin / hair / eyes), then a strong morphological CLOSE bridges the
    // dark hair and outline into one solid blob per figure, and fillHoles
    // removes every interior line. The wood shelf is excluded outright by the
    // FLOOR_FRAC cut so it can never form a competing component.
    const N = cw * ch;
    const floorY = Math.round(ch * FLOOR_FRAC);
    const sat = new Uint8Array(N);   // confident figure-body pixels
    for (let y = 0; y < floorY; y++) {
      for (let x = 0; x < cw; x++) {
        const i = idx(x, y);
        const r = d[i], g = d[i+1], b = d[i+2];
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        const s = max === 0 ? 0 : (max - min) / max; // HSV saturation
        const v = max;                               // HSV value
        const isColour = s > 0.42 && v > 85;         // vivid clothing
        const isBright = v > 150;                    // skin / blonde / eyes
        if (isColour || isBright) sat[i / 4] = 1;
      }
    }

    // ---- morphology helpers ----------------------------------------------
    const dilate = (src, radius) => {
      let cur = src;
      for (let r = 0; r < radius; r++) {
        const next = new Uint8Array(N);
        for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
          const p = y * cw + x;
          if (cur[p]) { next[p] = 1; continue; }
          if ((x && cur[p-1]) || (x<cw-1 && cur[p+1]) ||
              (y && cur[p-cw]) || (y<ch-1 && cur[p+cw])) next[p] = 1;
        }
        cur = next;
      }
      return cur;
    };
    const erode = (src, radius) => {
      let cur = src;
      for (let r = 0; r < radius; r++) {
        const next = new Uint8Array(N);
        for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
          const p = y * cw + x;
          if (!cur[p]) continue;
          if (x===0||x===cw-1||y===0||y===ch-1) { next[p]=0; continue; }
          if (cur[p-1] && cur[p+1] && cur[p-cw] && cur[p+cw]) next[p] = 1;
        }
        cur = next;
      }
      return cur;
    };
    const fillHoles = (src) => {
      // flood the outside (reachable from border) then invert: anything not
      // reached and not already mask becomes mask -> interior holes vanish.
      const outside = new Uint8Array(N);
      const stack = [];
      for (let x = 0; x < cw; x++) { stack.push(x); stack.push((ch-1)*cw + x); }
      for (let y = 0; y < ch; y++) { stack.push(y*cw); stack.push(y*cw + cw-1); }
      while (stack.length) {
        const p = stack.pop();
        if (p < 0 || p >= N || outside[p] || src[p]) continue;
        outside[p] = 1;
        const x = p % cw, y = (p / cw) | 0;
        if (x) stack.push(p-1);
        if (x<cw-1) stack.push(p+1);
        if (y) stack.push(p-cw);
        if (y<ch-1) stack.push(p+cw);
      }
      const res = new Uint8Array(N);
      for (let p = 0; p < N; p++) res[p] = (src[p] || !outside[p]) ? 1 : 0;
      return res;
    };
    const components = (src) => {
      const label = new Int32Array(N).fill(-1);
      const comps = [];
      for (let s = 0; s < N; s++) {
        if (!src[s] || label[s] !== -1) continue;
        const id = comps.length;
        const cells = [];
        const stack = [s]; label[s] = id;
        while (stack.length) {
          const p = stack.pop(); cells.push(p);
          const x = p % cw, y = (p / cw) | 0;
          const nb = [];
          if (x) nb.push(p-1); if (x<cw-1) nb.push(p+1);
          if (y) nb.push(p-cw); if (y<ch-1) nb.push(p+cw);
          for (const q of nb) if (src[q] && label[q]===-1) { label[q]=id; stack.push(q); }
        }
        comps.push(cells);
      }
      return comps;
    };

    // ---- 2. build solid silhouettes --------------------------------------
    // Strong CLOSE (dilate CLOSE_R then erode CLOSE_R): bridges the dark hair and
    // the black outline gap between separated body patches so head+torso+legs of
    // one figure become a single blob, without inflating the final silhouette
    // (the matching erosion gives the size back). fillHoles then swallows every
    // interior line, leaving only the outer contour.
    const CLOSE_R = 7;
    let mask = erode(dilate(sat, CLOSE_R), CLOSE_R);
    mask = fillHoles(mask);
    // keep the KEEP_COMPONENTS largest blobs (the three figures); smaller
    // specks (stray bright pixels on the wall/posters) are discarded.
    let comps = components(mask).sort((a, b) => b.length - a.length);
    const keep = new Uint8Array(N);
    const MIN_AREA = N * 0.01; // ignore tiny flecks
    let kept = 0;
    for (let k = 0; k < comps.length && kept < KEEP_COMPONENTS; k++) {
      if (comps[k].length < MIN_AREA) break;
      for (const p of comps[k]) keep[p] = 1;
      kept++;
    }
    // Grow the kept blobs by 2px to swallow each figure's own dark outline
    // (so the rim sits just outside the black line, as the recipe prescribes),
    // then re-fill holes to be safe. The grow also covers stray hair strands
    // that the colour seeds missed above the head.
    let solid = fillHoles(dilate(keep, 2));
    solid = fillHoles(solid);

    // ---- 3. outer rim band ------------------------------------------------
    const grown = dilate(solid, BAND_OUTER);
    const shrunk = erode(solid, BAND_INNER);
    const band = new Uint8Array(N);
    for (let p = 0; p < N; p++) band[p] = (grown[p] && !shrunk[p]) ? 1 : 0;

    // ---- emit band PNG (white on transparent) -----------------------------
    const bc = document.createElement('canvas');
    bc.width = cw; bc.height = ch;
    const bctx = bc.getContext('2d');
    const bImg = bctx.createImageData(cw, ch);
    for (let p = 0; p < N; p++) {
      const i = p * 4;
      bImg.data[i] = 255; bImg.data[i+1] = 255; bImg.data[i+2] = 255;
      bImg.data[i+3] = band[p] ? 255 : 0;
    }
    bctx.putImageData(bImg, 0, 0);
    const bandUrl = bc.toDataURL('image/png');

    // ---- composite for verification: dimmed source + rim in magenta -------
    const comp = document.createElement('canvas');
    comp.width = cw; comp.height = ch;
    const cctx = comp.getContext('2d');
    const cImg = cctx.createImageData(cw, ch);
    for (let p = 0; p < N; p++) {
      const i = p * 4;
      if (band[p]) { cImg.data[i]=255; cImg.data[i+1]=0; cImg.data[i+2]=255; cImg.data[i+3]=255; }
      else { cImg.data[i]=d[i]*0.45; cImg.data[i+1]=d[i+1]*0.45; cImg.data[i+2]=d[i+2]*0.45; cImg.data[i+3]=255; }
    }
    cctx.putImageData(cImg, 0, 0);
    // scale composite up 6x for inspection
    const sc = document.createElement('canvas');
    sc.width = cw*6; sc.height = ch*6;
    const sctx = sc.getContext('2d');
    sctx.imageSmoothingEnabled = false;
    sctx.drawImage(comp, 0, 0, cw, ch, 0, 0, cw*6, ch*6);
    const compUrl = sc.toDataURL('image/png');

    // recompute the precise bbox (percent) the band crop corresponds to
    const bbox = {
      left: (L / W) * 100, top: (T / H) * 100,
      width: (cw / W) * 100, height: (ch / H) * 100,
    };
    const solidCount = solid.reduce((a, v) => a + v, 0);
    const bandCount = band.reduce((a, v) => a + v, 0);
    return { bandUrl, compUrl, bbox, cw, ch, kept, solidCount, bandCount, total: N };
  }, { BBOX, SLACK, KEEP_COMPONENTS, BAND_OUTER, BAND_INNER, FLOOR_FRAC });

  fs.writeFileSync(path.join(__dirname, 'figures-band.png'), Buffer.from(out.bandUrl.split(',')[1], 'base64'));
  fs.writeFileSync(path.join(__dirname, 'figures-composite.png'), Buffer.from(out.compUrl.split(',')[1], 'base64'));
  fs.writeFileSync(path.join(__dirname, 'figures-edge.txt'), out.bandUrl); // full data URI for CSS

  console.log(JSON.stringify({
    bbox: out.bbox, cw: out.cw, ch: out.ch, kept: out.kept,
    solidPct: (out.solidCount / out.total * 100).toFixed(1),
    bandPct: (out.bandCount / out.total * 100).toFixed(1),
  }, null, 2));

  await browser.close();
})();
