import { auth, db } from './firebase.js';
import * as E from './crypto.js';
import { isBad } from './filter.js';
import * as Chat from './chat.js';
import { onAuthStateChanged, signOut, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { collection, query, where, orderBy, limit, startAt, endAt, documentId, onSnapshot, doc, getDoc, getDocs, getCountFromServer, addDoc, setDoc, updateDoc, deleteDoc, writeBatch, arrayUnion, arrayRemove, increment, Timestamp, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const $ = id => document.getElementById(id);
// every piece of user text goes through textContent => no XSS. innerHTML is used ONLY for the static icons below.
const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const dt = v => v && v.toDate ? v.toDate() : v ? new Date(v) : new Date();
function ago(d) { const s = (Date.now() - d.getTime()) / 1000; if (s < 60) return 'indi'; if (s < 3600) return Math.floor(s / 60) + ' dəq'; if (s < 86400) return Math.floor(s / 3600) + ' saat'; return d.toLocaleDateString(); }
const ICON = {
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/>',
  comment: '<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.2A8.4 8.4 0 0 1 12 3a8.5 8.5 0 0 1 9 8.5z"/>',
  more: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8.1 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
  video: '<path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/>',
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10a7 7 0 0 1-14 0M12 17v5M8 22h8"/>',
  send: '<path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>',
  reply: '<path d="M9 14L4 9l5-5"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  smile: '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/>',
  play: '<path d="M7 4l13 8-13 8z" fill="currentColor"/>',
  pause: '<path d="M7 4h4v16H7zM13 4h4v16h-4z" fill="currentColor"/>',
  back: '<path d="M15 5l-7 7 7 7"/>', gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'
};
const ico = n => { const s = h('span', 'ic'); s.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${ICON[n]}</svg>`; return s; };

let me, uid, following = new Set(), subs = [], hooks = [], cards = new Map(), storiesRow = null, stories = [], routeTok = 0, ftab = 'foryou', lim = 20, rankIds = null, fileCb = null;
const users = {};
let followsRes; const followsReady = new Promise(r => followsRes = r);
let np = { like: 1, comment: 1, follow: 1, sound: 1 };
try { np = { ...np, ...JSON.parse(localStorage.getItem('np')) }; } catch {}
const staff = () => me && ['admin', 'teacher'].includes(me.role);
const isMonitor = () => me && me.role === 'monitor';
const canMod = x => staff() || (isMonitor() && x.scope === 'class' && x.cls === me.schoolClass);
const BADGE = { admin: ' 🛡', teacher: ' 👩‍🏫', monitor: ' ⭐' };
const nameOf = u => u ? (u.name || '') + (u.verified ? ' ✔' : '') + (BADGE[u.role] || '') : '';
const empty = t => h('div', 'empty', t);

// ---------- helpers ----------
function toast(t) { const e = $('toast'); e.textContent = t; e.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.remove('show'), 2800); }
function ask(title, { input, ph = '', ok = 'OK', danger, val = '', type = 'text' } = {}) {
  return new Promise(res => {
    const i = $('di'), done = v => { $('ov').classList.add('hidden'); res(v); };
    $('dt').textContent = title; i.classList.toggle('hidden', !input); i.type = type; i.placeholder = ph; i.value = val;
    $('dok').textContent = ok; $('dok').className = danger ? 'dng' : 'pri';
    $('ov').classList.remove('hidden'); input && i.focus();
    $('dok').onclick = () => done(input ? i.value.trim() : true);
    $('dc').onclick = () => done(null);
    $('ov').onclick = e => { if (e.target === $('ov')) done(null); };
    i.onkeydown = e => { if (e.key === 'Enter') $('dok').click(); if (e.key === 'Escape') done(null); };
  });
}
let ac;
function beep() { try { ac = ac || new AudioContext(); const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = 660; g.gain.setValueAtTime(.07, ac.currentTime); g.gain.exponentialRampToValueAtTime(.001, ac.currentTime + .25); o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + .25); } catch {} }
function avatar(b, name, url) {
  b.textContent = ''; b.style.background = '';
  if (url && /^(https:\/\/|data:image\/jpeg;base64,)/.test(url)) { const i = h('img'); i.src = url; i.alt = ''; i.loading = 'lazy'; b.append(i); return; }
  const x = [...(name || '?')].reduce((a, c) => a + c.charCodeAt(0) * 7, 0) % 360;
  b.style.background = `linear-gradient(135deg,hsl(${x} 70% 58%),hsl(${(x + 40) % 360} 65% 45%))`; b.textContent = (name || '?')[0].toUpperCase();
}
async function loadUser(id, force) {
  if (!force && users[id]) return users[id];
  try { const s = await getDoc(doc(db, 'users', id)); if (s.exists()) users[id] = { uid: id, ...s.data() }; } catch {}
  return users[id];
}
// photo -> JPEG data URL under maxLen characters (images live inside Firestore: no paid Storage needed)
async function imgToData(file, side, maxLen) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  for (const sc of [1, .85, .7, .55, .4]) {
    const k = Math.min(1, side / Math.max(bmp.width, bmp.height)) * sc, c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    for (const q of [.8, .65, .5, .4]) { const u = c.toDataURL('image/jpeg', q); if (u.length <= maxLen) return u; }
  }
  throw new Error('too big');
}
async function squareAvatar(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }), s = Math.min(bmp.width, bmp.height), c = document.createElement('canvas');
  c.width = c.height = 160; c.getContext('2d').drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, 160, 160);
  let q = .85, u = c.toDataURL('image/jpeg', q); while (u.length > 20000 && q > .3) { q -= .1; u = c.toDataURL('image/jpeg', q); } return u;
}
function richText(p, text) {
  p.textContent = '';
  const re = /(https?:\/\/[^\s<]+|#[\p{L}\p{N}_]{2,30})/gu; let i = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > i) p.append(text.slice(i, m.index));
    if (m[0][0] === '#') { const t = h('span', 'tag', m[0]), tg = m[0].slice(1).toLowerCase(); t.onclick = e => { e.stopPropagation(); location.hash = '#/tag/' + encodeURIComponent(tg); }; p.append(t); }
    else { const a = h('a', 'inl', m[0]); a.href = m[0]; a.target = '_blank'; a.rel = 'noopener noreferrer nofollow'; a.onclick = e => e.stopPropagation(); p.append(a); }
    i = m.index + m[0].length;
  }
  if (i < text.length) p.append(text.slice(i));
}
const tagsOf = t => [...new Set((t.match(/#[\p{L}\p{N}_]{2,30}/gu) || []).map(x => x.slice(1).toLowerCase()))].slice(0, 5);
function pick(cb) { fileCb = cb; $('file').click(); }
$('file').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (!f || !fileCb) return; if (!/^image\//.test(f.type)) return toast('Şəkil seçin'); fileCb(f); };
function openModal(el) { $('mbox').replaceChildren(el); $('modal').classList.remove('hidden'); }
const closeModal = () => $('modal').classList.add('hidden');
$('modal').onclick = e => { if (e.target === $('modal')) closeModal(); };
function actionSheet(title, items) {
  const w = h('div'); if (title) w.append(h('h3', null, title));
  items.filter(Boolean).forEach(([t, fn, red]) => { const b = h('button', 'mbtn' + (red ? ' red' : ''), t); b.onclick = () => { closeModal(); fn(); }; w.append(b); });
  openModal(w);
}
async function report(kind, refId, t, text) {
  const reason = await ask('Şikayət səbəbi', { input: true, ph: 'Qısa izah edin', ok: 'Göndər', danger: true }); if (!reason) return;
  const d = { reporter: uid, reporterName: me.name, target: t.uid || 'anonymous', targetName: t.name || 'Anonim', targetUsername: t.username || '', reason: reason.slice(0, 300), kind, refId, createdAt: serverTimestamp() };
  if (text) d.msgText = String(text).slice(0, 300);
  try { await addDoc(collection(db, 'reports'), d); toast('✔️ Şikayət göndərildi'); } catch { toast('Göndərilə bilmədi'); }
}

// ---------- notifications + follows (the actor's client writes them; Firestore rules verify each one) ----------
async function notify(to, type, extra = {}) {
  const { id, ...rest } = extra, d = { to, from: uid, fromName: me.name, type, snippet: '', read: false, createdAt: serverTimestamp(), ...rest };
  try { if (id) await setDoc(doc(db, 'notifs', id), d); else await addDoc(collection(db, 'notifs'), d); } catch {}
}
async function follow(t) { try { await setDoc(doc(db, 'follows', uid + '__' + t), { follower: uid, target: t, createdAt: serverTimestamp() }); notify(t, 'follow', { id: 'follow_' + uid + '_' + t }); } catch { toast('Alınmadı'); } }
async function unfollow(t) { try { await deleteDoc(doc(db, 'follows', uid + '__' + t)); } catch { toast('Alınmadı'); } }
function startFollows() {
  onSnapshot(query(collection(db, 'follows'), where('follower', '==', uid)), s => { following = new Set(s.docs.map(d => d.data().target)); followsRes(); hooks.forEach(f => f()); }, () => followsRes());
}
function startNotifBadge() {
  let first = true;
  onSnapshot(query(collection(db, 'notifs'), where('to', '==', uid), where('read', '==', false)), s => {
    $('nb').textContent = s.size > 9 ? '9+' : s.size; $('nb').classList.toggle('hidden', !s.size);
    if (!first && np.sound) s.docChanges().forEach(c => c.type === 'added' && beep());
    first = false;
  }, () => {});
}
async function toggleLike(p) {
  const liked = (p.likedBy || []).includes(uid);
  try { await updateDoc(doc(db, 'posts', p.id), { likedBy: liked ? arrayRemove(uid) : arrayUnion(uid) }); if (!liked && p.uid !== uid) notify(p.uid, 'like', { postId: p.id, id: 'like_' + p.id + '_' + uid }); }
  catch { toast('Alınmadı'); }
}

// ---------- start + router ----------
onAuthStateChanged(auth, async u => {
  if (!u) return location.replace('start.html');
  try { await u.reload(); } catch {}
  if (!u.emailVerified) return location.replace('start.html');
  try { await u.getIdToken(true); } catch {}
  uid = u.uid;
  const s = await getDoc(doc(db, 'users', uid)).catch(() => null);
  if (!s || !s.exists()) { await signOut(auth).catch(() => {}); return location.replace('start.html'); }
  me = { uid, ...s.data() }; users[uid] = me;
  if (me.banned) { toast('Hesabınız bloklanıb'); return; }
  getDoc(doc(db, 'usernames', me.username)).then(x => { const n = (me.name || '').toLowerCase(); if (x.exists() && x.data().uid === uid && x.data().n !== n) updateDoc(x.ref, { n }); }).catch(() => {}); // keeps people-search up to date
  startFollows(); startNotifBadge(); startStories(); cleanStories();
  Chat.init({ auth, db, uid, me, users, h, ico, ask, toast, avatar, loadUser, beep, report, mount, setBadge: n => { $('cb').textContent = n > 9 ? '9+' : n; $('cb').classList.toggle('hidden', !n); } });
  addEventListener('hashchange', route); route();
});
function route() {
  const parts = (location.hash.replace(/^#\/?/, '') || 'chat').split('/'), name = parts[0], arg = decodeURIComponent(parts.slice(1).join('/') || '');
  if (name === 'chat' && Chat.mounted()) { Chat.open(arg); return; }   // switching chats does not rebuild the list
  if (Chat.mounted()) Chat.leave();
  document.body.classList.remove('chatmode', 'convopen'); if (name === 'chat') document.body.classList.add('chatmode');
  subs.forEach(f => { try { f(); } catch {} }); subs = []; hooks = []; cards.clear(); storiesRow = null; closeModal(); routeTok++;
  const fn = { chat: viewChat, feed: viewFeed, search: viewSearch, notifs: viewNotifs, me: () => viewProfile(uid), u: viewProfile, post: viewPost, tag: viewTag }[name] || viewChat;
  $('fab').classList.toggle('hidden', !['feed', ''].includes(name === 'feed' || !parts[0] ? 'feed' : name));
  document.querySelectorAll('#tabbar a').forEach(a => a.classList.toggle('on', a.dataset.r === (name === 'u' && arg === uid ? 'me' : name)));
  fn(arg); scrollTo(0, 0);
}
const mount = (...els) => $('view').replaceChildren(...els);
function viewChat(arg) { Chat.view(arg); }
function top(title, right) {
  const t = h('div', 'top'), b = h('button', 'icb'); b.append(ico('back')); b.onclick = () => history.length > 1 ? history.back() : (location.hash = '#/feed');
  t.append(b, h('b', null, title)); if (right) t.append(h('span', 'grow'), right); return t;
}
const errBox = err => { const b = h('div', 'empty'); b.textContent = 'Xəta: ' + err.message + '\n(İlk dəfədirsə, konsoldakı linkə klikləyib indeks yaradın.)'; return b; };

// ---------- feed ----------
function viewFeed() {
  const head = h('div', 'top'); head.append(h('b', 'logo', 'LawApp'));
  const st = h('div', 'stories'); storiesRow = st; renderStories();
  const seg = h('div', 'seg'), list = h('div'), more = h('button', 'more hidden', 'Daha çox');
  [['foryou', 'Sənin üçün'], ['class', 'Sinif'], ['follow', 'Abunəliklər'], ['news', '📢 Elanlar']].forEach(([k, t]) => { const b = h('button', k === ftab ? 'on' : '', t); b.onclick = () => { ftab = k; lim = 20; route(); }; seg.append(b); });
  more.onclick = () => { lim += 20; route(); };
  mount(head, st, seg, list, more);
  subscribeFeed(list, more);
}
async function subscribeFeed(list, more) {
  const tok = routeTok; let cons;
  if (ftab === 'class') { if (!me.schoolClass) return list.replaceChildren(empty('Sinfiniz təyin olunmayıb. Admin sinfi təyin etməlidir.')); cons = [where('scope', '==', 'class'), where('cls', '==', me.schoolClass)]; }
  else if (ftab === 'follow') {
    await followsReady; if (tok !== routeTok) return;
    const ids = [...following].slice(0, 30);
    if (!ids.length) return list.replaceChildren(empty('Hələ heç kimə abunə deyilsiniz.\nAxtarışdan insanları tapıb abunə olun.'));
    cons = [where('scope', '==', 'school'), where('uid', 'in', ids)];
  } else cons = [where('scope', '==', ftab === 'news' ? 'news' : 'school')];
  rankIds = null;
  subs.push(onSnapshot(query(collection(db, 'posts'), ...cons, orderBy('createdAt', 'desc'), limit(lim)), snap => {
    let docs = snap.docs.map(d => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }));
    docs = ftab === 'foryou' ? ranked(docs) : docs.sort((a, b) => (b.pin ? 1 : 0) - (a.pin ? 1 : 0));
    renderCards(list, docs, ftab === 'news' ? 'Hələ elan yoxdur.' : 'Hələ paylaşım yoxdur. İlk siz yazın ✨'); more.classList.toggle('hidden', snap.size < lim);
  }, err => list.replaceChildren(errBox(err))));
}
// "For you": popular posts rise, new posts appear on top; order stays stable while you read
function ranked(docs) {
  if (!rankIds) { const now = Date.now(), sc = p => ((p.likedBy || []).length * 2 + 1) / Math.pow((now - dt(p.createdAt)) / 36e5 + 2, 1.3); rankIds = docs.slice().sort((a, b) => sc(b) - sc(a)).map(p => p.id); }
  const by = new Map(docs.map(p => [p.id, p])), known = new Set(rankIds);
  rankIds = [...docs.filter(p => !known.has(p.id)).map(p => p.id), ...rankIds.filter(i => by.has(i))];
  return rankIds.map(i => by.get(i));
}
function renderCards(list, docs, emptyMsg) {
  const els = docs.map(p => { let c = cards.get(p.id); if (!c) { c = makeCard(p); cards.set(p.id, c); } c.update(p); return c.el; });
  list.replaceChildren(...(els.length ? els : [empty(emptyMsg || 'Boşdur')]));
}
function makeCard(p0, full) {
  let p = p0;
  const el = h('article', 'card'), head = h('div', 'ph'), avw = h('div', 'avw'), av = h('div', 'av sm'), plus = h('button', 'plus', '+');
  const who = h('div', 'grow'), nm = h('b'), tm = h('div', 's'), mb = h('button', 'icb'); mb.append(ico('more'));
  avw.append(av, plus); who.append(nm, tm); head.append(avw, who, mb);
  const pinEl = h('div', 'pin hidden', '📌 Sabitlənib'), body = h('div', 'pbody'), img = h('img', 'pimg'), chips = h('div', 'chips'), act = h('div', 'pact');
  const like = h('button', 'act'), cmt = h('button', 'act'), likeN = h('span'), cmtN = h('span', null, '0');
  like.append(ico('heart'), likeN); cmt.append(ico('comment'), cmtN); act.append(like, cmt);
  el.append(head, pinEl, body, img, chips, act);
  const open = () => { if (!full) location.hash = '#/post/' + p.id; };
  avw.onclick = nm.onclick = e => { if (e.target === plus) return; location.hash = '#/u/' + p.uid; };
  plus.onclick = e => { e.stopPropagation(); follow(p.uid); };
  body.onclick = img.onclick = open; cmt.onclick = open;
  like.onclick = () => toggleLike(p);
  mb.onclick = () => actionSheet('', [
    ['🔗 Linki kopyala', () => navigator.clipboard && navigator.clipboard.writeText(location.href.split('#')[0] + '#/post/' + p.id).then(() => toast('Link kopyalandı'))],
    p.uid !== uid && ['🚩 Şikayət et', () => report('post', p.id, p, p.text || '[şəkil]'), true],
    (p.uid === uid || canMod(p)) && ['🗑 Sil', async () => { if (await ask('Paylaşım silinsin?', { ok: 'Sil', danger: true })) deleteDoc(doc(db, 'posts', p.id)).then(() => { toast('Silindi'); if (full) history.back(); }).catch(() => toast('Silmək mümkün olmadı')); }, true],
    staff() && p.uid !== uid && ['🚫 İstifadəçini blokla', async () => { if (await ask(p.name + ' bloklansın?', { ok: 'Blokla', danger: true })) updateDoc(doc(db, 'users', p.uid), { banned: true }).then(() => toast('Bloklandı')).catch(() => toast('Alınmadı')); }, true]
  ]);
  function refresh() { plus.classList.toggle('hidden', p.uid === uid || following.has(p.uid)); }
  hooks.push(refresh);
  function update(np2) {
    p = np2; nm.textContent = p.name; tm.textContent = `@${p.username}${p.cls ? ' • ' + p.cls : ''} • ${ago(dt(p.createdAt))}`;
    loadUser(p.uid).then(u => { avatar(av, p.name, u && u.photoURL); if (u) nm.textContent = nameOf(u); });
    body.classList.toggle('hidden', !p.text); richText(body, p.text || '');
    if (p.img) { if (img.dataset.k !== String(p.img.length)) { img.src = p.img; img.dataset.k = String(p.img.length); } img.classList.remove('hidden'); } else img.classList.add('hidden');
    chips.replaceChildren(...(p.tags || []).map(t => { const c = h('button', 'chip', '#' + t); c.onclick = () => { location.hash = '#/tag/' + encodeURIComponent(t); }; return c; }));
    const liked = (p.likedBy || []).includes(uid); like.classList.toggle('liked', liked); likeN.textContent = (p.likedBy || []).length;
    pinEl.classList.toggle('hidden', !p.pin); refresh();
  }
  const cons = [where('pid', '==', p0.id), where('scope', '==', p0.scope)]; if (p0.scope === 'class') cons.push(where('cls', '==', p0.cls));
  getCountFromServer(query(collection(db, 'comments'), ...cons)).then(r => { cmtN.textContent = r.data().count; }).catch(() => {});
  return { el, update, setCount: n => { cmtN.textContent = n; }, focusComment: () => {} };
}

// ---------- new post ----------
$('fab').onclick = () => openComposer();
function openComposer() {
  let scope = ftab === 'class' ? 'class' : ftab === 'news' && staff() ? 'news' : 'school', img = '';
  const w = h('div'), ta = h('textarea'), prev = h('img', 'prev hidden'), tagsEl = h('div', 'chips'), pills = h('div', 'pills'), row = h('div', 'crow');
  ta.maxLength = 500; ta.placeholder = 'Nə var nə yox? #hashtag əlavə edin';
  ta.oninput = () => tagsEl.replaceChildren(...tagsOf(ta.value).map(t => h('span', 'chip', '#' + t)));
  const opts = [['school', 'Məktəb'], me.schoolClass && ['class', 'Sinif ' + me.schoolClass], staff() && ['news', '📢 Elan']].filter(Boolean);
  opts.forEach(([k, t]) => { const b = h('button', k === scope ? 'on' : '', t); b.onclick = () => { scope = k; [...pills.children].forEach(x => x.classList.toggle('on', x === b)); pinL.classList.toggle('hidden', !((staff() || isMonitor()) && scope !== 'school')); }; pills.append(b); });
  const pinL = h('label', 'chip hidden'), pin = h('input'); pin.type = 'checkbox'; pinL.append(pin, ' 📌 Sabitlə'); pinL.classList.toggle('hidden', !((staff() || isMonitor()) && scope !== 'school'));
  const ib = h('button', 'go ghost', '📷 Şəkil'), pb = h('button', 'go', 'Paylaş'); pb.style.marginLeft = 'auto';
  ib.onclick = () => pick(async f => { try { img = await imgToData(f, 720, 110000); prev.src = img; prev.classList.remove('hidden'); } catch { toast('Şəkil işlənmədi'); } });
  pb.onclick = async () => {
    const text = ta.value.trim();
    if (!text && !img) return toast('Mətn və ya şəkil əlavə edin');
    if (isBad(text)) return toast('Mətndə qadağan olunmuş söz var. Nəzakətli olun 🙂');
    pb.disabled = true;
    try {
      const tags = tagsOf(text), b = writeBatch(db);
      b.set(doc(collection(db, 'posts')), { uid, name: me.name, username: me.username, cls: me.schoolClass || '', scope, img, text, tags, pin: pin.checked && scope !== 'school', likedBy: [], createdAt: serverTimestamp() });
      tags.forEach(t => b.set(doc(db, 'tags', t), { count: increment(1), last: serverTimestamp() }, { merge: true }));
      await b.commit(); closeModal(); toast('✔️ Paylaşıldı');
    } catch (e) { pb.disabled = false; toast('Paylaşılmadı' + (e.code === 'permission-denied' ? ' (icazə yoxdur)' : '')); }
  };
  row.append(ib, pinL, pb);
  w.append(h('h3', null, 'Yeni paylaşım'), ta, prev, tagsEl, pills, row); openModal(w); ta.focus();
}

// ---------- post page + threaded comments ----------
function viewPost(id) {
  const holder = h('div'), cl = h('div'), form = h('form', 'cbar'), inp = h('input'), sb = h('button', null, '➤'), rc = h('div', 'rchip hidden');
  inp.placeholder = 'Şərh yaz...'; inp.maxLength = 300; sb.type = 'submit'; form.append(inp, sb);
  let c = null, p = null, par = null;
  mount(top('Paylaşım'), holder, rc, form, cl);
  subs.push(onSnapshot(doc(db, 'posts', id), s => {
    if (!s.exists()) return holder.replaceChildren(empty('Paylaşım tapılmadı'));
    p = { id, ...s.data({ serverTimestamps: 'estimate' }) };
    if (!c) { c = makeCard(p, true); holder.replaceChildren(c.el); listenComments(); }
    c.update(p);
  }, err => holder.replaceChildren(errBox(err))));
  function setPar(x) { par = x; rc.classList.toggle('hidden', !x); rc.textContent = x ? '↩ @' + x.name + ' adlı istifadəçiyə cavab (ləğv et üçün toxunun)' : ''; if (x) inp.focus(); }
  rc.onclick = () => setPar(null);
  function listenComments() {
    const cons = [where('pid', '==', id), where('scope', '==', p.scope)]; if (p.scope === 'class') cons.push(where('cls', '==', p.cls));
    subs.push(onSnapshot(query(collection(db, 'comments'), ...cons), snap => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) })).sort((a, b) => dt(a.createdAt) - dt(b.createdAt));
      c.setCount(all.length);
      const out = []; all.filter(x => !x.parent).forEach(t => { out.push(crow(t, false)); all.filter(x => x.parent === t.id).forEach(r => out.push(crow(r, true))); });
      cl.replaceChildren(...(out.length ? out : [empty('Hələ şərh yoxdur. İlk siz yazın!')]));
    }, err => cl.replaceChildren(errBox(err))));
  }
  function crow(x, rep) {
    const r = h('div', 'cm' + (rep ? ' rep' : '')), av = h('div', 'av xs'), b = h('div', 'cb'), nm = h('b', null, x.name), tx = h('div'), acts = h('div', 'acts');
    avatar(av, x.name); loadUser(x.uid).then(u => u && avatar(av, u.name, u.photoURL));
    nm.onclick = av.onclick = () => { location.hash = '#/u/' + x.uid; };
    if (x.rname) { const t = h('span', 'tag', '@' + x.rname + ' '); tx.append(t); } const sp = h('span'); richText(sp, x.text); tx.append(sp);
    const rb = h('button', null, 'Cavab ver'); rb.onclick = () => setPar({ id: x.parent || x.id, uid: x.uid, name: x.name }); acts.append(h('span', 's', ago(dt(x.createdAt))), rb);
    if (x.uid !== uid) { const fb = h('button', null, '🚩'); fb.onclick = () => report('comment', x.id, x, x.text); acts.append(fb); }
    if (x.uid === uid || canMod(x)) { const d = h('button', null, '🗑'); d.onclick = () => deleteDoc(doc(db, 'comments', x.id)).catch(() => toast('Silinmədi')); acts.append(d); }
    b.append(nm, tx, acts); r.append(av, b); return r;
  }
  form.onsubmit = async e => {
    e.preventDefault(); const t = inp.value.trim(); if (!t || !p) return;
    if (isBad(t)) return toast('Qadağan olunmuş söz var. Nəzakətli olun 🙂');
    const pp = par; inp.value = ''; setPar(null);
    try {
      const cr = await addDoc(collection(db, 'comments'), { pid: id, scope: p.scope, cls: p.cls, uid, name: me.name, username: me.username, text: t, createdAt: serverTimestamp(), ...(pp ? { parent: pp.id, rname: pp.name } : {}) });
      const sn = t.slice(0, 80);
      if (p.uid !== uid && !(pp && pp.uid === p.uid)) notify(p.uid, 'comment', { postId: id, cid: cr.id, snippet: sn });
      if (pp && pp.uid !== uid) notify(pp.uid, 'reply', { postId: id, cid: cr.id, snippet: sn });
    } catch { toast('Göndərilmədi'); }
  };
}

// ---------- hashtag page ----------
function viewTag(tag) {
  const list = h('div'); mount(top('#' + tag), list);
  subs.push(onSnapshot(query(collection(db, 'posts'), where('scope', '==', 'school'), where('tags', 'array-contains', tag), orderBy('createdAt', 'desc'), limit(30)),
    s => renderCards(list, s.docs.map(d => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) })), 'Bu hashtag ilə hələ paylaşım yoxdur.'), err => list.replaceChildren(errBox(err))));
}

// ---------- search: people + hashtags ----------
function viewSearch() {
  let mode = 'people', timer;
  const box = h('div', 'sbox'), inp = h('input'), seg = h('div', 'seg'), out = h('div');
  inp.placeholder = 'İnsan (@ad) və ya #hashtag axtar'; inp.autocomplete = 'off'; box.append(inp);
  [['people', 'Adamlar'], ['tags', 'Hashtaglar']].forEach(([k, t]) => { const b = h('button', k === mode ? 'on' : '', t); b.dataset.k = k; b.onclick = () => { mode = k; [...seg.children].forEach(x => x.classList.toggle('on', x === b)); run(); }; seg.append(b); });
  mount(top('Axtarış'), box, seg, out);
  inp.oninput = () => { if (inp.value.trim().startsWith('#') && mode !== 'tags') seg.children[1].click(); clearTimeout(timer); timer = setTimeout(run, 300); };
  run();
  async function run() {
    const q = inp.value.trim().toLowerCase().replace(/^[@#]/, ''), tok = routeTok;
    try {
      if (mode === 'tags') {
        const snap = q ? await getDocs(query(collection(db, 'tags'), orderBy(documentId()), startAt(q), endAt(q + '\uf8ff'), limit(10)))
                       : await getDocs(query(collection(db, 'tags'), orderBy('count', 'desc'), limit(10)));
        if (tok !== routeTok) return;
        const rows = snap.docs.map(d => { const r = h('div', 'trow'); r.append(h('b', null, '#' + d.id), h('span', 's', (d.data().count || 0) + ' paylaşım')); r.onclick = () => { location.hash = '#/tag/' + encodeURIComponent(d.id); }; return r; });
        out.replaceChildren(h('div', 'h3', q ? 'Nəticələr' : '🔥 Trend hashtaglar'), ...(rows.length ? rows : [empty('Hashtag tapılmadı.')]));
      } else {
        if (!q) return out.replaceChildren(empty('Ad və ya istifadəçi adı yazın.\nMəsələn: ali və ya @ali_200'));
        const [a, b] = await Promise.all([
          getDocs(query(collection(db, 'usernames'), orderBy(documentId()), startAt(q), endAt(q + '\uf8ff'), limit(8))),
          getDocs(query(collection(db, 'usernames'), orderBy('n'), startAt(q), endAt(q + '\uf8ff'), limit(8))).catch(() => ({ docs: [] }))
        ]);
        const ids = [...new Set([...a.docs, ...b.docs].map(d => d.data().uid))].slice(0, 12);
        const found = (await Promise.all(ids.map(i => loadUser(i)))).filter(Boolean);
        if (tok !== routeTok) return;
        out.replaceChildren(...(found.length ? found.map(userRow) : [empty('Heç kim tapılmadı.')]));
      }
    } catch (err) { out.replaceChildren(errBox(err)); }
  }
}
function userRow(u) {
  const r = h('div', 'urow'), av = h('div', 'av sm'), b = h('div', 'grow'); avatar(av, u.name, u.photoURL);
  b.append(h('b', null, nameOf(u)), h('div', 's', '@' + u.username + (u.schoolClass ? ' • ' + u.schoolClass : '')));
  r.append(av, b); r.onclick = () => { closeModal(); location.hash = '#/u/' + u.uid; };
  if (u.uid !== uid) {
    const fb = h('button', 'go'); const set = () => { const f = following.has(u.uid); fb.textContent = f ? 'Abunəsiniz' : 'Abunə ol'; fb.classList.toggle('ghost', f); }; set(); hooks.push(set);
    fb.onclick = e => { e.stopPropagation(); following.has(u.uid) ? unfollow(u.uid) : follow(u.uid); }; r.append(fb);
  }
  return r;
}

// ---------- notifications ----------
const NTXT = { like: 'paylaşımınızı bəyəndi', comment: 'paylaşımınıza şərh yazdı', reply: 'şərhinizə cavab verdi', follow: 'sizə abunə oldu' };
function viewNotifs() {
  const list = h('div'), all = h('button', 'go ghost', 'Hamısı oxundu'); let items = [];
  const markAll = () => items.filter(n => !n.read).forEach(n => updateDoc(doc(db, 'notifs', n.id), { read: true }).catch(() => {}));
  all.onclick = markAll; mount(top('Bildirişlər', all), list);
  subs.push(onSnapshot(query(collection(db, 'notifs'), where('to', '==', uid)), snap => {
    items = snap.docs.map(d => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) })).sort((a, b) => dt(b.createdAt) - dt(a.createdAt)).slice(0, 60);
    const shown = items.filter(n => np[n.type === 'reply' ? 'comment' : n.type] !== 0);
    list.replaceChildren(...(shown.length ? shown.map(nrow) : [empty('Hələ bildiriş yoxdur.')]));
  }, err => list.replaceChildren(errBox(err))));
  subs.push(markAll);   // leaving the page marks everything as read
}
function nrow(n) {
  const r = h('div', 'nrow' + (n.read ? '' : ' unread')), av = h('div', 'av sm'), b = h('div', 'grow'), line = h('div');
  avatar(av, n.fromName); loadUser(n.from).then(u => u && avatar(av, u.name, u.photoURL));
  line.append(h('b', null, n.fromName), ' ' + (NTXT[n.type] || '')); b.append(line);
  if (n.snippet) b.append(h('div', 's', n.snippet)); b.append(h('div', 's', ago(dt(n.createdAt))));
  r.append(av, b);
  r.onclick = () => { if (!n.read) updateDoc(doc(db, 'notifs', n.id), { read: true }).catch(() => {}); location.hash = n.type === 'follow' ? '#/u/' + n.from : '#/post/' + n.postId; };
  return r;
}

// ---------- profile ----------
async function viewProfile(id) {
  const tok = routeTok; mount(top('Profil'), empty('Yüklənir...'));
  const u = await loadUser(id, true); if (tok !== routeTok) return;
  if (!u) return mount(top('Profil'), empty('İstifadəçi tapılmadı'));
  const mine = id === uid, x = [...id].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  const gear = mine ? h('button', 'icb') : null; if (gear) { gear.append(ico('gear')); gear.onclick = () => openSettings(); }
  const banner = h('div', 'banner'); banner.style.background = `linear-gradient(135deg,hsl(${x} 60% 40%),hsl(${(x + 70) % 360} 65% 28%))`;
  const av = h('div', 'av pav'); avatar(av, u.name, u.photoURL);
  const head = h('div', 'phead'), counts = h('div', 'counts'), fr = h('button', 'cnt'), fg = h('button', 'cnt'), btns = h('div', 'btns');
  head.append(av, h('h2', null, nameOf(u)), h('div', 's', '@' + u.username + (u.schoolClass ? ' • ' + u.schoolClass + ' sinfi' : '')));
  if (u.bio) head.append(h('div', 'bio', u.bio));
  counts.append(fr, fg); head.append(counts, btns);
  async function counts_() {
    try {
      const [a, b] = await Promise.all([getCountFromServer(query(collection(db, 'follows'), where('target', '==', id))), getCountFromServer(query(collection(db, 'follows'), where('follower', '==', id)))]);
      fr.replaceChildren(h('b', null, String(a.data().count)), h('span', null, 'abunəçi')); fg.replaceChildren(h('b', null, String(b.data().count)), h('span', null, 'abunəlik'));
    } catch {}
  }
  counts_(); fr.onclick = () => showUsers('Abunəçilər', 'target', 'follower', id); fg.onclick = () => showUsers('Abunəliklər', 'follower', 'target', id);
  if (mine) { const e = h('button', 'go', 'Redaktə et'); e.onclick = () => openSettings('account'); btns.append(e); }
  else {
    const fb = h('button', 'go'); const set = () => { const f = following.has(id); fb.textContent = f ? 'Abunəsiniz' : 'Abunə ol'; fb.classList.toggle('ghost', f); }; set(); hooks.push(set);
    fb.onclick = async () => { following.has(id) ? await unfollow(id) : await follow(id); setTimeout(counts_, 700); };
    const m = h('a', 'go ghost', '💬 Mesaj'); m.href = '#/chat/@' + u.username;
    btns.append(fb, m);
    if (u.askOpen !== false) { const q = h('button', 'go ghost', '❓ Anonim sual'); q.onclick = () => sendAsk(u); btns.append(q); }
    if (staff() && u.role !== 'admin') { const bb = h('button', 'go red', u.banned ? 'Blokdan çıxar' : '🚫 Blokla'); bb.onclick = async () => { if (await ask((u.banned ? 'Blokdan çıxarılsın: ' : 'Bloklansın: ') + u.name + '?', { ok: 'Bəli', danger: true })) updateDoc(doc(db, 'users', id), { banned: !u.banned }).then(() => { u.banned = !u.banned; bb.textContent = u.banned ? 'Blokdan çıxar' : '🚫 Blokla'; }).catch(() => toast('Alınmadı')); }; btns.append(bb); }
  }
  const seg = h('div', 'seg'), area = h('div');
  const tabs = [['posts', 'Paylaşımlar'], ['qa', mine ? 'Suallar' : 'Cavablar']]; let cur = 'posts', stop = null;
  const show = k => { cur = k; stop && stop(); stop = null; [...seg.children].forEach(b => b.classList.toggle('on', b.dataset.k === k)); k === 'posts' ? postsGrid(area, id) : qaPane(area, id, mine, f => { stop = f; }); };
  tabs.forEach(([k, t]) => { const b = h('button', k === cur ? 'on' : '', t); b.dataset.k = k; b.onclick = () => show(k); seg.append(b); });
  subs.push(() => stop && stop());
  mount(top(mine ? 'Profilim' : 'Profil', gear), banner, head, seg, area); show('posts');
}
function postsGrid(area, id) {
  area.replaceChildren(empty('Yüklənir...'));
  getDocs(query(collection(db, 'posts'), where('uid', '==', id), where('scope', '==', 'school'), orderBy('createdAt', 'desc'), limit(24))).then(s => {
    if (s.empty) return area.replaceChildren(empty('Hələ paylaşım yoxdur.'));
    const g = h('div', 'grid');
    s.forEach(d => { const p = d.data(), c = h('div', 'cell'); if (p.img) { const i = h('img'); i.src = p.img; i.alt = ''; c.append(i); } else c.append(h('span', null, p.text)); c.onclick = () => { location.hash = '#/post/' + d.id; }; g.append(c); });
    area.replaceChildren(g);
  }).catch(err => area.replaceChildren(errBox(err)));
}
async function showUsers(title, qField, uField, id) {
  const w = h('div'); w.append(h('h3', null, title), empty('Yüklənir...')); openModal(w);
  try {
    const s = await getDocs(query(collection(db, 'follows'), where(qField, '==', id), limit(50)));
    const list = (await Promise.all(s.docs.map(d => loadUser(d.data()[uField])))).filter(Boolean);
    w.replaceChildren(h('h3', null, title), ...(list.length ? list.map(userRow) : [empty('Hələ heç kim yoxdur.')]));
  } catch { w.replaceChildren(h('h3', null, title), empty('Yüklənmədi')); }
}

// ---------- anonymous questions ----------
async function sendAsk(to) {
  const t = await ask('Anonim sual (@' + to.username + ')', { input: true, ph: 'Sualınızı yazın', ok: 'Göndər' }); if (!t) return;
  if (t.length < 3 || t.length > 200) return toast('Sual 3–200 simvol olmalıdır');
  if (isBad(t)) return toast('Qadağan olunmuş söz var. Nəzakətli olun 🙂');
  const id = doc(collection(db, 'asks')).id, b = writeBatch(db);
  b.set(doc(db, 'asks', id), { to: to.uid, text: t, createdAt: serverTimestamp(), answered: false, answer: '' });
  b.set(doc(db, 'askAuthors', id), { uid, to: to.uid, createdAt: serverTimestamp() });   // admins can trace abuse; the receiver cannot see this
  try { await b.commit(); toast('✔️ Sual anonim göndərildi'); } catch { toast('Göndərilmədi (istifadəçi sualları bağlamış ola bilər)'); }
}
function qaPane(area, id, mine, setStop) {
  if (!mine) {
    area.replaceChildren(empty('Yüklənir...'));
    return getDocs(query(collection(db, 'asks'), where('to', '==', id), where('answered', '==', true))).then(s => {
      const list = s.docs.map(d => d.data()).sort((a, b) => dt(b.answeredAt) - dt(a.answeredAt));
      area.replaceChildren(...(list.length ? list.map(a => { const c = h('div', 'card qa'); c.append(h('div', 'q', '❓ ' + a.text), h('div', 'a', a.answer)); return c; }) : [empty('Hələ cavablanmış sual yoxdur.')]));
    }).catch(() => area.replaceChildren(empty('Suallar yüklənmədi.')));
  }
  setStop(onSnapshot(query(collection(db, 'asks'), where('to', '==', uid)), s => {
    const items = s.docs.map(d => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) })).sort((a, b) => (a.answered - b.answered) || dt(b.createdAt) - dt(a.createdAt));
    const info = h('div', 'card s'); info.textContent = 'Sizə anonim suallar göndərilə bilər. Göndərən sizə görünmür, amma sui-istifadə halında adminlər onu müəyyən edə bilər. Cavab verdiyiniz suallar profilinizdə görünür.';
    const els = [info]; if (!items.length) els.push(empty('Hələ sual yoxdur.'));
    items.forEach(a => {
      const c = h('div', 'card qa'); c.append(h('div', 'q', '❓ ' + a.text));
      if (a.answered) c.append(h('div', 'a', a.answer));
      else {
        const inp = h('input'); inp.maxLength = 300; inp.placeholder = 'Cavabınız (hamıya görünəcək)';
        const b = h('button', 'go', 'Cavabla'); b.style.marginTop = '8px';
        b.onclick = async () => { const t = inp.value.trim(); if (!t) return; if (isBad(t)) return toast('Qadağan olunmuş söz var'); try { await updateDoc(doc(db, 'asks', a.id), { answer: t, answered: true, answeredAt: serverTimestamp() }); } catch { toast('Alınmadı'); } };
        c.append(inp, b);
      }
      const row = h('div', 'crow'), del = h('button', 'go ghost', '🗑 Sil'), rp = h('button', 'go ghost', '🚩 Şikayət');
      del.onclick = () => deleteDoc(doc(db, 'asks', a.id)).catch(() => toast('Silinmədi')); rp.onclick = () => report('ask', a.id, {}, a.text);
      row.append(del, rp); c.append(row); els.push(c);
    });
    area.replaceChildren(...els);
  }, err => area.replaceChildren(errBox(err))));
}

// ---------- settings (profile edit, theme, security, privacy, notifications) ----------
const srow = (title, desc, ctrl, onclick) => { const r = h('div', 'srow' + (onclick ? ' click' : '')), b = h('div', 'grow'); b.append(h('b', null, title)); if (desc) b.append(h('span', null, desc)); r.append(b); if (ctrl) r.append(ctrl); if (onclick) r.onclick = onclick; return r; };
const sw = (on, fn) => { const l = h('label', 'sw'), i = h('input'); i.type = 'checkbox'; i.checked = !!on; i.onchange = () => fn(i.checked); l.append(i, h('span')); return l; };
async function saveField(patch, ok) { try { await updateDoc(doc(db, 'users', uid), patch); Object.assign(me, patch); toast(ok || '✔️ Yeniləndi'); return true; } catch (e) { toast('Xəta: ' + (e.code === 'permission-denied' ? 'icazə yoxdur' : e.message)); return false; } }
function openSettings(sec = 'account') {
  const w = h('div'), nav = h('div', 'snav'), body = h('div'), done = h('button', 'go ghost', 'Bağla'); done.onclick = closeModal;
  const SEC = {
    account: () => {
      const av = h('div', 'av'); avatar(av, me.name, me.photoURL);
      const pb = h('button', 'go ghost', '📷 Şəkli dəyiş'), rb = h('button', 'go ghost', 'Sil');
      pb.onclick = () => pick(async f => { try { if (await saveField({ photoURL: await squareAvatar(f) }, '✔️ Şəkil yeniləndi')) openSettings('account'); } catch { toast('Şəkil yüklənmədi'); } });
      rb.onclick = async () => { if (await ask('Profil şəkli silinsin?', { ok: 'Sil', danger: true })) { await saveField({ photoURL: '' }, 'Şəkil silindi'); openSettings('account'); } };
      const pr = h('div', 'crow'); pr.append(pb); if (me.photoURL) pr.append(rb);
      const top_ = h('div', 'srow'); top_.append(av, pr);
      return [top_,
        srow('Ad', me.name, null, async () => { const v = await ask('Ad və soyad', { input: true, val: me.name, ok: 'Yadda saxla' }); if (v === null) return; if (v.length < 2 || v.length > 40) return toast('Ad 2–40 simvol olmalıdır'); if (await saveField({ name: v })) openSettings('account'); }),
        srow('İstifadəçi adı', '@' + me.username, null, changeUsername),
        srow('Haqqında', me.bio || 'Özünüz haqqında yazın', null, async () => { const v = await ask('Haqqında (maks. 140 simvol)', { input: true, val: me.bio || '', ok: 'Yadda saxla' }); if (v === null) return; if (v.length > 140) return toast('Maksimum 140 simvol'); if (await saveField({ bio: v })) openSettings('account'); }),
        srow('Sinif', (me.schoolClass || '—') + ' (dəyişdirmək üçün admin)'),
        srow('E-poçt', auth.currentUser.email + ' ✓')];
    },
    look: () => { const dk = h('button', 'go ghost', '🌙 Qaranlıq'), lt = h('button', 'go ghost', '☀️ İşıqlı'); const set = t => { document.documentElement.dataset.theme = t; try { localStorage.setItem('theme', t); } catch {} }; dk.onclick = () => set('dark'); lt.onclick = () => set('light'); const r = h('div', 'crow'); r.append(dk, lt); return [srow('Mövzu', 'Görünüşü seçin'), r]; },
    security: () => [
      srow('Şifrəni dəyiş', 'Hesab şifrəsi və şifrələmə açarı yenilənir', null, changePassword),
      srow('Uçdan-uca şifrələmə', 'Şəxsi söhbətləri yalnız siz və qarşı tərəf oxuya bilər. Açar bu cihazda saxlanır.'),
      srow('Bu cihazdan açarı sil', 'Ortaq kompüterdə istifadədən sonra tövsiyə olunur', null, async () => { try { await E.wipeKeys(); toast('Açar silindi'); } catch { toast('Alınmadı'); } }),
      srow('Qaydalar', 'LawApp qaydalarını oxu', null, () => { location.href = 'rules.html'; }),
      ...(me.role === 'admin' ? [srow('Admin panel', 'İstifadəçilər, şikayətlər, mesajlar', null, () => { location.href = 'admin.html'; })] : []),
      srow('Hesabdan çıx', '', null, async () => { try { await E.wipeKeys(); } catch {} signOut(auth); })],
    privacy: () => [
      srow('Onlayn statusu', 'Başqaları sizin onlayn olduğunuzu görsün', sw(me.showOnline !== false, v => saveField({ showOnline: v }, '✔️ Yadda saxlandı'))),
      srow('Anonim suallar', 'İstifadəçilər sizə anonim sual verə bilsin', sw(me.askOpen !== false, v => saveField({ askOpen: v }, '✔️ Yadda saxlandı')))],
    notif: () => { const sv = () => { try { localStorage.setItem('np', JSON.stringify(np)); } catch {} }; return [
      srow('Bəyənmələr', 'Paylaşımınız bəyənildikdə', sw(np.like, v => { np.like = v ? 1 : 0; sv(); })),
      srow('Şərhlər və cavablar', 'Şərh və ya cavab yazıldıqda', sw(np.comment, v => { np.comment = v ? 1 : 0; sv(); })),
      srow('Abunələr', 'Kimsə sizə abunə olduqda', sw(np.follow, v => { np.follow = v ? 1 : 0; sv(); })),
      srow('Səs', 'Yeni bildirişdə səs çal', sw(np.sound, v => { np.sound = v ? 1 : 0; sv(); }))]; }
  };
  const render = k => { [...nav.children].forEach(b => b.classList.toggle('on', b.dataset.k === k)); body.replaceChildren(...SEC[k]()); };
  [['account', 'Hesab'], ['look', 'Görünüş'], ['security', 'Təhlükəsizlik'], ['privacy', 'Məxfilik'], ['notif', 'Bildirişlər']].forEach(([k, t]) => { const b = h('button', '', t); b.dataset.k = k; b.onclick = () => render(k); nav.append(b); });
  w.append(h('h3', null, 'Parametrlər'), nav, body, h('div', 'crow')); w.lastChild.append(done); openModal(w); render(sec);
}
async function changeUsername() {
  const v = await ask('Yeni istifadəçi adı (4–20: a-z, 0-9, _)', { input: true, val: me.username, ok: 'Dəyiş' }); if (v === null) return;
  const nu = v.toLowerCase().replace(/^@/, '');
  if (!/^[a-z0-9_]{4,20}$/.test(nu)) return toast('Format səhvdir: 4–20 simvol, a-z, 0-9, _');
  if (nu === me.username) return;
  try {
    if ((await getDoc(doc(db, 'usernames', nu))).exists()) return toast('❌ Bu istifadəçi adı məşğuldur');
    const pw = await ask('Şifrənizi təsdiqləyin', { input: true, type: 'password', ok: 'Davam' }); if (!pw) return;
    await reauthenticateWithCredential(auth.currentUser, EmailAuthProvider.credential(auth.currentUser.email, pw));
    const b = writeBatch(db);   // the SERVER refuses a taken name and releases the old one in the same atomic batch
    b.set(doc(db, 'usernames', nu), { uid, n: (me.name || '').toLowerCase() }); b.delete(doc(db, 'usernames', me.username)); b.update(doc(db, 'users', uid), { username: nu }); b.delete(doc(db, 'logins', 'u_' + me.username)); b.set(doc(db, 'logins', 'u_' + nu), { uid, un: nu, ...await E.sealText(auth.currentUser.email, pw) });
    await b.commit(); me.username = nu; toast('✔️ İstifadəçi adı dəyişdirildi'); openSettings('account');
  } catch { toast('❌ Dəyişmək alınmadı (ad məşğul ola bilər)'); }
}
async function changePassword() {
  const old = await ask('Köhnə şifrə', { input: true, type: 'password' }); if (!old) return;
  const nw = await ask('Yeni şifrə (min. 8 simvol, 1 böyük, 1 kiçik hərf, 1 rəqəm)', { input: true, type: 'password', ok: 'Yenilə' }); if (!nw) return;
  if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(nw)) return toast('❌ Şifrə tələblərə cavab vermir!');
  try {
    await reauthenticateWithCredential(auth.currentUser, EmailAuthProvider.credential(auth.currentUser.email, old));
    const ks = await getDoc(doc(db, 'keys', uid)), raw = ks.exists() ? (await E.openIdentity(old, ks.data())).raw : null;
    await updatePassword(auth.currentUser, nw);
    if (raw) await setDoc(doc(db, 'keys', uid), await E.sealIdentity(raw, nw));
    toast('✔️ Şifrə yeniləndi!');
  } catch { toast('❌ Köhnə şifrə səhvdir.'); }
}

// ---------- stories (24 hours) ----------
let queue = [], qi = 0, tmr;
function startStories() {
  onSnapshot(query(collection(db, 'stories'), where('exp', '>', Timestamp.now())), s => { stories = s.docs.map(d => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) })).sort((a, b) => dt(a.createdAt) - dt(b.createdAt)); renderStories(); }, () => {});
  setInterval(renderStories, 60000);
}
function renderStories() {
  if (!storiesRow) return;
  const live = stories.filter(s => dt(s.exp) > new Date()), by = new Map(); live.forEach(s => by.set(s.uid, [...(by.get(s.uid) || []), s]));
  const add = h('div', 'st add'), ar = h('div', 'ring'); ar.append(h('div', 'av', '+')); add.append(ar, h('span', null, 'Hekayə')); add.onclick = addStory;
  const els = [add];
  [...by.keys()].sort((a, b) => (b === uid) - (a === uid)).forEach(id => {
    const first = by.get(id)[0], st = h('div', 'st'), ring = h('div', 'ring'), av = h('div', 'av'); avatar(av, first.name, users[id] && users[id].photoURL); loadUser(id).then(u => u && avatar(av, u.name, u.photoURL));
    ring.append(av); st.append(ring, h('span', null, id === uid ? 'Sizin' : first.name.split(' ')[0])); st.onclick = () => viewStories(id); els.push(st);
  });
  storiesRow.replaceChildren(...els);
}
function addStory() {
  pick(async f => {
    let img; try { img = await imgToData(f, 540, 70000); } catch { return toast('Şəkil işlənmədi'); }
    const cap = await ask('Başlıq (istəyə görə)', { input: true, ph: 'məs: Üçüncü dərs ləğv olundu! 🎉', ok: 'Paylaş' }); if (cap === null) return;
    if (isBad(cap)) return toast('Qadağan olunmuş söz var');
    try { await addDoc(collection(db, 'stories'), { uid, name: me.name, username: me.username, img, cap: cap.slice(0, 120), createdAt: serverTimestamp(), exp: Timestamp.fromMillis(Date.now() + 24 * 3600 * 1000) }); toast('✔️ Hekayə paylaşıldı (24 saat)'); } catch { toast('Paylaşılmadı'); }
  });
}
async function cleanStories() { try { (await getDocs(query(collection(db, 'stories'), where('uid', '==', uid)))).forEach(d => { if (dt(d.data().exp) < new Date()) deleteDoc(d.ref).catch(() => {}); }); } catch {} }
function viewStories(startUid) {
  const live = stories.filter(s => dt(s.exp) > new Date()), order = [...new Set(live.map(s => s.uid))], i = order.indexOf(startUid);
  queue = [...order.slice(i), ...order.slice(0, i)].flatMap(id => live.filter(s => s.uid === id)); qi = 0; $('viewer').classList.remove('hidden'); showStory();
}
function showStory() {
  clearTimeout(tmr); if (qi >= queue.length || qi < 0) return closeViewer();
  const s = queue[qi]; $('simg').src = s.img; $('scap').textContent = s.cap || ''; $('snm').textContent = s.name; $('stm').textContent = ago(dt(s.createdAt)); avatar($('sav'), s.name, users[s.uid] && users[s.uid].photoURL);
  const bar = $('sbar'); bar.style.animation = 'none'; void bar.offsetWidth; bar.style.animation = 'fill 5s linear forwards';
  $('sdel').classList.toggle('hidden', !(s.uid === uid || staff())); $('srep').classList.toggle('hidden', s.uid === uid);
  tmr = setTimeout(() => { qi++; showStory(); }, 5000);
}
function closeViewer() { clearTimeout(tmr); $('viewer').classList.add('hidden'); }
$('sx').onclick = closeViewer; $('snext').onclick = () => { qi++; showStory(); }; $('sprev').onclick = () => { qi = Math.max(0, qi - 1); showStory(); };
$('srep').onclick = () => { const s = queue[qi]; if (s) { clearTimeout(tmr); report('story', s.id, s, s.cap || '[hekayə]').then(showStory); } };
$('sdel').onclick = async () => { const s = queue[qi]; if (!s) return; clearTimeout(tmr); if (await ask('Hekayə silinsin?', { ok: 'Sil', danger: true })) { deleteDoc(doc(db, 'stories', s.id)).catch(() => toast('Silinmədi')); queue.splice(qi, 1); } showStory(); };
addEventListener('keydown', e => { if (e.key === 'Escape') { closeViewer(); closeModal(); } });