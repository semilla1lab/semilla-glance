// End-to-end run in the official Even Hub simulator, driven through its automation API.
// Starts mock Telegram + backend, launches the simulator, taps through the flows,
// saves glasses screenshots to demo/frames and asserts what reached Telegram.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { startMockTelegram } from '../server/mock-telegram.mjs';
import { createApp } from '../server/index.mjs';

const AUTO = 'http://127.0.0.1:9898';
const FRAMES = 'demo/frames';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const STEP_MS = Number(process.env.STEP_MS || 1200);
fs.rmSync(FRAMES, { recursive: true, force: true });
fs.mkdirSync(FRAMES, { recursive: true });

const tg = await startMockTelegram({ port: 8081, token: 'TEST:TOKEN' });
const { server } = createApp({
  ...process.env, TELEGRAM_BOT_TOKEN: 'TEST:TOKEN', TELEGRAM_API_BASE: tg.url,
  GLANCE_ALLOW_CHATS: '-1001,501,-1002', GLANCE_PAIR_CODE: 'DEMO42',
  DEMO_TRANSCRIPT: process.env.DEMO_TRANSCRIPT || 'um sí, nos vemos mañana a las dos, uh yo llevo el postre',
});
await new Promise((r) => server.listen(8787, '127.0.0.1', r));

const sim = spawn('node_modules/.bin/evenhub-simulator', ['--automation-port', '9898', '--no-glow', 'http://127.0.0.1:8787/?pair=DEMO42'], { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
const killSim = () => { try { process.kill(-sim.pid, 'SIGTERM'); } catch {} };
process.on('exit', killSim);
sim.stderr.on('data', (d) => process.env.DEBUG && process.stderr.write(d));

let frame = 0;
const T0 = Number(process.env.REC_T0 || Date.now());
const marks = [];
const mark = (text) => { marks.push({ t: (Date.now() - T0) / 1000, text }); console.log('mark', text); };
let consoleId = 0;
const seen = [];
let cursor = 0;
const notes = [];
async function snap(label) {
  const res = await fetch(`${AUTO}/api/screenshot/glasses`);
  const file = `${FRAMES}/${String(++frame).padStart(2, '0')}-${label}.png`;
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  notes.push({ file, label });
  console.log('frame', file);
}
async function input(action) {
  await consoleLines();
  cursor = seen.length;
  await fetch(`${AUTO}/api/input`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }) });
  await sleep(STEP_MS);
}
async function consoleLines() {
  const res = await fetch(`${AUTO}/api/console?since_id=${consoleId}`);
  const data = await res.json();
  for (const e of data.entries || []) { consoleId = Math.max(consoleId, e.id + 1); seen.push(e.message); if (!/audioPcm|intercepted/.test(e.message)) console.log('  sim>', e.message.slice(0, 200)); }
  return data.entries || [];
}
async function waitScreen(name, timeout = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    await consoleLines();
    const i = seen.findIndex((l, k) => k >= cursor && l.includes(`screen=${name} ok=true`));
    if (i >= 0) { cursor = i + 1; return; }
    await sleep(250);
  }
  throw new Error(`timeout waiting for screen ${name}`);
}

let failed = false;
try {
  for (let i = 0; i < 60; i++) { try { if ((await (await fetch(`${AUTO}/api/ping`)).text()) === 'pong') break; } catch {} await sleep(500); }
  await waitScreen('inbox', 30000); await sleep(800); mark('Your Telegram, filtered: only the chats you allow. 4 new in 3 chats.'); await snap('inbox'); await sleep(Number(process.env.INTRO_MS || 0));

  // Flow 0: 3-second digest from the context menu
  mark('Open the menu: Digest = the whole inbox in one glance.');
  await input('context_menu'); await sleep(800); await snap('menu');
  await input('click'); await waitScreen('digest'); await snap('digest');
  mark('Tap to go back to the inbox.');
  await input('click'); await waitScreen('inbox');

  // Flow 1: Launch Team -> AI draft -> confirm -> send
  mark('Tap a chat: latest messages + 3 AI-drafted replies.');
  await input('click'); await waitScreen('chat'); await snap('launch-team');
  mark('Tap a draft. Nothing is sent without one confirming tap.');
  await input('click'); await waitScreen('confirm'); await snap('confirm-draft');
  mark('Tap Send: the reply goes to Telegram as a threaded reply.');
  await input('click'); await waitScreen('sent'); await snap('sent');
  await waitScreen('inbox'); await sleep(500); await snap('inbox-after');

  // Flow 2: Marta -> speak a reply -> polished -> send
  mark('Next chat (Spanish). Drafts follow the language of the chat.');
  await input('click'); await waitScreen('chat'); await snap('marta');
  mark('Scroll to "Speak a reply" with the touchpad or R1 ring.');
  for (let i = 0; i < 3; i++) await input('down');
  await snap('marta-speak-selected');
  mark('G2 mic streams 16 kHz PCM to our backend (Whisper-compatible STT).');
  await input('click'); await waitScreen('listening'); await snap('listening');
  await sleep(2500);
  mark('The AI cleans filler words ("um", "uh") into a short reply.');
  await input('click'); await waitScreen('confirm'); await snap('confirm-voice');
  mark('Confirm with one tap. Sent.');
  await input('click'); await waitScreen('sent'); await snap('sent-voice');
  await waitScreen('inbox'); await sleep(800);
  mark('Two replies sent in under a minute. Phone stayed in the pocket.');
  await sleep(2500);

  console.log('SENT TO TELEGRAM:', JSON.stringify(tg.sent));
  if (tg.sent.length !== 2) throw new Error(`expected 2 sends, got ${tg.sent.length}`);
  if (tg.sent[0].chat_id !== '-1001' || !/Approved/.test(tg.sent[0].text)) throw new Error('flow 1 send mismatch');
  if (tg.sent[1].chat_id !== '501') throw new Error('flow 2 send mismatch');
  console.log('E2E PASS');
} catch (e) {
  failed = true;
  console.error('E2E FAIL:', e.message);
  await consoleLines().catch(() => {});
  await snap('failure').catch(() => {});
} finally {
  fs.writeFileSync(`${FRAMES}/index.json`, JSON.stringify({ notes, marks, sent: tg.sent }, null, 2));
  if (!process.env.KEEP_OPEN) { killSim(); server.close(); tg.server.close(); }
  if (!process.env.KEEP_OPEN) process.exit(failed ? 1 : 0);
}
