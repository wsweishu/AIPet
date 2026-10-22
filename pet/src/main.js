const { app, BrowserWindow, ipcMain, Menu, Tray, screen, dialog, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const config = require('./config');
const brain = require('./brain');
const feishu = require('./feishu');

const PET_W = 300;
const PET_H = 500;
const SELFTEST = process.env.AIPET_SELFTEST === '1';

let petWin = null;
let settingsWin = null;
let tray = null; // Windows only: the pet skips the taskbar, so the tray is how people find and quit it
const inflight = new Map(); // chat id -> AbortController

// Defaults shipped next to the app (e.g. which Miaoda app to talk to); user settings override them.
function defaults() {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'pet.defaults.json'), 'utf8'));
  } catch {
    return {};
  }
}

function currentConfig() {
  const cfg = config.load();
  const d = defaults();
  return { ...cfg, baseUrl: cfg.baseUrl || d.baseUrl || '' };
}

function createPet() {
  const { workArea } = screen.getPrimaryDisplay();
  const saved = config.load().position;
  petWin = new BrowserWindow({
    width: PET_W,
    height: PET_H,
    x: saved?.x ?? workArea.x + workArea.width - PET_W - 24,
    y: saved?.y ?? workArea.y + workArea.height - PET_H - 8,
    transparent: true,
    frame: false,
    resizable: false,
    hasShadow: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    fullscreenable: false,
    show: false, // shown inactive below, so launching never steals keyboard focus from the user's app
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
    },
  });
  petWin.setAlwaysOnTop(true, 'floating');
  petWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // Transparent pixels pass clicks through; the renderer turns this off while the pointer is over the fish or UI.
  petWin.setIgnoreMouseEvents(true, { forward: true });
  petWin.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  petWin.once('ready-to-show', () => petWin.showInactive());
  petWin.on('moved', () => {
    const [x, y] = petWin.getPosition();
    config.save({ position: { x, y } });
  });
  petWin.on('closed', () => {
    petWin = null;
  });
}

function openSettings() {
  if (settingsWin) return settingsWin.focus();
  settingsWin = new BrowserWindow({
    width: 440,
    height: 560,
    title: 'AIPet 肥鱼 · 设置',
    resizable: false,
    minimizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
    },
  });
  settingsWin.setMenuBarVisibility(false);
  settingsWin.loadFile(path.join(__dirname, '..', 'renderer', 'settings.html'));
  settingsWin.on('closed', () => {
    settingsWin = null;
  });
}

function notifyPet(channel, payload) {
  if (petWin && !petWin.isDestroyed()) petWin.webContents.send(channel, payload);
}

async function doLogin() {
  const cfg = currentConfig();
  if (!cfg.baseUrl) {
    openSettings();
    return null;
  }
  const user = await brain.login(cfg, settingsWin ?? undefined);
  if (user) {
    config.save({ mode: 'login', userName: user.userName });
    notifyPet('pet:status', { text: `你好呀${user.userName}，登录好啦～`, mood: 'happy' });
  }
  return user;
}

// ---- IPC: pet window ----

ipcMain.on('pet:interactive', (_e, on) => {
  if (petWin) petWin.setIgnoreMouseEvents(!on, { forward: true });
});

ipcMain.on('pet:drag', (_e, { dx, dy }) => {
  if (!petWin) return;
  const [x, y] = petWin.getPosition();
  petWin.setPosition(Math.round(x + dx), Math.round(y + dy));
});

function menuTemplate() {
  const cfg = currentConfig();
  return [
    { label: cfg.mode === 'login' ? `飞书登录：${cfg.userName || '未登录'}` : `API Key：${cfg.userName || '未命名'}`, enabled: false },
    { type: 'separator' },
    { label: '设置…', click: openSettings },
    { label: '飞书登录…', click: doLogin },
    { label: '清空记忆', click: () => notifyPet('pet:clear') },
    { type: 'separator' },
    { label: '退出肥鱼', click: () => app.quit() },
  ];
}

ipcMain.on('pet:menu', () => {
  Menu.buildFromTemplate(menuTemplate()).popup({ window: petWin });
});

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'icon.png')).resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip('AIPet 肥鱼');
  tray.on('click', () => petWin?.showInactive());
  // rebuilt on each open so the login line stays current
  tray.on('right-click', () => tray.popUpContextMenu(Menu.buildFromTemplate(menuTemplate())));
}

let authorizing = null; // pending lark-cli browser flow, so repeated questions don't open many tabs

function startBrowserFlow(run, doneText) {
  if (authorizing) return;
  authorizing = run()
    .then(() => notifyPet('pet:status', { text: doneText, mood: 'happy' }))
    .catch(err => notifyPet('pet:status', { text: `没完成：${err.message}`, mood: 'error' }))
    .finally(() => { authorizing = null; });
}
const startAuthorize = scopes => startBrowserFlow(() => feishu.authorize(scopes), '飞书授权好啦！再问我一次吧～');
const startConfigure = () => startBrowserFlow(() => feishu.configure(), 'lark-cli 配置好啦！再问我一次，我会接着申请查看权限～');

