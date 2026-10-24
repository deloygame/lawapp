// Voice / video calls (WebRTC).
//  - the media is end-to-end encrypted by WebRTC itself (DTLS-SRTP, peer to peer)
//  - the signaling (offer / answer / ICE) goes through Firestore but is ENCRYPTED with the same key as the private chat,
//    so the server cannot read it or swap the connection fingerprints (man-in-the-middle)
//  - calls only ring while LawApp is open (no push notifications without a server)
import * as E from './crypto.js';
import { collection, query, where, onSnapshot, doc, addDoc, setDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// STUN finds the public address. About 1 call in 5 also needs a TURN relay (strict mobile networks): add one here later.
const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] };
const RING_MS = 40000;
let A, db, uid, h, st = null, ringTone = null, ac;

const dt = v => v && v.toDate ? v.toDate() : v ? new Date(v) : new Date();
const mmss = s => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
function tone() { try { ac = ac || new AudioContext(); const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = 520; g.gain.setValueAtTime(.08, ac.currentTime); g.gain.exponentialRampToValueAtTime(.001, ac.currentTime + .6); o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + .6); } catch {} }
const startRing = () => { stopRing(); tone(); ringTone = setInterval(tone, 1800); };
const stopRing = () => { clearInterval(ringTone); ringTone = null; };

export const inCall = () => !!st;

export function initCalls(api) {
  A = api; ({ db, uid, h } = api);
  onSnapshot(query(collection(db, 'calls'), where('to', '==', uid), where('state', '==', 'ringing')), s => {
    s.docChanges().forEach(c => {
      if (c.type !== 'added') return;
      const d = { id: c.doc.id, ...c.doc.data({ serverTimestamps: 'estimate' }) };
      if (Date.now() - dt(d.createdAt).getTime() > RING_MS) return;   // old, already missed
      if (st) return updateDoc(doc(db, 'calls', d.id), { state: 'busy' }).catch(() => {});
      incoming(d);
    });
  }, () => {});
}

// ---------- UI ----------
function overlay() {
  const el = h('div', 'callui'), media = h('div', 'cmedia'), rv = h('video'), lv = h('video', 'lvid hidden'), au = h('audio');
  rv.autoplay = rv.playsInline = true; lv.autoplay = lv.playsInline = lv.muted = true; au.autoplay = true;
  const who = h('div', 'cwho'), av = h('div', 'av pav'), nm = h('b'), stt = h('div', 's'), bar = h('div', 'cbtns');
  who.append(av, nm, stt); media.append(rv, lv, au); el.append(media, who, bar); document.body.append(el);
  return { el, rv, lv, au, av, nm, stt, bar, who };
}
const roundBtn = (cls, label, icon, fn) => { const b = h('button', 'cb ' + cls); b.type = 'button'; b.setAttribute('aria-label', label); b.append(typeof icon === 'string' ? h('span', null, icon) : icon); b.onclick = fn; const w = h('div', 'cbw'); w.append(b, h('small', null, label)); return { w, b }; };

function showPeer(ui, u, text) { A.avatar(ui.av, u.name, u.photoURL); ui.nm.textContent = u.name; ui.stt.textContent = text; }

// ---------- outgoing ----------
export async function startCall(peer, video) {
  if (st) return A.toast('Zəng davam edir');
  if (!(window.RTCPeerConnection && navigator.mediaDevices)) return A.toast('Bu brauzer zəngləri dəstəkləmir (HTTPS lazımdır)');
  let key; try { key = await A.getKey(peer.uid); } catch (e) { return A.toast('🔒 ' + e.message); }
  let stream; try { stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: video ? { facingMode: 'user' } : false }); } catch { return A.toast('Mikrofon/kamera icazəsi verilmədi'); }
  const ref = doc(collection(db, 'calls')), id = ref.id, aad = 'call_' + id;
  st = { id, peer, video, key, aad, pc: new RTCPeerConnection(ICE), stream, subs: [], ui: overlay(), caller: true, t0: 0, tick: null, timeout: null, ended: false };
  setupCommon(st, stream);
  showPeer(st.ui, peer, 'Zəng edilir...'); controls(st);
  try {
    const offer = await st.pc.createOffer();
    await setDoc(ref, { from: uid, to: peer.uid, video: !!video, state: 'ringing', createdAt: serverTimestamp(), offer: await E.encrypt(key, { sdp: offer.sdp, type: offer.type }, aad) });
    await st.pc.setLocalDescription(offer);   // starts ICE gathering: the call document already exists
  } catch (e) { console.error(e); A.toast('Zəng başlamadı'); return finish(false); }
  st.subs.push(onSnapshot(ref, async s => {
    if (!st || st.id !== id || !s.exists()) return;
    const d = s.data();
    if (d.answer && !st.pc.currentRemoteDescription) {
      try { await st.pc.setRemoteDescription(await E.decrypt(key, d.answer, aad)); st.ui.stt.textContent = 'Qoşulur...'; } catch (e) { console.error(e); A.toast('Zəng açılmadı'); finish(true); }
    }
    if (['declined', 'busy', 'missed', 'ended'].includes(d.state)) { A.toast(d.state === 'declined' ? 'Zəng rədd edildi' : d.state === 'busy' ? 'Xətt məşğuldur' : d.state === 'missed' ? 'Cavab verilmədi' : 'Zəng bitdi'); finish(false); }
  }));
  listenIce(st);
  st.timeout = setTimeout(() => { if (st && st.id === id && !st.t0) { updateDoc(ref, { state: 'missed', endedAt: serverTimestamp() }).catch(() => {}); A.toast('Cavab verilmədi'); finish(false); } }, RING_MS);
}

