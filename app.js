const $ = (id) => document.getElementById(id);
const PEOPLE = { irsyad: 'Irsyad', ain: 'Ain' };
const KEYS = Object.keys(PEOPLE);

/* ---------- Saved data (on this device) ---------- */
const read = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch {} };
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const clean = (d) => {
  const arr = (k) => (Array.isArray(d && d[k]) ? d[k] : []);
  return {
    irsyad: arr('irsyad'), ain: arr('ain'), events: arr('events'), restock: arr('restock'),
    memories: arr('memories'), notes: arr('notes'), recipes: arr('recipes'),
    start: typeof (d && d.start) === 'string' ? d.start : '',
  };
};
// Also picks up lists saved by older versions of the app.
let data = clean(read('myspace-data') || { irsyad: read('tasks-irsyad'), ain: read('tasks-ain') });
const isDirty = () => localStorage.getItem('myspace-dirty') === '1';
const hasData = () => Object.values(data).some((v) => Array.isArray(v) && v.length);

/* ---------- Small helpers ---------- */
const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const toDate = (s) => new Date(s + 'T00:00:00');
const longDay = (s) => toDate(s).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
const shortDay = (s) => toDate(s).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const fmtTime = (t) => (t ? new Date('1970-01-01T' + t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '');
const byWhen = (a, b) => a.date.localeCompare(b.date) || (a.time || '99:99').localeCompare(b.time || '99:99');
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const lines = (s) => s.split('\n').map((x) => x.trim()).filter(Boolean);
const HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-4.6-9.3-9A5.3 5.3 0 0 1 12 6.6 5.3 5.3 0 0 1 21.3 12C19 16.4 12 21 12 21z"/></svg>';

function chipGroup(root, attr, value, onChange) {      // a row of buttons where one is chosen
  const btns = [...root.querySelectorAll('button')];
  const paint = (v) => btns.forEach((b) => b.classList.toggle('on', b.dataset[attr] === v));
  paint(value);
  btns.forEach((b) => { b.onclick = () => { value = b.dataset[attr]; paint(value); if (onChange) onChange(value); }; });
  return () => value;
}

let taskFilter = 'all';
let taskFor = lsGet('task-for') || 'irsyad';
let calFilter = 'all';
let calFor = lsGet('cal-for') || 'both';
let restockFilter = 'all';
let restockFor = lsGet('restock-for') || 'wet';
let moreTab = lsGet('more-tab') || 'memories';
let selDay = ymd(new Date());
let calMonth = new Date(); calMonth.setDate(1);
let currentView = 'home';
const WHO = { both: 'Irsyad & Ain', irsyad: 'Irsyad', ain: 'Ain' };
const evWho = (e) => (e.who === 'irsyad' || e.who === 'ain' ? e.who : 'both');   // older events count as both
const visibleEvents = () => data.events.filter((e) => calFilter === 'all' || evWho(e) === 'both' || evWho(e) === calFilter);
function goDay(date) { selDay = date; const d = toDate(date); calMonth = new Date(d.getFullYear(), d.getMonth(), 1); }

function changed() {                       // call after any edit
  write('myspace-data', data);
  write('myspace-dirty', '1');
  schedule();
}

/* ---------- Screens ---------- */
const VIEWS = ['home', 'tasks', 'restock', 'cal', 'more', 'chat', 'settings', 'wallpaper'];
function render(view) {                    // draw one screen without scrolling
  if (view === 'home') renderHome();
  if (view === 'tasks') renderTasks();
  if (view === 'restock') renderRestock();
  if (view === 'cal') renderCal();
  if (view === 'more') renderMore();
}
const refresh = () => render(currentView);

function setFab(view) {
  let f = null;
  if (view === 'cal') f = ['New event', () => openEventSheet()];
  if (view === 'more') {
    f = moreTab === 'memories' ? ['New memory', () => openMemorySheet()]
      : moreTab === 'notes' ? ['New note', () => openNoteSheet()] : ['New recipe', () => openRecipeSheet()];
  }
  $('fabwrap').hidden = !f;
  if (f) { $('fab').textContent = '+ ' + f[0]; $('fab').onclick = f[1]; }
}

function route() {
  let page = location.hash.slice(1);
  if (page === 'irsyad' || page === 'ain') { taskFilter = page; page = 'tasks'; }   // links from older versions
  if (['memories', 'notes', 'recipes'].includes(page)) { moreTab = page; page = 'more'; }
  if (!VIEWS.includes(page || 'home')) page = '';
  const view = page || 'home';
  currentView = view;
  VIEWS.forEach((v) => { $(v).hidden = v !== view; });
  const tab = ['chat', 'settings', 'wallpaper'].includes(view) ? '' : page;      // those belong to Home
  document.querySelectorAll('#tabs a').forEach((a) => a.classList.toggle('on', a.dataset.p === tab));
  clearInterval(chatTimer);
  render(view);
  if (view === 'home') chatSync();
  if (view === 'chat') openChat();
  if (view === 'settings') {
    const c = read('gh-config');
    $('owner').value = c ? c.owner : '';
    $('repo').value = c ? c.repo : '';
    $('token').value = '';
    $('cfg-msg').textContent = c ? 'Connected. Enter a new token only if you want to change it.' : '';
    $('token').required = !c;
  }
  setFab(view);
  if (view !== 'home' && $('q').value) { $('q').value = ''; $('q').oninput(); }
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);

/* ---------- Sheets (pop-up panels) ---------- */
let closeSheet = () => {};
function openSheet(title, build) {
  $('sheet-title').textContent = title;
  $('sheet-body').innerHTML = '';
  $('sheet').hidden = false;
  document.body.style.overflow = 'hidden';
  closeSheet = () => { $('sheet').hidden = true; document.body.style.overflow = ''; $('sheet-body').innerHTML = ''; };
  build($('sheet-body'), closeSheet);
}
$('sheet-x').onclick = () => closeSheet();
$('sheet-bg').onclick = () => closeSheet();
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('sheet').hidden) closeSheet(); });

