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
      const abbrMap = data.settings.courseAbbr || {};
      list.push({
        kind: 'course', startMin: toMinutes(p.start), time: p.start,
        name: abbrMap[c.name] || c.name, full: c.name,
        loc: c.location || '', teacher: c.teacher || '',
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
        const loc = (it.kind === 'course' && it.loc) ? `<span class="loc"${it.teacher ? ` title="${esc(it.teacher)}"` : ''}>📍 ${esc(it.loc)}</span>` : '';
        const titleAttr = (it.kind === 'course' && it.full && it.full !== it.name) ? ` title="${esc(it.full)}"` : '';
        const style = it.color ? ` style="background:${hexToRgba(it.color, 0.16)};border-left:3px solid ${hexToRgba(it.color, 0.85)}"` : '';
        return `<div class="${cls}"${titleAttr}${style}>${tm}${esc(it.name)}${loc}</div>`;
      }).join('') + (items.length > 12 ? `<div class="it" style="color:#7d86a3">+${items.length - 12}</div>` : '') + '</div>';
    }
    col.innerHTML = head + itemsHtml + `<button class="add" title="查看/添加 ${key} 的安排">+</button>`;
    col.querySelector('.add').addEventListener('click', () => window.api.openPopup(key));
    box.appendChild(col);
  }
}

function render() {
  if (dragging) return; // 拖拽中不重建 DOM，避免 pointer capture 被释放导致拖拽卡死
  // 挂件不透明度（0.2~1.0）
  const op = data && data.settings ? Number(data.settings.widgetOpacity) : 0.66;
  document.documentElement.style.setProperty('--widget-alpha', String(Math.max(0.2, Math.min(1, op || 0.66))));
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
    const abbrMap = data.settings.courseAbbr || {};
    const abbrOf = (n) => abbrMap[n] || n;
    const cur = today.find(x => n >= x.startMin && n < x.endMin);
    if (cur) {
      text = `🔔 现在：${abbrOf(cur.c.name)}${cur.c.location ? ' ' + cur.c.location : ''}（${cur.p.start}~${cur.p.end}）`;
    } else {
      const next = today.find(x => x.startMin > n);
      if (next) {
        text = `⏰ 下节：${abbrOf(next.c.name)}${next.c.location ? ' ' + next.c.location : ''} ${next.p.start}（还有 ${next.startMin - n} 分钟）`;
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
    const meta = [x.cd.time ? '🕒 ' + x.cd.time : '', x.cd.location ? '📍 ' + x.cd.location : ''].filter(Boolean).join(' · ');
    return `<span class="cd"${color}>🎯 ${esc(x.cd.title)} · ${label}${meta ? ' · ' + esc(meta) : ''}</span>`;
  }).join('');
}

// ---------- 交互区域上报：主进程每 50ms 轮询光标，命中交互区才取消穿透（不依赖鼠标事件转发，本机转发不可用） ----------
function sendInteractiveAreas() {
  if (!window.api.setInteractiveAreas) return;
  const els = document.querySelectorAll('.add, button, .mv, .rz');
  const areas = [];
  els.forEach(el => {
    const r = el.getBoundingClientRect();
    areas.push({ x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) });
  });
  window.api.setInteractiveAreas(areas);
}
window.addEventListener('resize', () => sendInteractiveAreas());

