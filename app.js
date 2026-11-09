const $ = (id) => document.getElementById(id);
const PEOPLE = { irsyad: 'Irsyad', ain: 'Ain' };

/* ---------- Saved data (on this device) ---------- */
const read = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch {} };
const clean = (d) => ({
  irsyad: Array.isArray(d && d.irsyad) ? d.irsyad : [],
  ain: Array.isArray(d && d.ain) ? d.ain : [],
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
  if (page in PEOPLE) openTodo(page);
  if (page === 'settings') {
    const c = read('gh-config');
    $('owner').value = c ? c.owner : '';
    $('repo').value = c ? c.repo : '';
    $('token').value = '';
    $('cfg-msg').textContent = c ? 'Connected. Enter a new token only if you want to change it.' : '';
    $('token').required = !c;
  }
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
const API = (c) => `https://api.github.com/repos/${c.owner}/${c.repo}/contents/data.json`;
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
    status(navigator.onLine ? 'Sync problem – check Sync settings' : 'Offline – will save when online');
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

/* ---------- Start ---------- */
route();
status(read('gh-config') ? 'Syncing…' : 'Saved on this device only');
sync();
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js'));
}
