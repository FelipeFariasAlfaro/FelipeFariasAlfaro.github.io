// Find the black inner rectangle of the CRT screen in room.webp by probing the
// green-on-black screen content: scan for the bounding box of dark/greenish
// pixels inside the monitor region, then report it as percentages.
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const pwRoot = execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(pwRoot, 'playwright'));

const REPO = path.resolve(__dirname, '..');
const IMG = path.join(REPO, 'assets/images/room.webp');
// spot-screen bbox (from styles.css) frames the whole monitor incl. bezel.
const SCREEN = { left: 33.7936, top: 24.2188, width: 32.3038, height: 40.1693 };

(async () => {
  const imgData = fs.readFileSync(IMG).toString('base64');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await page.setContent(`<img id="im" src="data:image/webp;base64,${imgData}"><canvas id="c"></canvas>`);
  await page.waitForFunction(() => { const im = document.getElementById('im'); return im && im.complete && im.naturalWidth > 0; });

  const res = await page.evaluate(({ SCREEN }) => {
    const im = document.getElementById('im');
    const W = im.naturalWidth, H = im.naturalHeight;
    const c = document.getElementById('c'); c.width = W; c.height = H;
    const ctx = c.getContext('2d'); ctx.drawImage(im, 0, 0);
    const L = Math.round(SCREEN.left/100*W), T = Math.round(SCREEN.top/100*H);
    const R = Math.round((SCREEN.left+SCREEN.width)/100*W), B = Math.round((SCREEN.top+SCREEN.height)/100*H);
    const cw = R-L, ch = B-T;
    const d = ctx.getImageData(L,T,cw,ch).data;
    const isScreen = (x,y) => {
      const i=(y*cw+x)*4; const r=d[i],g=d[i+1],b=d[i+2];
      // dark screen area: low brightness, OR green phosphor text (g dominant)
      const dark = r<45 && g<60 && b<45;
      const green = g>60 && g>r*1.3 && g>b*1.3;
      return dark || green;
    };
    // find bbox of screen pixels, but only within an inset to avoid bezel shadows
    let minX=cw, minY=ch, maxX=0, maxY=0, count=0;
    for (let y=0;y<ch;y++) for (let x=0;x<cw;x++) {
      if (isScreen(x,y)) { count++;
        if (x<minX)minX=x; if (x>maxX)maxX=x; if (y<minY)minY=y; if (y>maxY)maxY=y; }
    }
    // To be robust against stray dark pixels in the bezel, instead use per-column
    // and per-row coverage thresholds.
    const colCov = new Array(cw).fill(0), rowCov = new Array(ch).fill(0);
    for (let y=0;y<ch;y++) for (let x=0;x<cw;x++) if (isScreen(x,y)) { colCov[x]++; rowCov[y]++; }
    const firstAbove = (arr, frac) => { const th=arr.length*frac; for(let i=0;i<arr.length;i++) if(arr[i]>=th) return i; return -1; };
    const lastAbove = (arr, frac) => { const th=arr.length*frac; for(let i=arr.length-1;i>=0;i--) if(arr[i]>=th) return i; return -1; };
    // colCov indexed by x -> its length is cw, threshold vs ch
    const thCol = ch*0.45, thRow = cw*0.45;
    let cx0=-1,cx1=-1,cy0=-1,cy1=-1;
    for(let x=0;x<cw;x++) if(colCov[x]>=thCol){cx0=x;break;}
    for(let x=cw-1;x>=0;x--) if(colCov[x]>=thCol){cx1=x;break;}
    for(let y=0;y<ch;y++) if(rowCov[y]>=thRow){cy0=y;break;}
    for(let y=ch-1;y>=0;y--) if(rowCov[y]>=thRow){cy1=y;break;}

    const toPct = (x,y,w,h) => ({
      left: ((L+x)/W*100), top: ((T+y)/H*100),
      width: (w/W*100), height: (h/H*100),
    });
    return {
      W,H, screenCrop:{L,T,cw,ch},
      bboxAll: toPct(minX,minY,maxX-minX,maxY-minY),
      bboxCov: toPct(cx0,cy0,cx1-cx0,cy1-cy0),
      cov:{cx0,cx1,cy0,cy1},
    };
  }, { SCREEN });
  console.log(JSON.stringify(res,null,2));
  await browser.close();
})();
