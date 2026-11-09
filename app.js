const $ = (id) => document.getElementById(id);
const PEOPLE = { irsyad: 'Irsyad', ain: 'Ain' };

/* ---------- Saved data (on this device) ---------- */
const read = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch {} };
const clean = (d) => ({
  irsyad: Array.isArray(d && d.irsyad) ? d.irsyad : [],
  ain: Array.isArray(d && d.ain) ? d.ain : [],
  start: typeof (d && d.start) === 'string' ? d.start : '',
});
// Also picks up lists saved by the older version of the app.
let data = clean(read('myspace-data') || { irsyad: read('tasks-irsyad'), ain: read('tasks-ain') });
const isDirty = () => localStorage.getItem('myspace-dirty') === '1';

/* ---------- Screens ---------- */
let person = null;
function route() {
  const page = location.hash.slice(1);
  $('home').hidden = page !== '';
  $('calc').hidden = page !== 'calc';
  $('todo').hidden = !(page in PEOPLE);
  $('settings').hidden = page !== 'settings';
  $('wallpaper').hidden = page !== 'wallpaper';
  $('chat').hidden = page !== 'chat';
  clearInterval(chatTimer);
  if (page === 'chat') openChat();
  if (page in PEOPLE) openTodo(page);
  if (page === 'settings') {
    const c = read('gh-config');
    $('owner').value = c ? c.owner : '';
    $('repo').value = c ? c.repo : '';
    $('token').value = '';
    $('cfg-msg').textContent = c ? 'Connected. Enter a new token only if you want to change it.' : '';
    $('token').required = !c;
  }
  document.querySelectorAll('#tabs a').forEach((a) => a.classList.toggle('on', a.dataset.p === page));
  if (page !== '' && $('q').value) { $('q').value = ''; $('q').oninput(); }
  if (page === '') { renderHome(); chatSync(); }
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);

/* ---------- To-do lists ---------- */
function openTodo(who) {
  person = who;
  $('todo-title').textContent = PEOPLE[who] + "'s tasks";
  renderTodo();
}
function changed() {                       // call after any edit
  write('myspace-data', data);
  write('myspace-dirty', '1');
  schedule();
}
function renderTodo() {
  const tasks = data[person];
  const list = $('list');
  list.innerHTML = '';
  for (const t of tasks) {
    const li = document.createElement('li');
    if (t.done) li.className = 'done';
    const box = document.createElement('input');
    box.type = 'checkbox'; box.checked = t.done;
    box.setAttribute('aria-label', 'Mark done: ' + t.text);
    box.onchange = () => { t.done = box.checked; changed(); renderTodo(); };
    const label = document.createElement('span');
    label.textContent = t.text;
    const del = document.createElement('button');
    del.className = 'del'; del.type = 'button'; del.textContent = '×';
    del.setAttribute('aria-label', 'Delete: ' + t.text);
    del.onclick = () => { data[person] = data[person].filter((x) => x.id !== t.id); changed(); renderTodo(); };
    li.append(box, label, del);
    list.append(li);
  }
  $('count').textContent = tasks.length ? tasks.filter((t) => !t.done).length + ' open' : '';
  $('empty').hidden = tasks.length > 0;
  $('clear').hidden = !tasks.some((t) => t.done);
}
$('add').onsubmit = (e) => {
  e.preventDefault();
  const text = $('text').value.trim();
  if (!text) return;
  data[person].unshift({ id: Date.now(), text, done: false });
  $('text').value = '';
  changed(); renderTodo();
};
$('clear').onclick = () => { data[person] = data[person].filter((t) => !t.done); changed(); renderTodo(); };

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
      if (data.irsyad.length || data.ain.length) write('myspace-dirty', '1');
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
let me = null;
try { me = localStorage.getItem('chat-me'); } catch {}
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
    const d = document.createElement('div');
    d.className = 'msg ' + (m.from === me ? 'mine' : 'theirs');
    const n = document.createElement('small');
    n.textContent = (PEOPLE[m.from] || m.from) + ' · ' +
      new Date(m.t).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    const p = document.createElement('p');
    p.textContent = m.text;
    d.append(n, p);
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
  b.onclick = () => {
    me = b.dataset.who;
    try { localStorage.setItem('chat-me', me); } catch {}
    renderChat();
  };
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

