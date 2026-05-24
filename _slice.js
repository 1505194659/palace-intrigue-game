// One-shot helper: slice an AI-generated multi-card sheet into per-class PNGs.
// Supports either 6x1 horizontal sheets (cols=6, rows=1) or 3x2 grids (cols=3, rows=2).
const path = require('path');
const fs = require('fs');
const { Jimp } = require('jimp');

const SRC = process.argv[2] || 'C:/Users/a1505/Downloads/ChatGPT Image 2026年5月24日 12_57_13.png';
const OUT = path.join(__dirname, 'public', 'portraits');
// Order: row-major. For a 3x2 sheet:
//   row 0 (top):    default(良家), talent(才女), seductress(妖姬)
//   row 1 (bottom): schemer(心机), noble(嫡女),  healer(神医)
const IDS = ['default', 'talent', 'seductress', 'schemer', 'noble', 'healer'];

// CONFIG: tune to the actual sheet layout.
const COLS = 3;
const ROWS = 2;
const PAD = 0; // pixels trimmed from each card edge (gutters between cards)

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const img = await Jimp.read(SRC);
  const W = img.bitmap.width;
  const H = img.bitmap.height;
  console.log('source:', W, 'x', H, '   layout:', COLS, 'x', ROWS);

  const cellW = W / COLS;
  const cellH = H / ROWS;

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const idx = r * COLS + c;
      if (idx >= IDS.length) break;
      const x = Math.round(c * cellW + PAD);
      const y = Math.round(r * cellH + PAD);
      const w = Math.round(cellW - 2 * PAD);
      const h = Math.round(cellH - 2 * PAD);
      const out = img.clone().crop({ x, y, w, h });
      out.resize({ w: 500 });
      const outPath = path.join(OUT, IDS[idx] + '.png');
      await out.write(outPath);
      console.log('wrote', IDS[idx] + '.png', '(x=' + x + ', y=' + y + ', ' + w + 'x' + h + ')');
    }
  }
})().catch((e) => { console.error(e); process.exit(1); });
