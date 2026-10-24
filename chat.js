import * as E from './crypto.js';
import { isBad } from './filter.js';
import { initCalls, startCall } from './calls.js';
import { reauthenticateWithCredential, EmailAuthProvider } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { collection, query, where, orderBy, limit, onSnapshot, doc, getDoc, getDocs, deleteDoc, setDoc, updateDoc, writeBatch, Timestamp, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Chat lives inside app.html. app.js calls init() once after sign-in, view()/open()/leave() from its router.
// Private chats (and voice messages, and call signaling) are end-to-end encrypted; public rooms are not (moderators can see them).
const ROOMS = [
  { id: 'general', title: 'Ümumi Söhbət', sub: 'Hamı üçün açıq', icon: '🌐' },
  { id: 'az_sector', title: 'Azərbaycan Sektoru', sub: 'Az sektoru', icon: '🇦🇿', sector: 'az' },
  { id: 'ru_sector', title: 'Rus Sektoru', sub: 'Rus sektoru', icon: '🇷🇺', sector: 'ru' }
];
const COLORS = ['#3b82f6', '#e0a458', '#a855f7', '#ef4476', '#10b981', '#d4a017', '#f97316', '#0ea5e9'];
const colorOf = s => COLORS[[...(s || '')].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
const hm = d => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const dt = v => v && v.toDate ? v.toDate() : v ? new Date(v) : new Date();
const fmt = ms => { const d = new Date(ms); return d.toDateString() === new Date().toDateString() ? hm(d) : d.toLocaleDateString([], { day: '2-digit', month: '2-digit' }); };
const mmss = s => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(Math.floor(s % 60)).padStart(2, '0');
const touch = matchMedia('(pointer:coarse)').matches;
const MAX_VOICE = 60;   // seconds

let A, auth, db, uid, me, h, users, ui = null;
let room = null, curPeer = null, tab = 'all', unsubMsg, unsubT, unsubR, lim = 50, older = false, first = true, lastSend = 0, wd, rtm, dtok = 0;
let dialogRaw = {}, previews = {}, unread = {}, seen = {}, lastRead = {}, online = {}, typingMap = {}, peerReadAt = 0, blocked = new Set();
let replyTo = null, newCount = 0, ctx = {}, typingTimer, lastTypeWrite = 0, myKey = null, keyCache = {}, plain = new Map(), baseSub = '', infoUser = null, curAudio = null;
let recorder = null, recStream = null, recChunks = [], recT0 = 0, recTick = null, recCancel = false;

const dmId = p => 'dm_' + [uid, p].sort().join('_');
const nameOf = u => u ? (u.name || '') + (u.verified ? ' ✔' : '') : '';
const classRoom = () => /^(1[01]|[1-9])-[A-ZƏÇŞĞÜÖİ]$/.test(me.schoolClass || '') ? { id: 'class_' + me.schoolClass, title: 'Sinif ' + me.schoolClass, sub: 'Yalnız sinif yoldaşları', icon: '🎒' } : null;
const visibleRooms = () => [...ROOMS.filter(r => !r.sector || r.sector === me.sector || me.role === 'admin'), classRoom()].filter(Boolean);
const saveRead = () => { try { localStorage.setItem('lr_' + uid, JSON.stringify(lastRead)); } catch {} };
function setTitle() { const n = Object.values(unread).filter(Boolean).length; document.title = (n ? '(' + n + ') ' : '') + 'LawApp'; A.setBadge(n); }
function markRead(id) { lastRead[id] = Date.now(); unread[id] = false; saveRead(); setTitle(); }
function linkify(p, text) {
  const re = /https?:\/\/[^\s<]+/g; let i = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > i) p.append(text.slice(i, m.index));
    const a = h('a', null, m[0]); a.href = m[0]; a.target = '_blank'; a.rel = 'noopener noreferrer nofollow'; p.append(a); i = m.index + m[0].length;
  }
  if (i < text.length) p.append(text.slice(i));
}

// ---------- start (once, after sign-in) ----------
export function init(api) {
  A = api; ({ auth, db, uid, me, h, users } = api);
  try { lastRead = JSON.parse(localStorage.getItem('lr_' + uid)) || {}; } catch {}
  document.addEventListener('visibilitychange', () => { if (!document.hidden && room) { markRead(room); if (curPeer) writeRead(); } });
  addEventListener('pagehide', stopTyping);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  initKeys(); startRoomPreviews(); startDialogs(); startPresence(); startBlocks();
  initCalls({ db, uid, h, toast: A.toast, avatar: A.avatar, loadUser: A.loadUser, ico: A.ico, getKey: async p => { await A.loadUser(p); return roomKey(dmId(p)); } });
}
export const mounted = () => !!ui && document.body.contains(ui.root);