function withMe(cb) {                      // some actions need to know who is using this device
  if (me) return cb();
  openSheet('Who are you?', (body, close) => {
    body.innerHTML = '<p class="lede">So the app knows who you are on this device.</p><div class="actions"><button type="button" class="primary" data-w="irsyad">I am Irsyad</button><button type="button" class="primary" data-w="ain">I am Ain</button></div>';
    body.querySelectorAll('button').forEach((b) => { b.onclick = () => { me = b.dataset.w; write('chat-me', me); close(); cb(); }; });
  });
}

/* ---------- Tasks (Irsyad and Ain in one list) ---------- */
function renderTasks() {
  document.querySelectorAll('#tfilter button').forEach((b) => b.classList.toggle('on', b.dataset.f === taskFilter));
  document.querySelectorAll('#tfor button').forEach((b) => b.classList.toggle('on', b.dataset.k === taskFor));
  const rows = [];
  for (const k of KEYS) for (const t of data[k]) rows.push({ k, t });
  rows.sort((a, b) => (+!!a.t.done - +!!b.t.done) || (b.t.id - a.t.id));
  const shown = taskFilter === 'all' ? rows : rows.filter((r) => r.k === taskFilter);
  const list = $('list');
  list.innerHTML = '';
  for (const { k, t } of shown) {
    const li = el('li', t.done ? 'done' : '');
    const box = el('input');
    box.type = 'checkbox'; box.checked = !!t.done;
    box.setAttribute('aria-label', 'Mark done: ' + t.text);
    box.onchange = () => { t.done = box.checked; changed(); renderTasks(); };
    const who = el('i', 'av', PEOPLE[k][0]);
    who.title = PEOPLE[k];
    const del = el('button', 'del', '×');
    del.type = 'button';
    del.setAttribute('aria-label', 'Delete: ' + t.text);
    del.onclick = () => { data[k] = data[k].filter((x) => x.id !== t.id); changed(); renderTasks(); };
    li.append(box, el('span', '', t.text), who, del);
    list.append(li);
  }
  const open = shown.filter((r) => !r.t.done).length;
  $('count').textContent = shown.length ? open + ' open' : '';
  $('empty').hidden = shown.length > 0;
  $('clear').hidden = !rows.some((r) => r.t.done);
}
document.querySelectorAll('#tfilter button').forEach((b) => {
  b.onclick = () => { taskFilter = b.dataset.f; if (taskFilter !== 'all') { taskFor = taskFilter; write('task-for', taskFor); } renderTasks(); };
});
document.querySelectorAll('#tfor button').forEach((b) => {
  b.onclick = () => { taskFor = b.dataset.k; write('task-for', taskFor); if (taskFilter !== 'all') taskFilter = taskFor; renderTasks(); };
});
$('add').onsubmit = (e) => {
  e.preventDefault();
  const text = $('text').value.trim();
  if (!text) return;
  data[taskFor].unshift({ id: Date.now(), text, done: false });
  $('text').value = '';
  changed(); renderTasks();
};
$('clear').onclick = () => { for (const k of KEYS) data[k] = data[k].filter((t) => !t.done); changed(); renderTasks(); };

/* ---------- Restock (kitchen wet/dry, personal for Irsyad or Ain) ---------- */
const CATS = { wet: 'Kitchen · Wet', dry: 'Kitchen · Dry', irsyad: "Irsyad's personal items", ain: "Ain's personal items" };
function renderRestock() {
  document.querySelectorAll('#rfilter button').forEach((b) => b.classList.toggle('on', b.dataset.f === restockFilter));
  document.querySelectorAll('#rfor button').forEach((b) => b.classList.toggle('on', b.dataset.k === restockFor));
  const box = $('rlist');
  box.innerHTML = '';
  let total = 0, open = 0;
  for (const c of restockFilter === 'all' ? Object.keys(CATS) : [restockFilter]) {
    const items = data.restock.filter((i) => i.cat === c).sort((a, b) => (+!!a.done - +!!b.done) || (b.id - a.id));
    if (!items.length) continue;
    box.append(el('h3', '', CATS[c]));
    const ul = el('ul');
    for (const i of items) {
      total++; if (!i.done) open++;
      const li = el('li', i.done ? 'done' : '');
      const cb = el('input');
      cb.type = 'checkbox'; cb.checked = !!i.done;
      cb.setAttribute('aria-label', 'Bought: ' + i.text);
      cb.onchange = () => { i.done = cb.checked; changed(); renderRestock(); };
      const del = el('button', 'del', '×');
      del.type = 'button';
      del.setAttribute('aria-label', 'Delete: ' + i.text);
      del.onclick = () => { data.restock = data.restock.filter((x) => x.id !== i.id); changed(); renderRestock(); };
      li.append(cb, el('span', '', i.text), del);
      ul.append(li);
    }
    box.append(ul);
  }
  $('rcount').textContent = total ? open + ' to buy' : '';
  $('rempty').hidden = total > 0;
  $('rclear').hidden = !data.restock.some((i) => i.done);
}
document.querySelectorAll('#rfilter button').forEach((b) => {
  b.onclick = () => { restockFilter = b.dataset.f; if (restockFilter !== 'all') { restockFor = restockFilter; write('restock-for', restockFor); } renderRestock(); };
});
document.querySelectorAll('#rfor button').forEach((b) => {
  b.onclick = () => { restockFor = b.dataset.k; write('restock-for', restockFor); if (restockFilter !== 'all') restockFilter = restockFor; renderRestock(); };
});
$('radd').onsubmit = (e) => {
  e.preventDefault();
  const text = $('rtext').value.trim();
  if (!text) return;
  data.restock.unshift({ id: Date.now(), cat: restockFor, text, done: false });
  $('rtext').value = '';
  changed(); renderRestock();
};
$('rclear').onclick = () => { data.restock = data.restock.filter((i) => !i.done); changed(); renderRestock(); };

