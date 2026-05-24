// One-shot helper: slice the 6-girl AI sheet into per-class half-body PNGs.
// Saves:
//   - public/portraits/sheet.png  (whole image copy, for sprite mode)
//   - public/portraits/<id>.png   (head-shoulder crops 5:7, for single mode)
const path = require('path');
const fs = require('fs');
const { Jimp } = require('jimp');

const SRC = process.argv[2] || 'C:/Users/a1505/Downloads/ChatGPT Image 2026年5月24日 12_42_21.png';
const OUT = path.join(__dirname, 'public', 'portraits');
const IDS = ['default', 'talent', 'seductress', 'schemer', 'noble', 'healer'];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const img = await Jimp.read(SRC);
  const W = img.bitmap.width;
  const H = img.bitmap.height;
  console.log('source:', W, 'x', H);

  // copy whole sheet as sprite source
  await img.clone().write(path.join(OUT, 'sheet.png'));
  console.log('wrote sheet.png');

  const cols = 6;
  const colW = W / cols;
  // crop body region: head down to just above the name plate (~y=720).
  // Use ratio 1:2.5, classic "tachi-e" half-body proportions.
  const RATIO = 2.5;
  const cropH = Math.round(colW * RATIO);
  const y0 = 8;

  for (let i = 0; i < cols; i++) {
    const x = Math.round(i * colW);
    const w = Math.round(colW);
    const out = img.clone().crop({ x, y: y0, w, h: Math.min(cropH, H - y0) });
    // resize to a clean target (keeping ratio): width 500
    out.resize({ w: 500 });
    const outPath = path.join(OUT, IDS[i] + '.png');
    await out.write(outPath);
    console.log('wrote', IDS[i] + '.png', '(crop x=' + x + ', w=' + w + ', h=' + cropH + ')');
  }
})().catch((e) => { console.error(e); process.exit(1); });