function startRoomPreviews() {
  visibleRooms().forEach(r => onSnapshot(query(collection(db, 'messages'), where('room', '==', r.id), orderBy('createdAt', 'desc'), limit(1)), s => {
    const d = s.docs[0], p0 = d ? d.data({ serverTimestamps: 'estimate' }) : null, p = p0 && p0.uid ? p0 : null;
    previews[r.id] = p;
    const t = p ? dt(p.createdAt).getTime() : 0, fresh = p && p.uid !== uid && t > (lastRead[r.id] || 0);
    if (r.id === room && !document.hidden) markRead(r.id);
    else { if (fresh && seen[r.id] && !unread[r.id]) A.beep(); unread[r.id] = !!fresh; setTitle(); }
    seen[r.id] = true; renderList();
  }, () => {}));
}
function startDialogs() {   // one small document per private chat; its preview is ciphertext too
  onSnapshot(query(collection(db, 'dialogs'), where('owner', '==', uid)), s => {
    dialogRaw = {};
    s.forEach(d => { const x = d.data({ serverTimestamps: 'estimate' }); dialogRaw[x.peer] = { at: dt(x.at).getTime(), from: x.from, iv: x.iv, ct: x.ct }; });
    buildDialogs();
  }, () => {});
}
async function buildDialogs() {
  const tok = ++dtok, ids = Object.keys(dialogRaw);
  await Promise.all(ids.map(p => A.loadUser(p)));
  for (const p of ids) {
    const x = dialogRaw[p]; x.text = '🔒 Şifrələnmiş mesaj';
    if (myKey && users[p] && users[p].pub) { try { x.text = (await E.decrypt(await roomKey(dmId(p)), x, dmId(p))).text; } catch {} }
  }
  if (tok !== dtok) return;
  ids.forEach(p => {
    const id = dmId(p), x = dialogRaw[p], fresh = x.from !== uid && x.at > (lastRead[id] || 0);
    if (id === room && !document.hidden) { if (fresh) markRead(id); }
    else { if (fresh && seen[id] && !unread[id]) A.beep(); unread[id] = fresh; }
    seen[id] = true;
  });
  setTitle(); renderList();
}
function startPresence() {
  const beat = () => { if (!document.hidden && me.showOnline !== false) setDoc(doc(db, 'presence', uid), { at: serverTimestamp() }).catch(() => {}); };
  const poll = async () => {
    try {
      const s = await getDocs(query(collection(db, 'presence'), where('at', '>', Timestamp.fromMillis(Date.now() - 100000))));
      online = {}; s.forEach(d => online[d.id] = 1); online[uid] = 1;
      if (ui) ui.onl.textContent = Object.keys(online).length + ' onlayn';
      renderList(); statusLine();
    } catch {}
  };
  beat(); setTimeout(poll, 1200);
  setInterval(() => { beat(); poll(); }, 45000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { beat(); poll(); } });
  setInterval(statusLine, 1500);
}
function startBlocks() {
  onSnapshot(query(collection(db, 'blocks'), where('owner', '==', uid)), s => { blocked = new Set(s.docs.map(d => d.data().target)); updateComposer(); fillInfo(); }, () => {});
}

