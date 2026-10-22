// Renders assets/icon.html to assets/icon.png (1024²) and assets/icon.icns.
// Run with: npx electron scripts/make-icon.js
const { app, BrowserWindow } = require('electron');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ASSETS = path.join(__dirname, '..', 'assets');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1024, height: 1024, show: false, transparent: true, frame: false,
    useContentSize: true, webPreferences: { offscreen: true, zoomFactor: 1 },
  });
  await win.loadFile(path.join(ASSETS, 'icon.html'));
  // icon.html sets its title to "ready" once the video frame is drawn
  for (let i = 0; i < 50 && win.getTitle() !== 'ready'; i++) await new Promise(r => setTimeout(r, 100));
  // Export the canvas directly: a page holding a <video> loses its transparent background in captures.
  const dataUrl = await win.webContents.executeJavaScript("document.getElementById('c').toDataURL('image/png')");
  const png = Buffer.from(dataUrl.split(',')[1], 'base64');
  fs.writeFileSync(path.join(ASSETS, 'icon.png'), png);

  const iconset = path.join(ASSETS, 'icon.iconset');
  fs.mkdirSync(iconset, { recursive: true });
  for (const size of [16, 32, 128, 256, 512]) {
    for (const scale of [1, 2]) {
      const px = size * scale;
      const name = `icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`;
      execFileSync('sips', ['-z', String(px), String(px), path.join(ASSETS, 'icon.png'), '--out', path.join(iconset, name)], { stdio: 'ignore' });
    }
  }
  execFileSync('iconutil', ['-c', 'icns', iconset, '-o', path.join(ASSETS, 'icon.icns')]);
  fs.rmSync(iconset, { recursive: true, force: true });
  console.log('wrote assets/icon.png and assets/icon.icns');
  app.quit();
});
