import { auth, db } from './firebase.js';
import * as E from './crypto.js';
import { isBad } from './filter.js';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc, setDoc, writeBatch, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// One screen at a time, like WhatsApp. All text goes through textContent; innerHTML only for the static logo.
const $ = id => document.getElementById(id), root = $('app');
const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const MAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/, USER = /^[a-z0-9_]{4,20}$/, PASS = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
const RESERVED = ['admin', 'administrator', 'lawapp', 'support', 'moderator', 'official', 'system', 'root', 'deloy', 'staff'];
let busy = false, poll = null, first = true;
const reg = { email: '', name: '', username: '', photo: '', phone: '' };

const LOGO = '<svg class="logo" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path pathLength="100" stroke-width="4" d="M12 14c0-3 2-5 5-5h30c3 0 5 2 5 5v24c0 3-2 5-5 5H30l-11 9v-9h-2c-3 0-5-2-5-5z"/><path pathLength="100" stroke-width="4.5" d="M24 20v16h14"/></svg>';
const logo = cls => { const s = h('span', cls || 'lg'); s.innerHTML = LOGO; return s; };
const link = (text, fn) => { const b = h('button', 'lk', text); b.type = 'button'; b.onclick = fn; return b; };
const field = (label, o = {}) => {
  const w = h('label', 'fld'), i = h('input');
  i.type = o.type || 'text'; i.placeholder = o.ph || ''; i.value = o.val || ''; i.autocapitalize = 'none'; i.spellcheck = false;
  if (o.ac) i.autocomplete = o.ac; if (o.max) i.maxLength = o.max; if (o.mode) i.inputMode = o.mode;
  w.append(h('span', null, label), i); return { w, i };
};

// one screen: top bar (back + progress), title, body, message line, primary button at the bottom
function view(o) {
  clearInterval(poll);
  const s = h('section', 'scr'), top = h('div', 'tb');
  if (o.back) { const b = h('button', 'bk', '←'); b.type = 'button'; b.setAttribute('aria-label', 'Geri'); b.onclick = o.back; top.append(b); }
  if (o.total) { const p = h('div', 'prog'), i = h('i'); i.style.width = (o.step / o.total * 100) + '%'; p.append(i); top.append(p); }
  s.append(top, h('h1', null, o.title)); if (o.sub) s.append(h('p', 'sub', o.sub));
  const bd = h('div', 'bd'); (o.body || []).forEach(x => bd.append(x)); s.append(bd);
  const msg = h('div', 'msg'); msg.setAttribute('role', 'alert'); s.append(msg);
  const ft = h('div', 'ft'), btn = h('button', 'pri', o.btn || 'Davam et'); btn.type = 'button'; ft.append(btn); if (o.alt) ft.append(o.alt); s.append(ft);
  const ctl = {
    btn, say: (t, ok) => { msg.textContent = t || ''; msg.classList.toggle('ok', !!ok); },
    busy: v => { btn.disabled = v; btn.classList.toggle('ld', v); }
  };
  btn.onclick = () => o.next && o.next(ctl);
  s.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); if (!btn.disabled) btn.click(); } });
  root.replaceChildren(s);
  const f = s.querySelector('input'); if (f) setTimeout(() => f.focus(), 60);
  return ctl;
}

// ---------- welcome ----------
function welcome() {
  clearInterval(poll);
  const s = h('section', 'scr wl'), mid = h('div', 'wm'), ft = h('div', 'ft');
  const reg_ = h('button', 'pri', 'Hesab yarat'), log = h('button', 'sec', 'Daxil ol'); reg_.type = log.type = 'button';
  reg_.onclick = regConsent; log.onclick = () => loginId();
  mid.append(logo('lg big'), h('h1', null, 'LawApp'), h('p', 'sub', 'Yaz, paylaş, kəşf et. Şəxsi söhbətlərin yalnız sənə və qarşı tərəfə görünür.'));
  ft.append(reg_, log); s.append(mid, ft); root.replaceChildren(s);
}