// ---------- layout: list pane (left) + conversation pane ----------
export function view(arg) {
  const root = h('div', 'chat'), cl = h('aside', 'cl'), cv = h('section', 'cv');
  // list pane
  const top = h('div', 'clh'), onl = h('span', 'onl'), nb = h('button', 'icb'); nb.append(A.ico('edit')); nb.setAttribute('aria-label', 'Yeni söhbət'); nb.onclick = newChat;
  top.append(h('b', null, 'Söhbətlər'), h('span', 'grow'), onl, nb);
  const sbx = h('div', 'sbx'), search = h('input'); search.placeholder = 'Axtar və ya @istifadəçi adı'; search.oninput = renderList; sbx.append(search);
  const tabs = h('div', 'ctabs');
  [['all', 'Hamısı'], ['dm', 'Şəxsi'], ['rooms', 'İcmalar']].forEach(([k, t]) => { const b = h('button', k === tab ? 'on' : '', t); b.onclick = () => { tab = k; [...tabs.children].forEach(x => x.classList.toggle('on', x === b)); renderList(); }; tabs.append(b); });
  const list = h('div', 'clist'); cl.append(top, sbx, tabs, list);
  // empty state (desktop, no chat open)
  const ph = h('div', 'cph'); ph.append(h('b', null, 'LawApp'), h('span', null, 'Söhbət seçin və ya yenisini başladın.'), h('small', null, '🔒 Şəxsi söhbətlər, səsli mesajlar və zənglər uçdan-uca şifrələnir'));
  // conversation
  const pane = h('div', 'cpane hidden'), head = h('div', 'ch'), back = h('button', 'icb back'), hav = h('div', 'av sm'), hbox = h('div', 'grow hb'), title = h('b'), sub = h('div', 's');
  back.append(A.ico('back')); back.setAttribute('aria-label', 'Geri'); back.onclick = () => { location.hash = '#/chat'; };
  hbox.append(title, sub); hbox.onclick = hav.onclick = () => { if (curPeer) showInfo(curPeer); };
  const cA = h('button', 'icb dmonly'), cV = h('button', 'icb dmonly'), ib = h('button', 'icb dmonly');
  cA.append(A.ico('phone')); cV.append(A.ico('video')); ib.append(A.ico('more')); cA.title = 'Səsli zəng'; cV.title = 'Video zəng'; ib.title = 'Məlumat';
  cA.onclick = () => curPeer && users[curPeer] && startCall(users[curPeer], false); cV.onclick = () => curPeer && users[curPeer] && startCall(users[curPeer], true); ib.onclick = () => curPeer && showInfo(curPeer);
  head.append(back, hav, hbox, cA, cV, ib);
  const msgs = h('div', 'msgs'), down = h('button', 'down'), newc = h('i', 'hidden'); down.append(A.ico('down'), newc); down.onclick = () => { newCount = 0; toBottom(true); };
  msgs.onscroll = () => { if (atBottom()) newCount = 0; updateDown(); };
  const rbar = h('div', 'rbar hidden'), rq = h('div', 'quote'), rn = h('b'), rt = h('span'), rx = h('button', 'icb'); rq.append(rn, rt); rx.append(A.ico('x')); rx.onclick = () => setReply(null); rbar.append(rq, rx);
  const emo = h('div', 'emo hidden');
  // composer: text + emoji + send; in private chats the send button turns into a microphone while the box is empty
  const form = h('form', 'comp'), eb = h('button', 'icb'), inp = h('textarea'), send = h('button', 'sendb'), mic = h('button', 'sendb mic');
  Array.from('😀😁😂🤣😊😍😘😎🤔😅😭😡👍👎👏🙏💪🔥✨🎉❤️💔🥳😴🤗😬🙄😇🤝👋🙌💯✅❌📚✏️🏫🎒⚽🎮🎵🍕☕').forEach(e => { const b = h('button', null, e); b.type = 'button'; b.onclick = () => { const s = inp.selectionStart; inp.setRangeText(e, s, inp.selectionEnd, 'end'); inp.oninput(); if (!touch) inp.focus(); }; emo.append(b); });
  eb.type = 'button'; eb.append(A.ico('smile')); eb.onclick = () => emo.classList.toggle('hidden');
  inp.rows = 1; inp.maxLength = 1000; inp.placeholder = touch ? 'Mesaj yazın' : 'Mesaj yazın (Enter — göndər)';
  send.append(A.ico('send')); send.setAttribute('aria-label', 'Göndər'); mic.type = 'button'; mic.append(A.ico('mic')); mic.setAttribute('aria-label', 'Səsli mesaj'); mic.onclick = startRec;
  inp.oninput = () => { inp.style.height = '42px'; inp.style.height = Math.min(inp.scrollHeight, 120) + 'px'; inp.value.trim() ? typed() : stopTyping(); swapSend(); };
  inp.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && !touch) { e.preventDefault(); form.requestSubmit(); } };
  form.onsubmit = sendText; form.append(eb, inp, send, mic);
  const recbar = h('div', 'recbar hidden'), rdel = h('button', 'icb'), rdot = h('i', 'rdot'), rtm_ = h('span', 'rtm', '00:00'), rok = h('button', 'sendb');
  rdel.append(A.ico('trash')); rdel.setAttribute('aria-label', 'Ləğv et'); rdel.onclick = () => stopRec(false); rok.append(A.ico('send')); rok.setAttribute('aria-label', 'Göndər'); rok.onclick = () => stopRec(true);
  recbar.append(rdel, rdot, rtm_, h('span', 'grow'), rok);
  const blk = h('div', 'blkbar hidden'), bb = h('button', 'go ghost', 'Blokdan çıxar'); blk.append(h('span', null, 'Bu istifadəçini blokladınız.'), bb); bb.onclick = () => curPeer && toggleBlock(users[curPeer]);
  // contact info panel
  const info = h('div', 'info'), ipt = h('div', 'ptop'), ix = h('button', 'icb'), big = h('div', 'big'), iav = h('div', 'av pav'), inm = h('h3'), iun = h('div', 's'), ist = h('div', 's'), ibio = h('div', 'ibio'), ifp = h('div', 'ifp hidden'), ibtns = h('div', 'ibtns');
  ix.append(A.ico('x')); ix.onclick = closeInfo; ipt.append(ix, h('b', null, 'Məlumat')); big.append(iav, inm, iun, ist, ibio, ifp); info.append(ipt, big, ibtns);
  pane.append(head, msgs, down, rbar, emo, form, recbar, blk, info);
  cv.append(ph, pane); root.append(cl, cv);
  ui = { root, cl, cv, ph, pane, list, search, tabs, onl, hav, title, sub, msgs, down, newc, rbar, rn, rt, emo, form, inp, send, mic, recbar, rtm: rtm_, blk, info, iav, inm, iun, ist, ibio, ifp, ibtns, cA, cV, ib };
  A.mount(root); renderList(); open(arg);
}
export function leave() {
  stopTyping(); stopRec(false); unsubMsg && unsubMsg(); unsubT && unsubT(); unsubR && unsubR(); unsubMsg = unsubT = unsubR = null;
  if (curAudio) { curAudio.pause(); curAudio = null; }
  room = null; curPeer = null; ui = null; document.body.classList.remove('chatmode', 'convopen');
}
export function open(arg) {
  if (!ui) return;
  if (!arg) return closeRoom();
  if (arg[0] === '@') return startChatWith(arg.slice(1));
  if (arg.startsWith('dm_')) {
    const p = arg.split('_'); if (!p.includes(uid)) return A.toast('Bu söhbət sizə aid deyil');
    const pid = p[1] === uid ? p[2] : p[1];
    return A.loadUser(pid).then(u => { if (!u) return A.toast('İstifadəçi tapılmadı'); openRoom({ id: arg, uid: pid, title: nameOf(u), url: u.photoURL, sub: '@' + u.username }); });
  }
  const r = visibleRooms().find(x => x.id === arg); if (r) openRoom({ ...r });
}
function closeRoom() {
  stopTyping(); stopRec(false); unsubMsg && unsubMsg(); unsubT && unsubT(); unsubR && unsubR(); unsubMsg = unsubT = unsubR = null;
  room = null; curPeer = null; if (!ui) return;
  ui.root.classList.remove('open'); ui.pane.classList.add('hidden'); ui.ph.classList.remove('hidden'); document.body.classList.remove('convopen'); renderList();
}

