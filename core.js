import { initializeApp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import { getFirestore, collection, doc, addDoc, setDoc, updateDoc, deleteDoc, onSnapshot, serverTimestamp, query, orderBy, limit, arrayUnion, arrayRemove, increment, getDoc } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

export { collection, doc, addDoc, setDoc, updateDoc, deleteDoc, serverTimestamp, signOut, onSnapshot, query, orderBy, limit, arrayUnion, arrayRemove, increment, getDoc };
export const fbApp = initializeApp(firebaseConfig);
export const auth = getAuth(fbApp);
export const db = getFirestore(fbApp);

/* shared state: S.user = who is signed in, S.users = both of you, S.data = live lists */
export const S = { user: null, tab: null, users: {}, data: {} };
export const features = [];
// hooks: small jobs a page wants to run once you are signed in (they can return a "stop" function)
export const hooks = [];
// afterRender: small jobs to run every time the screen is redrawn
export const afterRender = [];
export const openGroups = new Set();
export const list = (name) => S.data[name] || [];
export function register(f) { features.push(f); features.sort((a, b) => a.order - b.order); }

const root = document.getElementById("app");
let unsubs = [];

/* ---------- small helpers (text is always inserted safely) ---------- */
const NS = "http://www.w3.org/2000/svg";
export const h = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (k === "class") e.className = v;
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat()) {
    if (c == null || c === false) continue;
    e.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return e;
};
export const icon = (d) => {
  const s = document.createElementNS(NS, "svg");
  s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("class", "i");
  const p = document.createElementNS(NS, "path"); p.setAttribute("d", d); s.append(p); return s;
};
export function loadCss(href) {
  if (!document.querySelector(`link[href="${href}"]`)) document.head.append(h("link", { rel: "stylesheet", href }));
}
// Shrinks a chosen picture so it is quick to save and load (returns a small JPEG as text).
export function toJpeg(file, max, quality) {
  return new Promise((resolve, reject) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => reject(new Error("bad image"));
    img.src = url;
  });
}
export const toast = (msg) => {
  const t = document.getElementById("toast");
  t.textContent = msg; t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2800);
};
export const pad = (n) => String(n).padStart(2, "0");
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayStr = () => ymd(new Date());
export const parse = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
export function nextDue(due, repeat) {
  const d = parse(due);
  if (repeat === "daily") d.setDate(d.getDate() + 1);
  else if (repeat === "weekly") d.setDate(d.getDate() + 7);
  else if (repeat === "monthly") {
    const day = d.getDate();
    d.setDate(1); d.setMonth(d.getMonth() + 1);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, last));
  }
  return ymd(d);
}
export function dueLabel(due) {
  if (!due) return "";
  const t = todayStr();
  if (due === t) return "Today";
  const tm = parse(t); tm.setDate(tm.getDate() + 1);
  if (due === ymd(tm)) return "Tomorrow";
  return parse(due).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}
export const fmtTime = (t) => {
  if (!t) return "";
  const [hh, mm] = t.split(":").map(Number);
  return new Date(2000, 0, 1, hh, mm).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase();
};
export const money = (n) => "RM " + Number(n).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const nameOf = (uid) => {
  const u = S.users[uid];
  if (!u) return "Someone";
  return (u.name || u.googleName || (u.email || "").split("@")[0] || "Someone").trim().split(" ")[0] || "Someone";
};
// The little round picture (or a coloured circle with an initial). Photos are small pictures saved in the database.
export function avatar(uid, cls = "") {
  const u = S.users[uid] || {};
  const photo = typeof u.photo === "string" && u.photo.startsWith("data:image/jpeg;base64,") ? u.photo : null;
  return photo
    ? h("img", { class: "av " + cls, src: photo, alt: nameOf(uid) })
    : h("span", { class: "av c" + (uid.charCodeAt(0) % 2) + " " + cls }, (nameOf(uid)[0] || "?").toUpperCase());
}
// Shared settings (like your start date) live in one document: settings/couple
// The other person (whoever is signed in is "you")
export const partnerId = () => Object.keys(S.users).find((id) => id !== S.user?.uid);
export const couple = () => list("settings").find((x) => x.id === "couple") || {};
// Light / dark / auto is remembered on each phone separately.
export const getTheme = () => { try { return localStorage.getItem("us-theme") || "auto"; } catch { return "auto"; } };
function applyTheme() {
  const m = getTheme();
  if (m === "auto") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = m;
}
export function setTheme(m) { try { localStorage.setItem("us-theme", m); } catch {} applyTheme(); }
applyTheme();
// Only real web links are allowed (http or https). Anything else is rejected.
export function safeUrl(s) {
  try { const u = new URL(s.trim()); return (u.protocol === "https:" || u.protocol === "http:") ? u.href : null; }
  catch { return null; }
}
export const siteName = (href) => new URL(href).hostname.replace(/^www\./, "");

