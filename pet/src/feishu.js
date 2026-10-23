// The pet's hands: read-only Feishu queries through Feishu's OpenAPI, as the signed-in user.
// Only the actions below can run; the model picks one by name and supplies at most a date.
// The user authorizes once in a Feishu consent window; the bridge (which holds the Feishu app
// secret) swaps the code for the user's own token, kept here encrypted with the OS keychain.
const { app, BrowserWindow, safeStorage } = require('electron');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const brain = require('./brain');

const API = 'https://open.feishu.cn/open-apis';
const TIMEOUT_MS = 20_000;
const MAX_ITEMS = 20;
const EARLY_REFRESH_MS = 5 * 60_000;
const AUTH_TIMEOUT_MS = 5 * 60_000;

// Feishu error codes that mean the token is gone or lacks a scope the user must grant
const TOKEN_INVALID = new Set([99991668, 99991677, 20005]);
const SCOPE_MISSING = new Set([99991679, 99991672]);

class NeedsAuthError extends Error {
  constructor() {
    super('还没有授权肥鱼查看你的飞书');
  }
}

// ---------- the user's token, encrypted at rest when the OS offers a keychain ----------

function tokenFile() {
  return path.join(app.getPath('userData'), 'feishu-token.bin');
}

function loadToken() {
  try {
    const raw = fs.readFileSync(tokenFile());
    const text = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(raw) : raw.toString('utf8');
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function saveToken(t) {
  const now = Date.now();
  const token = {
    accessToken: t.accessToken,
    expiresAt: now + t.expiresIn * 1000,
    refreshToken: t.refreshToken,
    refreshExpiresAt: t.refreshToken ? now + t.refreshExpiresIn * 1000 : 0,
    scope: t.scope,
  };
  const text = JSON.stringify(token);
  const data = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(text) : text;
  fs.mkdirSync(path.dirname(tokenFile()), { recursive: true });
  fs.writeFileSync(tokenFile(), data, { mode: 0o600 });
  return token;
}

function clearToken() {
  fs.rmSync(tokenFile(), { force: true });
  primaryCalendarId = null;
}

function isAuthorized() {
  const t = loadToken();
  return Boolean(t && (t.expiresAt > Date.now() || t.refreshExpiresAt > Date.now()));
}

let refreshing = null; // a refresh token works once, so concurrent callers share one refresh

async function accessToken(cfg, { forceRefresh = false } = {}) {
  const t = loadToken();
  if (!t) throw new NeedsAuthError();
  if (!forceRefresh && t.expiresAt - EARLY_REFRESH_MS > Date.now()) return t.accessToken;
  if (!t.refreshToken || t.refreshExpiresAt <= Date.now()) throw new NeedsAuthError();
  refreshing ??= brain.feishuRefresh(cfg, t.refreshToken)
    .then(saveToken)
    .finally(() => { refreshing = null; });
  return (await refreshing).accessToken;
}

// ---------- OpenAPI ----------

async function api(cfg, method, apiPath, query, retried = false) {
  const url = new URL(`${API}${apiPath}`);
  for (const [k, v] of Object.entries(query || {})) url.searchParams.set(k, String(v));
  const token = await accessToken(cfg, { forceRefresh: retried });
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=utf-8' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = await res.json().catch(() => null);
  if (body?.code === 0) return body.data ?? {};
  const code = body?.code;
  if (TOKEN_INVALID.has(code) && !retried) return api(cfg, method, apiPath, query, true);
  if (TOKEN_INVALID.has(code) || SCOPE_MISSING.has(code)) throw new NeedsAuthError();
  throw new Error(`飞书接口出错：${body?.msg || `HTTP ${res.status}`}${code ? `（${code}）` : ''}`);
}

let primaryCalendarId = null;

async function primaryCalendar(cfg) {
  if (primaryCalendarId) return primaryCalendarId;
  const data = await api(cfg, 'POST', '/calendar/v4/calendars/primary');
  primaryCalendarId = data.calendars?.[0]?.calendar?.calendar_id;
  if (!primaryCalendarId) throw new Error('没找到你的飞书主日历');
  return primaryCalendarId;
}

// ---------- formatting: keep only what the model needs to answer ----------

function localOffset(d) {
  const m = -d.getTimezoneOffset();
  const sign = m >= 0 ? '+' : '-';
  const abs = Math.abs(m);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

function toDate(v) {
  if (v == null) return null;
  if (typeof v === 'object') return toDate(v.datetime ?? v.date_time ?? v.timestamp ?? v.date);
  if (typeof v === 'number' || /^\d{9,13}$/.test(String(v))) {
    const n = Number(v);
    return new Date(n < 1e12 ? n * 1000 : n);
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

const hhmm = d => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Find the first array of records in an OpenAPI `data` object.
function findItems(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    for (const key of ['items', 'events', 'tasks', 'data']) if (Array.isArray(data[key])) return data[key];
    for (const v of Object.values(data)) {
      const found = findItems(v);
      if (found.length) return found;
    }
  }
  return [];
}

// Locations are often a meeting link; the model only needs to know it is online.
function placeOf(location) {
  const name = (location?.name ?? (typeof location === 'string' ? location : '')).trim();
  if (!name) return '';
  return /^https?:\/\//i.test(name) ? '线上会议' : name.slice(0, 30);
}

const RSVP = { accept: '', needs_action: '，未回复邀请', tentative: '，待定' };

function formatAgenda(data, date) {
  const events = findItems(data)
    .filter(e => e && (e.status ?? '') !== 'cancelled' && e.self_rsvp_status !== 'decline')
    .map(e => {
      const start = toDate(e.start_time ?? e.start);
      const end = toDate(e.end_time ?? e.end);
      const allDay = Boolean(e.start_time?.date && !e.start_time?.timestamp && !e.start_time?.datetime);
      const time = allDay || !start ? '全天' : `${hhmm(start)}${end ? `-${hhmm(end)}` : ''}`;
      const notes = [placeOf(e.location)].filter(Boolean).join('');
      const rsvp = RSVP[e.self_rsvp_status] ?? '';
      const extra = notes || rsvp ? `（${notes}${notes ? rsvp : rsvp.slice(1)}）` : '';
      return { sort: start?.getTime() ?? 0, line: `- ${time} ${e.summary || e.title || '（无标题）'}${extra}` };
    })
    .sort((a, b) => a.sort - b.sort);
  if (!events.length) return `${date} 的日程：没有安排。`;
  const shown = events.slice(0, MAX_ITEMS).map(e => e.line);
  const more = events.length > MAX_ITEMS ? `\n（另有 ${events.length - MAX_ITEMS} 项未列出）` : '';
  return `${date} 的日程（共 ${events.length} 项）：\n${shown.join('\n')}${more}`;
}

function formatTasks(data) {
  const tasks = findItems(data)
    .filter(t => t && t.completed !== true)
    .map(t => {
      const due = toDate(t.due_at ?? t.due?.timestamp ?? t.due);
      return { sort: due?.getTime() ?? Infinity, line: `- ${t.summary || t.title || '（无标题）'}${due ? `（截止 ${ymd(due)} ${hhmm(due)}）` : ''}` };
    })
    .sort((a, b) => a.sort - b.sort);
  if (!tasks.length) return '未完成的待办：没有。';
  const shown = tasks.slice(0, MAX_ITEMS).map(t => t.line);
  const more = tasks.length > MAX_ITEMS ? `\n（另有 ${tasks.length - MAX_ITEMS} 项未列出）` : '';
  return `未完成的待办（共 ${tasks.length} 项）：\n${shown.join('\n')}${more}`;
}

// ---------- the allowlist ----------

const ACTIONS = {
  async calendar_agenda(cfg, { date }) {
    const day = /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? date : ymd(new Date());
    const start = new Date(`${day}T00:00:00`);
    const end = new Date(`${day}T23:59:59`);
    const id = await primaryCalendar(cfg);
    // instance_view expands recurring events into the day's occurrences
    const data = await api(cfg, 'GET', `/calendar/v4/calendars/${encodeURIComponent(id)}/events/instance_view`, {
      start_time: Math.floor(start.getTime() / 1000),
      end_time: Math.floor(end.getTime() / 1000),
    });
    return formatAgenda(data, day);
  },
  async task_list(cfg) {
    const data = await api(cfg, 'GET', '/task/v2/tasks', { type: 'my_tasks', completed: false, page_size: 100 });
    return formatTasks(data);
  },
};

function isAction(name) {
  return Object.prototype.hasOwnProperty.call(ACTIONS, name);
}

async function run(cfg, action, args = {}) {
  if (!isAction(action)) throw new Error(`不支持的动作：${action}`);
  return ACTIONS[action](cfg, args);
}

// Opens Feishu's consent page in a window that shares the Miaoda login (so Feishu SSO is already
// done), catches the redirect back to the bridge, and swaps the code for the user's token.
// Resolves true once authorized, false if the user closes the window or declines.
async function authorize(cfg, parent) {
  const state = crypto.randomBytes(24).toString('base64url');
  const { url, redirectUri } = await brain.feishuAuthorizeUrl(cfg, state);
  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      width: 520,
      height: 720,
      parent,
      title: '飞书授权 · AIPet 肥鱼',
      webPreferences: { partition: brain.PARTITION, contextIsolation: true, sandbox: true },
    });
    win.setMenuBarVisibility(false);
    let done = false;
    let caught = false; // will-redirect and did-navigate can both see the same redirect
    const finish = (err, ok) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (!win.isDestroyed()) win.close();
      if (err) reject(err);
      else resolve(ok);
    };
    const timer = setTimeout(() => finish(new Error('飞书授权超时了')), AUTH_TIMEOUT_MS);
    const catchRedirect = (event, target) => {
      if (caught || !target.startsWith(redirectUri)) return;
      caught = true;
      event.preventDefault();
      const params = new URL(target).searchParams;
      if (params.get('state') !== state) return finish(new Error('飞书授权的校验信息不匹配，请重试'));
      const code = params.get('code');
      if (!code) return finish(null, false); // e.g. error=access_denied
      brain.feishuToken(cfg, code).then(t => {
        saveToken(t);
        primaryCalendarId = null;
        finish(null, true);
      }, err => finish(err));
    };
    win.webContents.on('will-redirect', (e, target) => catchRedirect(e, target));
    win.webContents.on('will-navigate', (e, target) => catchRedirect(e, target));
    win.webContents.on('did-navigate', (e, target) => catchRedirect(e, target));
    win.on('closed', () => finish(null, false));
    win.loadURL(url);
  });
}

module.exports = {
  run, isAction, authorize, isAuthorized, clearToken, NeedsAuthError, formatAgenda, formatTasks,
};
