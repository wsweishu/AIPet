#!/usr/bin/env node
// Minimal aily client for AIPet: talks to a Feishu aily agent (Workmate) through lark-cli,
// reusing lark-cli's stored identity (no secrets in this repo).
//
// Flow (aily v1 agent API, see @larksuiteoapi/node-sdk agentAgentChat):
//   POST /aily/v1/agents/:agent_id/chats  -> agent_chat_id (+ session_id for multi-turn)
//   GET  /aily/v1/agents/:agent_id/chats/:agent_chat_id  (poll until finished)
// Scopes: aily:agent_chat:write, aily:agent_chat:read
//
// Usage:
//   AILY_AGENT_ID=agent_xxx node scripts/aily-chat.mjs "明天下午我有什么会？"
//   node scripts/aily-chat.mjs --new "..."      # start a fresh session
// Env: AILY_AGENT_ID (required), AILY_AS=user|bot (default user)

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STATE_FILE = join(ROOT, '.aipet', 'aily-session.json');
const POLL_MS = 1000;
const TIMEOUT_MS = 300_000;
// Status values are not documented in the SDK types; anything else counts as still running.
const DONE = new Set(['completed', 'succeeded', 'success', 'finished', 'failed', 'error', 'cancelled', 'canceled', 'expired']);

const agentId = process.env.AILY_AGENT_ID;
const as = process.env.AILY_AS || 'user';

async function lark(method, path, { data, params } = {}) {
  const args = ['api', method, path, '--as', as];
  if (data) args.push('--data', JSON.stringify(data));
  if (params) args.push('--params', JSON.stringify(params));
  let stdout;
  try {
    ({ stdout } = await run('lark-cli', args, { maxBuffer: 16 * 1024 * 1024 }));
  } catch (err) {
    // lark-cli writes {"ok":false,"error":{...}} and exits non-zero
    let detail = err.stderr || err.stdout || err.message;
    try {
      const e = JSON.parse(err.stderr || err.stdout).error;
      detail = `${e.message}${e.hint ? `\n  hint: ${e.hint}` : ''}`;
    } catch {}
    throw new Error(`${method} ${path} failed: ${detail}`);
  }
  const out = JSON.parse(stdout);
  if (!out.ok) throw new Error(`${method} ${path} failed: ${JSON.stringify(out.error)}`);
  return out.data;
}

async function loadSessionId() {
  try {
    const s = JSON.parse(await readFile(STATE_FILE, 'utf8'));
    return s.agentId === agentId ? s.sessionId : undefined;
  } catch {
    return undefined;
  }
}

async function saveSessionId(sessionId) {
  await mkdir(dirname(STATE_FILE), { recursive: true });
  await writeFile(STATE_FILE, JSON.stringify({ agentId, sessionId }, null, 2));
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function chat(text, { fresh = false, onStatus } = {}) {
  const sessionId = fresh ? undefined : await loadSessionId();
  const c = await lark('POST', `/open-apis/aily/v1/agents/${agentId}/chats`, {
    data: {
      user_message: { content: [{ type: 'text', text }] },
      ...(sessionId ? { session_id: sessionId } : {}),
    },
  });
  if (c.session_id) await saveSessionId(c.session_id);

  const deadline = Date.now() + TIMEOUT_MS;
  let result;
  do {
    await sleep(POLL_MS);
    result = await lark('GET', `/open-apis/aily/v1/agents/${agentId}/chats/${c.agent_chat_id}`);
    onStatus?.(result.status);
  } while (!result.finish_reason && !DONE.has(String(result.status).toLowerCase()) && Date.now() < deadline);

  const reply = (result.content || []).filter(p => p.text).map(p => p.text).join('\n');
  return { sessionId: c.session_id ?? sessionId, chatId: c.agent_chat_id, status: result.status, finishReason: result.finish_reason, reply, content: result.content };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const fresh = argv[0] === '--new';
  const text = (fresh ? argv.slice(1) : argv).join(' ');
  if (!agentId || !text) {
    console.error('usage: AILY_AGENT_ID=<agent id> node scripts/aily-chat.mjs [--new] "<message>"');
    process.exit(2);
  }
  try {
    let last;
    const r = await chat(text, { fresh, onStatus: s => s !== last && console.error(`[aily] status=${(last = s)}`) });
    console.log(r.reply || JSON.stringify(r.content, null, 2));
    console.error(`[aily] session=${r.sessionId} chat=${r.chatId} status=${r.status} finish=${r.finishReason ?? '-'}`);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
