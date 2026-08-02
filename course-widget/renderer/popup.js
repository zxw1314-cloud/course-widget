let data = null;
const DATE = new URLSearchParams(location.search).get('date') || todayKey();
const $ = (id) => document.getElementById(id);
const WEEK_CN = ['日', '一', '二', '三', '四', '五', '六'];
function pad(n) { return String(n).padStart(2, '0'); }
function todayKey() { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function weekdayIndex(d) { const w = d.getDay(); return w === 0 ? 7 : w; }
function toMinutes(t) { if (!t) return null; const p = t.split(':').map(Number); return p[0] * 60 + p[1]; }
function parseDateKey(key) { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function hexToRgba(hex, alpha) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + alpha + ')';
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function parsePoints(s) { return (s || '').split(/[,，、]/).map(x => parseInt(x, 10)).filter(x => !isNaN(x) && x >= 0); }
function parseRepeat(startEl, everyEl) {
  const s = parseInt(startEl.value, 10), e = parseInt(everyEl.value, 10);
  if (!isNaN(s) && s >= 0 && !isNaN(e) && e > 0) return { start: s, every: e };
  return null;
}
function normReminders(pointsArr, repeat) {
  const pts = (pointsArr && pointsArr.length) ? pointsArr : [10];
  return { points: pts, repeat };
}

function currentWeek() {
  if (!data.settings.semesterStart) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const start = parseDateKey(data.settings.semesterStart); start.setHours(0, 0, 0, 0);
  const week = Math.floor((today - start) / 86400000 / 7) + 1;
  return week > 0 ? week : 0;
}
function weekMatches(course, week) {
  if (!course.weeks || !course.weeks.length) return true;
  if (week === null) return true;
  return course.weeks.includes(week);
}

function dayCourses() {
  const d = parseDateKey(DATE);
  const wk = weekdayIndex(d);
  const week = currentWeek();
  const out = [];
  for (const c of data.courses) {
    if (c.day !== wk || !weekMatches(c, week)) continue;
    const p = data.periods.find(x => x.index === c.period);
    if (!p) continue;
    out.push({ time: p.start + '~' + p.end, startMin: toMinutes(p.start), name: c.name, loc: c.location, teacher: c.teacher || null, color: c.color || null });
  }
  out.sort((a, b) => (a.startMin == null ? 1440 : a.startMin) - (b.startMin == null ? 1440 : b.startMin));
  return out;
}

function render() {
  const d = parseDateKey(DATE);
  $('title').textContent = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 周${WEEK_CN[d.getDay()]}`;

  const cb = $('courses');
  const courses = dayCourses();
  cb.innerHTML = '';
  if (!courses.length) cb.innerHTML = '<div class="item" style="color:#8a91a5">这天没有课</div>';
  for (const c of courses) {
    const el = document.createElement('div');
    el.className = 'item course';
    const meta = [c.loc, c.teacher].filter(Boolean).join(' · ');
    el.innerHTML = `<span class="tm">${esc(c.time)}</span><span class="txt">${esc(c.name)}</span>${meta ? `<span style="color:#8a91a5;font-size:11px">${esc(meta)}</span>` : ''}`;
    if (c.color) {
      el.style.background = hexToRgba(c.color, 0.12);
      el.style.borderLeft = '3px solid ' + hexToRgba(c.color, 0.85);
    }
    cb.appendChild(el);
  }

  renderTodos();
  renderEvents();
}

function renderTodos() {
  const box = $('todos');
  const todos = data.todos[DATE] || [];
  box.innerHTML = '';
  if (!todos.length) box.innerHTML = '<div class="item" style="color:#8a91a5">暂无待办</div>';
  todos.forEach((t) => {
    const el = document.createElement('div');
    el.className = 'item todo' + (t.done ? ' done' : '');
    el.innerHTML = `<input type="checkbox" ${t.done ? 'checked' : ''} class="t-done">
      <span class="tm" style="color:#a17700">${t.deadline ? esc(t.deadline) : ''}</span>
      <span class="txt">${esc(t.text)}</span>
      <button class="del t-del">🗑</button>`;
    el.querySelector('.t-done').addEventListener('change', (e) => { t.done = e.target.checked; save(); renderTodos(); });
    el.querySelector('.t-del').addEventListener('click', () => {
      data.todos[DATE] = data.todos[DATE].filter(x => x.id !== t.id);
      if (!data.todos[DATE].length) delete data.todos[DATE];
      save(); renderTodos();
    });
    box.appendChild(el);
  });
}

function renderEvents() {
  const box = $('events');
  const events = data.events.filter(e => e.date === DATE).sort((a, b) => (toMinutes(a.time) || 1440) - (toMinutes(b.time) || 1440));
  box.innerHTML = '';
  if (!events.length) box.innerHTML = '<div class="item" style="color:#8a91a5">暂无临时活动</div>';
  events.forEach((e) => {
    const el = document.createElement('div');
    el.className = 'item event';
    const eloc = e.location ? ` <span style="color:#8a91a5;font-size:11px">📍${esc(e.location)}</span>` : '';
    el.innerHTML = `<span class="tm" style="color:#d23c2f">${e.time ? esc(e.time) : '全天'}</span><span class="txt">${esc(e.title)}${eloc}</span><button class="del e-del">🗑</button>`;
    el.querySelector('.e-del').addEventListener('click', () => {
      data.events = data.events.filter(x => x.id !== e.id);
      save(); renderEvents();
    });
    box.appendChild(el);
  });
}

function save() { window.api.setData(data); }

function addTodo() {
  const text = $('tText').value.trim();
  if (!text) return;
  if (!data.todos[DATE]) data.todos[DATE] = [];
  data.todos[DATE].push({
    id: uid(), text, deadline: $('tTime').value || null, done: false, createdAt: Date.now(),
    reminders: normReminders(parsePoints($('tPoints').value), parseRepeat($('tRepStart'), $('tRepEvery')))
  });
  $('tText').value = ''; $('tTime').value = ''; $('tPoints').value = ''; $('tRepStart').value = ''; $('tRepEvery').value = '';
  save(); renderTodos();
}
function addEvent() {
  const title = $('eTitle').value.trim();
  if (!title) return;
  data.events.push({
    id: uid(), title, date: DATE, time: $('eTime').value || null, location: $('eLocation').value.trim() || null,
    reminders: normReminders(parsePoints($('ePoints').value), parseRepeat($('eRepStart'), $('eRepEvery')))
  });
  $('eTitle').value = ''; $('eTime').value = ''; $('eLocation').value = ''; $('ePoints').value = ''; $('eRepStart').value = ''; $('eRepEvery').value = '';
  save(); renderEvents();
}

$('btnClose').addEventListener('click', () => window.close());
$('btnAddTodo').addEventListener('click', addTodo);
$('tText').addEventListener('keydown', (e) => { if (e.key === 'Enter') addTodo(); });
$('btnAddEvent').addEventListener('click', addEvent);
$('eTitle').addEventListener('keydown', (e) => { if (e.key === 'Enter') addEvent(); });

(async () => { data = await window.api.getData(); render(); })();