// ---------- login: 1) e-mail or username  2) password ----------
function loginId(val = '') {
  const f = field('E-poçt və ya istifadəçi adı', { val, ph: 'ad@mail.com və ya ali_200', ac: 'username', mode: 'email' });
  view({
    title: 'Daxil ol', sub: 'Əvvəlcə hesabınızı tapaq.', back: welcome, body: [f.w], alt: link('Hesabınız yoxdur? Qeydiyyatdan keçin', regConsent),
    next: async c => {
      const raw = f.i.value.trim().toLowerCase().replace(/^@/, ''); if (!raw) return c.say('E-poçt və ya istifadəçi adını yazın.');
      const isMail = raw.includes('@');
      if (isMail ? !MAIL.test(raw) : !USER.test(raw)) return c.say(isMail ? 'E-poçt düzgün deyil.' : 'İstifadəçi adı: 4–20 simvol, a-z, 0-9, _');
      c.busy(true); c.say('');
      try {
        const s = await getDoc(doc(db, 'logins', (isMail ? 'e_' : 'u_') + raw));   // the server answers at once: does this account exist?
        if (!s.exists()) { c.busy(false); return c.say(isMail ? 'Bu e-poçtla hesab tapılmadı.' : 'Bu istifadəçi adı ilə hesab tapılmadı.'); }
        loginPass({ raw, isMail, rec: s.data() });
      } catch { c.busy(false); c.say('Yoxlamaq alınmadı. İnterneti yoxlayıb yenidən cəhd edin.'); }
    }
  });
}
function loginPass(id) {
  const f = field('Şifrə', { type: 'password', ac: 'current-password' }), chip = h('button', 'chip'); chip.type = 'button';
  chip.append(h('span', null, (id.isMail ? '' : '@') + id.raw), h('b', null, id.isMail ? 'E-poçtu dəyiş' : 'Adı dəyiş')); chip.onclick = () => loginId(id.raw);
  let c;
  const forgot = id.isMail ? link('Şifrəni unutdum', async () => {
    try { await sendPasswordResetEmail(auth, id.raw); } catch {}
    c.say('Əgər belə hesab varsa, sıfırlama linki göndərildi. Diqqət: şifrə sıfırlananda köhnə şəxsi mesajlar oxunmaz olur (uçdan-uca şifrələmə).', true);
  }) : null;
  c = view({
    title: 'Şifrənizi yazın', back: () => loginId(id.raw), body: [chip, f.w], btn: 'Daxil ol', alt: forgot,
    next: async c => {
      const pass = f.i.value; if (!pass) return c.say('Şifrəni yazın.');
      c.busy(true); busy = true; c.say('');
      try {
        let email = id.raw;
        if (!id.isMail) { try { email = await E.openText(id.rec, pass); } catch { throw { code: 'auth/wrong-password' }; } }   // the e-mail is sealed with the password: a wrong password reveals nothing
        const cred = await signInWithEmailAndPassword(auth, email, pass);
        await afterLogin(cred.user, pass);
      } catch (e) { busy = false; c.busy(false); c.say(e.code === 'auth/too-many-requests' ? 'Çox cəhd edildi. Bir az sonra yenidən yoxlayın.' : 'Şifrə səhvdir.'); }
    }
  });
}
async function afterLogin(user, pass) {
  try { // unlock the end-to-end key with the password; it stays on THIS device only
    const ks = await getDoc(doc(db, 'keys', user.uid));
    if (ks.exists() && window.crypto && crypto.subtle) await E.saveKey(user.uid, (await E.openIdentity(pass, ks.data())).privateKey);
  } catch (e) { console.error('key unlock failed', e); }
  try { // keep the "login by username" record in step with the current password
    const us = await getDoc(doc(db, 'users', user.uid));
    if (us.exists() && us.data().username) await setDoc(doc(db, 'logins', 'u_' + us.data().username), { uid: user.uid, un: us.data().username, ...await E.sealText(user.email, pass) });
  } catch {}
  busy = false; go(user);
}
async function go(user) {
  try { await user.reload(); } catch {}
  if (user.emailVerified) { try { await user.getIdToken(true); } catch {} location.replace('app.html#/chat'); } else verifyScreen(user, false);
}

