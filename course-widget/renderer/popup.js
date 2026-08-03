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
function occursOn(item, fromDate, targetDate) {
  const r = item && item.repeat;
  if (r === 'daily') return true;
  if (r === 'weekly' && fromDate && targetDate) return parseDateKey(fromDate).getDay() === parseDateKey(targetDate).getDay();
  return fromDate === targetDate;
}
// ---- 速记解析（规则版，离线） ----
function keyFromDate(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function keyFromYMD(y, m, dd) { return y + '-' + pad(m) + '-' + pad(dd); }
function parseQuickDate(text, baseKey) {
  const base = parseDateKey(baseKey);
  let m = text.match(/(\d{4})[-/.]?(\d{1,2})[-/.]?(\d{1,2})/);
  if (m) return keyFromYMD(+m[1], +m[2], +m[3]);
  m = text.match(/(\d{1,2})月(\d{1,2})[日号]?/);
  if (m) return keyFromYMD(base.getFullYear(), +m[1], +m[2]);
  m = text.match(/(\d{1,2})[-/.](\d{1,2})/);
  if (m) return keyFromYMD(base.getFullYear(), +m[1], +m[2]);
  if (/后天/.test(text)) { const d = new Date(base); d.setDate(d.getDate() + 2); return keyFromDate(d); }
  if (/明天/.test(text)) { const d = new Date(base); d.setDate(d.getDate() + 1); return keyFromDate(d); }
  if (/今天|今日/.test(text)) return baseKey;
  const wm = text.match(/(?:下|这)?(?:周|星期|礼拜)([一二三四五六日天])/);
  if (wm) {
    const map = { '一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'日':7,'天':7 };
    const target = map[wm[1]];
    const bw = base.getDay() === 0 ? 7 : base.getDay();
    let diff = target - bw; if (diff <= 0) diff += 7;
    if (wm[0].indexOf('下') >= 0) diff += 7;
    const d = new Date(base); d.setDate(d.getDate() + diff);
    return keyFromDate(d);
  }
  return baseKey;
}
function parseQuickTime(text) {
  let m = text.match(/(\d{1,2})[:：](\d{2})/);
  if (m) { const h = +m[1], mm = +m[2]; if (h === 24 && mm === 0) return '23:59'; if (h > 23 || mm > 59) return null; return pad(h) + ':' + pad(mm); }
  m = text.match(/(凌晨|早上|上午|中午|下午|晚上|晚)?(\d{1,2})点(?:半|(\d{1,2})分?)?/);
  if (m) {
    let hh = +m[2]; let mm2 = m[3] ? +m[3] : 0; const pre = m[1] || '';
    if (m[0].indexOf('半') >= 0) mm2 = 30;
    if (mm2 > 59) return null;
    if (pre === '下午' || pre === '晚上' || pre === '晚') { if (hh < 12) hh += 12; }
    else if (pre === '中午') { hh = 12; }
    else if ((pre === '凌晨' || pre === '早上' || pre === '上午') && hh === 12) { hh = 0; }
    return pad(hh) + ':' + pad(mm2);
  }
  if (/24点|24:00|晚上24/.test(text)) return '23:59';
  return null;
}
function parseQuick(text, baseKey) {
  text = String(text || '').trim();
  if (!text) return null;
  let loc = null;
  const lm = text.match(/@([^\s，,。]+)/);
  if (lm) loc = lm[1];
  const date = parseQuickDate(text, baseKey);
  const time = parseQuickTime(text);
  const repeat = /每天|每日/.test(text) ? 'daily' : (/每周|每个(?:周|星期)/.test(text) ? 'weekly' : null);
  let points = 10;
  const pm = text.match(/(?:提醒|提前)(\d+)\s*(?:分钟|小时)/);
  if (pm) points = /小时/.test(pm[0]) ? (+pm[1]) * 60 : +pm[1];
  let type;
  if (/倒数|还有\d+天|距离.+还有/.test(text)) type = 'countdown';
  else if (/考试/.test(text) && !time) type = 'countdown';
  else if (/作业|提交|截止|完成|做完|签到|打卡|上传|交/.test(text)) type = 'todo';
  else if (/活动|会议|讲座|大会|班会|团会|比赛|排练|聚会|晚会|聚餐|例会|年级会|开会/.test(text)) type = 'event';
  else type = (time && loc) ? 'event' : 'todo';
  const body = text
    .replace(/(\d{4})[-/.]?(\d{1,2})[-/.]?(\d{1,2})/g, ' ')
    .replace(/(\d{1,2})月(\d{1,2})[日号]?/g, ' ')
    .replace(/(\d{1,2})[-/.](\d{1,2})/g, ' ')
    .replace(/(凌晨|早上|上午|中午|下午|晚上|晚)?\d{1,2}点(?:半|\d{1,2}分?)?/g, ' ')
    .replace(/\d{1,2}[:：]\d{2}/g, ' ')
    .replace(/@\S+/g, ' ')
    .replace(/今天|今日|明天|后天/g, ' ')
    .replace(/(?:下|这)?(?:周|星期|礼拜)[一二三四五六日天]/g, ' ')
    .replace(/(?:提醒|提前)\d+\s*(?:分钟|小时)/g, ' ')
    .replace(/每周|每个(?:周|星期)|每天|每日/g, ' ')
    .replace(/\s+/g, ' ').trim();
  const clean = body || text;
  if (type === 'countdown') return { type: 'countdown', title: clean, date, time };
  if (type === 'event') return { type: 'event', title: clean, date, time, location: loc, points, repeat };
  return { type: 'todo', text: clean, date, deadline: time, points, repeat };
}
function applyQuick() {
  const msg = $('quickMsg');
  const p = parseQuick($('quickText').value, DATE);
  if (!p) { msg.textContent = '输入为空'; return; }
  if (p.type === 'todo') {
    if (!data.todos[p.date]) data.todos[p.date] = [];
    data.todos[p.date].push({ id: uid(), text: p.text, deadline: p.deadline, done: false, createdAt: Date.now(), repeat: p.repeat || null, reminders: { points: [p.points || 10], repeat: null } });
  } else if (p.type === 'event') {
    data.events.push({ id: uid(), title: p.title, date: p.date, time: p.time, location: p.location, repeat: p.repeat || null, reminders: { points: [p.points || 10], repeat: null } });
  } else {
    if (!data.countdowns) data.countdowns = [];
    data.countdowns.push({ id: uid(), title: p.title, date: p.date, time: p.time, location: null, color: null });
  }
  $('quickText').value = '';
  const tag = { todo: '待办', event: '活动', countdown: '倒数日' }[p.type];
  msg.textContent = '已加入' + tag + '（' + p.date + (p.time ? ' ' + p.time : '') + '）' + (p.repeat ? ' · 重复' + (p.repeat === 'weekly' ? '每周' : '每天') : '');
  save(); render();
}
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
  const items = [];
  for (const k of Object.keys(data.todos || {})) {
    for (const t of data.todos[k] || []) if (occursOn(t, k, DATE)) items.push({ k, t });
  }
  box.innerHTML = '';
  if (!items.length) box.innerHTML = '<div class="item" style="color:#8a91a5">暂无待办</div>';
  items.forEach(({ k, t }) => {
    const el = document.createElement('div');
    el.className = 'item todo' + (t.done ? ' done' : '');
    const badge = t.repeat === 'weekly' ? '<span style="color:#8a91a5;font-size:10px">[每周]</span>' : (t.repeat === 'daily' ? '<span style="color:#8a91a5;font-size:10px">[每天]</span>' : '');
    el.innerHTML = `<input type="checkbox" ${t.done ? 'checked' : ''} class="t-done">
      <span class="tm" style="color:#a17700">${t.deadline ? esc(t.deadline) : ''}</span>
      <span class="txt">${esc(t.text)} ${badge}</span>
      <button class="del t-del">🗑</button>`;
    el.querySelector('.t-done').addEventListener('change', (e) => { t.done = e.target.checked; save(); renderTodos(); });
    el.querySelector('.t-del').addEventListener('click', () => {
      data.todos[k] = data.todos[k].filter(x => x.id !== t.id);
      if (!data.todos[k].length) delete data.todos[k];
      save(); renderTodos();
    });
    box.appendChild(el);
  });
}

function renderEvents() {
  const box = $('events');
  const events = data.events.filter(e => occursOn(e, e.date, DATE)).sort((a, b) => (toMinutes(a.time) || 1440) - (toMinutes(b.time) || 1440));
  box.innerHTML = '';
  if (!events.length) box.innerHTML = '<div class="item" style="color:#8a91a5">暂无临时活动</div>';
  events.forEach((e) => {
    const el = document.createElement('div');
    el.className = 'item event';
    const badge = e.repeat === 'weekly' ? '<span style="color:#8a91a5;font-size:10px">[每周]</span>' : (e.repeat === 'daily' ? '<span style="color:#8a91a5;font-size:10px">[每天]</span>' : '');
    const eloc = e.location ? ` <span style="color:#8a91a5;font-size:11px">📍${esc(e.location)}</span>` : '';
    el.innerHTML = `<span class="tm" style="color:#d23c2f">${e.time ? esc(e.time) : '全天'}</span><span class="txt">${esc(e.title)} ${badge}${eloc}</span><button class="del e-del">🗑</button>`;
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
    id: uid(), text, deadline: $('tTime').value || null, done: false, createdAt: Date.now(), repeat: $('tRepeat').value || null,
    reminders: normReminders(parsePoints($('tPoints').value), parseRepeat($('tRepStart'), $('tRepEvery')))
  });
  $('tText').value = ''; $('tTime').value = ''; $('tPoints').value = ''; $('tRepStart').value = ''; $('tRepEvery').value = ''; $('tRepeat').value = '';
  save(); renderTodos();
}
function addEvent() {
  const title = $('eTitle').value.trim();
  if (!title) return;
  data.events.push({
    id: uid(), title, date: DATE, time: $('eTime').value || null, location: $('eLocation').value.trim() || null, repeat: $('eRepeat').value || null,
    reminders: normReminders(parsePoints($('ePoints').value), parseRepeat($('eRepStart'), $('eRepEvery')))
  });
  $('eTitle').value = ''; $('eTime').value = ''; $('eLocation').value = ''; $('ePoints').value = ''; $('eRepStart').value = ''; $('eRepEvery').value = ''; $('eRepeat').value = '';
  save(); renderEvents();
}

$('btnClose').addEventListener('click', () => window.close());
$('btnAddTodo').addEventListener('click', addTodo);
$('tText').addEventListener('keydown', (e) => { if (e.key === 'Enter') addTodo(); });
$('btnAddEvent').addEventListener('click', addEvent);
$('eTitle').addEventListener('keydown', (e) => { if (e.key === 'Enter') addEvent(); });
$('btnQuick').addEventListener('click', applyQuick);
$('quickText').addEventListener('keydown', (e) => { if (e.key === 'Enter') applyQuick(); });

(async () => { data = await window.api.getData(); render(); })();