// ---------- incoming ----------
async function incoming(d) {
  const peer = await A.loadUser(d.from); if (!peer) return;
  const ui = overlay(); startRing();
  showPeer(ui, peer, d.video ? 'Gələn video zəng' : 'Gələn səsli zəng');
  const ref = doc(db, 'calls', d.id);
  const close = () => { stopRing(); ui.el.remove(); un(); clearTimeout(tm); };
  const un = onSnapshot(ref, s => { if (!s.exists() || s.data().state !== 'ringing') close(); }, () => {});   // caller hung up
  const tm = setTimeout(close, RING_MS);
  const no = roundBtn('red', 'Rədd et', A.ico('phone'), async () => { close(); updateDoc(ref, { state: 'declined', endedAt: serverTimestamp() }).catch(() => {}); });
  const yes = roundBtn('green', 'Cavabla', A.ico('phone'), async () => { close(); accept(d, peer); });
  ui.bar.append(no.w, yes.w);
}
async function accept(d, peer) {
  if (st) return;
  let key; try { key = await A.getKey(peer.uid); } catch (e) { return A.toast('🔒 ' + e.message); }
  let stream; try { stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: d.video ? { facingMode: 'user' } : false }); } catch { updateDoc(doc(db, 'calls', d.id), { state: 'declined', endedAt: serverTimestamp() }).catch(() => {}); return A.toast('Mikrofon/kamera icazəsi verilmədi'); }
  const ref = doc(db, 'calls', d.id), aad = 'call_' + d.id;
  st = { id: d.id, peer, video: !!d.video, key, aad, pc: new RTCPeerConnection(ICE), stream, subs: [], ui: overlay(), caller: false, t0: 0, tick: null, timeout: null, ended: false };
  setupCommon(st, stream); showPeer(st.ui, peer, 'Qoşulur...'); controls(st);
  try {
    await st.pc.setRemoteDescription(await E.decrypt(key, d.offer, aad));
    const ans = await st.pc.createAnswer();
    await updateDoc(ref, { answer: await E.encrypt(key, { sdp: ans.sdp, type: ans.type }, aad), state: 'active', startedAt: serverTimestamp() });
    await st.pc.setLocalDescription(ans);
  } catch (e) { console.error(e); A.toast('Zəng açılmadı'); return finish(true); }
  listenIce(st);
  st.subs.push(onSnapshot(ref, s => { if (st && st.id === d.id && s.exists() && ['ended', 'missed'].includes(s.data().state)) { A.toast('Zəng bitdi'); finish(false); } }));
}

// ---------- shared ----------
function setupCommon(c, stream) {
  const rs = new MediaStream();
  stream.getTracks().forEach(t => c.pc.addTrack(t, stream));
  c.ui.lv.srcObject = stream; c.ui.lv.classList.toggle('hidden', !c.video);
  c.pc.ontrack = e => { e.streams[0].getTracks().forEach(t => rs.addTrack(t)); c.ui.rv.srcObject = rs; c.ui.au.srcObject = rs; if (c.video) { c.ui.el.classList.add('vid'); c.ui.rv.play().catch(() => {}); } };
  c.pc.onicecandidate = async e => {
    if (!e.candidate || !st || st.id !== c.id) return;
    try { await addDoc(collection(db, 'calls', c.id, 'ice'), { from: uid, ...await E.encrypt(c.key, { c: e.candidate.toJSON() }, c.aad) }); } catch {}
  };
  c.pc.onconnectionstatechange = () => {
    if (st !== c) return;
    const s = c.pc.connectionState;
    if (s === 'connected' && !c.t0) { c.t0 = Date.now(); clearTimeout(c.timeout); c.ui.stt.textContent = '00:00'; c.tick = setInterval(() => { c.ui.stt.textContent = mmss(Math.floor((Date.now() - c.t0) / 1000)); }, 1000); }
    if (s === 'failed') { A.toast('Qoşulmaq alınmadı. Şəbəkə bağlantını əngəlləyə bilər.'); finish(true); }
  };
}
function listenIce(c) {
  c.subs.push(onSnapshot(query(collection(db, 'calls', c.id, 'ice'), where('from', '==', c.peer.uid)), s => {
    s.docChanges().forEach(async ch => {
      if (ch.type !== 'added' || !st || st.id !== c.id) return;
      try { const { c: cand } = await E.decrypt(c.key, ch.doc.data(), c.aad); await c.pc.addIceCandidate(cand); } catch {}
    });
  }, () => {}));
}
function controls(c) {
  const mute = roundBtn('', 'Səs', A.ico('mic'), () => { const t = c.stream.getAudioTracks()[0]; if (!t) return; t.enabled = !t.enabled; mute.b.classList.toggle('off', !t.enabled); });
  const items = [mute.w];
  if (c.video) { const cam = roundBtn('', 'Kamera', A.ico('video'), () => { const t = c.stream.getVideoTracks()[0]; if (!t) return; t.enabled = !t.enabled; cam.b.classList.toggle('off', !t.enabled); }); items.push(cam.w); }
  const end = roundBtn('red', 'Bitir', A.ico('phone'), () => finish(true));
  items.push(end.w); c.ui.bar.replaceChildren(...items);
}
// end the call on this device; tell the other side only when we ended it
function finish(notify) {
  const c = st; if (!c || c.ended) return; c.ended = true; st = null;
  clearTimeout(c.timeout); clearInterval(c.tick); stopRing();
  c.subs.forEach(f => { try { f(); } catch {} });
  if (notify) updateDoc(doc(db, 'calls', c.id), { state: 'ended', endedAt: serverTimestamp() }).catch(() => {});
  try { c.stream.getTracks().forEach(t => t.stop()); c.pc.close(); } catch {}
  c.ui.el.remove();
}