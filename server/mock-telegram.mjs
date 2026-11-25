// Local stand-in for the Telegram Bot API, used for tests and the recorded demo.
// Implements getMe, getUpdates and sendMessage with the same JSON shapes.
import http from 'node:http';

const now = () => Math.floor(Date.now() / 1000);

export const SEED = [
  { chat: { id: -1001, title: 'Launch Team', type: 'supergroup' }, from: 'Ana', text: 'Staging deploy is green. Can you join the launch call at 4pm?' },
  { chat: { id: -1001, title: 'Launch Team', type: 'supergroup' }, from: 'Leo', text: 'I need your OK on the release notes before 4pm' },
  { chat: { id: 501, first_name: 'Marta', type: 'private' }, from: 'Marta', text: '¿Comemos mañana a las 2?' },
  { chat: { id: -1002, title: 'Crypto Alpha', type: 'supergroup' }, from: 'bot', text: 'TON up 4% today, gas fees normal' },
  { chat: { id: -1003, title: 'Random memes', type: 'supergroup' }, from: 'Zed', text: 'lol look at this cat' },
];

export function startMockTelegram({ port = 8081, token = 'TEST:TOKEN', seed = SEED } = {}) {
  let updateId = 100;
  let messageId = 1000;
  const updates = [];
  const sent = [];
  const push = ({ chat, from, text }) => {
    updates.push({
      update_id: ++updateId,
      message: { message_id: ++messageId, date: now(), chat, from: { id: 9, is_bot: false, first_name: from }, text },
    });
  };
  seed.forEach(push);

  const server = http.createServer(async (req, res) => {
    let body = '';
    for await (const c of req) body += c;
    const json = body ? JSON.parse(body) : {};
    const send = (obj, code = 200) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
    if (req.url === '/mock/sent') return send(sent);
    if (req.url === '/mock/inject') { push(json); return send({ ok: true }); }
    const m = req.url.match(/^\/bot([^/]+)\/(\w+)/);
    if (!m) return send({ ok: false, description: 'Not Found' }, 404);
    if (m[1] !== token) return send({ ok: false, error_code: 401, description: 'Unauthorized' }, 401);
    switch (m[2]) {
      case 'getMe':
        return send({ ok: true, result: { id: 42, is_bot: true, first_name: 'Semilla Glance', username: 'semilla_glance_bot' } });
      case 'getUpdates': {
        const off = json.offset || 0;
        return send({ ok: true, result: updates.filter((u) => u.update_id >= off) });
      }
      case 'sendMessage': {
        const msg = { message_id: ++messageId, date: now(), chat: { id: json.chat_id }, text: json.text };
        sent.push({ chat_id: json.chat_id, text: json.text, reply_parameters: json.reply_parameters });
        console.log(`[mock-telegram] sendMessage chat=${json.chat_id} text=${JSON.stringify(json.text)}`);
        return send({ ok: true, result: msg });
      }
      default:
        return send({ ok: false, description: `method ${m[2]} not mocked` }, 400);
    }
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({ server, sent, push, url: `http://127.0.0.1:${port}` })));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.MOCK_TG_PORT || 8081);
  startMockTelegram({ port, token: process.env.TELEGRAM_BOT_TOKEN || 'TEST:TOKEN' }).then(({ url }) => console.log(`[mock-telegram] listening on ${url}`));
}