// ---------- chat list ----------
function buildItems() {
  const rooms = visibleRooms().map(r => { const p = previews[r.id]; return { kind: 'room', id: r.id, title: r.title, icon: r.icon, sub: r.sub, last: p ? `${p.uid === uid ? 'Siz' : (p.name || '').split(' ')[0]}: ${p.text}` : r.sub, ts: p ? dt(p.createdAt).getTime() : 0 }; });
  const dms = Object.entries(dialogRaw).map(([p, x]) => { const u = users[p] || {}; return { kind: 'dm', id: dmId(p), uid: p, title: nameOf(u) || '…', url: u.photoURL, sub: '@' + (u.username || ''), last: (x.from === uid ? 'Siz: ' : '') + (x.text || '🔒'), ts: x.at }; }).sort((a, b) => b.ts - a.ts);
  return tab === 'rooms' ? rooms : tab === 'dm' ? dms : [...rooms, ...dms];
}
function renderList() {
  if (!ui) return;
  const q = ui.search.value.trim().toLowerCase().replace(/^@/, ''), frag = document.createDocumentFragment(); let lastKind = '';
  buildItems().filter(i => !q || (i.title + ' ' + (i.sub || '')).toLowerCase().includes(q)).forEach(i => {
    if (tab === 'all' && i.kind !== lastKind) { lastKind = i.kind; frag.append(h('div', 'cap', i.kind === 'room' ? 'İCMALAR' : 'ŞƏXSİ SÖHBƏTLƏR')); }
    const row = h('div', 'item' + (i.id === room ? ' on' : '') + (unread[i.id] ? ' unread' : '')), a = h('div', 'av sm'), body = h('div', 'body'), r1 = h('div', 'row1'), tm = h('div', 'tm', i.ts ? fmt(i.ts) : '');
    A.avatar(a, i.title, i.url); if (i.icon) { a.style.background = 'var(--sf2)'; a.textContent = i.icon; }
    if (i.uid && online[i.uid]) a.classList.add('onl_');
    if (unread[i.id]) tm.append(h('span', 'dot'));
    r1.append(h('div', 't', i.title), tm); body.append(r1, h('div', 's', i.last)); row.append(a, body);
    row.onclick = () => { location.hash = '#/chat/' + i.id; };
    frag.append(row);
  });
  if (/^[a-z0-9_]{4,20}$/.test(q)) {
    const row = h('div', 'item'), a = h('div', 'av sm', '🔎'), body = h('div', 'body'); body.append(h('div', 't', '@' + q), h('div', 's', 'İstifadəçi adı ilə axtar və yaz'));
    row.append(a, body); row.onclick = () => { location.hash = '#/chat/@' + q; }; frag.append(row);
  }
  if (!frag.children.length) frag.append(h('div', 'empty', 'Burada hələ söhbət yoxdur.\n✎ düyməsi ilə istifadəçi adı yazaraq kimisə tapın.'));
  ui.list.replaceChildren(frag);
}
async function startChatWith(name) {
  name = (name || '').toLowerCase().replace(/^@/, '');
  if (!/^[a-z0-9_]{4,20}$/.test(name)) { A.toast('İstifadəçi adı: 4–20 simvol, a-z, 0-9, _'); return location.replace('#/chat'); }
  try {
    const s = await getDoc(doc(db, 'usernames', name));
    if (!s.exists()) { A.toast('❌ Belə istifadəçi tapılmadı'); return location.replace('#/chat'); }
    const id = s.data().uid; if (id === uid) { A.toast('Bu sizsiniz 🙂'); return location.replace('#/chat'); }
    location.replace('#/chat/' + dmId(id));
  } catch { A.toast('Axtarış alınmadı'); location.replace('#/chat'); }
}
async function newChat() { const v = await A.ask('İstifadəçi adını yazın', { input: true, ph: 'məsələn: ali_200', ok: 'Tap' }); if (v) location.hash = '#/chat/@' + v.toLowerCase().replace(/^@/, ''); }

async function openRoom(i) {
  if (i.uid) await A.loadUser(i.uid);
  if (!ui) return;
  document.body.classList.add('convopen'); ui.root.classList.add('open'); ui.ph.classList.add('hidden'); ui.pane.classList.remove('hidden');
  if (room === i.id && unsubMsg) { renderList(); return; }
  stopTyping(); stopRec(false); room = i.id; curPeer = i.uid || null; lim = 50; baseSub = i.sub || ''; setReply(null); ui.emo.classList.add('hidden'); closeInfo();
  const pu = curPeer && users[curPeer];
  ui.title.textContent = pu ? nameOf(pu) : i.title; A.avatar(ui.hav, i.title, pu ? pu.photoURL : i.url);
  if (i.icon) { ui.hav.style.background = 'var(--sf2)'; ui.hav.textContent = i.icon; }
  ui.msgs.classList.toggle('grp', !curPeer); ui.root.classList.toggle('isdm', !!curPeer); updateComposer();
  markRead(room); renderList(); subscribe(); listenTyping(); listenReceipts(); statusLine();
  if (curPeer) writeRead();
  if (!touch) ui.inp.focus();
}
function updateComposer() {
  if (!ui) return; const b = !!curPeer && blocked.has(curPeer);
  ui.form.classList.toggle('hidden', b); ui.blk.classList.toggle('hidden', !b); swapSend();
}
function swapSend() { if (!ui) return; const voice = !!curPeer && !ui.inp.value.trim(); ui.mic.classList.toggle('hidden', !voice); ui.send.classList.toggle('hidden', voice); }

