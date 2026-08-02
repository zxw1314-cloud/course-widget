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
function hexToRgba(hex, alpha) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + alpha + ')';
}
function isNowBetween(start, end) {
  const d = new Date(); const n = d.getHours() * 60 + d.getMinutes();
  return n >= toMinutes(start) && n < toMinutes(end);
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
      list.push({
        kind: 'course', startMin: toMinutes(p.start), time: p.start + '~' + p.end,
        name: c.name, meta: [c.location, c.teacher].filter(Boolean).join(' ｜ ') || '',
        done: false, color: c.color || null,
        current: date === dateKey(new Date()) && isNowBetween(p.start, p.end)
      });
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
        const cls = 'it ' + it.kind + (it.done ? ' done' : '') + (it.current ? ' now' : '');
        const tm = it.time ? `<span class="tm">${esc(it.time)}</span>` : '';
        const meta = it.meta ? ' ' + esc(it.meta) : '';
        const style = it.color ? ` style="background:${hexToRgba(it.color, 0.16)};border-left:3px solid ${hexToRgba(it.color, 0.85)}"` : '';
        return `<div class="${cls}"${style}>${tm}${esc(it.name)}${meta}</div>`;
      }).join('') + (items.length > 12 ? `<div class="it" style="color:#7d86a3">+${items.length - 12}</div>` : '') + '</div>';
    }
    col.innerHTML = head + itemsHtml + `<button class="add" title="查看/添加 ${key} 的安排">+</button>`;
    col.querySelector('.add').addEventListener('click', () => window.api.openPopup(key));
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
  renderStatus();
  renderCountdowns();
}

function renderStatus() {
  const now = new Date();
  const wk = weekdayIndex(now);
  const week = currentWeek();
  const n = now.getHours() * 60 + now.getMinutes();
  const today = [];
  for (const c of data.courses) {
    if (c.day !== wk || !weekMatches(c, week)) continue;
    const p = data.periods.find(x => x.index === c.period);
    if (!p) continue;
    today.push({ c, p, startMin: toMinutes(p.start), endMin: toMinutes(p.end) });
  }
  today.sort((a, b) => a.startMin - b.startMin);
  let text = '';
  if (!today.length) {
    text = '📥 今天没有课';
  } else {
    const cur = today.find(x => n >= x.startMin && n < x.endMin);
    if (cur) {
      text = `🔔 现在：${cur.c.name}${cur.c.location ? ' ' + cur.c.location : ''}（${cur.p.start}~${cur.p.end}）`;
    } else {
      const next = today.find(x => x.startMin > n);
      if (next) {
        text = `⏰ 下节：${next.c.name}${next.c.location ? ' ' + next.c.location : ''} ${next.p.start}（还有 ${next.startMin - n} 分钟）`;
      } else {
        text = '📥 今天的课已结束';
      }
    }
  }
  const el = $('status');
  if (el) el.textContent = text;
}

function renderCountdowns() {
  const box = $('cdstrip');
  const enabled = data.settings && data.settings.showCountdown !== false;
  const list = (data.countdowns || []).filter(cd => cd && cd.date);
  if (!enabled || !list.length) { box.style.display = 'none'; return; }
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const items = list
    .map(cd => {
      const t = parseDateKey(cd.date); t.setHours(0, 0, 0, 0);
      return { cd, days: Math.round((t - today) / 86400000) };
    })
    .filter(x => x.days >= 0)
    .sort((a, b) => a.days - b.days)
    .slice(0, 3);
  if (!items.length) { box.style.display = 'none'; return; }
  box.style.display = '';
  box.innerHTML = items.map(x => {
    const color = x.cd.color ? ` style="color:${esc(x.cd.color)}"` : '';
    const label = x.days === 0 ? '就是今天' : `还有 ${x.days} 天`;
    return `<span class="cd"${color}>🎯 ${esc(x.cd.title)} · ${label}</span>`;
  }).join('');
}

// ---------- 选择性点击穿透：只保留 14 个加号 / 移动手柄 / 缩放手柄 / 右上角按钮 可交互，其余全部穿透到桌面 ----------
let clickThroughOn = false;
let dragging = false;
function isInteractive(el) {
  return !!(el && el.closest && el.closest('.add, button, .mv, .rz'));
}
document.addEventListener('mousemove', (e) => {
  if (dragging) return;
  const want = !isInteractive(e.target);
  if (want !== clickThroughOn) {
    clickThroughOn = want;
    if (window.api.setClickThrough) window.api.setClickThrough(want);
  }
});
document.addEventListener('mouseleave', () => {
  if (dragging) return;
  if (!clickThroughOn) { clickThroughOn = true; if (window.api.setClickThrough) window.api.setClickThrough(true); }
});
window.__ctState = () => clickThroughOn;

// ---------- 移动 / 缩放拖拽 ----------
let drag = null;
function beginDrag(e, mode, edge) {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  e.preventDefault();
  dragging = true;
  drag = {
    mode, edge,
    start: { x: window.screenX, y: window.screenY, w: window.outerWidth, h: window.outerHeight, mx: e.screenX, my: e.screenY }
  };
  try { e.target.setPointerCapture(e.pointerId); } catch (err) {}
  document.addEventListener('pointermove', onDragMove);
  document.addEventListener('pointerup', endDrag);
  document.addEventListener('pointercancel', endDrag);
}
function onDragMove(e) {
  if (!drag) return;
  const s = drag.start;
  const dx = e.screenX - s.mx;
  const dy = e.screenY - s.my;
  const b = { x: s.x, y: s.y };
  if (drag.mode === 'move') {
    b.x = s.x + dx; b.y = s.y + dy;
  } else {
    const edge = drag.edge || '';
    if (edge.includes('l')) { b.x = s.x + dx; b.width = s.w - dx; }
    if (edge.includes('r')) b.width = s.w + dx;
    if (edge.includes('t')) { b.y = s.y + dy; b.height = s.h - dy; }
    if (edge.includes('b')) b.height = s.h + dy;
  }
  if (window.api.setWidgetBounds) window.api.setWidgetBounds(b);
}
function endDrag() {
  dragging = false;
  drag = null;
  document.removeEventListener('pointermove', onDragMove);
  document.removeEventListener('pointerup', endDrag);
  document.removeEventListener('pointercancel', endDrag);
  if (window.api.setWidgetBounds) window.api.setWidgetBounds({ persist: true });
}

document.querySelectorAll('.rz').forEach(z => {
  z.addEventListener('pointerdown', (e) => beginDrag(e, 'resize', z.dataset.edge));
});
$('btnMove').addEventListener('pointerdown', (e) => beginDrag(e, 'move', null));
$('btnHide').addEventListener('click', () => window.api.hideWidget());
$('btnGear').addEventListener('click', () => window.api.openSetup());

(async () => {
  data = await window.api.getData();
  if (window.api.onBellRing) {
    window.api.onBellRing((kind) => {
      const s = (data && data.settings) || {};
      playChime(s.bellPreset || 'school-bell', s.bellVolume != null ? s.bellVolume : 0.8);
    });
  }
  render();
  // 首次启动（未持久化过高度）按内容一次性定高并持久化；之后高度只由手动缩放决定，不再自动调整
  if (!data.settings.widgetHeight && window.api.setWidgetBounds) {
    const h = Math.min(document.body.scrollHeight + 4, Math.floor(window.screen.availHeight * 0.8));
    window.api.setWidgetBounds({ height: Math.round(h), persist: true });
  }
  setInterval(async () => { data = await window.api.getData(); render(); }, 30000);
  window.addEventListener('focus', async () => { data = await window.api.getData(); render(); });
})();