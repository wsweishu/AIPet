#!/usr/bin/env node
// AIPet brain via a Feishu Miaoda (Spark) app: POST /openapi/pet/chat on the
// "AIPet 豆包桥测试" app, whose backend calls Miaoda's built-in Doubao (ai-text-generate).
// Streams the reply over SSE and prints it as it arrives.
//
// Config: .aipet/miaoda.env (MIAODA_BASE_URL, MIAODA_API_KEY), or the same names in env.
// Usage:  node scripts/miaoda-chat.mjs "你好"
//         node scripts/miaoda-chat.mjs --no-stream "你好"

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

async function loadConfig() {
  const cfg = { MIAODA_BASE_URL: process.env.MIAODA_BASE_URL, MIAODA_API_KEY: process.env.MIAODA_API_KEY };
  try {
    for (const line of (await readFile(join(ROOT, '.aipet', 'miaoda.env'), 'utf8')).split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m && !cfg[m[1]]) cfg[m[1]] = m[2];
    }
  } catch {}
  if (!cfg.MIAODA_BASE_URL || !cfg.MIAODA_API_KEY) throw new Error('missing MIAODA_BASE_URL / MIAODA_API_KEY');
  return cfg;
}

// Yields reply text chunks as they arrive (one chunk when stream is false).
export async function* chat(message, { stream = true } = {}) {
  const { MIAODA_BASE_URL, MIAODA_API_KEY } = await loadConfig();
  const res = await fetch(`${MIAODA_BASE_URL}/openapi/pet/chat`, {
    method: 'POST',
    // the Miaoda gateway wants Bearer; X-Api-Key is rejected with 403
    headers: { Authorization: `Bearer ${MIAODA_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, stream }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  if (!stream) {
    yield (await res.json()).reply;
    return;
  }

  const decoder = new TextDecoder();
  let buf = '';
  for await (const bytes of res.body) {
    buf += decoder.decode(bytes, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const event = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const type = event.match(/^event: (.+)$/m)?.[1] ?? 'message';
      const data = event.match(/^data: (.*)$/m)?.[1];
      if (!data) continue;
      const payload = JSON.parse(data);
      if (type === 'error') throw new Error(payload.message);
      if (type === 'message' && payload.content) yield payload.content;
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const stream = argv[0] !== '--no-stream';
  const text = (stream ? argv : argv.slice(1)).join(' ');
  if (!text) {
    console.error('usage: node scripts/miaoda-chat.mjs [--no-stream] "<message>"');
    process.exit(2);
  }
  const t0 = Date.now();
  try {
    for await (const part of chat(text, { stream })) process.stdout.write(part);
    process.stdout.write('\n');
    console.error(`[miaoda] ${Date.now() - t0} ms`);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
