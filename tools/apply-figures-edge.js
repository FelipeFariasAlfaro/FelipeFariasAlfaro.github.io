// Build step: run the extractor, then rewrite the .spot-figures block in
// styles.css with the freshly computed bbox + inlined --edge mask.
// Usage: node tools/apply-figures-edge.js
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const CSS = path.join(REPO, 'assets/css/styles.css');

// 1. re-extract (writes figures-edge.txt + bbox on stdout)
const stdout = execSync('node ' + JSON.stringify(path.join(__dirname, 'extract-figures-edge.js')), {
  cwd: REPO,
}).toString();
const info = JSON.parse(stdout);
const bbox = info.bbox;
const dataUri = fs.readFileSync(path.join(__dirname, 'figures-edge.txt'), 'utf8').replace(/\s+/g, '');

const fmt = (n) => n.toFixed(4) + '%';
const block =
  '.spot-figures {\n' +
  '    left: ' + fmt(bbox.left) + '; top: ' + fmt(bbox.top) +
  '; width: ' + fmt(bbox.width) + '; height: ' + fmt(bbox.height) + ';\n' +
  '    --edge: url("' + dataUri + '");\n' +
  '}';

let css = fs.readFileSync(CSS, 'utf8');
const re = /\.spot-figures\s*\{[\s\S]*?\}/;
if (!re.test(css)) throw new Error('.spot-figures block not found in styles.css');
css = css.replace(re, block);
fs.writeFileSync(CSS, css);

console.log('Updated .spot-figures with bbox', JSON.stringify(bbox));
console.log('kept components:', info.kept, 'solid%:', info.solidPct, 'band%:', info.bandPct);
