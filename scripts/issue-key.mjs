#!/usr/bin/env node
// Issue one Miaoda API key per pet user. Each key shows up by name in the Miaoda console
// (app → 开放 API), where it can be disabled or reset on its own.
//
// Usage:  node scripts/issue-key.mjs <person name>          # create, save to .aipet/keys/<name>.env
//         node scripts/issue-key.mjs --list                 # list keys (masked) for the app
// The raw key is shown by Miaoda only once; this script writes it to a 0600 file and never prints it.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROUTES = ['POST /openapi/pet/chat', 'POST /openapi/pet/plan'];

async function appConfig() {
  const cfg = {};
  for (const line of (await readFile(join(ROOT, '.aipet', 'miaoda.env'), 'utf8')).split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) cfg[m[1]] = m[2];
  }
  return cfg;
}

async function lark(args) {
  const { stdout } = await run('lark-cli', ['apps', ...args, '--as', 'user'], { maxBuffer: 4 * 1024 * 1024 });
  const out = JSON.parse(stdout);
  if (!out.ok) throw new Error(JSON.stringify(out.error));
  return out.data;
}

const arg = process.argv.slice(2).join(' ').trim();
const { MIAODA_APP_ID, MIAODA_BASE_URL } = await appConfig();

if (!arg || arg === '--list') {
  const data = await lark(['+openapi-key-list', '--app-id', MIAODA_APP_ID]);
  const items = data.infos ?? [];
  for (const k of items) console.log(`${k.status === 1 ? 'on ' : 'off'}  ${k.key_preview}  ${k.name}  (id ${k.api_key_id})`);
  if (!items.length) console.log(JSON.stringify(data, null, 2));
} else {
  const safe = arg.replace(/[^\p{L}\p{N}_-]+/gu, '_');
  const data = await lark([
    '+openapi-key-create', '--app-id', MIAODA_APP_ID, '--name', `AIPet - ${arg}`,
    ...ROUTES.flatMap(r => ['--scope-api', r]),
  ]);
  const file = join(ROOT, '.aipet', 'keys', `${safe}.env`);
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  await writeFile(
    file,
    `# AIPet pet config for ${arg}\nMIAODA_BASE_URL=${MIAODA_BASE_URL}\nMIAODA_API_KEY=${data.api_key}\nAIPET_USER_NAME=${arg}\n`,
    { mode: 0o600 },
  );
  console.log(`created key "AIPet - ${arg}" (id ${data.api_key_id}, ${data.info?.key_preview ?? ''})`);
  console.log(`saved to ${file} — hand this file to ${arg}; it is the only copy of the key`);
}
