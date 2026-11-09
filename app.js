const $ = (id) => document.getElementById(id);
const PEOPLE = { irsyad: 'Irsyad', ain: 'Ain' };
const KEYS = Object.keys(PEOPLE);

/* ---------- Saved data (on this device) ---------- */
const read = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch {} };
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const clean = (d) => ({
  irsyad: Array.isArray(d && d.irsyad) ? d.irsyad : [],
  ain: Array.isArray(d && d.ain) ? d.ain : [],
  events: Array.isArray(d && d.events) ? d.events : [],
  restock: Array.isArray(d && d.restock) ? d.restock : [],
  start: typeof (d && d.start) === 'string' ? d.start : '',
});
// Also picks up lists saved by older versions of the app.
let data = clean(read('myspace-data') || { irsyad: read('tasks-irsyad'), ain: read('tasks-ain') });
const isDirty = () => localStorage.getItem('myspace-dirty') === '1';

/* ---------- Small helpers ---------- */
const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const toDate = (s) => new Date(s + 'T00:00:00');
const longDay = (s) => toDate(s).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
const shortDay = (s) => toDate(s).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const fmtTime = (t) => (t ? new Date('1970-01-01T' + t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '');
const byWhen = (a, b) => a.date.localeCompare(b.date) || (a.time || '99:99').localeCompare(b.time || '99:99');
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

let taskFilter = 'all';
let taskFor = lsGet('task-for') || 'irsyad';
let calFilter = 'all';
let calFor = lsGet('cal-for') || 'both';
let restockFilter = 'all';
let restockFor = lsGet('restock-for') || 'wet';
const WHO = { both: 'Irsyad & Ain', irsyad: 'Irsyad', ain: 'Ain' };
const evWho = (e) => (e.who === 'irsyad' || e.who === 'ain' ? e.who : 'both');   // older events count as both
const visibleEvents = () => data.events.filter((e) => calFilter === 'all' || evWho(e) === 'both' || evWho(e) === calFilter);
let selDay = ymd(new Date());
let calMonth = new Date(); calMonth.setDate(1);
function goDay(date) { selDay = date; const d = toDate(date); calMonth = new Date(d.getFullYear(), d.getMonth(), 1); }

function changed() {                       // call after any edit
  write('myspace-data', data);
  write('myspace-dirty', '1');
  schedule();
}

/* ---------- Screens ---------- */
const VIEWS = ['home', 'cal', 'tasks', 'restock', 'chat', 'settings', 'wallpaper'];
function route() {
  let page = location.hash.slice(1);
  if (page === 'irsyad' || page === 'ain') { taskFilter = page; page = 'tasks'; }   // links from the older version
  if (!VIEWS.includes(page || 'home')) page = '';
  const view = page || 'home';
  VIEWS.forEach((v) => { $(v).hidden = v !== view; });
  document.querySelectorAll('#tabs a').forEach((a) => a.classList.toggle('on', a.dataset.p === page));
  clearInterval(chatTimer);
  if (view === 'home') { renderHome(); chatSync(); }
  if (view === 'cal') renderCal();
  if (view === 'tasks') renderTasks();
  if (view === 'restock') renderRestock();
  if (view === 'chat') openChat();
  if (view === 'settings') {
    const c = read('gh-config');
    $('owner').value = c ? c.owner : '';
    $('repo').value = c ? c.repo : '';
    $('token').value = '';
    $('cfg-msg').textContent = c ? 'Connected. Enter a new token only if you want to change it.' : '';
    $('token').required = !c;
  }
  if (view !== 'home' && $('q').value) { $('q').value = ''; $('q').oninput(); }
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);

/* ---------- Tasks (Irsyad and Ain in one list) ---------- */
function renderTasks() {
  document.querySelectorAll('#tfilter button').forEach((b) => b.classList.toggle('on', b.dataset.f === taskFilter));
  document.querySelectorAll('#tfor button').forEach((b) => b.classList.toggle('on', b.dataset.k === taskFor));
  const rows = [];
  for (const k of KEYS) for (const t of data[k]) rows.push({ k, t });
  rows.sort((a, b) => (a.t.done - b.t.done) || (b.t.id - a.t.id));      // open tasks first, newest first
  const shown = taskFilter === 'all' ? rows : rows.filter((r) => r.k === taskFilter);
  const list = $('list');
  list.innerHTML = '';
  for (const { k, t } of shown) {
    const li = el('li', t.done ? 'done' : '');
    const box = el('input');
    box.type = 'checkbox'; box.checked = t.done;
    box.setAttribute('aria-label', 'Mark done: ' + t.text);
    box.onchange = () => { t.done = box.checked; changed(); renderTasks(); };
    const label = el('span', '', t.text);
    const who = el('i', 'av', PEOPLE[k][0]);
    who.title = PEOPLE[k];
    const del = el('button', 'del', '×');
    del.type = 'button';
    del.setAttribute('aria-label', 'Delete: ' + t.text);
    del.onclick = () => { data[k] = data[k].filter((x) => x.id !== t.id); changed(); renderTasks(); };
    li.append(box, label, who, del);
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

/* ---------- Calendar (events and reminders by date) ---------- */
function renderCal() {
  document.querySelectorAll('#cfilter button').forEach((b) => b.classList.toggle('on', b.dataset.f === calFilter));
  document.querySelectorAll('#cfor button').forEach((b) => b.classList.toggle('on', b.dataset.w === calFor));
  const y = calMonth.getFullYear(), m = calMonth.getMonth();
  $('cal-title').textContent = calMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const blanks = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate();
  const counts = {};
  for (const e of visibleEvents()) counts[e.date] = (counts[e.date] || 0) + 1;
  const todayKey = ymd(new Date());
  const grid = $('cal-grid');
  grid.innerHTML = '';
  for (let i = 0; i < blanks; i++) grid.append(el('span'));
  for (let d = 1; d <= days; d++) {
    const key = ymd(new Date(y, m, d));
    const b = el('button', 'day' + (key === todayKey ? ' today' : '') + (key === selDay ? ' sel' : ''), String(d));
    b.type = 'button';
    b.setAttribute('aria-label', longDay(key) + (counts[key] ? ', ' + counts[key] + ' planned' : ''));
    if (counts[key]) b.append(el('i', 'dot'));
    b.onclick = () => { selDay = key; renderCal(); };
    grid.append(b);
  }
  renderDay();
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
      lead.onchange = () => { e.done = lead.checked; changed(); renderDay(); };
    } else lead = el('i', 'evdot');
    const body = el('span', '', e.title);
    body.append(el('small', '', [fmtTime(e.time), e.kind === 'reminder' ? 'Reminder' : 'Event', WHO[evWho(e)]].filter(Boolean).join(' · ')));
    const del = el('button', 'del', '×');
    del.type = 'button';
    del.setAttribute('aria-label', 'Delete: ' + e.title);
    del.onclick = () => { data.events = data.events.filter((x) => x.id !== e.id); changed(); renderCal(); };
    li.append(lead, body, ...(evWho(e) === 'both' ? [] : [el('i', 'av', PEOPLE[evWho(e)][0])]), del);
    ul.append(li);
  }
  $('day-empty').hidden = items.length > 0;
}
$('prev').onclick = () => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1); renderCal(); };
$('next').onclick = () => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1); renderCal(); };
$('todaybtn').onclick = () => { goDay(ymd(new Date())); renderCal(); };
document.querySelectorAll('#cfilter button').forEach((b) => {
  b.onclick = () => { calFilter = b.dataset.f; if (calFilter !== 'all') { calFor = calFilter; write('cal-for', calFor); } renderCal(); };
});
document.querySelectorAll('#cfor button').forEach((b) => {
  b.onclick = () => { calFor = b.dataset.w; write('cal-for', calFor); if (calFilter !== 'all' && calFor !== 'both') calFilter = calFor; renderCal(); };
});
$('evform').onsubmit = (e) => {
  e.preventDefault();
  const title = $('evtitle').value.trim();
  if (!title) return;
  data.events.push({ id: Date.now(), date: selDay, time: $('evtime').value, title, kind: $('evkind').value, who: calFor, done: false });
  $('evtitle').value = ''; $('evtime').value = '';
  changed(); renderCal();
};

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
  a.append(el('b', '', e.title), el('small', '', [extra, fmtTime(e.time), e.kind === 'reminder' ? 'Reminder' : 'Event', WHO[evWho(e)]].filter(Boolean).join(' · ')));
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
  const hits = [];
  for (const k of KEYS) for (const t of data[k]) {
    if (t.text.toLowerCase().includes(q)) hits.push({ href: '#tasks', title: t.text, sub: PEOPLE[k] + "'s task" + (t.done ? ' (done)' : '') });
  }
  for (const i of data.restock) {
    if (i.text.toLowerCase().includes(q)) hits.push({ href: '#restock', title: i.text, sub: 'Restock · ' + CATS[i.cat] + (i.done ? ' (bought)' : '') });
  }
  for (const e of data.events) {
    if (e.title.toLowerCase().includes(q)) hits.push({ href: '#cal', title: e.title, sub: (e.kind === 'reminder' ? 'Reminder' : 'Event') + ' · ' + shortDay(e.date), day: e.date });
  }
  for (const m of msgs) {
    if (m.text.toLowerCase().includes(q)) hits.push({ href: '#chat', title: m.text, sub: 'Chat · ' + (PEOPLE[m.from] || m.from) });
  }
  if (!hits.length) box.append(el('p', 'muted', 'No matches.'));
  for (const h of hits.slice(0, 30)) {
    const a = el('a', 'trow');
    a.href = h.href;
    if (h.day) a.onclick = () => goDay(h.day);
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
      const body = { message: 'Update tasks', content: enc(JSON.stringify(data, null, 1)) };
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
      if (!isDirty()) { data = clean(JSON.parse(dec(j.content))); write('myspace-data', data); route(); }
    } else if (r.status === 404) {
      sha = null;
      if (data.irsyad.length || data.ain.length || data.events.length || data.restock.length) write('myspace-dirty', '1');
    } else throw new Error(r.status);
    if (isDirty()) await put(c);
    status('Saved to GitHub ✓');
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
      ? 'Connected ✓ Your lists will now save automatically.'
      : 'Connected, but this repository is PUBLIC, so anyone can read your lists. Please make it private.';
    sync();
  } catch {
    msg.textContent = "Couldn't connect. Check the username, repository name and token.";
  }
};
$('disconnect').onclick = () => {
  try { localStorage.removeItem('gh-config'); } catch {}
  sha = null;
  $('cfg-msg').textContent = 'Disconnected. Lists now save on this device only.';
  status('Saved on this device only');
};