// ---------- 移动 / 缩放拖拽 ----------
let dragging = false;
let drag = null;
function beginDrag(e, mode, edge) {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  e.preventDefault();
  dragging = true;
  if (window.api.setDragActive) window.api.setDragActive(true);
  document.addEventListener('pointermove', onDragMove);
  document.addEventListener('pointerup', endDrag);
  document.addEventListener('pointercancel', endDrag);
  (async () => {
    // 拖拽起点用主进程的真实窗口 bounds（渲染进程 screenX/outerWidth 可能失同步，会导致窗口算飞）
    let sb = { x: window.screenX, y: window.screenY, w: window.outerWidth, h: window.outerHeight };
    if (window.api.getWidgetBounds) {
      try { const g = await window.api.getWidgetBounds(); if (g) sb = { x: g.x, y: g.y, w: g.width, h: g.height }; } catch (err) {}
    }
    if (!dragging) return; // 拖拽已在等 bounds 期间结束
    drag = { mode, edge, start: { x: sb.x, y: sb.y, w: sb.w, h: sb.h, mx: e.screenX, my: e.screenY } };
    try { e.target.setPointerCapture(e.pointerId); } catch (err) {}
  })();
}
function onDragMove(e) {
  if (!drag) return;
  const s = drag.start;
  if (drag.timer) clearTimeout(drag.timer);
  drag.timer = setTimeout(endDrag, 2000); // 兜底：pointerup 丢失时 2 秒无移动自动结束，防拖拽卡死
  const dx = e.screenX - s.mx;
  const dy = e.screenY - s.my;
  // 目标始终带上完整宽高（以拖拽起点为基准），主进程才不会把"读回的膨胀尺寸"再写回导致越拖越宽/越高
  const b = { x: s.x, y: s.y, width: s.w, height: s.h };
  if (drag.mode === 'move') {
    b.x = s.x + dx; b.y = s.y + dy;
  } else {
    const edge = drag.edge || '';
    if (edge.includes('l')) { b.x = s.x + dx; b.width = s.w - dx; }
    else if (edge.includes('r')) b.width = s.w + dx;
    if (edge.includes('t')) { b.y = s.y + dy; b.height = s.h - dy; }
    else if (edge.includes('b')) b.height = s.h + dy;
  }
  drag.last = { x: b.x, y: b.y, width: b.width, height: b.height };
  if (window.api.setWidgetBounds) window.api.setWidgetBounds(Object.assign({ edge: drag.edge, start: { x: s.x, y: s.y, w: s.w, h: s.h } }, b));
}
function endDrag() {
  const d = drag;
  if (d && d.timer) { clearTimeout(d.timer); d.timer = null; }
  dragging = false;
  drag = null;
  document.removeEventListener('pointermove', onDragMove);
  document.removeEventListener('pointerup', endDrag);
  document.removeEventListener('pointercancel', endDrag);
  if (window.api.setDragActive) window.api.setDragActive(false);
  // 松手时用最后一次拖拽目标做"精确落位"（correct=true），抵消系统缩放下 setBounds 的 DIP 舍入，避免每次拖拽变大
  if (window.api.setWidgetBounds && d && d.last) {
    window.api.setWidgetBounds(Object.assign({ persist: true, correct: true, edge: d.edge, start: { x: d.start.x, y: d.start.y, w: d.start.w, h: d.start.h } }, d.last));
  }
}
window.addEventListener('blur', () => { if (dragging) endDrag(); });

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
  sendInteractiveAreas();
  // 首次启动（未持久化过高度）按内容一次性定高并持久化；之后高度只由手动缩放决定，不再自动调整
  if (!data.settings.widgetHeight && window.api.setWidgetBounds) {
    const h = Math.min(document.body.scrollHeight + 4, Math.floor(window.screen.availHeight * 0.8));
    window.api.setWidgetBounds({ height: Math.round(h), persist: true });
  }
  if (window.api.onDataChanged) {
    // 防抖合并刷新：连续变更（如拖动透明度滑杆、批量编辑）只在停顿后拉一次最新数据，
    // 避免并发 getData 乱序导致界面残留旧值；数据最终一定与主进程一致
    let refreshTimer = null;
    window.api.onDataChanged(() => {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(async () => {
        data = await window.api.getData();
        if (!dragging) { render(); sendInteractiveAreas(); }
      }, 120);
    });
  }
  setInterval(async () => { data = await window.api.getData(); render(); sendInteractiveAreas(); }, 10000);
  window.addEventListener('focus', async () => { data = await window.api.getData(); render(); });
})();