// ---------- read receipts (private chats): ✓ sent, ✓✓ read ----------
function writeRead() { clearTimeout(rtm); rtm = setTimeout(() => { if (curPeer && !document.hidden) setDoc(doc(db, 'reads', room + '__' + uid), { room, uid, at: serverTimestamp() }).catch(() => {}); }, 500); }
function listenReceipts() {
  unsubR && unsubR(); peerReadAt = 0; if (!curPeer) return;
  unsubR = onSnapshot(doc(db, 'reads', room + '__' + curPeer), s => {
    peerReadAt = s.exists() ? dt(s.data({ serverTimestamps: 'estimate' }).at).getTime() : 0;
    ui && ui.msgs.querySelectorAll('.msg.out').forEach(b => { const t = b.querySelector('.tick'); if (t && !t.classList.contains('p')) setTick(t, +b.dataset.ts); });
  }, () => {});
}
const setTick = (t, ts) => { t.textContent = curPeer && ts <= peerReadAt ? '✓✓' : '✓'; };

// ---------- messages ----------
const atBottom = () => ui.msgs.scrollHeight - ui.msgs.scrollTop - ui.msgs.clientHeight < 120;
const toBottom = smooth => ui.msgs.scrollTo({ top: ui.msgs.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
function updateDown() { if (!ui) return; ui.down.classList.toggle('show', !atBottom()); ui.newc.classList.toggle('hidden', !newCount); ui.newc.textContent = newCount; }
const $m = id => ui && ui.msgs.querySelector('#m_' + CSS.escape(id));

function voiceEl(pl) {
  const w = h('div', 'vm'), b = h('button', 'vp'), bar = h('div', 'vb'), fill = h('i'), t = h('span', 'vt', mmss(pl.dur || 0)); let au = null;
  b.type = 'button'; b.append(A.ico('play')); bar.append(fill); w.append(b, bar, t);
  b.onclick = e => {
    e.stopPropagation();
    if (!au) {
      au = new Audio(URL.createObjectURL(new Blob([Uint8Array.from(atob(pl.a), c => c.charCodeAt(0))], { type: pl.mime || 'audio/webm' })));
      au.ontimeupdate = () => { fill.style.width = (au.currentTime / ((isFinite(au.duration) && au.duration) || pl.dur || 1) * 100) + '%'; t.textContent = mmss(au.currentTime); };
      au.onended = () => { b.replaceChildren(A.ico('play')); fill.style.width = '0'; t.textContent = mmss(pl.dur || 0); };
      au.onpause = () => b.replaceChildren(A.ico('play')); au.onplay = () => b.replaceChildren(A.ico('pause'));
    }
    if (au.paused) { if (curAudio && curAudio !== au) curAudio.pause(); curAudio = au; au.play().catch(() => A.toast('Səs oxunmadı')); } else au.pause();
  };
  return w;
}
const build = (d, a) => { try { return build0(d, a); } catch (e) { console.error(e); return []; } };
function build0(d, anim) {
  const m = d.data({ serverTimestamps: 'estimate' }); if (!m.uid) return [];
  const pl = plain.get(d.id); if (pl) { m.text = pl.text; m.reply = pl.reply; }
  const t = dt(m.createdAt), ds = t.toDateString(), out = [];
  if (ds !== ctx.day) { ctx.day = ds; ctx.uid = null; out.push(h('div', 'day', ds === new Date().toDateString() ? 'Bu gün' : ds === new Date(Date.now() - 864e5).toDateString() ? 'Dünən' : t.toLocaleDateString())); }
  const mine = m.uid === uid, isFirst = ctx.uid !== m.uid || t - ctx.t > 3e5; ctx.uid = m.uid; ctx.t = t;
  const b = h('div', 'msg ' + (mine ? 'out' : 'in') + (isFirst ? ' first' : '') + (anim ? ' new' : '')); b.id = 'm_' + d.id; b.dataset.ts = t.getTime();
  if (!mine && isFirst && !curPeer) {
    const w = h('div', 'who', m.name); w.style.color = colorOf(m.uid); w.onclick = e => { e.stopPropagation(); showInfo(m.uid); }; b.append(w);
    const a = h('div', 'av mav'); a.dataset.uid = m.uid; A.avatar(a, m.name, users[m.uid] && users[m.uid].photoURL); a.onclick = e => { e.stopPropagation(); showInfo(m.uid); }; b.append(a);
  }
  if (m.reply) { const q = h('div', 'quote'); q.append(h('b', null, m.reply.name), h('span', null, m.reply.text)); b.append(q); }
  let body;
  if (pl && pl.type === 'voice') body = voiceEl(pl); else { body = h('span'); linkify(body, m.text || ''); }
  const meta = h('span', 'meta', hm(t));
  if (mine) { const p = d.metadata.hasPendingWrites, tk = h('span', 'tick' + (p ? ' p' : ''), p ? '🕓' : ''); if (!p) setTick(tk, t.getTime()); meta.append(tk); }
  b.append(body, meta);
  const label = pl && pl.type === 'voice' ? '🎤 Səsli mesaj' : (m.text || '').slice(0, 120);
  const acts = h('div', 'acts'), rb = h('button', null); rb.append(A.ico('reply')); rb.title = 'Cavab ver'; rb.onclick = e => { e.stopPropagation(); setReply({ name: m.name, text: label }); }; acts.append(rb);
  if (!mine) { const fb = h('button', null, '🚩'); fb.title = 'Şikayət et'; fb.onclick = e => { e.stopPropagation(); A.report('message', d.id, { uid: m.uid, name: m.name, username: m.username }, pl && pl.type === 'voice' ? '[səsli mesaj]' : m.text); }; acts.append(fb); }
  if (mine || me.role === 'admin') { const x = h('button', null); x.append(A.ico('trash')); x.title = 'Sil'; x.onclick = async e => { e.stopPropagation(); if (await A.ask('Mesaj silinsin?', { ok: 'Sil', danger: true })) deleteDoc(d.ref).catch(() => A.toast('Silmək mümkün olmadı')); }; acts.append(x); }
  b.append(acts); b.onclick = () => b.classList.toggle('sel'); b.ondblclick = () => setReply({ name: m.name, text: label });
  out.push(b); return out;
}
function skeleton() { ui.msgs.textContent = ''; for (let i = 0; i < 6; i++) { const s = h('div', 'sk' + (i % 3 ? '' : ' r')); s.style.width = 30 + (i * 17) % 40 + '%'; ui.msgs.append(s); } }
async function fillAvatars() {
  if (!ui) return; const els = [...ui.msgs.querySelectorAll('.mav')], ids = [...new Set(els.map(a => a.dataset.uid))];
  await Promise.all(ids.map(i => A.loadUser(i))); els.forEach(a => { const u = users[a.dataset.uid]; if (u) A.avatar(a, u.name, u.photoURL); });
}
function subscribe() {
  unsubMsg && unsubMsg(); first = true; newCount = 0; skeleton(); clearTimeout(wd);
  wd = setTimeout(() => { if (first && ui) { const b = h('button', 'more', 'Yenidən cəhd et'); b.onclick = subscribe; ui.msgs.textContent = ''; ui.msgs.append(h('div', 'day', 'Mesajlar yüklənmir. İnterneti və Firestore indeksini yoxlayın.'), b); } }, 12000);
  const q = query(collection(db, 'messages'), where('room', '==', room), orderBy('createdAt', 'desc'), limit(lim)), myRoom = room; let chain = Promise.resolve();
  const render = snap => {
    if (!ui) return; const box = ui.msgs, changes = snap.docChanges({ includeMetadataChanges: true });
    if (first || older || changes.some(c => c.type === 'removed')) {
      const prevH = box.scrollHeight, prevT = box.scrollTop, frag = document.createDocumentFragment(); ctx = {};
      frag.append(h('div', 'day lock' + (curPeer ? '' : ' g'), curPeer ? '🔒 Mesajlar, səsli mesajlar və zənglər uçdan-uca şifrələnib. Yalnız siz və qarşı tərəf.' : 'ℹ️ Bu söhbət şifrələnmir: moderatorlar mesajları görə bilər.'));
      if (snap.size >= lim) { const b = h('button', 'more', 'Əvvəlki mesajlar'); b.onclick = () => { lim += 50; older = true; subscribe(); }; frag.append(b); }
      if (!snap.size) { const e = h('div', 'day', 'Hələ mesaj yoxdur. İlk yazan siz olun!'); e.id = 'emptynote'; frag.append(e); }
      snap.docs.slice().reverse().forEach(d => frag.append(...build(d)));
      box.textContent = ''; box.append(frag);
      if (older) { box.scrollTop = box.scrollHeight - prevH + prevT; older = false; } else if (first) toBottom(false); else box.scrollTop = prevT;
      first = false; clearTimeout(wd); updateDown(); fillAvatars(); if (curPeer) writeRead(); return;
    }
    changes.forEach(c => {
      const d = c.doc;
      if (c.type === 'added' && !$m(d.id)) {
        const wasBottom = atBottom(), mine = d.data().uid === uid; box.querySelector('#emptynote')?.remove();
        box.append(...build(d, true)); fillAvatars();
        if (mine || wasBottom) toBottom(true); else { newCount++; updateDown(); }
        if (!mine && !d.metadata.hasPendingWrites) { if (document.hidden) A.beep(); else if (curPeer) writeRead(); }
      } else if (c.type === 'modified') {
        const b = $m(d.id), t = b && b.querySelector('.tick');
        if (t) { if (d.metadata.hasPendingWrites) { t.textContent = '🕓'; t.className = 'tick p'; } else { b.dataset.ts = dt(d.data().createdAt).getTime(); t.className = 'tick'; setTick(t, +b.dataset.ts); } }
      }
    });
  };
  unsubMsg = onSnapshot(q, { includeMetadataChanges: true }, snap => {   // decrypt first (private chats), then render, strictly in order
    chain = chain.then(async () => { await decryptAll(snap.docs, myRoom); if (myRoom === room) render(snap); }).catch(console.error);
  }, err => { if (ui) { ui.msgs.textContent = ''; ui.msgs.append(h('div', 'day', 'Xəta: ' + err.message)); } });
}

// ---------- sending ----------
function setReply(r) { replyTo = r; if (!ui) return; ui.rbar.classList.toggle('hidden', !r); if (r) { ui.rn.textContent = r.name; ui.rt.textContent = r.text; ui.inp.focus(); } }
async function commit(data, prev) {
  const b = writeBatch(db); b.set(doc(collection(db, 'messages')), data);
  if (curPeer) {   // update both people's chat lists (the preview is ciphertext too)
    const dd = { at: serverTimestamp(), from: uid, ...prev };
    b.set(doc(db, 'dialogs', uid + '__' + curPeer), { owner: uid, peer: curPeer, ...dd }); b.set(doc(db, 'dialogs', curPeer + '__' + uid), { owner: curPeer, peer: uid, ...dd });
  }
  await b.commit(); markRead(room);
}
const sendErr = err => A.toast(err.code === 'permission-denied' ? 'Göndərilə bilmədi (hesab təsdiqlənməyib, bloklanıb və ya mesaj çox böyükdür).' : 'Göndərilmədi: ' + err.message);
async function sendText(e) {
  e.preventDefault(); const inp = ui.inp, text = inp.value.trim(); if (!text || !room) return;
  if (isBad(text)) return A.toast('Mesajda qadağan olunmuş söz var. Nəzakətli olun 🙂');
  if (Date.now() - lastSend < 800) return A.toast('Çox tez yazırsınız 🙂');
  if (curPeer && blocked.has(curPeer)) return A.toast('Bu istifadəçini blokladınız');
  lastSend = Date.now(); inp.value = ''; inp.oninput(); ui.emo.classList.add('hidden');
  const base = { room, uid, name: me.name, username: me.username, createdAt: serverTimestamp() }; let data, enc;
  try { if (curPeer) { enc = await encryptMsg({ text, reply: replyTo }); data = { ...base, ...enc }; } else data = { text, ...base, ...(replyTo ? { reply: replyTo } : {}) }; }
  catch (err) { inp.value = text; inp.oninput(); return A.toast('🔒 ' + err.message); }
  setReply(null); try { await commit(data, enc); } catch (err) { sendErr(err); }
}

// ---------- voice messages (private chats only: they are end-to-end encrypted like text) ----------
async function startRec() {
  if (!curPeer || recorder) return;
  if (!(navigator.mediaDevices && window.MediaRecorder)) return A.toast('Bu brauzer səs yazmağı dəstəkləmir (HTTPS lazımdır)');
  try { recStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); } catch { return A.toast('Mikrofona icazə verilmədi'); }
  const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find(x => MediaRecorder.isTypeSupported(x)) || '';
  recorder = new MediaRecorder(recStream, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 24000 });
  recChunks = []; recCancel = false; const peer = curPeer, rm = room, rec = recorder;
  rec.ondataavailable = e => { if (e.data.size) recChunks.push(e.data); };
  rec.onstop = async () => {
    const dur = Math.round((Date.now() - recT0) / 1000), type = rec.mimeType || mime || 'audio/webm', chunks = recChunks, cancelled = recCancel; cleanupRec();
    if (cancelled || dur < 1 || peer !== curPeer || rm !== room) return;
    try { await sendVoice(new Blob(chunks, { type }), dur, type); } catch (err) { sendErr(err); }
  };
  rec.start(); recT0 = Date.now(); ui.form.classList.add('hidden'); ui.recbar.classList.remove('hidden'); ui.rtm.textContent = '00:00';
  recTick = setInterval(() => { const s = Math.floor((Date.now() - recT0) / 1000); if (ui) ui.rtm.textContent = mmss(s); if (s >= MAX_VOICE) stopRec(true); }, 250);
}
function stopRec(send) {
  if (!recorder) return; recCancel = !send; clearInterval(recTick);
  try { recorder.state !== 'inactive' ? recorder.stop() : cleanupRec(); } catch { cleanupRec(); }
}
function cleanupRec() {
  clearInterval(recTick); if (recStream) recStream.getTracks().forEach(t => t.stop()); recStream = null; recorder = null;
  if (ui) { ui.recbar.classList.add('hidden'); updateComposer(); }
}
async function sendVoice(blob, dur, mime) {
  if (blocked.has(curPeer)) return A.toast('Bu istifadəçini blokladınız');
  const a = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(blob); });
  if (a.length > 450000) return A.toast('Səsli mesaj çox uzundur');
  const key = await roomKey(room), base = { room, uid, name: me.name, username: me.username, createdAt: serverTimestamp() };
  const enc = await E.encrypt(key, { type: 'voice', dur, mime, a, reply: replyTo }, room), prev = await E.encrypt(key, { text: '🎤 Səsli mesaj' }, room);
  setReply(null); await commit({ ...base, ...enc }, prev);
}

