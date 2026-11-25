// Semilla Glance backend: keeps Telegram/LLM/STT keys server-side (never in the app),
// exposes a tiny JSON API for the G2 WebView and serves the built web app.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { TelegramInbox } from './telegram.mjs';
import { Assistant } from './ai.mjs';
import { Transcriber } from './stt.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };

export function createApp(env = process.env) {
  const pairCode = env.GLANCE_PAIR_CODE || crypto.randomBytes(3).toString('hex').toUpperCase();
  const tg = new TelegramInbox({
    token: env.TELEGRAM_BOT_TOKEN,
    apiBase: env.TELEGRAM_API_BASE || 'https://api.telegram.org',
    allowChats: (env.GLANCE_ALLOW_CHATS || '').split(',').map((s) => s.trim()).filter(Boolean),
  });
  const ai = new Assistant({ baseUrl: env.LLM_BASE_URL, apiKey: env.LLM_API_KEY, model: env.LLM_MODEL });
  const stt = new Transcriber({ baseUrl: env.STT_BASE_URL, apiKey: env.STT_API_KEY, model: env.STT_MODEL, demoTranscript: env.DEMO_TRANSCRIPT || '' });
  const pending = new Map(); // confirmation tokens: nothing is sent without an explicit tap

  const json = (res, code, obj) => {
    res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type,x-glance-pair' });
    res.end(JSON.stringify(obj));
  };
  const readBody = async (req) => { const chunks = []; for await (const c of req) chunks.push(c); return Buffer.concat(chunks); };

  async function api(req, res, url) {
    if (req.headers['x-glance-pair'] !== pairCode) return json(res, 401, { error: 'pair code required' });
    const p = url.pathname;
    if (p === '/api/inbox' && req.method === 'GET') {
      await tg.poll(0).catch((e) => console.warn('[tg] poll:', e.message));
      return json(res, 200, { chats: tg.inbox(), ai: ai.online ? 'llm' : 'offline' });
    }
    let m = p.match(/^\/api\/chat\/([^/]+)$/);
    if (m && req.method === 'GET') {
      const chat = tg.chat(decodeURIComponent(m[1]));
      if (!chat) return json(res, 404, { error: 'unknown chat' });
      const drafts = await ai.drafts(chat);
      const unread = Math.max(chat.unread, 1);
      return json(res, 200, { id: chat.id, title: chat.title, recent: chat.messages.slice(-Math.min(unread, 3)), drafts });
    }
    if (p === '/api/digest' && req.method === 'GET') {
      await tg.poll(0).catch(() => {});
      return json(res, 200, { lines: await ai.digest([...tg.chats.values()]) });
    }
    if (p === '/api/voice' && req.method === 'POST') {
      const chatId = url.searchParams.get('chat');
      const chat = tg.chat(chatId);
      if (!chat) return json(res, 404, { error: 'unknown chat' });
      const pcm = await readBody(req);
      const { text, source } = await stt.transcribe(pcm);
      const reply = await ai.polish(text, chat);
      return json(res, 200, { transcript: text, reply, source, bytes: pcm.length });
    }
    if (p === '/api/prepare' && req.method === 'POST') {
      const { chatId, text } = JSON.parse((await readBody(req)).toString() || '{}');
      if (!tg.chat(chatId) || !text) return json(res, 400, { error: 'chatId and text required' });
      const token = crypto.randomBytes(8).toString('hex');
      pending.set(token, { chatId, text: String(text).slice(0, 500), at: Date.now() });
      return json(res, 200, { token });
    }
    if (p === '/api/confirm' && req.method === 'POST') {
      const { token } = JSON.parse((await readBody(req)).toString() || '{}');
      const job = pending.get(token);
      pending.delete(token);
      if (!job || Date.now() - job.at > 120000) return json(res, 410, { error: 'confirmation expired' });
      const chat = tg.chat(job.chatId);
      const replyTo = chat?.messages.filter((x) => !x.out).at(-1)?.id;
      const sent = await tg.send(job.chatId, job.text, replyTo);
      return json(res, 200, { ok: true, message_id: sent.message_id });
    }
    if (p === '/api/read' && req.method === 'POST') {
      const { chatId } = JSON.parse((await readBody(req)).toString() || '{}');
      tg.markRead(chatId);
      return json(res, 200, { ok: true });
    }
    return json(res, 404, { error: 'not found' });
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://local');
    try {
      if (req.method === 'OPTIONS') return json(res, 204, {});
      if (url.pathname === '/healthz') return json(res, 200, { ok: true });
      if (url.pathname.startsWith('/api/')) return await api(req, res, url);
      const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      const file = path.join(ROOT, 'web', 'dist', path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
      if (!fs.existsSync(file)) return json(res, 404, { error: 'not found' });
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    } catch (e) {
      console.error('[server]', e);
      json(res, 500, { error: e.message });
    }
  });
  return { server, pairCode, tg, ai };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT || 8787);
  const { server, pairCode, ai } = createApp();
  server.listen(port, '0.0.0.0', () => {
    console.log(`[glance] backend on http://127.0.0.1:${port}  ai=${ai.online ? 'llm' : 'offline'}`);
    console.log(`[glance] pair code: ${pairCode}`);
  });
}
