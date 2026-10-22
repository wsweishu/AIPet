// Pet settings, stored as JSON in Electron's userData directory.
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const DEFAULTS = {
  mode: 'login', // 'login' (Feishu sign-in to the Miaoda app, default) | 'key' (per-person API key)
  baseUrl: '',
  apiKey: '',
  userName: '',
  position: null, // { x, y } of the pet window
};

function file() {
  return path.join(app.getPath('userData'), 'config.json');
}

function load() {
  try {
    return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(file(), 'utf8')) };
  } catch {
    return { ...DEFAULTS };
  }
}

function save(patch) {
  const next = { ...load(), ...patch };
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(next, null, 2), { mode: 0o600 });
  return next;
}

// Reads a key file made by scripts/issue-key.mjs (MIAODA_BASE_URL / MIAODA_API_KEY / AIPET_USER_NAME).
function fromEnvFile(text) {
  const env = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  const patch = {};
  if (env.MIAODA_BASE_URL) patch.baseUrl = env.MIAODA_BASE_URL.replace(/\/+$/, '');
  if (env.MIAODA_API_KEY) patch.apiKey = env.MIAODA_API_KEY;
  if (env.AIPET_USER_NAME) patch.userName = env.AIPET_USER_NAME;
  return patch;
}

// What the settings page may see: never the key itself.
function publicView(cfg) {
  return {
    mode: cfg.mode,
    baseUrl: cfg.baseUrl,
    userName: cfg.userName,
    hasKey: Boolean(cfg.apiKey),
    keyPreview: cfg.apiKey ? `****${cfg.apiKey.slice(-4)}` : '',
  };
}

module.exports = { load, save, fromEnvFile, publicView };
