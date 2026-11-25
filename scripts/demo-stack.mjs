// Starts the mock Telegram Bot API + the Semilla Glance backend with a fixed pair code.
// Real use: skip this and run `npm start` with a real TELEGRAM_BOT_TOKEN.
import { startMockTelegram } from '../server/mock-telegram.mjs';
import { createApp } from '../server/index.mjs';

const tg = await startMockTelegram({ port: 8081, token: 'TEST:TOKEN' });
const { server, pairCode } = createApp({
  ...process.env,
  TELEGRAM_BOT_TOKEN: 'TEST:TOKEN',
  TELEGRAM_API_BASE: tg.url,
  GLANCE_ALLOW_CHATS: '-1001,501,-1002', // "Random memes" is intentionally not allowed
  GLANCE_PAIR_CODE: 'DEMO42',
  DEMO_TRANSCRIPT: process.env.DEMO_TRANSCRIPT || "um yes I'm in, uh send me the notes and I'll approve them in five minutes",
});
server.listen(8787, '127.0.0.1', () => console.log(`[demo] backend http://127.0.0.1:8787/?pair=${pairCode}  mock telegram ${tg.url}`));
