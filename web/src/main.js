// Semilla Glance: Telegram inbox on Even Realities G2.
// Read: only chats you allow, newest first, one glance per chat.
// Write: tap an AI-drafted reply or speak one; every send needs one confirming tap.
import { waitForEvenAppBridge, OsEventTypeList, StartUpPageCreateResult } from '@evenrealities/even_hub_sdk';

const BACKEND = (typeof __BACKEND_URL__ !== 'undefined' && __BACKEND_URL__) || window.location.origin;
const W = 576, H = 288;
const MAX_LINE = 46;
const log = (...a) => { console.log('[glance]', ...a); const el = document.getElementById('log'); if (el) el.textContent = `${a.join(' ')}\n${el.textContent}`.slice(0, 2000); };
const clip = (s, n = MAX_LINE) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length <= n ? s : s.slice(0, n - 1) + '…'; };
const ascii = (s) => String(s).replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/…/g, '...');

let bridge;
let pair = '';
let started = false;
const state = { screen: 'boot', chats: [], chat: null, draft: '', token: '', items: [], audio: [], listenTimer: null };

async function api(path, opts = {}) {
  const res = await fetch(`${BACKEND}${path}`, { ...opts, headers: { 'x-glance-pair': pair, ...(opts.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

const PAD = 8;
function text(id, name, x, y, w, h, content, capture = 0) {
  x += PAD; w -= PAD * 2;
  return { xPosition: x, yPosition: y, width: w, height: h, containerID: id, containerName: name, content: ascii(content), isEventCapture: capture };
}
function list(id, name, x, y, w, h, items) {
  x += PAD; w -= PAD * 2;
  return { xPosition: x, yPosition: y, width: w, height: h, containerID: id, containerName: name, isEventCapture: 1, itemContainer: { itemCount: items.length, itemName: items.map((i) => ascii(clip(i, 44))) } };
}
const MENU = { menuItems: [{ itemName: 'Digest', itemID: 1 }, { itemName: 'Refresh', itemID: 2 }, { itemName: 'Inbox', itemID: 3 }] };

async function show(screen, { textObject = [], listObject = [] }) {
  state.screen = screen;
  const page = { containerTotalNum: textObject.length + listObject.length, textObject, listObject, menuObject: MENU };
  let ok;
  if (!started) {
    ok = (await bridge.createStartUpPageContainer(page)) === StartUpPageCreateResult.success;
    started = ok;
  } else {
    ok = await bridge.rebuildPageContainer(page);
  }
  log(`screen=${screen} ok=${ok}`);
  document.getElementById('screen').textContent = screen;
}

async function showInbox() {
  try {
    const { chats, ai } = await api('/api/inbox');
    state.chats = chats;
    const total = chats.reduce((n, c) => n + c.unread, 0);
    if (chats.length === 0) {
      return show('inbox', { textObject: [text(1, 'title', 0, 0, W, H, 'SEMILLA GLANCE\n\nInbox zero.\nTap to refresh.', 1)] });
    }
    state.items = chats.map((c) => ({ kind: 'chat', id: c.id }));
    await show('inbox', {
      textObject: [text(1, 'title', 0, 0, W, 34, `TELEGRAM  ${total} new in ${chats.length} chats${ai === 'llm' ? '  AI' : ''}`)],
      listObject: [list(2, 'chats', 0, 38, W, H - 38, chats.map((c) => `${c.title} (${c.unread}): ${c.last?.text || ''}`))],
    });
  } catch (e) {
    await show('error', { textObject: [text(1, 'title', 0, 0, W, H, `Cannot reach backend\n${clip(e.message)}\nTap to retry.`, 1)] });
  }
}

async function openChat(id) {
  const c = await api(`/api/chat/${encodeURIComponent(id)}`);
  state.chat = c;
  const lines = c.recent.map((m) => clip(`${m.from}: ${m.text}`, 92));
  const items = [...c.drafts, 'Speak a reply', 'Mark read', 'Back'];
  state.items = [...c.drafts.map((d) => ({ kind: 'draft', text: d })), { kind: 'speak' }, { kind: 'read' }, { kind: 'back' }];
  await show('chat', {
    textObject: [text(1, 'thread', 0, 0, W, 118, `${clip(c.title, 30)}\n${lines.join('\n')}`)],
    listObject: [list(2, 'replies', 0, 122, W, H - 122, items)],
  });
}

async function confirmScreen(reply) {
  state.draft = reply;
  const { token } = await api('/api/prepare', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chatId: state.chat.id, text: reply }) });
  state.token = token;
  state.items = [{ kind: 'send' }, { kind: 'speak' }, { kind: 'cancel' }];
  await show('confirm', {
    textObject: [text(1, 'preview', 0, 0, W, 118, `Send to ${clip(state.chat.title, 28)}?\n"${clip(reply, 120)}"`)],
    listObject: [list(2, 'confirm', 0, 122, W, H - 122, ['Send', 'Speak again', 'Cancel'])],
  });
}

async function startListening() {
  state.audio = [];
  await show('listening', { textObject: [text(1, 'mic', 0, 0, W, H, `Listening...\nReply to ${clip(state.chat.title, 28)}\n\nTap when done.`, 1)] });
  const ok = await bridge.audioControl(true);
  log(`mic=${ok}`);
  clearTimeout(state.listenTimer);
  state.listenTimer = setTimeout(stopListening, 8000);
}

async function stopListening() {
  if (state.screen !== 'listening') return;
  clearTimeout(state.listenTimer);
  await bridge.audioControl(false);
  const total = state.audio.reduce((n, a) => n + a.length, 0);
  const pcm = new Uint8Array(total);
  let off = 0;
  for (const a of state.audio) { pcm.set(a, off); off += a.length; }
  await show('thinking', { textObject: [text(1, 'mic', 0, 0, W, H, 'Transcribing...', 1)] });
  const r = await api(`/api/voice?chat=${encodeURIComponent(state.chat.id)}`, { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: pcm });
  log(`voice bytes=${r.bytes} source=${r.source} reply=${JSON.stringify(r.reply)}`);
  if (!r.reply) return openChat(state.chat.id);
  await confirmScreen(r.reply);
}

async function send() {
  const r = await api('/api/confirm', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: state.token }) });
  log(`sent message_id=${r.message_id}`);
  await show('sent', { textObject: [text(1, 'done', 0, 0, W, H, `SENT to ${clip(state.chat.title, 30)}\n"${clip(state.draft, 80)}"`, 1)] });
  setTimeout(() => { if (state.screen === 'sent') showInbox(); }, 1500);
}

