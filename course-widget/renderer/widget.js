let data = null;
const WEEK_CN = ['日', '一', '二', '三', '四', '五', '六'];
const $ = (id) => document.getElementById(id);
function pad(n) { return String(n).padStart(2, '0'); }
function dateKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function weekdayIndex(d) { const w = d.getDay(); return w === 0 ? 7 : w; }
function toMinutes(t) { if (!t) return null; const p = t.split(':').map(Number); return p[0] * 60 + p[1]; }
function parseDateKey(key) { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); }
function mondayOf(d) { const x = new Date(d); const w = x.getDay() === 0 ? 7 : x.getDay(); x.setDate(x.getDate() - (w - 1)); x.setHours(0, 0, 0, 0); return x; }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

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

function dayItems(date, isThisWeek) {
  const d = parseDateKey(date);
  const wk = weekdayIndex(d);
  const week = currentWeek();
  const list = [];
  if (isThisWeek) {
    for (const c of data.courses) {
      if (c.day !== wk || !weekMatches(c, week)) continue;
      const p = data.periods.find(x => x.index === c.period);
      if (!p) continue;
      list.push({ kind: 'course', startMin: toMinutes(p.start), time: p.start + '~' + p.end, name: c.name, meta: c.location || '', done: false });
    }
  }
  for (const t of (data.todos[date] || [])) {
    list.push({ kind: 'todo', startMin: toMinutes(t.deadline), time: t.deadline || '', name: t.text, meta: '', done: !!t.done });
  }
  for (const ev of data.events) {
    if (ev.date !== date) continue;
    list.push({ kind: 'event', startMin: toMinutes(ev.time), time: ev.time || '', name: ev.title, meta: '', done: false });
  }
  list.sort((a, b) => (a.startMin == null ? 1440 : a.startMin) - (b.startMin == null ? 1440 : b.startMin));
  return list;
}

function renderWeek(containerId, startDate, count, isThisWeek, todayKey) {
  const box = $(containerId);
  box.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const d = new Date(startDate); d.setDate(startDate.getDate() + i);
    const key = dateKey(d);
    const items = dayItems(key, isThisWeek);
    const col = document.createElement('div');
    col.className = 'day' + (key === todayKey ? ' today' : '');
    const head = `<div class="dhead"><span class="dw">周${WEEK_CN[d.getDay()]}</span><span class="dn">${d.getDate()}</span></div>`;
    let itemsHtml = '';
    if (!items.length) {
      itemsHtml = '<div class="empty">—</div>';
    } else {
      itemsHtml = '<div class="ditems">' + items.slice(0, 12).map(it => {
        const cls = 'it ' + it.kind + (it.done ? ' done' : '');
        const tm = it.time ? `<span class="tm">${esc(it.time)}</span>` : '';
        const meta = it.meta ? ' ' + esc(it.meta) : '';
        return `<div class="${cls}">${tm}${esc(it.name)}${meta}</div>`;
      }).join('') + (items.length > 12 ? `<div class="it" style="color:#7d86a3">+${items.length - 12}</div>` : '') + '</div>';
    }
    col.innerHTML = head + itemsHtml;
    col.addEventListener('click', () => window.api.openPopup(key));
    box.appendChild(col);
  }
}

function render() {
  const now = new Date();
  const monday = mondayOf(now);
  const week1end = new Date(monday); week1end.setDate(monday.getDate() + 6);
  const week2start = new Date(monday); week2start.setDate(monday.getDate() + 7);
  const week2end = new Date(monday); week2end.setDate(monday.getDate() + 13);
  $('range').textContent = `${monday.getMonth() + 1}月${monday.getDate()}日 ~ ${week2end.getMonth() + 1}月${week2end.getDate()}日`;
  $('label1').textContent = `本周 ${monday.getMonth() + 1}月${monday.getDate()}日 ~ ${week1end.getMonth() + 1}月${week1end.getDate()}日`;
  $('label2').textContent = `下周 ${week2start.getMonth() + 1}月${week2start.getDate()}日 ~ ${week2end.getMonth() + 1}月${week2end.getDate()}日`;

  const todayKey = dateKey(now);
  renderWeek('week1', monday, 7, true, todayKey);
  renderWeek('week2', week2start, 7, false, todayKey);

  const itemsToday = dayItems(todayKey, true);
  const courseToday = itemsToday.filter(x => x.kind === 'course').length;
  const todoToday = itemsToday.filter(x => x.kind === 'todo' && !x.done).length;
  const evToday = itemsToday.filter(x => x.kind === 'event').length;
  const parts = [];
  if (courseToday) parts.push(courseToday + '节课');
  if (todoToday) parts.push(todoToday + '待办');
  if (evToday) parts.push(evToday + '活动');
  $('summary').textContent = '今天：' + (parts.join(' · ') || '无安排');
}

let resizeTimer = null;
function scheduleResize() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const h = Math.min(document.body.scrollHeight + 4, Math.floor(window.screen.availHeight * 0.8));
    window.api.resizeWidget(null, h);
  }, 150);
}

$('btnHide').addEventListener('click', () => window.api.hideWidget());
$('btnGear').addEventListener('click', () => window.api.openSetup());

(async () => {
  data = await window.api.getData();
  render();
  scheduleResize();
  setInterval(async () => { data = await window.api.getData(); render(); scheduleResize(); }, 30000);
  window.addEventListener('focus', async () => { data = await window.api.getData(); render(); scheduleResize(); });
})();