import { S, db, doc, setDoc, deleteDoc, serverTimestamp, fbApp, hooks, render, h, toast, showSheet, closeSheet } from "./core.js";
import { VAPID_KEY } from "./push-config.js";

const MSG_URL = "https://www.gstatic.com/firebasejs/13.1.0/firebase-messaging.js";
const KEY = "us-push-token";
const UA = navigator.userAgent || "";
const isIOS = /iPhone|iPad|iPod/.test(UA);
const standalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const supported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const stored = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const store = (t) => { try { t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY); } catch {} };

export function pushStatus() {
  if (!supported()) return isIOS && !standalone() ? "needs-install" : "unsupported";
  if (Notification.permission === "denied") return "denied";
  return Notification.permission === "granted" && stored() ? "on" : "off";
}
async function fetchToken() {
  const m = await import(MSG_URL);
  const reg = await navigator.serviceWorker.ready;
  return m.getToken(m.getMessaging(fbApp), { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
}
// Remember this phone in the database so the worker knows where to send alerts.
const saveDevice = (token) => setDoc(doc(db, "devices", token), { uid: S.user.uid, platform: isIOS ? "iPhone" : "other", updatedAt: serverTimestamp() }, { merge: true });

async function enable() {
  try {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") { toast("Notifications weren't allowed. You can change this in iPhone Settings."); render(); return; }
    const token = await fetchToken();
    if (!token) throw new Error("no token");
    await saveDevice(token); store(token);
    toast("Notifications are on for this phone.");
  } catch (e) {
    console.error(e);
    toast("Couldn't turn on notifications: " + String(e.code || e.message || "unknown").slice(0, 80));
  }
  render();
}
async function disable() {
  const t = stored();
  try { if (t) await deleteDoc(doc(db, "devices", t)); } catch {}
  try { const m = await import(MSG_URL); await m.deleteToken(m.getMessaging(fbApp)); } catch {}
  store(null); toast("Notifications are off for this phone."); render();
}
// Each time the app opens, keep this phone's address fresh (it can change now and then).
hooks.push(() => {
  if (supported() && Notification.permission === "granted" && stored()) {
    fetchToken().then(async (t) => {
      if (!t) return;
      if (t !== stored()) { try { await deleteDoc(doc(db, "devices", stored())); } catch {} }
      await saveDevice(t); store(t);
    }).catch(() => {});
  }
});
function showToken() {
  const t = stored() || "";
  const box = h("input", { type: "text", value: t, readonly: true });
  const copy = async () => { try { await navigator.clipboard.writeText(t); toast("Copied."); } catch { box.select(); toast("Press and hold the text, then tap Copy."); } };
  showSheet(h("h2", {}, "This phone's alert address"),
    h("div", { class: "meta" }, "Only needed for testing. It isn't a password, but there's no need to share it."), box,
    h("div", { class: "row" }, h("button", { class: "btn ghost", onclick: closeSheet }, "Close"), h("button", { class: "btn", onclick: copy }, "Copy")));
}
export function pushCard() {
  const st = pushStatus();
  const kids = [h("div", { class: "title" }, "Notifications")];
  const say = (t) => kids.push(h("div", { class: "meta", style: "margin-top:4px" }, t));
  if (st === "needs-install") say("To get alerts on iPhone, open this app from its Home Screen icon (not from Safari). If it isn't there yet: Share button, then Add to Home Screen.");
  else if (st === "unsupported") say("This phone or browser can't show alerts for this app.");
  else if (st === "denied") say("Alerts are blocked. Turn them back on in iPhone Settings, then Notifications, then this app.");
  else if (st === "off") { say("Get a buzz for reminders and when your partner adds something."); kids.push(h("div", { class: "row" }, h("button", { class: "btn", onclick: enable }, "Turn on notifications"))); }
  else {
    say("Notifications are on for this phone.");
    kids.push(h("div", { class: "row" }, h("button", { class: "btn ghost", onclick: disable }, "Turn off"), h("button", { class: "btn ghost", onclick: showToken }, "Alert address")));
  }
  return h("div", { class: "card" }, ...kids);
}