// ---------- end-to-end encryption ----------
async function initKeys() {
  if (!(window.crypto && crypto.subtle)) return A.toast('⚠️ Şifrələmə üçün sayt HTTPS (və ya localhost) ilə açılmalıdır');
  myKey = await E.loadKey(uid).catch(() => null);
  if (myKey) { buildDialogs(); return; }
  const s = await getDoc(doc(db, 'keys', uid));
  const pw = await A.ask(s.exists() ? '🔒 Şifrələmə açarını açmaq üçün şifrənizi daxil edin' : '🔒 Şifrələməni aktivləşdirmək üçün şifrənizi daxil edin', { input: true, type: 'password', ok: 'Aç' });
  if (!pw) return A.toast('Şəxsi söhbətləri oxumaq üçün açar lazımdır');
  try { if (s.exists()) myKey = (await E.openIdentity(pw, s.data())).privateKey; else await newIdentity(pw); await E.saveKey(uid, myKey); buildDialogs(); if (curPeer) subscribe(); }
  catch { // typical after a password reset by e-mail: the old key can't be opened any more
    if (!await A.ask('Şifrə düzgün deyil. Köhnə şifrəni unutmusunuzsa yeni açar yaradıla bilər — amma köhnə şəxsi mesajlar oxunmayacaq. Davam edilsin?', { ok: 'Yeni açar yarat', danger: true })) return;
    const cur = await A.ask('Hazırkı hesab şifrəniz', { input: true, type: 'password' }); if (!cur) return;
    try { await reauthenticateWithCredential(auth.currentUser, EmailAuthProvider.credential(auth.currentUser.email, cur)); await newIdentity(cur); await E.saveKey(uid, myKey); A.toast('✔️ Yeni açarlar yaradıldı'); buildDialogs(); if (curPeer) subscribe(); }
    catch { A.toast('❌ Şifrə səhvdir'); }
  }
}
async function newIdentity(pw) { const id = await E.createIdentity(pw); await setDoc(doc(db, 'keys', uid), id.rec); await updateDoc(doc(db, 'users', uid), { pub: id.pub }); me.pub = id.pub; myKey = id.privateKey; }
const peerOf = (r = room) => r && r.startsWith('dm_') ? users[r.split('_').find(x => x !== 'dm' && x !== uid)] : null;
async function roomKey(r) {
  if (!(window.crypto && crypto.subtle)) throw new Error('Şifrələmə üçün HTTPS və ya localhost lazımdır');
  if (!myKey) throw new Error('Şifrələmə açarı açılmayıb');
  const p = peerOf(r); if (!p) throw new Error('İstifadəçi tapılmadı');
  if (!p.pub) throw new Error('Bu istifadəçi hələ şifrələməni aktivləşdirməyib');
  const c = keyCache[r]; if (c && c.pub === p.pub) return c.k;
  const k = await E.dmKey(myKey, p.pub, uid, p.uid); keyCache[r] = { pub: p.pub, k }; return k;
}
const encryptMsg = async payload => E.encrypt(await roomKey(room), payload, room);
async function decryptAll(docs, r) {
  if (!r.startsWith('dm_')) return;
  let k = null;
  for (const d of docs) {
    const old = plain.get(d.id); if (old && !old.bad) continue;
    const m = d.data({ serverTimestamps: 'estimate' });
    if (!m.ct) { plain.set(d.id, { text: m.text || '', reply: m.reply }); continue; }
    try { k = k || await roomKey(r); plain.set(d.id, await E.decrypt(k, m, r)); } catch { plain.set(d.id, { text: '🔒 Mesaj açıla bilmədi', bad: true }); }
  }
}

