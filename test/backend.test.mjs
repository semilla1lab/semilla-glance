import test from 'node:test';
import assert from 'node:assert/strict';
import { startMockTelegram } from '../server/mock-telegram.mjs';
import { createApp } from '../server/index.mjs';
import { pcmToWav, rms } from '../server/stt.mjs';
import { offlineDrafts } from '../server/ai.mjs';

async function stack(extra = {}) {
  const port = 18000 + Math.floor(Math.random() * 1000);
  const tg = await startMockTelegram({ port, token: 'T:1' });
  const app = createApp({ TELEGRAM_BOT_TOKEN: 'T:1', TELEGRAM_API_BASE: tg.url, GLANCE_ALLOW_CHATS: '-1001,501', GLANCE_PAIR_CODE: 'ABC123', DEMO_TRANSCRIPT: 'um yes I am in', ...extra });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const call = async (path, opts = {}) => {
    const res = await fetch(base + path, { ...opts, headers: { 'x-glance-pair': 'ABC123', 'content-type': 'application/json', ...(opts.headers || {}) } });
    return { status: res.status, body: await res.json() };
  };
  const close = () => { app.server.close(); tg.server.close(); };
  return { tg, call, base, close };
}

test('rejects calls without the pair code', async () => {
  const s = await stack();
  const res = await fetch(`${s.base}/api/inbox`);
  assert.equal(res.status, 401);
  s.close();
});

test('inbox only shows allow-listed chats, newest unread', async () => {
  const s = await stack();
  const { body } = await s.call('/api/inbox');
  const titles = body.chats.map((c) => c.title);
  assert.deepEqual(titles.sort(), ['Launch Team', 'Marta']);
  assert.equal(body.chats.find((c) => c.title === 'Launch Team').unread, 2);
  s.close();
});

test('chat view returns 3 short drafts', async () => {
  const s = await stack();
  await s.call('/api/inbox');
  const { body } = await s.call('/api/chat/-1001');
  assert.equal(body.drafts.length, 3);
  for (const d of body.drafts) assert.ok(d.length <= 60, d);
  assert.match(body.drafts[0], /Approved/);
  s.close();
});

test('nothing is sent without prepare + confirm, and confirm is single-use', async () => {
  const s = await stack();
  await s.call('/api/inbox');
  const prep = await s.call('/api/prepare', { method: 'POST', body: JSON.stringify({ chatId: '-1001', text: 'Approved.' }) });
  assert.equal(s.tg.sent.length, 0);
  const ok = await s.call('/api/confirm', { method: 'POST', body: JSON.stringify({ token: prep.body.token }) });
  assert.equal(ok.status, 200);
  assert.equal(s.tg.sent.length, 1);
  assert.equal(s.tg.sent[0].text, 'Approved.');
  assert.equal(s.tg.sent[0].reply_parameters.message_id, 1002);
  const again = await s.call('/api/confirm', { method: 'POST', body: JSON.stringify({ token: prep.body.token }) });
  assert.equal(again.status, 410);
  assert.equal(s.tg.sent.length, 1);
  s.close();
});

test('cannot send to a chat outside the allow-list', async () => {
  const s = await stack();
  await s.call('/api/inbox');
  const prep = await s.call('/api/prepare', { method: 'POST', body: JSON.stringify({ chatId: '-1003', text: 'hi' }) });
  assert.equal(prep.status, 400);
  s.close();
});

test('voice note: silent PCM falls back to demo transcript and is polished', async () => {
  const s = await stack();
  await s.call('/api/inbox');
  const res = await fetch(`${s.base}/api/voice?chat=-1001`, { method: 'POST', headers: { 'x-glance-pair': 'ABC123' }, body: new Uint8Array(3200) });
  const body = await res.json();
  assert.equal(body.source, 'demo');
  assert.equal(body.reply, 'Yes I am in');
  s.close();
});

test('wav header and rms helpers', () => {
  const pcm = Buffer.alloc(3200);
  pcm.writeInt16LE(1000, 0);
  const wav = pcmToWav(pcm);
  assert.equal(wav.length, 3244);
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.ok(rms(pcm) > 0);
});

test('offline drafts follow the conversation language', () => {
  const d = offlineDrafts({ unread: 1, messages: [{ text: '¿Comemos mañana a las 2?', out: false }] });
  assert.equal(d[0], 'Sí, ahí nos vemos.');
});
