import { auth } from './firebase.js';
import { onAuthStateChanged, sendEmailVerification, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
const $ = id => document.getElementById(id), m = $('m');
let user = null, cool = 0;
const say = (t, c) => { m.style.color = c; m.textContent = t; };
onAuthStateChanged(auth, u => { if (!u) return location.replace('login.html'); user = u; $('em').textContent = u.email; check(false); });
async function check(manual) {
  try {
    await user.reload();
    if (user.emailVerified) { await user.getIdToken(true); location.replace('chat.html'); return; }
    if (manual) say('Hələ təsdiqlənməyib. Poçtunuzu yoxlayın.', '#e5484d');
  } catch {}
}
setInterval(() => user && check(false), 5000);
$('chk').onclick = () => check(true);
$('rs').onclick = async () => {
  if (Date.now() < cool) return say('Bir dəqiqə gözləyin', '#e5484d');
  try { await sendEmailVerification(user); cool = Date.now() + 60000; say('✔️ Link göndərildi', '#16a34a'); }
  catch { say('Çox cəhd edildi, bir az sonra yenidən yoxlayın', '#e5484d'); }
};
$('out').onclick = () => signOut(auth);