// ---------- typing indicator ----------
function statusLine() {
  if (!ui || !room) return;
  const now = Date.now(), s = ui.sub, names = Object.values(typingMap).filter(x => now - x.at < 6000).map(x => (x.name || '').split(' ')[0]);
  if (names.length) { s.textContent = curPeer ? 'yazır...' : names.length > 2 ? names.length + ' nəfər yazır...' : names.join(', ') + ' yazır...'; s.style.color = 'var(--ac)'; return; }
  s.style.color = ''; const p = peerOf(); s.textContent = p ? (online[p.uid] ? 'onlayn' : '@' + p.username) : baseSub;
}
const tdoc = () => doc(db, 'typing', room + '__' + uid);
function typed() { if (!room) return; const n = Date.now(); if (n - lastTypeWrite > 2500) { lastTypeWrite = n; setDoc(tdoc(), { room, uid, name: me.name, at: serverTimestamp() }).catch(() => {}); } clearTimeout(typingTimer); typingTimer = setTimeout(stopTyping, 4000); }
function stopTyping() { clearTimeout(typingTimer); if (lastTypeWrite && room) { lastTypeWrite = 0; deleteDoc(tdoc()).catch(() => {}); } }
function listenTyping() {
  unsubT && unsubT(); typingMap = {};
  unsubT = onSnapshot(query(collection(db, 'typing'), where('room', '==', room)), s => { typingMap = {}; s.forEach(d => { const x = d.data({ serverTimestamps: 'estimate' }); if (x.uid !== uid) typingMap[x.uid] = { name: x.name, at: dt(x.at).getTime() }; }); statusLine(); }, () => {});
}

