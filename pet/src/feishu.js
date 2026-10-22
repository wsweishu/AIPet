// The pet's hands: read-only Feishu queries through the local lark-cli, as the signed-in user.
// Only the actions below can run; the model picks one by name and supplies at most a date.
const { execFile, spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { shell } = require('electron');

const SEARCH_DIRS = ['/opt/homebrew/bin', '/usr/local/bin', path.join(process.env.HOME || '', '.local/bin')];
const TIMEOUT_MS = 20_000;
const MAX_ITEMS = 20;

const SCOPES = {
  calendar_agenda: 'calendar:calendar.event:read',
  task_list: 'task:task:read',
};

class NeedsAuthError extends Error {
  constructor(scopes) {
    super(`缺少飞书权限：${scopes.join('、')}`);
    this.scopes = scopes;
  }
}

// lark-cli is installed but this user has not created their own CLI app yet.
class NeedsConfigError extends Error {
  constructor() {
    super('lark-cli 还没有配置');
  }
}

// Apps launched from Finder get a minimal PATH, so look in the usual install locations too.
function larkCliPath() {
  const dirs = [...(process.env.PATH || '').split(':'), ...SEARCH_DIRS];
  for (const dir of dirs) {
    const p = path.join(dir, 'lark-cli');
    if (dir && fs.existsSync(p)) return p;
  }
  throw new Error('没找到 lark-cli，请先安装飞书 CLI：npm install -g @larksuite/cli，再运行 lark-cli config init --new');
}

function runLark(args) {
  return new Promise((resolve, reject) => {
    execFile(larkCliPath(), args, { timeout: TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      const text = (stdout || stderr || '').trim();
      let out;
      try {
        out = JSON.parse(text);
      } catch {
        return reject(new Error(err ? `lark-cli 出错：${(stderr || err.message).slice(0, 160)}` : 'lark-cli 返回了无法解析的内容'));
      }
      if (out.ok) return resolve(out.data);
      const e = out.error || {};
      if (e.subtype === 'missing_scope' && Array.isArray(e.missing_scopes)) return reject(new NeedsAuthError(e.missing_scopes));
      if (e.type === 'config' && e.subtype === 'not_configured') return reject(new NeedsConfigError());
      reject(new Error(e.message || 'lark-cli 调用失败'));
    });
  });
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

// lark-cli shortcut output shapes vary by version; find the first array of records.
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
  async calendar_agenda({ date }) {
    const day = /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? date : ymd(new Date());
    const tz = localOffset(new Date(`${day}T12:00:00`));
    const data = await runLark(['calendar', '+agenda', '--as', 'user', '--start', `${day}T00:00:00${tz}`, '--end', `${day}T23:59:59${tz}`]);
    return formatAgenda(data, day);
  },
  async task_list() {
    const data = await runLark(['task', '+get-my-tasks', '--as', 'user', '--complete=false']);
    return formatTasks(data);
  },
};

function isAction(name) {
  return Object.prototype.hasOwnProperty.call(ACTIONS, name);
}

async function run(action, args = {}) {
  if (!isAction(action)) throw new Error(`不支持的动作：${action}`);
  return ACTIONS[action](args);
}

// Starts lark-cli's device login for the missing scopes and opens the approval page in the browser.
// Resolves when lark-cli reports the login finished (or rejects on timeout/failure).
async function authorize(scopes) {
  const start = await new Promise((resolve, reject) => {
    execFile(larkCliPath(), ['auth', 'login', '--scope', scopes.join(' '), '--no-wait', '--json'], { timeout: TIMEOUT_MS }, (err, stdout) => {
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error(`无法发起飞书授权：${err?.message || stdout}`));
      }
    });
  });
  if (!start.verification_url || !start.device_code) throw new Error('lark-cli 没有返回授权链接');
  await shell.openExternal(start.verification_url);
  return new Promise((resolve, reject) => {
    const child = spawn(larkCliPath(), ['auth', 'login', '--device-code', start.device_code], { stdio: 'ignore' });
    child.on('exit', code => (code === 0 ? resolve() : reject(new Error('飞书授权没有完成'))));
    child.on('error', reject);
  });
}

// First-time setup: `lark-cli config init --new` creates the user's own CLI app in the browser.
// It blocks until the user finishes; the verification URL is taken from its output and opened.
function configure() {
  return new Promise((resolve, reject) => {
    const child = spawn(larkCliPath(), ['config', 'init', '--new'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let opened = false;
    const watch = chunk => {
      const url = String(chunk).match(/https:\/\/\S+/)?.[0];
      if (url && !opened) {
        opened = true;
        shell.openExternal(url.replace(/[)"'，。]+$/, ''));
      }
    };
    child.stdout.on('data', watch);
    child.stderr.on('data', watch);
    child.on('error', reject);
    child.on('exit', code => (code === 0 ? resolve() : reject(new Error('没有完成 lark-cli 配置'))));
  });
}

module.exports = {
  run, isAction, authorize, configure, NeedsAuthError, NeedsConfigError, SCOPES, formatAgenda, formatTasks,
};
