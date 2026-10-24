import { auth, db } from './firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { collection, query, where, orderBy, limit, onSnapshot, doc, getDoc, getDocs, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const $ = id => document.getElementById(id);
const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
let users = [], unsub;

// Only users with role: "admin" in their users/{uid} document may see this page.
onAuthStateChanged(auth, async u => {
  if (!u) return location.replace('login.html');
  const s = await getDoc(doc(db, 'users', u.uid));
  if (!s.exists() || s.data().role !== 'admin') return location.replace('chat.html');
  loadUsers(); loadMsgs(); loadReports();
});

function show(tab) {
  ['users', 'msgs', 'rep'].forEach(k => { $('v-' + k).classList.toggle('hidden', tab !== k); $('t-' + k).classList.toggle('on', tab === k); });
}
['users', 'msgs', 'rep'].forEach(k => $('t-' + k).onclick = () => show(k));

async function loadUsers() {
  users = (await getDocs(collection(db, 'users'))).docs.map(d => ({ id: d.id, ...d.data() }));
  renderUsers();
}
$('q').oninput = renderUsers;

function renderUsers() {
  const q = $('q').value.trim().toLowerCase(), box = $('users');
  box.textContent = '';
  $('stats').textContent = `Cəmi: ${users.length} • Azərbaycan: ${users.filter(u => u.sector === 'az').length} • Rus: ${users.filter(u => u.sector === 'ru').length} • Bloklu: ${users.filter(u => u.banned).length}`;
  users.filter(u => `${u.name} ${u.username} ${u.schoolClass}`.toLowerCase().includes(q)).forEach(u => {
    const row = h('div', 'row'), info = h('div', 'grow'), name = h('div', null, u.name);
    if (u.role === 'admin') name.append(h('span', 'tag', 'admin'));
    if (u.banned) name.append(h('span', 'tag red', 'bloklu'));
    if (u.verified) name.append(h('span', 'tag', '✔ təsdiqli'));
    info.append(name, h('div', 's', `@${u.username} • ${u.schoolClass} • ${u.sector === 'az' ? 'Az' : 'Rus'}`));
    row.append(info);
    { const vb = h('button', u.verified ? '' : 'ok', u.verified ? 'Təsdiqi götür' : '✔ Təsdiqlə');
      vb.onclick = async () => { try { await updateDoc(doc(db, 'users', u.id), { verified: !u.verified }); u.verified = !u.verified; renderUsers(); } catch (e) { alert(e.message); } };
      row.append(vb); }
    if (u.role !== 'admin') {
      const rb = h('button', 'ok', 'Rol: ' + (u.role || 'student'));
      rb.onclick = async () => { const v = prompt('Rol (student / teacher / monitor):', u.role || 'student'); if (!['student', 'teacher', 'monitor'].includes(v)) return; try { await updateDoc(doc(db, 'users', u.id), { role: v }); u.role = v; renderUsers(); } catch (e) { alert(e.message); } };
      const cb = h('button', 'ok', 'Sinif');
      cb.onclick = async () => { const v = prompt('Sinif (məs. 9-A):', u.schoolClass || ''); if (!v || !/^(1[01]|[1-9])-[A-ZƏÇŞĞÜÖİ]$/.test(v)) return; try { await updateDoc(doc(db, 'users', u.id), { schoolClass: v }); u.schoolClass = v; renderUsers(); } catch (e) { alert(e.message); } };
      row.append(rb, cb);
    }
    if (u.role !== 'admin') {
      const b = h('button', u.banned ? 'ok' : '', u.banned ? 'Blokdan çıxar' : 'Blokla');
      b.onclick = async () => {
        if (!confirm(`${u.name} ${u.banned ? 'blokdan çıxarılsın' : 'bloklansın'}?`)) return;
        try { await updateDoc(doc(db, 'users', u.id), { banned: !u.banned }); u.banned = !u.banned; renderUsers(); }
        catch (e) { alert('Xəta: ' + e.message); }
      };
      row.append(b);
    }
    box.append(row);
  });
}

function loadMsgs() {
  unsub && unsub();
  const q = query(collection(db, 'messages'), where('room', '==', $('room').value), orderBy('createdAt', 'desc'), limit(100));
  unsub = onSnapshot(q, snap => {
    const box = $('msgs'); box.textContent = '';
    if (!snap.size) box.append(h('div', 's', 'Mesaj yoxdur.'));
    snap.forEach(d => {
      const m = d.data({ serverTimestamps: 'estimate' }), row = h('div', 'row'), info = h('div', 'grow');
      const t = m.createdAt ? m.createdAt.toDate().toLocaleString() : '';
      info.append(h('div', 's', `${m.name} (@${m.username}) • ${t}`), h('div', null, m.text));
      const b = h('button', null, 'Sil');
      b.onclick = () => confirm('Mesaj silinsin?') && deleteDoc(d.ref);
      row.append(info, b); box.append(row);
    });
  }, err => { $('msgs').textContent = 'Xəta: ' + err.message; });
}
$('room').onchange = loadMsgs;

function loadReports() {
  onSnapshot(query(collection(db, 'reports'), orderBy('createdAt', 'desc'), limit(100)), snap => {
    const box = $('reps'); box.textContent = '';
    $('t-rep').textContent = 'Şikayətlər' + (snap.size ? ` (${snap.size})` : '');
    if (!snap.size) box.append(h('div', 's', 'Şikayət yoxdur.'));
    snap.forEach(d => {
      const r = d.data({ serverTimestamps: 'estimate' }), row = h('div', 'row'), info = h('div', 'grow');
      info.append(h('div', null, `${r.reporterName} → ${r.targetName} (@${r.targetUsername})`), h('div', null, '[' + (r.kind || 'mesaj') + '] Səbəb: ' + r.reason));
      if (r.msgText) info.append(h('div', 's', 'Mesaj: ' + r.msgText));
      const ban = h('button', null, 'Blokla');
      ban.onclick = async () => { if (confirm(r.targetName + ' bloklansın?')) { try { await updateDoc(doc(db, 'users', r.target), { banned: true }); alert('Bloklandı'); } catch (e) { alert(e.message); } } };
      if (r.kind === 'ask') {
        const who = h('button', 'ok', 'Göndərəni göstər');
        who.onclick = async () => { try { const au = await getDoc(doc(db, 'askAuthors', r.refId)); if (!au.exists()) return alert('Tapılmadı'); const uu = await getDoc(doc(db, 'users', au.data().uid)); const x = uu.data() || {}; if (confirm('Göndərən: ' + x.name + ' (@' + x.username + ')\n\nBloklansın?')) { await updateDoc(doc(db, 'users', au.data().uid), { banned: true }); alert('Bloklandı'); } } catch (e) { alert(e.message); } };
        row.append(who);
      }
      const cl = h('button', 'ok', 'Bağla'); cl.onclick = () => deleteDoc(d.ref);
      row.append(info, ban, cl); box.append(row);
    });
  }, e => { $('reps').textContent = 'Xəta: ' + e.message; });
}