/* ---------- Home ---------- */
function renderHome() {
  $('today').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  if (data.start) {
    const d = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(data.start + 'T00:00:00')) / 864e5);
    $('days').textContent = Math.max(0, d).toLocaleString();
  } else $('days').textContent = '–';
  $('startdate').value = data.start || '';

  const other = me === 'irsyad' ? 'Ain' : me === 'ain' ? 'Irsyad' : null;
  $('chat-title').textContent = other ? 'Chat with ' + other : 'Chat';
  const last = msgs[msgs.length - 1];
  $('chat-prev').textContent = last ? last.text : 'Say hello!';

  const rows = [];
  for (const k of Object.keys(PEOPLE)) for (const t of data[k]) if (!t.done) rows.push({ k, t });
  rows.sort((a, b) => b.t.id - a.t.id);
  const box = $('home-tasks');
  box.innerHTML = '';
  if (!rows.length) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = 'All clear. Add tasks from the Irsyad or Ain tabs.';
    box.append(p);
  }
  for (const { k, t } of rows.slice(0, 6)) {
    const row = document.createElement('div');
    row.className = 'trow';
    const c = document.createElement('button');
    c.className = 'circ'; c.type = 'button';
    c.setAttribute('aria-label', 'Mark done: ' + t.text);
    c.onclick = () => { t.done = true; changed(); renderHome(); };
    const a = document.createElement('a');
    a.className = 'tbody'; a.href = '#' + k;
    const b = document.createElement('b'); b.textContent = t.text;
    const sm = document.createElement('small'); sm.textContent = PEOPLE[k];
    a.append(b, sm);
    const av = document.createElement('i');
    av.className = 'av'; av.textContent = PEOPLE[k][0];
    row.append(c, a, av);
    box.append(row);
  }
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
  for (const k of Object.keys(PEOPLE)) for (const t of data[k]) {
    if (t.text.toLowerCase().includes(q)) hits.push({ href: '#' + k, title: t.text, sub: PEOPLE[k] + "'s task" + (t.done ? ' (done)' : '') });
  }
  for (const m of msgs) {
    if (m.text.toLowerCase().includes(q)) hits.push({ href: '#chat', title: m.text, sub: 'Chat · ' + (PEOPLE[m.from] || m.from) });
  }
  if (!hits.length) {
    const p = document.createElement('p');
    p.className = 'muted'; p.textContent = 'No matches.';
    box.append(p);
  }
  for (const h of hits.slice(0, 30)) {
    const a = document.createElement('a');
    a.className = 'trow'; a.href = h.href;
    const wrap = document.createElement('span');
    wrap.className = 'tbody';
    const b = document.createElement('b'); b.textContent = h.title;
    const sm = document.createElement('small'); sm.textContent = h.sub;
    wrap.append(b, sm);
    a.append(wrap);
    box.append(a);
  }
};

/* ---------- Calculator ---------- */
const calc = { cur: '0', prev: null, op: null, fresh: false };
const fmt = (n) => (isFinite(n) ? String(parseFloat(n.toPrecision(12))) : 'Error');
function compute() {
  const a = parseFloat(calc.prev), b = parseFloat(calc.cur);
  if (calc.op === '+') return a + b;
  if (calc.op === '−') return a - b;
  if (calc.op === '×') return a * b;
  if (calc.op === '÷') return b === 0 ? NaN : a / b;
  return b;
}
$('keys').onclick = (e) => {
  const k = e.target.dataset.k;
  if (!k) return;
  if (calc.cur === 'Error' && k !== 'C') calc.cur = '0';
  if (k >= '0' && k <= '9') {
    calc.cur = (calc.fresh || calc.cur === '0') ? k : calc.cur + k;
    calc.fresh = false;
  } else if (k === '.') {
    if (calc.fresh) { calc.cur = '0.'; calc.fresh = false; }
    else if (!calc.cur.includes('.')) calc.cur += '.';
  } else if (k === 'C') {
    Object.assign(calc, { cur: '0', prev: null, op: null, fresh: false });
  } else if (k === '±') {
    if (calc.cur !== '0') calc.cur = calc.cur.startsWith('-') ? calc.cur.slice(1) : '-' + calc.cur;
  } else if (k === '%') {
    calc.cur = fmt(parseFloat(calc.cur) / 100);
  } else if (k === '=') {
    if (calc.op) { calc.cur = fmt(compute()); calc.prev = null; calc.op = null; calc.fresh = true; }
  } else {
    if (calc.op && !calc.fresh) calc.cur = fmt(compute());
    calc.prev = calc.cur; calc.op = k; calc.fresh = true;
  }
  $('display').textContent = calc.cur;
};

/* ---------- Wallpaper (saved per device) ---------- */
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
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
  b.onclick = () => { try { localStorage.setItem('wp-style', b.dataset.s); } catch {} applyWallpaper(); };
});
$('pick').onclick = () => $('file').click();
$('rmphoto').onclick = () => {
  try { localStorage.removeItem('wp-custom'); localStorage.setItem('wp-style', 'cream'); } catch {}
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

/* Keyboard support for the calculator (desktop) */
document.addEventListener('keydown', (e) => {
  if ($('calc').hidden || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'Backspace') {
    e.preventDefault();
    if (!calc.fresh && calc.cur !== 'Error') {
      calc.cur = calc.cur.length > 1 && !(calc.cur.length === 2 && calc.cur[0] === '-') ? calc.cur.slice(0, -1) : '0';
      $('display').textContent = calc.cur;
    }
    return;
  }
  const map = { '*': '×', x: '×', X: '×', '/': '÷', '-': '−', Enter: '=', ',': '.', Escape: 'C', c: 'C', C: 'C' };
  const k = map[e.key] || e.key;
  const btn = document.querySelector('#keys [data-k="' + k + '"]');
  if (btn) { e.preventDefault(); btn.click(); }
});

/* ---------- Start ---------- */
applyWallpaper();
route();
status(read('gh-config') ? 'Syncing…' : 'Saved on this device only');
sync();
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js'));
}