// ---------- registration: consent, e-mail, name, username, photo, phone, password, verify ----------
const T = 6;
function regConsent() {
  const pts = h('div', 'pts');
  [['E-poçt, ad, istifadəçi adı', 'Hesabı yaratmaq və sizi tapmaq üçün lazımdır. Şəkil və telefon nömrəsi istəyə bağlıdır.'],
   ['Fəaliyyət məlumatı', 'Kimin kimə nə vaxt yazdığı, bəyənmələr və şikayətlər qeyd olunur. Təhlükəsizlik və sui-istifadənin qarşısını almaq üçün istifadə olunur.'],
   ['Şəxsi söhbətlər', 'Mesajların məzmunu uçdan-uca şifrələnir: yalnız siz və qarşı tərəf oxuya bilər.'],
   ['Açıq məzmun', 'Paylaşımlar, şərhlər və ümumi söhbətlər şifrələnmir, moderatorlar görə bilər.']]
    .forEach(([a, b]) => { const p = h('div', 'pt'); p.append(h('b', null, a), h('span', null, b)); pts.append(p); });
  const l = h('label', 'chk'), cb = h('input'); cb.type = 'checkbox'; l.append(cb, h('span', null, 'Qaydalarla və məlumatların toplanması ilə razıyam'));
  const rl = h('a', 'lk', 'Qaydaları oxu'); rl.href = 'rules.html'; rl.target = '_blank'; rl.rel = 'noopener';
  const c = view({ title: 'Başlamazdan əvvəl', sub: 'Nələr toplanır və kim görə bilər:', back: welcome, body: [pts, l], btn: 'Razıyam, davam et', alt: rl, next: regEmail });
  c.btn.disabled = true; cb.onchange = () => { c.btn.disabled = !cb.checked; };
}
function regEmail() {
  const f = field('E-poçt', { type: 'email', val: reg.email, ph: 'ad@mail.com', ac: 'email', mode: 'email' }); let c;
  c = view({
    title: 'E-poçtunuz nədir?', sub: 'Təsdiq linki bura gələcək.', back: regConsent, step: 1, total: T, body: [f.w],
    next: async c => {
      const v = f.i.value.trim().toLowerCase(); if (!MAIL.test(v)) return c.say('E-poçt düzgün deyil.');
      c.busy(true); c.say('');
      try { if ((await getDoc(doc(db, 'logins', 'e_' + v))).exists()) { c.busy(false); return c.say('Bu e-poçt artıq qeydiyyatdan keçib. Daxil olun.'); } } catch {}
      reg.email = v; regName();
    }
  });
}
function regName() {
  const f = field('Ad və soyad', { val: reg.name, ph: 'Əli Məmmədov', ac: 'name', max: 40 });
  view({
    title: 'Adınız nədir?', sub: 'Başqaları sizi bu adla görəcək.', back: regEmail, step: 2, total: T, body: [f.w],
    next: c => {
      const v = f.i.value.trim().replace(/\s+/g, ' ');
      if (v.length < 2 || v.length > 40 || !/\p{L}/u.test(v)) return c.say('Ad 2–40 simvol olmalı və hərf içərməlidir.');
      if (isBad(v)) return c.say('Adda qadağan olunmuş söz var.');
      reg.name = v; regUser();
    }
  });
}
function regUser() {
  const f = field('İstifadəçi adı', { val: reg.username, ph: 'ali_200', ac: 'off', max: 20 }), hint = h('div', 'hint', '4–20 simvol: a-z, 0-9, _'); let t, ok = false;
  const check = async () => {
    const v = f.i.value.trim().toLowerCase().replace(/^@/, ''); ok = false; hint.className = 'hint';
    if (!v) return hint.textContent = '4–20 simvol: a-z, 0-9, _';
    if (!USER.test(v)) return hint.textContent = '4–20 simvol: yalnız a-z, 0-9 və _';
    if (RESERVED.includes(v) || isBad(v)) { hint.className = 'hint bad'; return hint.textContent = 'Bu ad olmaz. Başqasını seçin.'; }
    hint.textContent = 'Yoxlanılır...';
    try { const s = await getDoc(doc(db, 'logins', 'u_' + v)); if (f.i.value.trim().toLowerCase().replace(/^@/, '') !== v) return; ok = !s.exists(); hint.className = 'hint ' + (ok ? 'good' : 'bad'); hint.textContent = ok ? '@' + v + ' boşdur' : '@' + v + ' məşğuldur'; } catch { hint.textContent = ''; }
  };
  f.i.oninput = () => { clearTimeout(t); t = setTimeout(check, 350); };
  view({
    title: 'İstifadəçi adı seçin', sub: 'Sizi bu adla tapacaqlar. Sonra dəyişə bilərsiniz.', back: regName, step: 3, total: T, body: [f.w, hint],
    next: async c => {
      const v = f.i.value.trim().toLowerCase().replace(/^@/, ''); await check();
      if (!ok) return c.say(USER.test(v) ? 'Bu ad olmaz və ya məşğuldur.' : 'İstifadəçi adı: 4–20 simvol, a-z, 0-9, _');
      reg.username = v; regPhoto();
    }
  });
}
async function squareAvatar(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }), s = Math.min(bmp.width, bmp.height), c = document.createElement('canvas');
  c.width = c.height = 160; c.getContext('2d').drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, 160, 160);
  let q = .85, u = c.toDataURL('image/jpeg', q); while (u.length > 20000 && q > .3) { q -= .1; u = c.toDataURL('image/jpeg', q); } return u;
}
function regPhoto() {
  const pv = h('button', 'pv'); pv.type = 'button'; pv.setAttribute('aria-label', 'Şəkil seç');
  const paint = () => { pv.textContent = ''; if (reg.photo) { const i = h('img'); i.src = reg.photo; i.alt = ''; pv.append(i); } else pv.append(h('span', null, (reg.name || '?')[0].toUpperCase())); };
  paint(); pv.onclick = () => $('file').click();
  const c = view({ title: 'Profil şəkli', sub: 'İstəyə bağlıdır. Sonra da əlavə edə bilərsiniz.', back: regUser, step: 4, total: T, body: [pv], alt: link('İndi yox', () => { reg.photo = ''; regPhone(); }), next: () => regPhone() });
  $('file').onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    if (!/^image\//.test(f.type)) return c.say('Şəkil faylı seçin.');
    try { reg.photo = await squareAvatar(f); paint(); c.say(''); } catch { c.say('Şəkil işlənmədi.'); }
  };
}
function regPhone() {
  const f = field('Telefon nömrəsi', { type: 'tel', val: reg.phone, ph: '+994 50 123 45 67', ac: 'tel', mode: 'tel', max: 20 });
  view({
    title: 'Telefon nömrəsi', sub: 'İstəyə bağlıdır. Hələlik SMS ilə təsdiqlənmir, bu tezliklə əlavə olunacaq.', back: regPhoto, step: 5, total: T, body: [f.w], alt: link('İndi yox', () => { reg.phone = ''; regPass(); }),
    next: c => {
      const v = f.i.value.replace(/[\s\-()]/g, ''); if (!v) { reg.phone = ''; return regPass(); }
      if (!/^\+[0-9]{9,15}$/.test(v)) return c.say('Nömrəni beynəlxalq formatda yazın: +994501234567');
      reg.phone = v; regPass();
    }
  });
}
function regPass() {
  const f1 = field('Şifrə', { type: 'password', ac: 'new-password' }), f2 = field('Şifrəni təkrarlayın', { type: 'password', ac: 'new-password' });
  view({
    title: 'Şifrə yaradın', sub: 'Min. 8 simvol, 1 böyük hərf, 1 kiçik hərf, 1 rəqəm. Şifrə şəxsi söhbətlərin açarını qoruyur, onu unutsanız köhnə mesajları bərpa etmək olmur.',
    back: regPhone, step: 6, total: T, body: [f1.w, f2.w], btn: 'Hesab yarat',
    next: async c => {
      const p = f1.i.value;
      if (!PASS.test(p)) return c.say('Şifrə tələblərə cavab vermir.');
      if (p !== f2.i.value) return c.say('Şifrələr üst-üstə düşmür.');
      if (!(window.crypto && crypto.subtle)) return c.say('Şifrələmə üçün sayt HTTPS (və ya localhost) ilə açılmalıdır.');
      c.busy(true); busy = true; c.say('');
      let cred;
      try { cred = await createUserWithEmailAndPassword(auth, reg.email, p); }
      catch (e) { busy = false; c.busy(false); return c.say(e.code === 'auth/email-already-in-use' ? 'Bu e-poçt artıq qeydiyyatdan keçib.' : e.code === 'auth/weak-password' ? 'Şifrə çox zəifdir.' : 'Xəta: ' + e.code); }
      try {
        const id = await E.createIdentity(p), uid = cred.user.uid, b = writeBatch(db);   // one atomic batch: the SERVER refuses it if the username is taken
        b.set(doc(db, 'usernames', reg.username), { uid, n: reg.name.toLowerCase() });
        b.set(doc(db, 'keys', uid), id.rec);
        const u = { name: reg.name, username: reg.username, photoURL: reg.photo || '', bio: '', rulesV: 1, consentV: 1, pub: id.pub, createdAt: serverTimestamp() }; if (reg.phone) u.phone = reg.phone;
        b.set(doc(db, 'users', uid), u);
        b.set(doc(db, 'logins', 'u_' + reg.username), { uid, un: reg.username, ...await E.sealText(reg.email, p) });
        b.set(doc(db, 'logins', 'e_' + reg.email), { uid });
        await b.commit(); await E.saveKey(uid, id.privateKey); await sendEmailVerification(cred.user);
        busy = false; verifyScreen(cred.user, true);
      } catch (err) {
        console.error(err); await cred.user.delete().catch(() => {});   // never leave a half-created account behind
        busy = false; c.busy(false); c.say('Hesab yaradılmadı. İstifadəçi adı tutulmuş ola bilər: geri qayıdıb başqa ad seçin.');
      }
    }
  });
}