// ---------- contact info, block, report ----------
async function showInfo(id) {
  if (id === uid) { location.hash = '#/me'; return; }
  const u = await A.loadUser(id, true); if (!u) return A.toast('Məlumat tapılmadı');
  infoUser = u; fillInfo(); ui.info.classList.add('show');
}
function fillInfo() {
  if (!ui || !infoUser) return; const u = infoUser;
  A.avatar(ui.iav, u.name, u.photoURL); ui.inm.textContent = nameOf(u); ui.iun.textContent = '@' + u.username; ui.ist.textContent = online[u.uid] ? 'onlayn' : 'oflayn';
  ui.ibio.textContent = u.bio || ''; ui.ifp.classList.add('hidden');
  if (me.pub && u.pub) E.fingerprint(me.pub, u.pub).then(f => { if (!ui) return; ui.ifp.replaceChildren(h('small', null, '🔒 Təhlükəsizlik kodu (qarşı tərəflə müqayisə edin)'), h('code', null, f)); ui.ifp.classList.remove('hidden'); });
  const mk = (t, fn, cls) => { const b = h('button', 'btn' + (cls ? ' ' + cls : ''), t); b.onclick = fn; return b; };
  ui.ibtns.replaceChildren(
    mk('👤 Profil və anonim sual', () => { location.hash = '#/u/' + u.uid; }),
    mk('📞 Səsli zəng', () => { closeInfo(); startCall(u, false); }), mk('🎥 Video zəng', () => { closeInfo(); startCall(u, true); }),
    mk(blocked.has(u.uid) ? '✅ Blokdan çıxar' : '🚫 Blokla', () => toggleBlock(u), blocked.has(u.uid) ? '' : 'red'),
    mk('🚩 Şikayət et', () => A.report('user', u.uid, u, ''), 'red'));
}
function closeInfo() { ui && ui.info.classList.remove('show'); }
async function toggleBlock(u) {
  if (!u) return; const id = uid + '__' + u.uid;
  try {
    if (blocked.has(u.uid)) { await deleteDoc(doc(db, 'blocks', id)); A.toast('Blok götürüldü'); }
    else { if (!await A.ask(u.name + ' bloklansın? O sizə yaza, zəng edə və abunə ola bilməyəcək.', { ok: 'Blokla', danger: true })) return; await setDoc(doc(db, 'blocks', id), { owner: uid, target: u.uid, createdAt: serverTimestamp() }); A.toast('Bloklandı'); }
  } catch { A.toast('Alınmadı'); }
}