/* ---------- shared pieces ---------- */
export function group(key, name, items, rowFn, extra) {
  const d = h("details", { class: "card", open: openGroups.has(key) },
    h("summary", {}, h("span", {}, name), h("span", { class: "meta" }, String(items.length))),
    h("div", { class: "list" }, items.length ? items.map(rowFn) : h("div", { class: "empty" }, "Nothing here."), extra));
  d.addEventListener("toggle", () => d.open ? openGroups.add(key) : openGroups.delete(key));
  return d;
}
export function closeSheet() { const b = document.getElementById("sheetbg"); b.classList.remove("show"); b.replaceChildren(); }
export function showSheet(...kids) {
  const bg = document.getElementById("sheetbg");
  bg.replaceChildren(h("div", { class: "sheet" }, ...kids));
  bg.classList.add("show");
  bg.onclick = (e) => { if (e.target === bg) closeSheet(); };
}
export function goto(id) { S.tab = id; render(); window.scrollTo(0, 0); }
// Pages marked "hidden" (like Money) are not in the bottom bar; their "parent" tab stays highlighted.
function navBar() {
  const active = features.find((x) => x.id === S.tab);
  const current = active?.parent || S.tab;
  return h("nav", {}, features.filter((f) => !f.hidden).map((f) =>
    h("button", { class: current === f.id ? "sel" : "", onclick: () => goto(f.id) }, icon(f.icon), f.label)));
}
export function render() {
  if (!S.user || !features.length) return;
  const f = features.find((x) => x.id === S.tab) || features[0];
  root.replaceChildren(...f.view(), navBar());
  const sel = root.querySelector(".pills .sel");
  if (sel) requestAnimationFrame(() => sel.scrollIntoView({ inline: "center", block: "nearest" }));
  afterRender.forEach((fn) => { try { fn(); } catch {} });
}

/* ---------- sign in / out ---------- */
async function signIn() {
  try { await signInWithPopup(auth, new GoogleAuthProvider()); }
  catch (e) { renderLogin("Sign-in didn't work (" + (e.code || "unknown") + "). Please allow pop-ups and try again."); }
}
function renderLogin(msg) {
  root.replaceChildren(h("div", { class: "login" },
    h("h1", {}, "Us"),
    h("p", { class: "meta" }, "Our private little corner."),
    h("button", { class: "btn", onclick: signIn }, "Sign in with Google"),
    msg ? h("p", { class: "err" }, msg) : null));
}
function renderDenied() {
  root.replaceChildren(h("div", { class: "login" },
    h("h1", {}, "Hmm."),
    h("p", { class: "meta" }, "This Google account isn't allowed in. Sign out and use the right one."),
    h("button", { class: "btn", onclick: () => signOut(auth) }, "Sign out")));
}

/* ---------- live data: every feature lists the collections it needs ---------- */
function start() {
  setDoc(doc(db, "users", S.user.uid), {
    googleName: S.user.displayName || "", email: S.user.email || "", lastSeen: serverTimestamp()
  }, { merge: true }).catch(() => {});
  const onErr = (e) => e.code === "permission-denied" ? renderDenied() : toast("Connection problem. Check your internet.");
  const names = new Set(["users"]);
  features.forEach((f) => (f.collections || []).forEach((c) => names.add(c)));
  names.forEach((n) => unsubs.push(onSnapshot(collection(db, n), (snap) => {
    const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (n === "users") { S.users = {}; arr.forEach((u) => (S.users[u.id] = u)); }
    else S.data[n] = arr;
    render();
  }, onErr)));
  hooks.forEach((fn) => { try { const u = fn(); if (u) unsubs.push(u); } catch {} });
}
function stop() { unsubs.forEach((u) => u()); unsubs = []; S.data = {}; S.users = {}; }

export function boot() {
  onAuthStateChanged(auth, (u) => {
    stop(); S.user = u;
    if (u) {
      if (!S.tab) S.tab = features[0].id;
      root.replaceChildren(h("p", { class: "meta" }, "Loading…"));
      start();
    } else renderLogin();
  });
}
