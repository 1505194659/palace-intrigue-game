const fs = require('fs');
const path = require('path');
const { Jimp } = require('jimp');

const DIR = path.join(__dirname, 'public', 'portraits');
const Q = 82;
const TARGET_W = 480;

(async () => {
  const files = fs.readdirSync(DIR).filter((f) => f.toLowerCase().endsWith('.png'));
  let totalIn = 0, totalOut = 0;
  for (const f of files) {
    const src = path.join(DIR, f);
    const dst = path.join(DIR, f.replace(/\.png$/i, '.jpg'));
    const inSize = fs.statSync(src).size;
    totalIn += inSize;
    const img = await Jimp.read(src);
    if (img.bitmap.width > TARGET_W) {
      img.resize({ w: TARGET_W });
    }
    await img.write(dst, { quality: Q });
    const outSize = fs.statSync(dst).size;
    totalOut += outSize;
    console.log(
      f.padEnd(18) + ' '
      + (inSize / 1024).toFixed(1).padStart(6) + ' KB'
      + ' -> ' + (outSize / 1024).toFixed(1).padStart(6) + ' KB'
      + '  (-' + ((1 - outSize / inSize) * 100).toFixed(0) + '%)',
    );
  }
  console.log('---');
  console.log('total: ' + (totalIn / 1024).toFixed(1) + ' KB -> ' + (totalOut / 1024).toFixed(1) + ' KB');
})().catch((e) => { console.error(e.message); process.exit(1); });