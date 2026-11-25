// Telegram Bot API adapter (read + write). Works against the real Bot API
// (https://api.telegram.org) or the local mock in server/mock-telegram.mjs.
export class TelegramInbox {
  constructor({ token, apiBase = 'https://api.telegram.org', allowChats = [], maxPerChat = 30 }) {
    if (!token) throw new Error('TELEGRAM_BOT_TOKEN missing');
    this.base = `${apiBase.replace(/\/$/, '')}/bot${token}`;
    this.allow = new Set(allowChats.map(String));
    this.maxPerChat = maxPerChat;
    this.offset = 0;
    this.chats = new Map(); // id -> {id,title,messages:[],unread}
    this.me = null;
  }

  async call(method, body) {
    const res = await fetch(`${this.base}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!data.ok) throw new Error(`telegram ${method} failed: ${data.description || res.status}`);
    return data.result;
  }

  allowed(chatId) {
    return this.allow.size === 0 || this.allow.has(String(chatId));
  }

  ingest(update) {
    const m = update.message || update.channel_post || update.edited_message;
    if (!m || !m.chat || typeof m.text !== 'string') return;
    if (!this.allowed(m.chat.id)) return;
    const id = String(m.chat.id);
    const title = m.chat.title || [m.chat.first_name, m.chat.last_name].filter(Boolean).join(' ') || m.chat.username || id;
    const chat = this.chats.get(id) || { id, title, type: m.chat.type, messages: [], unread: 0 };
    chat.title = title;
    const from = m.from ? (m.from.first_name || m.from.username || 'someone') : (m.author_signature || title);
    chat.messages.push({ id: m.message_id, from, text: m.text, date: m.date, out: false });
    if (chat.messages.length > this.maxPerChat) chat.messages.shift();
    chat.unread += 1;
    this.chats.set(id, chat);
  }

  async poll(timeout = 0) {
    if (!this.me) this.me = await this.call('getMe');
    const updates = await this.call('getUpdates', { offset: this.offset, timeout, allowed_updates: ['message', 'channel_post', 'edited_message'] });
    for (const u of updates) {
      this.offset = Math.max(this.offset, u.update_id + 1);
      this.ingest(u);
    }
    return updates.length;
  }

  inbox() {
    return [...this.chats.values()]
      .filter((c) => c.unread > 0)
      .sort((a, b) => (b.messages.at(-1)?.date || 0) - (a.messages.at(-1)?.date || 0))
      .map((c) => ({ id: c.id, title: c.title, unread: c.unread, last: c.messages.at(-1) }));
  }

  chat(id) {
    return this.chats.get(String(id)) || null;
  }

  markRead(id) {
    const c = this.chat(id);
    if (c) c.unread = 0;
  }

  async send(chatId, text, replyTo) {
    if (!this.allowed(chatId)) throw new Error('chat not in allow-list');
    const body = { chat_id: chatId, text };
    if (replyTo) body.reply_parameters = { message_id: replyTo, allow_sending_without_reply: true };
    const sent = await this.call('sendMessage', body);
    const c = this.chat(chatId);
    if (c) {
      c.messages.push({ id: sent.message_id, from: 'You', text, date: sent.date, out: true });
      c.unread = 0;
    }
    return sent;
  }
}