async function showDigest() {
  const { lines } = await api('/api/digest');
  await show('digest', { textObject: [text(1, 'digest', 0, 0, W, H, `DIGEST\n${lines.join('\n')}\n\nTap for inbox.`, 1)] });
}

async function back() {
  if (state.screen === 'chat' || state.screen === 'digest' || state.screen === 'confirm') return showInbox();
  if (state.screen === 'listening') { await bridge.audioControl(false); return openChat(state.chat.id); }
}

async function onSelect(index) {
  const item = state.items[index];
  log(`select screen=${state.screen} index=${index} kind=${item?.kind}`);
  if (!item) return;
  switch (item.kind) {
    case 'chat': return openChat(item.id);
    case 'draft': return confirmScreen(item.text);
    case 'speak': return startListening();
    case 'read': await api('/api/read', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chatId: state.chat.id }) }); return showInbox();
    case 'back': return showInbox();
    case 'send': return send();
    case 'cancel': return openChat(state.chat.id);
  }
}

let busy = false;
async function handle(event) {
  if (event.audioEvent) { if (state.screen === 'listening') state.audio.push(event.audioEvent.audioPcm); return; }
  if (busy) return;
  busy = true;
  try {
    if (event.menuItemClickEvent) {
      const id = event.menuItemClickEvent.itemID;
      if (id === 1) await showDigest(); else await showInbox();
      return;
    }
    const ev = event.listEvent || event.textEvent || event.sysEvent;
    if (!ev) return;
    const type = ev.eventType ?? OsEventTypeList.CLICK_EVENT;
    if (type === OsEventTypeList.DOUBLE_CLICK_EVENT) return await back();
    if (type !== OsEventTypeList.CLICK_EVENT) return;
    if (event.listEvent) return await onSelect(event.listEvent.currentSelectItemIndex ?? 0);
    if (state.screen === 'listening') return await stopListening();
    if (['inbox', 'error', 'digest', 'sent'].includes(state.screen)) return await showInbox();
  } catch (e) {
    log(`error ${e.message}`);
  } finally {
    busy = false;
  }
}

async function main() {
  const params = new URLSearchParams(location.search);
  bridge = await waitForEvenAppBridge();
  pair = params.get('pair') || (await bridge.getLocalStorage('glance_pair')) || '';
  if (params.get('pair')) await bridge.setLocalStorage('glance_pair', pair);
  document.getElementById('pair').value = pair;
  document.getElementById('save').onclick = async () => { pair = document.getElementById('pair').value.trim().toUpperCase(); await bridge.setLocalStorage('glance_pair', pair); showInbox(); };
  bridge.onEvenHubEvent((e) => handle(e));
  log(`boot backend=${BACKEND}`);
  await showInbox();
  setInterval(() => { if (state.screen === 'inbox' && !busy) showInbox(); }, 20000);
}

main().catch((e) => log(`fatal ${e.message}`));