/* ---------- Chat (messages.json in the same GitHub repo) ---------- */
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

/* ---------- Wallpaper (saved per device) ---------- */
function applyWallpaper() {
  const img = lsGet('wp-custom');
  let st = lsGet('wp-style') || 'cream';
  if (st === 'photo' && !img) st = 'cream';
  document.documentElement.dataset.wp = st;
  if (img) document.documentElement.style.setProperty('--wp-img', 'url("' + img + '")');
  else document.documentElement.style.removeProperty('--wp-img');
  const ph = document.querySelector('.sw[data-s="photo"]');
  ph.hidden = !img;
  if (img) ph.style.backgroundImage = 'url("' + img + '")';
  $('rmphoto').hidden = !img;
  document.querySelectorAll('.sw').forEach((b) => b.classList.toggle('on', b.dataset.s === st));
}
document.querySelectorAll('.sw').forEach((b) => {
  b.onclick = () => { write('wp-style', b.dataset.s); applyWallpaper(); };
});
$('pick').onclick = () => $('file').click();
$('rmphoto').onclick = () => {
  try { localStorage.removeItem('wp-custom'); } catch {}
  write('wp-style', 'cream');
  $('wp-msg').textContent = 'Photo removed.';
  applyWallpaper();
};
$('file').onchange = (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const msg = $('wp-msg');
  msg.textContent = 'Loading…';
  const url = URL.createObjectURL(f);
  const im = new Image();
  im.onload = () => {
    const sc = Math.min(1, 1600 / Math.max(im.width, im.height));   // shrink big photos
    const cv = document.createElement('canvas');
    cv.width = Math.round(im.width * sc); cv.height = Math.round(im.height * sc);
    cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
    URL.revokeObjectURL(url);
    try {
      localStorage.setItem('wp-custom', cv.toDataURL('image/jpeg', 0.8));
      localStorage.setItem('wp-style', 'photo');
      msg.textContent = 'Wallpaper set ✓';
    } catch { msg.textContent = 'That photo is too big to save here. Try a smaller one.'; }
    applyWallpaper();
    e.target.value = '';
  };
  im.onerror = () => { msg.textContent = "Couldn't read that image."; URL.revokeObjectURL(url); };
  im.src = url;
};

/* ---------- Start ---------- */
applyWallpaper();
route();
status(read('gh-config') ? 'Syncing…' : 'Saved on this device only');
sync();
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js'));
}