// ---------- e-mail verification (the page continues by itself) ----------
function verifyScreen(user, fresh) {
  let cool = 0, c;
  const check = async manual => {
    try {
      await user.reload();
      if (user.emailVerified) { await user.getIdToken(true); clearInterval(poll); return fresh ? done() : location.replace('app.html#/chat'); }
      if (manual) c.say('Hələ təsdiqlənməyib. Poçtunuzu (spam qovluğunu da) yoxlayın.');
    } catch {}
  };
  const resend = link('Linki yenidən göndər', async () => {
    if (Date.now() < cool) return c.say('Bir dəqiqə gözləyin.');
    try { await sendEmailVerification(user); cool = Date.now() + 60000; c.say('Link göndərildi.', true); } catch { c.say('Çox cəhd edildi. Bir az sonra yenidən yoxlayın.'); }
  });
  const out = link('Çıxış', async () => { try { await E.wipeKeys(); } catch {} await signOut(auth); welcome(); });
  const alt = h('div', 'alts'); alt.append(resend, out);
  c = view({ title: 'Poçtunuzu təsdiqləyin', sub: user.email + ' ünvanına təsdiq linki göndərdik. Linkə klikləyin, bu səhifə avtomatik davam edəcək.', btn: 'Təsdiq etdim', alt, next: () => check(true) });
  poll = setInterval(() => check(false), 4000);
}
function done() {
  view({ title: 'Hazırdır!', sub: 'Hesabınız təsdiqləndi. LawApp-a xoş gəlmisiniz.', btn: 'LawApp-a keç', next: () => location.replace('app.html#/chat') });
}

// ---------- start ----------
onAuthStateChanged(auth, async u => {
  if (!first || busy) return; first = false;
  if (!u) return welcome();
  try { await u.reload(); } catch {}
  if (u.emailVerified) return location.replace('app.html#/chat');
  verifyScreen(u, false);
});