// One turn: Doubao picks a read-only Feishu action (if any) → lark-cli runs it here →
// Doubao answers grounded on the result, streamed back to the pet.
ipcMain.handle('chat:send', async (e, { id, message, history }) => {
  const ctrl = new AbortController();
  inflight.set(id, ctrl);
  const send = (ch, p) => !e.sender.isDestroyed() && e.sender.send(ch, { id, ...p });
  const cfg = currentConfig();
  try {
    let toolResult;
    let step = { action: 'none', date: '' };
    try {
      step = await brain.plan(cfg, message, history, ctrl.signal);
    } catch (err) {
      if (ctrl.signal.aborted) throw err;
      console.warn('[pet] plan failed, answering without tools:', err.message);
    }
    if (feishu.isAction(step.action)) {
      send('chat:tool', { action: step.action, date: step.date });
      try {
        toolResult = await feishu.run(step.action, { date: step.date });
      } catch (err) {
        if (err instanceof feishu.NeedsAuthError) {
          startAuthorize(err.scopes);
          send('chat:error', { message: '肥鱼还没有查看你飞书的权限，我打开了授权页，点「同意」后再问我一次～', auth: true });
          return;
        }
        if (err instanceof feishu.NeedsConfigError) {
          startConfigure();
          send('chat:error', { message: '你的 lark-cli 还没配置，我打开了创建 CLI 应用的页面，按提示完成后再问我一次～', auth: true });
          return;
        }
        toolResult = `查询失败：${err.message}`;
      }
    }
    for await (const text of brain.chat(cfg, message, history, ctrl.signal, toolResult)) send('chat:chunk', { text });
    send('chat:done', { action: step.action, toolResult });
  } catch (err) {
    send('chat:error', { message: ctrl.signal.aborted ? '已取消' : err.message });
  } finally {
    inflight.delete(id);
  }
});

ipcMain.on('chat:cancel', (_e, id) => inflight.get(id)?.abort());

// ---- IPC: settings window ----

ipcMain.handle('settings:get', () => config.publicView(currentConfig()));

ipcMain.handle('settings:save', (_e, patch) => {
  const allowed = {};
  if (patch.mode === 'key' || patch.mode === 'login') allowed.mode = patch.mode;
  if (typeof patch.baseUrl === 'string') allowed.baseUrl = patch.baseUrl.trim().replace(/\/+$/, '');
  if (typeof patch.userName === 'string') allowed.userName = patch.userName.trim().slice(0, 40);
  if (typeof patch.apiKey === 'string' && patch.apiKey.trim()) allowed.apiKey = patch.apiKey.trim();
  config.save(allowed);
  notifyPet('pet:status', { text: '设置保存好啦，咕噜～', mood: 'happy' });
  return config.publicView(currentConfig());
});

ipcMain.handle('settings:importKeyFile', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(settingsWin, {
    title: '选择 issue-key.mjs 生成的 Key 文件',
    properties: ['openFile', 'showHiddenFiles'],
    filters: [{ name: 'Key 文件', extensions: ['env', 'txt'] }],
  });
  if (canceled || !filePaths[0]) return null;
  const patch = config.fromEnvFile(fs.readFileSync(filePaths[0], 'utf8'));
  if (!patch.apiKey) throw new Error('这个文件里没有 MIAODA_API_KEY');
  config.save({ ...patch, mode: 'key' });
  return config.publicView(currentConfig());
});

ipcMain.handle('settings:login', async () => {
  const user = await doLogin();
  return { user, view: config.publicView(currentConfig()) };
});

ipcMain.handle('settings:logout', async () => {
  await brain.logout();
  config.save({ mode: 'key' });
  return config.publicView(currentConfig());
});

// ---- self test: AIPET_SELFTEST=1 [AIPET_CONFIG_FILE=key.env] [AIPET_SELFTEST_SHOT=out.png] ----

async function selftest() {
  if (process.env.AIPET_CONFIG_FILE) {
    config.save({ ...config.fromEnvFile(fs.readFileSync(process.env.AIPET_CONFIG_FILE, 'utf8')), mode: 'key' });
  }
  await new Promise(r => petWin.webContents.once('did-finish-load', r));
  petWin.webContents.send('pet:selftest', { message: process.env.AIPET_SELFTEST_MESSAGE || '你好呀肥鱼，介绍一下你自己' });
  ipcMain.once('selftest:done', async (_e, result) => {
    console.log('[selftest]', JSON.stringify(result));
    const shot = process.env.AIPET_SELFTEST_SHOT;
    if (shot) {
      const img = await petWin.webContents.capturePage();
      fs.writeFileSync(shot, img.toPNG());
      console.log('[selftest] screenshot', shot);
    }
    app.quit();
  });
}

// must run before 'ready' so caches and cookies land in the test profile too
if (SELFTEST && process.env.AIPET_USER_DATA) app.setPath('userData', process.env.AIPET_USER_DATA);

// a second launch (double-clicking the exe again) just brings the existing pet forward
if (!SELFTEST && !app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => petWin?.showInactive());

app.whenReady().then(() => {
  if (process.platform === 'darwin' && app.dock) {
    const icon = path.join(__dirname, '..', 'assets', 'icon.png');
    if (fs.existsSync(icon)) app.dock.setIcon(nativeImage.createFromPath(icon));
  }
  createPet();
  if (process.platform === 'win32') createTray();
  if (SELFTEST) selftest();
  else firstRunCheck();
});

// Opens settings until the pet can reach its brain: an address plus a Feishu login (or an API key).
async function firstRunCheck() {
  const cfg = currentConfig();
  if (!cfg.baseUrl || (cfg.mode === 'key' && !config.load().apiKey)) return openSettings();
  if (cfg.mode === 'login') {
    const user = await brain.whoami(cfg).catch(() => null);
    if (user?.userName) {
      if (user.userName !== cfg.userName) config.save({ userName: user.userName });
      notifyPet('pet:status', { text: `${user.userName}，本鲸上班啦～`, mood: 'happy' });
    } else {
      openSettings();
      notifyPet('pet:status', { text: '先在设置里用飞书登录一下吧～', mood: 'listening' });
    }
  }
}

app.on('window-all-closed', () => app.quit());
