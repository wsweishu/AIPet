// The pet's brain: the "AIPet 豆包桥" Miaoda app, which answers with Miaoda's built-in Doubao.
// Two ways in:
//   key   — POST {base}/openapi/pet/chat with a per-person API key (managed in Miaoda's console)
//   login — POST {base}/api/pet/chat with the user's Feishu login session (cookies + CSRF header)
const { session, BrowserWindow } = require('electron');

const PARTITION = 'persist:miaoda';
const CSRF_COOKIE = 'suda-csrf-token';

function miaodaSession() {
  return session.fromPartition(PARTITION);
}

async function csrfHeader(baseUrl) {
  const cookies = await miaodaSession().cookies.get({ url: baseUrl, name: CSRF_COOKIE });
  return cookies[0] ? { 'X-Suda-Csrf-Token': cookies[0].value } : {};
}

// Splits an SSE byte stream into { type, data } events.
async function* sseEvents(body) {
  const decoder = new TextDecoder();
  let buf = '';
  for await (const bytes of body) {
    buf += decoder.decode(bytes, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const raw = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const type = raw.match(/^event: (.+)$/m)?.[1] ?? 'message';
      const data = raw.match(/^data: (.*)$/m)?.[1];
      if (data) yield { type, data: JSON.parse(data) };
    }
  }
}

async function request(cfg, path, init) {
  if (cfg.mode === 'login') {
    const headers = { ...init.headers, ...(await csrfHeader(cfg.baseUrl)) };
    return miaodaSession().fetch(`${cfg.baseUrl}/api/pet/${path}`, { ...init, headers, credentials: 'include' });
  }
  if (!cfg.apiKey) throw new Error('还没配置 API Key，右键肥鱼 → 设置');
  // the Miaoda gateway wants Bearer; X-Api-Key is rejected with 403
  const headers = { ...init.headers, Authorization: `Bearer ${cfg.apiKey}` };
  return fetch(`${cfg.baseUrl}/openapi/pet/${path}`, { ...init, headers });
}

async function checkResponse(cfg, res) {
  if (res.status === 401 || res.status === 403) {
    throw new Error(cfg.mode === 'login' ? '飞书登录已失效，右键肥鱼 → 飞书登录' : 'API Key 无效、已停用或没有这个接口的权限');
  }
  if (!res.ok) throw new Error(`妙搭返回 ${res.status}：${(await res.text()).slice(0, 120)}`);
}

function localToday() {
  const d = new Date();
  const week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return `${ymd} 星期${week}`;
}

// Asks Doubao which read-only Feishu action (if any) this message needs: { action, date }.
async function plan(cfg, message, history, signal) {
  if (!cfg.baseUrl) throw new Error('还没配置妙搭地址，右键肥鱼 → 设置');
  const res = await request(cfg, 'plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history, today: localToday() }),
    signal,
  });
  await checkResponse(cfg, res);
  return res.json();
}

// Streams the reply; yields text chunks. history: [{ role: 'user'|'pet', content }]
async function* chat(cfg, message, history, signal, toolResult) {
  if (!cfg.baseUrl) throw new Error('还没配置妙搭地址，右键肥鱼 → 设置');
  const res = await request(cfg, 'chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ message, history, stream: true, userName: cfg.userName || undefined, toolResult }),
    signal,
  });
  await checkResponse(cfg, res);
  for await (const ev of sseEvents(res.body)) {
    if (ev.type === 'error') throw new Error(ev.data.message || '生成失败');
    if (ev.type === 'message' && ev.data.content) yield ev.data.content;
  }
}

// Login mode only: who is signed in, or null.
async function whoami(cfg) {
  if (!cfg.baseUrl) return null;
  const res = await request({ ...cfg, mode: 'login' }, 'me', { method: 'GET', headers: {} });
  if (!res.ok) return null;
  return res.json();
}

// Opens the Miaoda app in a window that shares the pet's session, so Feishu SSO sets the cookies.
// Resolves with the signed-in user once /api/pet/me succeeds, or null if the window is closed first.
function login(cfg, parent) {
  return new Promise(resolve => {
    const win = new BrowserWindow({
      width: 480,
      height: 680,
      parent,
      title: '飞书登录 · AIPet 肥鱼',
      webPreferences: { partition: PARTITION, contextIsolation: true, sandbox: true },
    });
    let done = false;
    const finish = user => {
      if (done) return;
      done = true;
      clearInterval(timer);
      if (!win.isDestroyed()) win.close();
      resolve(user);
    };
    const timer = setInterval(async () => {
      const user = await whoami(cfg).catch(() => null);
      if (user?.userId) finish(user);
    }, 1500);
    win.on('closed', () => finish(null));
    win.loadURL(cfg.baseUrl);
  });
}

async function logout() {
  await miaodaSession().clearStorageData();
}

// ---- Feishu OAuth via the bridge, which holds the Feishu app secret (login mode only) ----

async function feishuCall(cfg, path, init) {
  if (!cfg.baseUrl) throw new Error('还没配置妙搭地址，右键肥鱼 → 设置');
  if (cfg.mode !== 'login') throw new Error('飞书授权需要先用「飞书登录」模式登录肥鱼，右键肥鱼 → 设置');
  const res = await request(cfg, `feishu/${path}`, init);
  if (res.status === 400) throw new Error((await res.json().catch(() => ({}))).message || '飞书授权失败');
  await checkResponse(cfg, res);
  return res.json();
}

const postJson = body => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

// { url, redirectUri }
function feishuAuthorizeUrl(cfg, state) {
  return feishuCall(cfg, `authorize-url?state=${encodeURIComponent(state)}`, { method: 'GET', headers: {} });
}

// { accessToken, expiresIn, refreshToken, refreshExpiresIn, scope }
function feishuToken(cfg, code) {
  return feishuCall(cfg, 'token', postJson({ code }));
}

function feishuRefresh(cfg, refreshToken) {
  return feishuCall(cfg, 'refresh', postJson({ refreshToken }));
}

module.exports = {
  plan, chat, whoami, login, logout, feishuAuthorizeUrl, feishuToken, feishuRefresh, PARTITION,
};
