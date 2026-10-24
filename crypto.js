// End-to-end encryption for private chats (Web Crypto, no external libraries).
//  - every user has an ECDH P-256 key pair created in the browser
//  - the PUBLIC key is stored in users/{uid}.pub (immutable, enforced by Firestore rules)
//  - the PRIVATE key is stored in Firestore only encrypted with a key derived from the
//    user's password (PBKDF2 310k + AES-GCM), so the server never sees it
//  - on the device the private key lives as a NON-EXTRACTABLE CryptoKey in IndexedDB
//  - each DM uses AES-256-GCM with a key = HKDF(ECDH(myPriv, peerPub)); the room id is bound as AAD
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const EC = { name: 'ECDH', namedCurve: 'P-256' };

async function wrapKey(password, salt) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
const importPriv = raw => crypto.subtle.importKey('pkcs8', raw, EC, false, ['deriveBits']);

export async function sealIdentity(raw, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await wrapKey(password, salt), raw);
  return { salt: b64(salt), iv: b64(iv), wrapped: b64(ct) };
}
export async function createIdentity(password) {
  const kp = await crypto.subtle.generateKey(EC, true, ['deriveBits']);
  const j = await crypto.subtle.exportKey('jwk', kp.publicKey);
  const raw = await crypto.subtle.exportKey('pkcs8', kp.privateKey);
  return { pub: JSON.stringify({ kty: j.kty, crv: j.crv, x: j.x, y: j.y }), rec: await sealIdentity(raw, password), privateKey: await importPriv(raw) };
}
export async function openIdentity(password, rec) {
  const k = await wrapKey(password, unb64(rec.salt));
  const raw = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(rec.iv) }, k, unb64(rec.wrapped)); // throws on wrong password
  return { privateKey: await importPriv(raw), raw };
}

export async function dmKey(privateKey, peerPub, uidA, uidB) {
  const peer = await crypto.subtle.importKey('jwk', { ...JSON.parse(peerPub), ext: true }, EC, false, []);
  const bits = await crypto.subtle.deriveBits({ name: 'ECDH', public: peer }, privateKey, 256);
  const hk = await crypto.subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: enc.encode([uidA, uidB].sort().join('_')), info: enc.encode('lawapp-dm-v1') },
    hk, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function encrypt(key, obj, aad) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(aad) }, key, enc.encode(JSON.stringify(obj)));
  return { iv: b64(iv), ct: b64(ct) };
}
export async function decrypt(key, m, aad) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(m.iv), additionalData: enc.encode(aad) }, key, unb64(m.ct));
  return JSON.parse(dec.decode(pt));
}
// "Safety number": both people should see the same code; compare it in person to rule out a man-in-the-middle.
export async function fingerprint(pubA, pubB) {
  const d = await crypto.subtle.digest('SHA-256', enc.encode([pubA, pubB].sort().join('|')));
  return [...new Uint8Array(d)].slice(0, 15).map(x => String(x).padStart(3, '0')).join('').match(/.{1,5}/g).join(' ');
}

// ---- device key storage (IndexedDB) ----
const idb = () => new Promise((res, rej) => { const r = indexedDB.open('lawapp-keys', 1); r.onupgradeneeded = () => r.result.createObjectStore('k'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
export async function saveKey(uid, key) { const d = await idb(); return new Promise((res, rej) => { const t = d.transaction('k', 'readwrite'); t.objectStore('k').put(key, uid); t.oncomplete = res; t.onerror = () => rej(t.error); }); }
export async function loadKey(uid) { const d = await idb(); return new Promise((res, rej) => { const q = d.transaction('k').objectStore('k').get(uid); q.onsuccess = () => res(q.result || null); q.onerror = () => rej(q.error); }); }
export async function wipeKeys() { const d = await idb(); return new Promise(res => { const t = d.transaction('k', 'readwrite'); t.objectStore('k').clear(); t.oncomplete = res; t.onerror = res; }); }
// ---- small sealed text (used for the "login by username" record: the e-mail is readable only with the password) ----
export async function sealText(text, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await wrapKey(password, salt), enc.encode(text));
  return { s: b64(salt), iv: b64(iv), ct: b64(ct) };
}
export async function openText(rec, password) {
  const k = await wrapKey(password, unb64(rec.s));
  return dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(rec.iv) }, k, unb64(rec.ct)));   // throws on wrong password
}