/* ---------- Calendar (Monday first, like the picture) ---------- */
function renderCal() {
  document.querySelectorAll('#cfilter button').forEach((b) => b.classList.toggle('on', b.dataset.f === calFilter));
  const y = calMonth.getFullYear(), m = calMonth.getMonth();
  $('cal-title').textContent = calMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const blanks = (new Date(y, m, 1).getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate();
  const byDay = {};
  for (const e of visibleEvents()) (byDay[e.date] = byDay[e.date] || []).push(e);
  const todayKey = ymd(new Date());
  const grid = $('cal-grid');
  grid.innerHTML = '';
  for (let i = 0; i < blanks; i++) grid.append(el('span'));
  for (let d = 1; d <= days; d++) {
    const key = ymd(new Date(y, m, d));
    const b = el('button', 'day' + (key === todayKey ? ' today' : '') + (key === selDay ? ' sel' : ''));
    b.type = 'button';
    b.append(el('span', 'num', String(d)));
    const list = byDay[key] || [];
    if (list.length) {
      const dots = el('div', 'dots');
      for (const w of ['irsyad', 'ain', 'both']) {
        if (list.some((e) => evWho(e) === w)) dots.append(el('i', w === 'irsyad' ? 'd-i' : w === 'ain' ? 'd-a' : 'd-b'));
      }
      b.append(dots);
    }
    b.setAttribute('aria-label', longDay(key) + (list.length ? ', ' + list.length + ' planned' : ''));
    b.onclick = () => { selDay = key; renderCal(); };
    grid.append(b);
  }
  renderDay();
  renderUpcoming(todayKey);
}
function evSmall(e, extra) {
  return [extra, fmtTime(e.time), e.kind === 'reminder' ? 'Reminder' : 'Event', WHO[evWho(e)]].filter(Boolean).join(' · ');
}
function renderDay() {
  $('day-title').textContent = longDay(selDay);
  const items = visibleEvents().filter((e) => e.date === selDay).sort(byWhen);
  const ul = $('day-list');
  ul.innerHTML = '';
  for (const e of items) {
    const li = el('li', e.done ? 'done' : '');
    let lead;
    if (e.kind === 'reminder') {
      lead = el('input');
      lead.type = 'checkbox'; lead.checked = !!e.done;
      lead.setAttribute('aria-label', 'Mark done: ' + e.title);
      lead.onchange = () => { e.done = lead.checked; changed(); renderCal(); };
    } else lead = el('i', 'evdot');
    const body = el('span', '', e.title);
    body.style.cursor = 'pointer';
    body.append(el('small', '', evSmall(e)));
    body.onclick = () => openEventSheet(e);
    li.append(lead, body);
    if (evWho(e) !== 'both') li.append(el('i', 'av', PEOPLE[evWho(e)][0]));
    ul.append(li);
  }
  $('day-empty').hidden = items.length > 0;
}
function renderUpcoming(todayKey) {
  const up = visibleEvents().filter((e) => e.date >= todayKey).sort(byWhen).slice(0, 8);
  const box = $('upcoming');
  box.innerHTML = '';
  for (const e of up) {
    const row = el('div', 'trow');
    row.style.cursor = 'pointer';
    const chip = el('div', 'datechip');
    chip.append(el('small', '', toDate(e.date).toLocaleDateString(undefined, { month: 'short' })), el('b', '', String(toDate(e.date).getDate())));
    const body = el('div', 'tbody');
    body.append(el('b', '', e.title), el('small', '', evSmall(e)));
    row.append(chip, body);
    row.onclick = () => { goDay(e.date); renderCal(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
    box.append(row);
  }
  $('up-empty').hidden = up.length > 0;
}
const shiftMonth = (n) => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + n, 1); renderCal(); };
$('prev').onclick = () => shiftMonth(-1);
$('next').onclick = () => shiftMonth(1);
let swipeX = null;                          // swipe the calendar left or right to change month
$('calcard').addEventListener('touchstart', (e) => { swipeX = e.touches[0].clientX; }, { passive: true });
$('calcard').addEventListener('touchend', (e) => {
  if (swipeX === null) return;
  const dx = e.changedTouches[0].clientX - swipeX;
  swipeX = null;
  if (Math.abs(dx) > 50) shiftMonth(dx < 0 ? 1 : -1);
});
document.querySelectorAll('#cfilter button').forEach((b) => {
  b.onclick = () => { calFilter = b.dataset.f; if (calFilter !== 'all') { calFor = calFilter; write('cal-for', calFor); } renderCal(); };
});

function openEventSheet(ev) {
  const isNew = !ev;
  const e = ev || { id: Date.now(), date: selDay, time: '', title: '', kind: 'event', who: calFor, done: false };
  openSheet(isNew ? 'New event' : 'Edit event', (body, close) => {
    body.innerHTML = `
      <label class="fld">Title<input id="s-title" type="text" placeholder="e.g. Dinner, bill due"></label>
      <div class="row2">
        <label class="fld">Date<input id="s-date" type="date"></label>
        <label class="fld">Time (optional)<input id="s-time" type="time"></label>
      </div>
      <div class="fld">Type<div class="chips" id="s-kind"><button type="button" data-v="event">Event</button><button type="button" data-v="reminder">Reminder</button></div></div>
      <div class="fld">For<div class="chips" id="s-who"><button type="button" data-v="both">Both</button><button type="button" data-v="irsyad">Irsyad</button><button type="button" data-v="ain">Ain</button></div></div>
      <p id="s-err" class="err"></p>
      <div class="actions"><button type="button" id="s-save" class="primary">Save</button>${isNew ? '' : '<button type="button" id="s-del" class="danger">Delete</button>'}</div>`;
    $('s-title').value = e.title; $('s-date').value = e.date; $('s-time').value = e.time || '';
    const kind = chipGroup($('s-kind'), 'v', e.kind || 'event');
    const who = chipGroup($('s-who'), 'v', evWho(e));
    $('s-save').onclick = () => {
      const title = $('s-title').value.trim(), date = $('s-date').value;
      if (!title || !date) { $('s-err').textContent = 'Please add a title and a date.'; return; }
      Object.assign(e, { title, date, time: $('s-time').value, kind: kind(), who: who() });
      if (isNew) data.events.push(e);
      calFor = e.who; write('cal-for', calFor);
      changed(); close(); goDay(date); refresh();
    };
    if (!isNew) $('s-del').onclick = () => {
      if (!confirm('Delete this event?')) return;
      data.events = data.events.filter((x) => x.id !== e.id);
      changed(); close(); refresh();
    };
  });
}

/* ---------- Photos (kept on the device, shared through GitHub) ---------- */
const memBlobs = new Map();
const idb = () => new Promise((res, rej) => {
  const r = indexedDB.open('myspace', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('photos');
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});
async function idbGet(k) {
  if (memBlobs.has(k)) return memBlobs.get(k);
  try {
    const db = await idb();
    return await new Promise((res) => { const q = db.transaction('photos').objectStore('photos').get(k); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); });
  } catch { return null; }
}
async function idbPut(k, v) {
  memBlobs.set(k, v);
  try {
    const db = await idb();
    await new Promise((res) => { const t = db.transaction('photos', 'readwrite'); t.objectStore('photos').put(v, k); t.oncomplete = res; t.onerror = res; });
  } catch {}
}
function shrink(file, max = 1200) {         // make a big photo small enough to save and share
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), im = new Image();
    im.onload = () => {
      const sc = Math.min(1, max / Math.max(im.width, im.height));
      const cv = document.createElement('canvas');
      cv.width = Math.round(im.width * sc); cv.height = Math.round(im.height * sc);
      cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url);
      cv.toBlob((b) => (b ? res(b) : rej(new Error('blob'))), 'image/jpeg', 0.82);
    };
    im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('image')); };
    im.src = url;
  });
}
const blobToDataURL = (b) => new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b); });
const urlCache = new Map();
async function photoURL(path) {
  if (urlCache.has(path)) return urlCache.get(path);
  let blob = await idbGet(path);
  if (!blob) {
    const c = read('gh-config');
    if (!c) return null;
    try {
      const r = await fetch(API(c, path), { headers: { ...hdr(c), Accept: 'application/vnd.github.raw+json' }, cache: 'no-store' });
      if (!r.ok) return null;
      blob = await r.blob();
      await idbPut(path, blob);
    } catch { return null; }
  }
  const u = URL.createObjectURL(blob);
  urlCache.set(path, u);
  return u;
}
async function uploadPhoto(path) {
  const c = read('gh-config');
  if (!c) return false;
  const blob = await idbGet(path);
  if (!blob) return true;
  const content = (await blobToDataURL(blob)).split(',')[1];
  const r = await fetch(API(c, path), { method: 'PUT', headers: { ...hdr(c), 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Add photo', content }) });
  return r.ok || r.status === 422;           // 422 means it is already there
}
let flushing = false;
async function flushUploads() {
  const list = read('pending-photos') || [];
  if (flushing || !list.length || !read('gh-config') || !navigator.onLine) return;
  flushing = true;
  const left = [];
  for (const p of list) { let ok = false; try { ok = await uploadPhoto(p); } catch {} if (!ok) left.push(p); }
  write('pending-photos', left);
  flushing = false;
}
async function deletePhoto(path) {          // best effort: remove the file from GitHub too
  const c = read('gh-config');
  if (!c || !path) return;
  try {
    const g = await fetch(API(c, path), { headers: hdr(c), cache: 'no-store' });
    if (!g.ok) return;
    const j = await g.json();
    await fetch(API(c, path), { method: 'DELETE', headers: { ...hdr(c), 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Delete photo', sha: j.sha }) });
  } catch {}
}
function showPhoto(holder, path, alt) {      // fill a box with the photo when it is ready
  photoURL(path).then((u) => { if (u && holder.isConnected) { const img = el('img'); img.src = u; img.alt = alt; holder.replaceChildren(img); } });
}

/* ---------- More: Memories, Notes, Recipes ---------- */
function renderMore() {
  document.querySelectorAll('#moretabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === moreTab));
  for (const t of ['memories', 'notes', 'recipes']) $('m-' + t).hidden = t !== moreTab;
  if (moreTab === 'memories') renderMemories();
  else if (moreTab === 'notes') renderNotes();
  else renderRecipes();
}
document.querySelectorAll('#moretabs button').forEach((b) => {
  b.onclick = () => { moreTab = b.dataset.t; write('more-tab', moreTab); renderMore(); setFab('more'); };
});
function openMore(tab) { moreTab = tab; write('more-tab', tab); }

/* Memories (photos with hearts) */
function paintHeart(btn, m) {
  const liked = !!me && m.hearts.includes(me);
  btn.classList.toggle('liked', liked);
  btn.innerHTML = HEART + (m.hearts.length ? '<span>' + m.hearts.length + '</span>' : '');
  btn.setAttribute('aria-label', liked ? 'Remove heart' : 'Add heart');
}
function toggleHeart(m, btn) {
  withMe(() => {
    m.hearts = m.hearts.includes(me) ? m.hearts.filter((x) => x !== me) : [...m.hearts, me];
    changed(); paintHeart(btn, m);
  });
}
function renderMemories() {
  const box = $('mem-grid');
  box.innerHTML = '';
  const list = [...data.memories].sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.id - a.id);
  $('mem-empty').hidden = list.length > 0;
  for (const m of list) {
    m.hearts = Array.isArray(m.hearts) ? m.hearts : [];
    const card = el('div', 'memcard glass');
    const ph = el('div', 'memph', m.photo ? '' : 'No photo');
    if (m.photo) showPhoto(ph, m.photo, m.title);
    const heart = el('button', 'heart');
    heart.type = 'button';
    paintHeart(heart, m);
    heart.onclick = (e) => { e.stopPropagation(); toggleHeart(m, heart); };
    card.append(ph, el('h4', '', m.title), el('small', '', shortDay(m.date)), heart);
    card.onclick = () => openMemoryDetail(m);
    box.append(card);
  }
}
function openMemorySheet() {
  openSheet('New memory', (body, close) => {
    let blob = null;
    body.innerHTML = `
      <div class="photopick" id="m-pick" role="button" tabindex="0"><span id="m-hint">Tap to add a photo</span></div>
      <input id="m-file" type="file" accept="image/*" hidden>
      <label class="fld">Title<input id="m-title" type="text" placeholder="What happened?"></label>
      <label class="fld">Date<input id="m-date" type="date"></label>
      <p id="m-err" class="err"></p>
      <div class="actions"><button type="button" id="m-save" class="primary">Save memory</button></div>`;
    $('m-date').value = ymd(new Date());
    const pick = $('m-pick');
    pick.onclick = () => $('m-file').click();
    pick.onkeydown = (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); $('m-file').click(); } };
    $('m-file').onchange = async (ev) => {
      const f = ev.target.files[0];
      if (!f) return;
      $('m-hint').textContent = 'Preparing photo…';
      try {
        blob = await shrink(f);
        pick.style.backgroundImage = 'url("' + URL.createObjectURL(blob) + '")';
        pick.classList.add('has');
        $('m-hint').textContent = 'Change photo';
      } catch { blob = null; $('m-hint').textContent = "Couldn't read that image"; }
    };
    $('m-save').onclick = async () => {
      const title = $('m-title').value.trim();
      if (!title) { $('m-err').textContent = 'Please add a title.'; return; }
      const id = Date.now();
      let photo = '';
      if (blob) {
        photo = 'photos/' + id + '.jpg';
        await idbPut(photo, blob);
        write('pending-photos', [...(read('pending-photos') || []), photo]);
      }
      data.memories.unshift({ id, title, date: $('m-date').value || ymd(new Date()), photo, hearts: [], by: me || '' });
      changed(); close(); refresh(); flushUploads();
    };
  });
}
function openMemoryDetail(m) {
  openSheet(m.title, (body, close) => {
    body.innerHTML = '<div class="bigph" id="d-ph"></div><p class="lede" id="d-meta"></p><div class="actions"><button type="button" class="heart big" id="d-heart"></button><button type="button" class="danger" id="d-del">Delete</button></div>';
    if (m.photo) showPhoto($('d-ph'), m.photo, m.title); else $('d-ph').hidden = true;
    $('d-meta').textContent = longDay(m.date) + (m.by && PEOPLE[m.by] ? ' · added by ' + PEOPLE[m.by] : '');
    paintHeart($('d-heart'), m);
    $('d-heart').onclick = () => toggleHeart(m, $('d-heart'));
    $('d-del').onclick = () => {
      if (!confirm('Delete this memory?')) return;
      data.memories = data.memories.filter((x) => x.id !== m.id);
      changed(); close(); refresh(); deletePhoto(m.photo);
    };
  });
}

/* Notes */
function renderNotes() {
  const box = $('note-grid');
  box.innerHTML = '';
  const list = [...data.notes].sort((a, b) => (b.t || 0) - (a.t || 0));
  $('note-empty').hidden = list.length > 0;
  for (const n of list) {
    const card = el('div', 'notecard glass');
    card.append(el('h4', '', n.title || (n.text || '').split('\n')[0] || 'Note'));
    if (n.title && n.text) card.append(el('p', '', n.text));
    card.append(el('small', '', [new Date(n.t || n.id).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), PEOPLE[n.by]].filter(Boolean).join(' · ')));
    card.onclick = () => openNoteSheet(n);
    box.append(card);
  }
}
function openNoteSheet(n) {
  const isNew = !n;
  const note = n || { id: Date.now(), title: '', text: '', by: me || '', t: Date.now() };
  openSheet(isNew ? 'New note' : 'Note', (body, close) => {
    body.innerHTML = `
      <label class="fld">Title (optional)<input id="n-title" type="text"></label>
      <label class="fld">Note<textarea id="n-text" rows="8"></textarea></label>
      <p id="n-err" class="err"></p>
      <div class="actions"><button type="button" id="n-save" class="primary">Save</button>${isNew ? '' : '<button type="button" id="n-del" class="danger">Delete</button>'}</div>`;
    $('n-title').value = note.title; $('n-text').value = note.text;
    $('n-save').onclick = () => {
      const title = $('n-title').value.trim(), text = $('n-text').value.trim();
      if (!title && !text) { $('n-err').textContent = 'Write something first.'; return; }
      Object.assign(note, { title, text, t: Date.now() });
      if (isNew) data.notes.unshift(note);
      changed(); close(); refresh();
    };
    if (!isNew) $('n-del').onclick = () => {
      if (!confirm('Delete this note?')) return;
      data.notes = data.notes.filter((x) => x.id !== note.id);
      changed(); close(); refresh();
    };
  });
}

/* Recipes */
function renderRecipes() {
  const q = $('rq').value.trim().toLowerCase();
  const list = data.recipes
    .filter((r) => !q || r.title.toLowerCase().includes(q) || (r.ingredients || []).some((i) => i.toLowerCase().includes(q)))
    .sort((a, b) => a.title.localeCompare(b.title));
  const box = $('rec-grid');
  box.innerHTML = '';
  $('rec-empty').hidden = list.length > 0;
  $('rec-empty').textContent = q ? 'No recipes match your search.' : 'No recipes yet. Tap + New recipe to add one.';
  for (const r of list) {
    const card = el('div', 'reccard glass');
    const ing = (r.ingredients || []).length, st = (r.steps || []).length;
    card.append(el('h4', '', r.title), el('small', '', ing + (ing === 1 ? ' ingredient' : ' ingredients')), el('small', '', st + (st === 1 ? ' step' : ' steps')));
    card.onclick = () => openRecipeDetail(r);
    box.append(card);
  }
}
$('rq').oninput = renderRecipes;
function openRecipeDetail(r) {
  openSheet(r.title, (body, close) => {
    const info = el('div', 'card');
    const kv = el('div', 'kv');
    kv.append(el('span', '', 'Added by'), el('b', '', PEOPLE[r.by] || '—'));
    info.append(kv);
    const ing = el('div', 'card');
    ing.append(el('p', 'cap', 'Ingredients · ' + (r.ingredients || []).length));
    const ul = el('ul');
    for (const i of r.ingredients || []) ul.append(el('li', '', i));
    ing.append(ul);
    const met = el('div', 'card');
    met.append(el('p', 'cap', 'Method · ' + (r.steps || []).length + ((r.steps || []).length === 1 ? ' step' : ' steps')));
    const ol = el('ol');
    for (const s of r.steps || []) ol.append(el('li', '', s));
    met.append(ol);
    const act = el('div', 'actions');
    const edit = el('button', 'primary', 'Edit'); edit.type = 'button';
    const del = el('button', 'danger', 'Delete'); del.type = 'button';
    edit.onclick = () => { close(); openRecipeSheet(r); };
    del.onclick = () => {
      if (!confirm('Delete this recipe?')) return;
      data.recipes = data.recipes.filter((x) => x.id !== r.id);
      changed(); close(); refresh();
    };
    act.append(edit, del);
    body.append(info, ing, met, act);
  });
}
function openRecipeSheet(r) {
  const isNew = !r;
  const rec = r || { id: Date.now(), title: '', ingredients: [], steps: [], by: me || 'irsyad', t: Date.now() };
  openSheet(isNew ? 'New recipe' : 'Edit recipe', (body, close) => {
    body.innerHTML = `
      <label class="fld">Name<input id="r-title" type="text" placeholder="e.g. Mee cotcot"></label>
      <label class="fld">Ingredients (one per line)<textarea id="r-ing" rows="6"></textarea></label>
      <label class="fld">Method (one step per line)<textarea id="r-steps" rows="5"></textarea></label>
      <div class="fld">Added by<div class="chips" id="r-by"><button type="button" data-v="irsyad">Irsyad</button><button type="button" data-v="ain">Ain</button></div></div>
      <p id="r-err" class="err"></p>
      <div class="actions"><button type="button" id="r-save" class="primary">Save recipe</button></div>`;
    $('r-title').value = rec.title; $('r-ing').value = (rec.ingredients || []).join('\n'); $('r-steps').value = (rec.steps || []).join('\n');
    const by = chipGroup($('r-by'), 'v', rec.by === 'ain' ? 'ain' : 'irsyad');
    $('r-save').onclick = () => {
      const title = $('r-title').value.trim();
      if (!title) { $('r-err').textContent = 'Please add a name.'; return; }
      Object.assign(rec, { title, ingredients: lines($('r-ing').value), steps: lines($('r-steps').value), by: by() });
      if (isNew) data.recipes.push(rec);
      changed(); close(); refresh();
    };
  });
}

/* ---------- Home ---------- */
function fill(box, rows, emptyText) {
  box.innerHTML = '';
  if (!rows.length) box.append(el('p', 'muted', emptyText));
  else box.append(...rows);
}
function evRow(e, extra) {                 // one event or reminder as a card
  const row = el('div', 'trow' + (e.done ? ' done' : ''));
  let lead;
  if (e.kind === 'reminder') {
    lead = el('button', 'circ' + (e.done ? ' tick' : ''));
    lead.type = 'button';
    lead.setAttribute('aria-label', (e.done ? 'Mark not done: ' : 'Mark done: ') + e.title);
    lead.onclick = () => { e.done = !e.done; changed(); renderHome(); };
  } else lead = el('span', 'circ ev');
  const a = el('a', 'tbody');
  a.href = '#cal';
  a.onclick = () => goDay(e.date);
  a.append(el('b', '', e.title), el('small', '', evSmall(e, extra)));
  row.append(lead, a);
  return row;
}
function renderHome() {
  const todayKey = ymd(new Date());
  $('today').textContent = longDay(todayKey);
  if (data.start) {
    const d = Math.floor((new Date().setHours(0, 0, 0, 0) - toDate(data.start)) / 864e5);
    $('days').textContent = Math.max(0, d).toLocaleString();
  } else $('days').textContent = '–';
  $('startdate').value = data.start || '';

  const other = me === 'irsyad' ? 'Ain' : me === 'ain' ? 'Irsyad' : null;
  $('chat-title').textContent = other ? 'Chat with ' + other : 'Chat';
  const last = msgs[msgs.length - 1];
  $('chat-prev').textContent = last ? last.text : 'Say hello!';

  const end = new Date(); end.setDate(end.getDate() + 14);
  const endKey = ymd(end);
  const todays = data.events.filter((e) => e.date === todayKey || (e.kind === 'reminder' && !e.done && e.date < todayKey)).sort(byWhen);
  fill($('home-today'), todays.map((e) => evRow(e, e.date < todayKey ? 'Overdue · ' + shortDay(e.date) : '')), 'Nothing planned for today.');
  const soon = data.events.filter((e) => e.date > todayKey && e.date <= endKey).sort(byWhen).slice(0, 5);
  fill($('home-soon'), soon.map((e) => evRow(e, shortDay(e.date))), 'Nothing in the next two weeks.');

  const rows = [];
  for (const k of KEYS) for (const t of data[k]) if (!t.done) rows.push({ k, t });
  rows.sort((a, b) => b.t.id - a.t.id);
  fill($('home-tasks'), rows.slice(0, 6).map(({ k, t }) => {
    const row = el('div', 'trow');
    const c = el('button', 'circ');
    c.type = 'button';
    c.setAttribute('aria-label', 'Mark done: ' + t.text);
    c.onclick = () => { t.done = true; changed(); renderHome(); };
    const a = el('a', 'tbody');
    a.href = '#tasks';
    a.onclick = () => { taskFilter = 'all'; };
    a.append(el('b', '', t.text), el('small', '', PEOPLE[k]));
    row.append(c, a, el('i', 'av', PEOPLE[k][0]));
    return row;
  }), 'All clear. Add tasks in the Tasks tab.');
}
$('startdate').onchange = (e) => { data.start = e.target.value; changed(); renderHome(); };

$('q').oninput = () => {
  const q = $('q').value.trim().toLowerCase();
  $('dash').hidden = !!q;
  $('results').hidden = !q;
  const box = $('results');
  box.innerHTML = '';
  if (!q) return;
  const has = (s) => (s || '').toLowerCase().includes(q);
  const hits = [];
  for (const k of KEYS) for (const t of data[k]) {
    if (has(t.text)) hits.push({ href: '#tasks', title: t.text, sub: PEOPLE[k] + "'s task" + (t.done ? ' (done)' : '') });
  }
  for (const i of data.restock) {
    if (has(i.text)) hits.push({ href: '#restock', title: i.text, sub: 'Restock · ' + CATS[i.cat] + (i.done ? ' (bought)' : '') });
  }
  for (const e of data.events) {
    if (has(e.title)) hits.push({ href: '#cal', title: e.title, sub: (e.kind === 'reminder' ? 'Reminder' : 'Event') + ' · ' + shortDay(e.date), go: () => goDay(e.date) });
  }
  for (const m of data.memories) if (has(m.title)) hits.push({ href: '#more', title: m.title, sub: 'Memory · ' + shortDay(m.date), go: () => openMore('memories') });
  for (const n of data.notes) if (has(n.title) || has(n.text)) hits.push({ href: '#more', title: n.title || n.text.split('\n')[0], sub: 'Note', go: () => openMore('notes') });
  for (const r of data.recipes) if (has(r.title) || (r.ingredients || []).some(has)) hits.push({ href: '#more', title: r.title, sub: 'Recipe', go: () => openMore('recipes') });
  for (const m of msgs) {
    if (has(m.text)) hits.push({ href: '#chat', title: m.text, sub: 'Chat · ' + (PEOPLE[m.from] || m.from) });
  }
  if (!hits.length) box.append(el('p', 'muted', 'No matches.'));
  for (const h of hits.slice(0, 30)) {
    const a = el('a', 'trow');
    a.href = h.href;
    if (h.go) a.onclick = h.go;
    const wrap = el('span', 'tbody');
    wrap.append(el('b', '', h.title), el('small', '', h.sub));
    a.append(wrap);
    box.append(a);
  }
};

/* ---------- GitHub sync ---------- */
const API = (c, f = 'data.json') => `https://api.github.com/repos/${c.owner}/${c.repo}/contents/${f}`;
const hdr = (c) => ({ Authorization: 'Bearer ' + c.token, Accept: 'application/vnd.github+json' });
const enc = (s) => btoa(unescape(encodeURIComponent(s)));          // text -> base64
const dec = (s) => decodeURIComponent(escape(atob(s.replace(/\s/g, '')))); // base64 -> text
let sha = null, timer = null, busy = false;

const status = (t) => { $('sync').textContent = t; };

function schedule() {                      // wait 1.5s after the last edit, then save
  clearTimeout(timer);
  if (!read('gh-config')) { status('Saved on this device only'); return; }
  status('Saving…');
  timer = setTimeout(sync, 1500);
}

async function put(c) {
  write('myspace-dirty', '0');
  let ok = false;
  try {
    for (let i = 0; i < 2 && !ok; i++) {
      const body = { message: 'Update data', content: enc(JSON.stringify(data, null, 1)) };
      if (sha) body.sha = sha;
      const r = await fetch(API(c), {
        method: 'PUT', headers: { ...hdr(c), 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (r.ok) { sha = (await r.json()).content.sha; ok = true; }
      else if (r.status === 409 || r.status === 422) {   // file changed elsewhere: get newest id, retry
        const g = await fetch(API(c), { headers: hdr(c), cache: 'no-store' });
        sha = g.ok ? (await g.json()).sha : null;
      } else throw new Error(r.status);
    }
    if (!ok) throw new Error('conflict');
  } finally {
    if (!ok) write('myspace-dirty', '1');
  }
}

async function sync() {
  const c = read('gh-config');
  if (!c) { status('Saved on this device only'); return; }
  if (busy) return;
  busy = true;
  let failed = false;
  try {
    status('Syncing…');
    const r = await fetch(API(c), { headers: hdr(c), cache: 'no-store' });
    if (r.ok) {
      const j = await r.json();
      sha = j.sha;
      if (!isDirty() && $('sheet').hidden) { data = clean(JSON.parse(dec(j.content))); write('myspace-data', data); refresh(); }
    } else if (r.status === 404) {
      sha = null;
      if (hasData()) write('myspace-dirty', '1');
    } else throw new Error(r.status);
    if (isDirty()) await put(c);
    status('Saved to GitHub ✓');
    flushUploads();
  } catch (e) {
    failed = true;
    status(navigator.onLine ? 'Sync problem (' + e.message + ') – check Sync settings' : 'Offline – will save when online');
  }
  busy = false;
  if (!failed && isDirty()) schedule();    // edits made while we were saving
}

window.addEventListener('online', sync);
document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });

$('cfg').onsubmit = async (e) => {
  e.preventDefault();
  const old = read('gh-config');
  const c = { owner: $('owner').value.trim(), repo: $('repo').value.trim(), token: $('token').value.trim() || (old && old.token) || '' };
  const msg = $('cfg-msg');
  msg.textContent = 'Testing…';
  try {
    const r = await fetch(`https://api.github.com/repos/${c.owner}/${c.repo}`, { headers: hdr(c) });
    if (!r.ok) throw new Error(r.status);
    const j = await r.json();
    write('gh-config', c);
    sha = null;
    $('token').value = '';
    msg.textContent = j.private
      ? 'Connected ✓ Your data will now save automatically.'
      : 'Connected, but this repository is PUBLIC, so anyone can read your data and photos. Please make it private.';
    sync();
  } catch {
    msg.textContent = "Couldn't connect. Check the username, repository name and token.";
  }
};
$('disconnect').onclick = () => {
  try { localStorage.removeItem('gh-config'); } catch {}
  sha = null;
  $('cfg-msg').textContent = 'Disconnected. Data now saves on this device only.';
  status('Saved on this device only');
};

/* ---------- Chat (messages.json in the same GitHub repo; opened from Home) ---------- */
let msgs = read('myspace-chat') || [];
let me = lsGet('chat-me');
let chatTimer = null, chatBusy = false, chatAgain = false;

const byTime = (a, b) => a.t - b.t || (a.id < b.id ? -1 : 1);
const merge = (a, b) => {                  // combine two lists, no duplicates
  const m = new Map();
  for (const x of [...a, ...b]) m.set(x.id, x);
  return [...m.values()].sort(byTime);
};

function renderChat() {
  document.querySelectorAll('#who button').forEach((b) => b.classList.toggle('on', b.dataset.who === me));
  const box = $('msgs');
  const stick = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
  box.innerHTML = '';
  for (const m of msgs) {
    const d = el('div', 'msg ' + (m.from === me ? 'mine' : 'theirs'));
    d.append(
      el('small', '', (PEOPLE[m.from] || m.from) + ' · ' +
        new Date(m.t).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })),
      el('p', '', m.text)
    );
    box.append(d);
  }
  $('chat-empty').hidden = msgs.length > 0;
  if (stick) box.scrollTop = box.scrollHeight;
}

function openChat() {
  renderChat();
  $('msgs').scrollTop = $('msgs').scrollHeight;
  $('chat-note').textContent = read('gh-config') ? '' : 'Connect Sync (home screen) to chat across devices.';
  chatSync();
  chatTimer = setInterval(chatSync, 6000);   // check for new messages every 6 seconds
}

async function ghGet(c, file) {
  const r = await fetch(API(c, file), { headers: hdr(c), cache: 'no-store' });
  if (r.status === 404) return { sha: null, json: null };
  if (!r.ok) throw new Error(r.status);
  const j = await r.json();
  return { sha: j.sha, json: JSON.parse(dec(j.content)) };
}

async function chatSync() {
  const c = read('gh-config');
  if (!c) return;
  if (chatBusy) { chatAgain = true; return; }
  chatBusy = true; chatAgain = false;
  try {
    for (let i = 0; i < 3; i++) {
      const { sha: s, json } = await ghGet(c, 'messages.json');
      const remote = Array.isArray(json) ? json : [];
      const merged = merge(remote, msgs);
      msgs = merged;
      write('myspace-chat', msgs);
      if (merged.length === remote.length) break;          // nothing new to send
      const body = { message: 'New message', content: enc(JSON.stringify(merged, null, 1)) };
      if (s) body.sha = s;
      const r = await fetch(API(c, 'messages.json'), {
        method: 'PUT', headers: { ...hdr(c), 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (r.ok) break;
      if (r.status !== 409 && r.status !== 422) throw new Error(r.status);  // else: someone wrote first, retry
    }
    if (!$('chat').hidden) { renderChat(); $('chat-note').textContent = ''; }
    if (!$('home').hidden) renderHome();
  } catch (e) {
    if (!$('chat').hidden) {
      $('chat-note').textContent = navigator.onLine
        ? 'Chat problem – check Sync settings' : 'Offline – messages will send when you are back online';
    }
  }
  chatBusy = false;
  if (chatAgain) chatSync();
}

document.querySelectorAll('#who button').forEach((b) => {
  b.onclick = () => { me = b.dataset.who; write('chat-me', me); renderChat(); };
});

$('send').onsubmit = (e) => {
  e.preventDefault();
  const text = $('msg').value.trim();
  if (!text) return;
  if (!me) { $('chat-note').textContent = 'Tap Irsyad or Ain above first, so I know who is writing.'; return; }
  msgs = merge(msgs, [{ id: Date.now() + '-' + Math.random().toString(36).slice(2, 6), from: me, text, t: Date.now() }]);
  write('myspace-chat', msgs);
  $('msg').value = '';
  renderChat();
  $('msgs').scrollTop = $('msgs').scrollHeight;
  chatSync();
};

/* ---------- Wallpaper and Liquid Glass (saved per device) ---------- */
function applyWallpaper() {
  const img = lsGet('wp-custom');
  let st = lsGet('wp-style') || 'glow';
  if (st === 'photo' && !img) st = 'glow';
  document.documentElement.dataset.wp = st;
  if (img) document.documentElement.style.setProperty('--wp-img', 'url("' + img + '")');
  else document.documentElement.style.removeProperty('--wp-img');
  const ph = document.querySelector('.sw[data-s="photo"]');
  ph.hidden = !img;
  if (img) ph.style.backgroundImage = 'url("' + img + '")';
  $('rmphoto').hidden = !img;
  document.querySelectorAll('.sw').forEach((b) => b.classList.toggle('on', b.dataset.s === st));
}
function applyGlass() {                     // 0 = clear glass, 100 = frosted
  const v = Number(lsGet('glass') === null ? 60 : lsGet('glass'));
  document.documentElement.style.setProperty('--ga', (0.25 + v * 0.0065).toFixed(2));
  document.documentElement.style.setProperty('--gb', (8 + v * 0.2).toFixed(0) + 'px');
  $('glass').value = v;
}
$('glass').oninput = () => { write('glass', $('glass').value); applyGlass(); };
document.querySelectorAll('.sw').forEach((b) => {
  b.onclick = () => { write('wp-style', b.dataset.s); applyWallpaper(); };
});
$('pick').onclick = () => $('file').click();
$('rmphoto').onclick = () => {
  try { localStorage.removeItem('wp-custom'); } catch {}
  write('wp-style', 'glow');
  $('wp-msg').textContent = 'Photo removed.';
  applyWallpaper();
};
$('file').onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const msg = $('wp-msg');
  msg.textContent = 'Loading…';
  try {
    const url = await blobToDataURL(await shrink(f, 1600));
    try { localStorage.setItem('wp-custom', url); localStorage.setItem('wp-style', 'photo'); msg.textContent = 'Wallpaper set ✓'; }
    catch { msg.textContent = 'That photo is too big to save here. Try a smaller one.'; }
    applyWallpaper();
  } catch { msg.textContent = "Couldn't read that image."; }
  e.target.value = '';
};

/* ---------- Start ---------- */
applyWallpaper();
applyGlass();
route();
status(read('gh-config') ? 'Syncing…' : 'Saved on this device only');
sync();
flushUploads();
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js'));
}
