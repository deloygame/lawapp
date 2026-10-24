import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// LawApp Firebase project. These values are public identifiers, NOT secrets: security comes from firestore.rules.
const app = initializeApp({
  apiKey: "AIzaSyBUcxeXVk_mZrc4GvgTDb8a5rxvoY-bixE",
  authDomain: "lawapp-sw.firebaseapp.com",
  projectId: "lawapp-sw",
  storageBucket: "lawapp-sw.firebasestorage.app",
  messagingSenderId: "312893655010",
  appId: "1:312893655010:web:e9de3731a60998fff55bbb"
});

export const auth = getAuth(app);
// local cache: data already seen opens instantly (also offline) and saves the free daily quota
let _db; try { _db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }); } catch { _db = getFirestore(app); }
export const db = _db;
