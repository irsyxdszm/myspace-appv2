import { S, db, doc, setDoc, register, render, h, toast, avatar, nameOf, couple, showSheet, closeSheet, signOut, auth, getTheme, setTheme, goto } from "./core.js";
import { openChat } from "./chat.js";
import { pushCard } from "./push.js";

// Shrinks a chosen picture to a small square so it is quick to save and load.
function toSmallJpeg(file) {
  return new Promise((resolve, reject) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(img.width, img.height), c = document.createElement("canvas");
      c.width = c.height = 192;
      c.getContext("2d").drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 192, 192);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => reject(new Error("bad image"));
    img.src = url;
  });
}
function profileSheet() {
  const me = S.users[S.user.uid] || {};
  let newPhoto = null;
  const preview = h("div", { class: "avwrap" }, avatar(S.user.uid, "lg"));
  const f = {
    name: h("input", { maxlength: 30, placeholder: "Your name", value: me.name || me.googleName || "" }),
    photo: h("input", { type: "file", accept: "image/*" }),
    start: h("input", { type: "date", value: couple().startDate || "" })
  };
  f.photo.addEventListener("change", async () => {
    const file = f.photo.files && f.photo.files[0];
    if (!file) return;
    try {
      newPhoto = await toSmallJpeg(file);
      preview.replaceChildren(h("img", { class: "av lg", src: newPhoto, alt: "Preview" }));
    } catch (e) { toast("That picture couldn't be read. Try another one."); }
  });
  const save = async () => {
    const name = f.name.value.trim();
    if (!name) { toast("Please type your name."); return; }
    try {
      const mine = { name }; if (newPhoto) mine.photo = newPhoto;
      await setDoc(doc(db, "users", S.user.uid), mine, { merge: true });
      if (f.start.value) await setDoc(doc(db, "settings", "couple"), { startDate: f.start.value }, { merge: true });
      closeSheet();
    } catch (e) { toast("Couldn't save. Check your connection."); }
  };
  showSheet(
    h("h2", {}, "My profile"),
    preview,
    h("label", {}, "Profile photo", f.photo),
    h("label", {}, "Name", f.name),
    h("label", {}, "Our start date (shared by both of us)", f.start),
    h("div", { class: "row" }, h("button", { class: "btn ghost", onclick: closeSheet }, "Cancel"), h("button", { class: "btn", onclick: save }, "Save")));
}
const PAGES = [["💰", "Money", "Bills, expenses and savings goals", "money"], ["🍳", "Recipes", "Our saved recipes", "recipes"], ["📸", "Memories", "Photos and moments", "memories"]];
function linkCard() {
  return h("div", { class: "card" }, PAGES.map(([e, t, s, id]) =>
    h("button", { class: "item", style: "width:100%;text-align:left", onclick: () => goto(id) },
      h("span", { class: "ico" }, e), h("div", { class: "body" }, h("div", { class: "title" }, t), h("div", { class: "meta" }, s)))));
}
function view() {
  const ids = Object.keys(S.users).sort((a) => (a === S.user.uid ? -1 : 1));
  const theme = h("select", {}, [["auto", "Automatic"], ["light", "Light"], ["dark", "Dark"]].map(([v, l]) => h("option", { value: v }, l)));
  theme.value = getTheme();
  theme.addEventListener("change", () => { setTheme(theme.value); render(); });
  return [h("div", { class: "top" }, h("h1", {}, "More")),
    h("div", { class: "card" },
      ids.map((id) => h("div", { class: "item", style: "border:0;padding:6px 0" }, avatar(id), h("div", { class: "body" },
        h("div", { class: "title" }, nameOf(id) + (id === S.user.uid ? " (you)" : "")),
        h("div", { class: "meta" }, (S.users[id] || {}).email || "")))),
      h("div", { class: "row" }, h("button", { class: "btn", onclick: profileSheet }, "Edit my profile"))),
    linkCard(),
    pushCard(),
    h("div", { class: "card" }, h("button", { class: "btn", onclick: openChat }, "Open chat")),
    h("div", { class: "card" }, h("label", { class: "meta" }, "Appearance on this phone", theme)),
    h("div", { class: "card" },
      h("div", { class: "meta" }, "Signed in as"),
      h("div", { class: "title" }, S.user.email || ""),
      h("div", { class: "row" }, h("button", { class: "btn ghost", onclick: () => signOut(auth) }, "Sign out of this phone"))),
    h("div", { class: "card" }, h("div", { class: "meta" }, "More pages (Chat, Bills, Notes and more) are coming soon."))];
}
register({ id: "more", label: "More", order: 99, collections: ["settings"], icon: "M5 12h.01M12 12h.01M19 12h.01", view });
