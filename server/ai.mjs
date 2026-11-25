// Reply drafts, digests and voice-note polishing.
// Uses any OpenAI-compatible chat endpoint (OpenRouter, OpenAI, local Ollama)
// when LLM_API_KEY / LLM_BASE_URL are set; otherwise a deterministic offline fallback.
const MAX_REPLY = 60;

function clip(s, n) {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…';
}

export class Assistant {
  constructor({ baseUrl, apiKey, model } = {}) {
    this.baseUrl = (baseUrl || '').replace(/\/$/, '');
    this.apiKey = apiKey || '';
    this.model = model || 'openai/gpt-4o-mini';
    this.online = Boolean(this.baseUrl && (this.apiKey || /localhost|127\.0\.0\.1/.test(this.baseUrl)));
  }

  async chat(system, user) {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}) },
      body: JSON.stringify({ model: this.model, temperature: 0.4, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
    });
    if (!res.ok) throw new Error(`llm ${res.status}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  }

  transcript(chat, n = 8) {
    return chat.messages.slice(-n).map((m) => `${m.out ? 'Me' : m.from}: ${m.text}`).join('\n');
  }

  async drafts(chat) {
    if (this.online) {
      try {
        const out = await this.chat(
          'You draft replies for a user reading Telegram on smart glasses. Return exactly 3 reply options, one per line, no numbering, each under 50 characters, in the language of the conversation: 1) positive/accept 2) need-more-time 3) a short question.',
          this.transcript(chat),
        );
        const lines = out.split('\n').map((l) => clip(l.replace(/^[-*\d.)\s]+/, ''), MAX_REPLY)).filter(Boolean);
        if (lines.length >= 3) return lines.slice(0, 3);
      } catch (e) {
        console.warn('[ai] drafts fallback:', e.message);
      }
    }
    return offlineDrafts(chat);
  }

  async digest(chats) {
    const all = chats.filter((c) => c.unread > 0);
    if (all.length === 0) return ['Inbox zero. Nothing new.'];
    if (this.online) {
      try {
        const text = all.map((c) => `# ${c.title}\n${this.transcript(c, Math.min(c.unread, 10))}`).join('\n\n');
        const out = await this.chat('Summarize these Telegram chats for a smart-glasses glance: one line per chat, format "Chat: gist", max 55 characters per line, flag anything urgent with "!".', text);
        const lines = out.split('\n').map((l) => clip(l.replace(/^[-*\s]+/, ''), 56)).filter(Boolean);
        if (lines.length) return lines.slice(0, 5);
      } catch (e) {
        console.warn('[ai] digest fallback:', e.message);
      }
    }
    return all.slice(0, 5).map((c) => {
      const last = c.messages.at(-1);
      const urgent = /\b(urgent|asap|now|hoy|down|fail\w*|before \d)\b|!!/i.test(last.text) ? '! ' : '';
      const who = last.from === c.title ? '' : `${last.from}: `;
      return clip(`${urgent}${c.title} (${c.unread}): ${who}${last.text}`, 56);
    });
  }

  async polish(transcript, chat) {
    const t = clip(transcript, 300);
    if (!t) return '';
    if (this.online) {
      try {
        const out = await this.chat('Turn this dictated voice note into a short, natural chat reply. Fix filler words and punctuation, keep the meaning and language, max 120 characters. Return only the reply.', `Conversation:\n${this.transcript(chat, 4)}\n\nDictated: ${t}`);
        if (out.trim()) return clip(out.trim().replace(/^"|"$/g, ''), 120);
      } catch (e) {
        console.warn('[ai] polish fallback:', e.message);
      }
    }
    const cleaned = t.replace(/\b(um+|uh+|eh+|este|o sea)\b[,]?\s*/gi, '').trim();
    return clip(cleaned.charAt(0).toUpperCase() + cleaned.slice(1), 120);
  }
}

export function offlineDrafts(chat) {
  const incoming = chat.messages.filter((m) => !m.out);
  const recent = incoming.slice(-Math.max(chat.unread || 1, 1)).map((m) => m.text).join(' ');
  const es = /[áéíóúñ¿¡]|\b(hola|puedes|mañana|gracias|hoy|reunión|listo|comemos)\b/i.test(recent);
  const isQuestion = /\?|¿/.test(recent);
  const time = /\b(meet|call|reuni\w*|llamad\w*|tomorrow|mañana|today|hoy|comemos|lunch|\d{1,2}(:\d\d)?\s?(am|pm))\b/i.test(recent);
  const approval = /\b(ok|okay|approve|approval|sign.?off|visto bueno|autoriza\w*)\b/i.test(recent);
  if (es) {
    return [
      time ? 'Sí, ahí nos vemos.' : isQuestion ? 'Sí, va.' : 'Recibido, gracias.',
      'Dame 10 min y te confirmo.',
      time ? '¿Lo movemos 30 min?' : '¿Me das más detalle?',
    ];
  }
  return [
    approval && time ? "Approved. I'll join at 4." : approval ? 'Approved, go ahead.' : time ? "Yes, I'll be there." : isQuestion ? 'Yes, sounds good.' : 'Got it, thanks!',
    'Give me 10 min, will confirm.',
    time ? 'Can we push it 30 min?' : 'Can you share more detail?',
  ];
}
