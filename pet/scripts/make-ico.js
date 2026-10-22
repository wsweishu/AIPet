// Packs PNGs (made from assets/icon.png, e.g. with `sips -z N N`) into assets/icon.ico for the Windows build.
// Usage: node scripts/make-ico.js <dir with 16.png 24.png ... 256.png>
const fs = require('node:fs');
const path = require('node:path');

const SIZES = [16, 24, 32, 48, 64, 128, 256];
const dir = process.argv[2];
const images = SIZES.map(n => fs.readFileSync(path.join(dir, `${n}.png`)));

const header = Buffer.alloc(6);
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(images.length, 4);
let offset = 6 + 16 * images.length;
const entries = images.map((png, i) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(SIZES[i] % 256, 0); // 0 means 256
  e.writeUInt8(SIZES[i] % 256, 1);
  e.writeUInt16LE(1, 4); // planes
  e.writeUInt16LE(32, 6); // bits per pixel
  e.writeUInt32LE(png.length, 8);
  e.writeUInt32LE(offset, 12);
  offset += png.length;
  return e;
});
fs.writeFileSync(path.join(__dirname, '..', 'assets', 'icon.ico'), Buffer.concat([header, ...entries, ...images]));
console.log('wrote assets/icon.ico');
