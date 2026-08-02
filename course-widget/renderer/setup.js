let data = null;
let editing = null;
const $ = (id) => document.getElementById(id);
const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
function pad(n) { return String(n).padStart(2, '0'); }
function dateKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function todayKey() { return dateKey(new Date()); }
function weekdayCN(key) { const d = new Date(key + 'T00:00:00'); return ['日','一','二','三','四','五','六'][d.getDay()]; }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function parseWeeks(s) {
  s = (s || '').trim();
  if (!s) return null;
  const out = [];
  for (const part of s.split(/[,，、]/)) {
    const m = part.match(/^(\d+)\s*[-–—~]\s*(\d+)$/);
    if (m) { const a = +m[1], b = +m[2]; for (let i = Math.min(a, b); i <= Math.max(a, b); i++) out.push(i); }
    else if (/^\d+$/.test(part)) out.push(+part);
  }
  return out.length ? out : null;
}
function formatWeeks(arr) {
  if (!arr || !arr.length) return '';
  const sorted = [...arr].sort((a, b) => a - b);
  const parts = []; let start = sorted[0], prev = sorted[0];
  for (let i = 1; i <= sorted.length; i++) {
    const cur = sorted[i];
    if (cur === prev + 1) { prev = cur; continue; }
    parts.push(start === prev ? String(start) : start + '-' + prev);
    start = cur; prev = cur;
  }
  return parts.join(',') + '周';
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
const COURSE_COLORS = ['#77b5e8', '#67bfa4', '#f6c85f', '#f28b82', '#a88ad8', '#5bc0d1', '#e887b0', '#8bc6a3'];
let selectedColor = null;
function renderColorSwatches() {
  const box = $('mColors');
  if (!box) return;
  box.innerHTML = '';
  const none = document.createElement('button');
  none.type = 'button';
  none.className = 'cdot none' + (!selectedColor ? ' on' : '');
  none.title = '默认颜色';
  none.textContent = '✕';
  none.addEventListener('click', () => { selectedColor = null; renderColorSwatches(); });
  box.appendChild(none);
  for (const c of COURSE_COLORS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cdot' + (selectedColor === c ? ' on' : '');
    b.title = c;
    b.style.background = c;
    b.addEventListener('click', () => { selectedColor = c; renderColorSwatches(); });
    box.appendChild(b);
  }
}
function fmtPoints(r) { return (r && r.points && r.points.length) ? r.points.join(',') + '分钟前' : ''; }
function fmtRepeat(r) { return (r && r.repeat) ? `重复:前${r.repeat.start}分/每${r.repeat.every}分` : ''; }

async function init() {
  data = await window.api.getData();
  bindTabs(); bindHeader(); renderPeriods(); renderGrid(); renderEvents(); renderSettings(); bindTodoTab(); refreshTodoList(); renderCountdowns();
}
function toast(msg) { $('toast').textContent = msg; setTimeout(() => { if ($('toast').textContent === msg) $('toast').textContent = ''; }, 3000); }

function bindTabs() {
  document.querySelectorAll('.tabs button').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tabs button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('main > section').forEach(s => s.classList.add('hidden'));
      $('tab-' + btn.dataset.tab).classList.remove('hidden');
    });
  });
}
function bindHeader() {
  $('btnSave').addEventListener('click', async () => { await window.api.setData(data); toast('✅ 已保存'); });
  $('btnApplyWidget').addEventListener('click', async () => {
    data.settings.widgetApplied = true; data.settings.firstRun = false;
    await window.api.setData(data); await window.api.showWidget();
    toast('✅ 已保存，挂件已应用到桌面（软件在托盘）');
  });
}

// ---- 节次 ----
function renderPeriods() {
  const box = $('periods'); box.innerHTML = '';
  data.periods.sort((a, b) => a.index - b.index);
  data.periods.forEach((p) => {
    const row = document.createElement('div'); row.className = 'period-row';
    row.innerHTML = `<span class="idx">第${p.index}节</span>
      <input type="time" value="${p.start}" class="p-start"><span>~</span>
      <input type="time" value="${p.end}" class="p-end">
      <button class="ghost small p-del">删除</button>`;
    row.querySelector('.p-start').addEventListener('change', (e) => { p.start = e.target.value || '00:00'; });
    row.querySelector('.p-end').addEventListener('change', (e) => { p.end = e.target.value || '00:00'; });
    row.querySelector('.p-del').addEventListener('click', () => {
      data.periods = data.periods.filter(x => x.index !== p.index);
      data.courses = data.courses.filter(c => c.period !== p.index);
      renderPeriods(); renderGrid();
    });
    box.appendChild(row);
  });
}
$('btnAddPeriod').addEventListener('click', () => {
  const next = data.periods.length ? Math.max(...data.periods.map(p => p.index)) + 1 : 1;
  data.periods.push({ index: next, start: '08:00', end: '08:45' });
  renderPeriods(); renderGrid();
});

// ---- 课表网格 ----
function renderGrid() {
  const table = $('courseGrid');
  let html = '<tr><th style="width:52px">节次</th>' + WEEKDAYS.map(d => `<th>${d}</th>`).join('') + '</tr>';
  data.periods.sort((a, b) => a.index - b.index);
  for (const p of data.periods) {
    html += `<tr><td class="idx" style="font-size:11px;color:#6b7280">${p.start}<br>~${p.end}</td>`;
    for (let day = 1; day <= 7; day++) {
      const c = data.courses.find(x => x.day === day && x.period === p.index);
      html += `<td class="cell" data-day="${day}" data-period="${p.index}">
        ${c ? `<span class="cname">${c.color ? `<span class="cchip" style="background:${esc(c.color)}"></span>` : ''}${esc(c.name)}</span><span class="cmeta">${esc([c.teacher, c.location].filter(Boolean).join(' / '))}${c.weeks ? ' ' + formatWeeks(c.weeks) : ''}${fmtPoints(c.reminders) ? ' ' + fmtPoints(c.reminders) : ''}</span>` : ''}
      </td>`;
    }
    html += '</tr>';
  }
  table.innerHTML = html;
  table.querySelectorAll('td.cell').forEach((td) => td.addEventListener('click', () => openEditor(+td.dataset.day, +td.dataset.period)));
}

function openEditor(day, period) {
  const c = data.courses.find(x => x.day === day && x.period === period);
  editing = { day, period, course: c || null };
  $('modalTitle').textContent = `${WEEKDAYS[day - 1]} 第${period}节`;
  $('mName').value = c ? c.name : '';
  $('mTeacher').value = c ? (c.teacher || '') : '';
  $('mLocation').value = c ? (c.location || '') : '';
  selectedColor = c ? (c.color || null) : null;
  renderColorSwatches();
  $('mWeeks').value = c && c.weeks ? formatWeeks(c.weeks).replace(/周$/, '') : '';
  const r = (c && c.reminders) || {};
  $('mPoints').value = r.points && r.points.length ? r.points.join(',') : '';
  $('mRepStart').value = r.repeat ? r.repeat.start : '';
  $('mRepEvery').value = r.repeat ? r.repeat.every : '';
  $('mDelete').classList.toggle('hidden', !c);
  $('modal').classList.remove('hidden');
  $('mName').focus();
}
function closeEditor() { $('modal').classList.add('hidden'); editing = null; }
function modalBackdrop(e) { if (e.target === $('modal')) closeEditor(); }
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeEditor(); });
$('modal').addEventListener('click', modalBackdrop);
$('mCancel').addEventListener('click', closeEditor);
$('mDelete').addEventListener('click', () => {
  if (editing && editing.course) {
    data.courses = data.courses.filter(x => x.id !== editing.course.id);
    renderGrid(); closeEditor();
  }
});
$('mSave').addEventListener('click', () => {
  if (!editing) { closeEditor(); return; }
  const name = $('mName').value.trim();
  if (!name) { toast('⚠ 请先输入课程名'); $('mName').focus(); return; }
  const course = editing.course || { id: uid(), day: editing.day, period: editing.period };
  course.name = name;
  course.teacher = $('mTeacher').value.trim() || null;
  course.location = $('mLocation').value.trim() || null;
  course.color = selectedColor;
  course.weeks = parseWeeks($('mWeeks').value);
  course.reminders = normReminders(parsePoints($('mPoints').value), parseRepeat($('mRepStart'), $('mRepEvery')));
  if (!editing.course) data.courses.push(course);
  renderGrid(); closeEditor(); toast('✅ 已保存课程：' + name);
});

// ---- 临时活动 ----
function renderEvents() {
  const list = $('eventList'); list.innerHTML = '';
  const items = [...data.events].sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
  if (!items.length) { list.innerHTML = '<li class="txt" style="color:#9aa1b2">暂无活动</li>'; return; }
  for (const ev of items) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="txt">📅 ${ev.date}（周${weekdayCN(ev.date)}）${ev.time ? ' ' + ev.time : ''} · <b>${esc(ev.title)}</b>${fmtPoints(ev.reminders) ? '（' + fmtPoints(ev.reminders) + '）' : ''}${fmtRepeat(ev.reminders) ? ' ' + fmtRepeat(ev.reminders) : ''}</span>
      <button class="ghost small ev-del">删除</button>`;
    li.querySelector('.ev-del').addEventListener('click', () => { data.events = data.events.filter(x => x.id !== ev.id); renderEvents(); });
    list.appendChild(li);
  }
}
$('btnAddEvent').addEventListener('click', () => {
  const title = $('evTitle').value.trim();
  const date = $('evDate').value || todayKey();
  if (!title) { $('evTitle').focus(); return; }
  data.events.push({
    id: uid(), title, date, time: $('evTime').value || null,
    reminders: normReminders(parsePoints($('evPoints').value), parseRepeat($('evRepStart'), $('evRepEvery')))
  });
  $('evTitle').value = ''; $('evTime').value = ''; $('evPoints').value = ''; $('evRepStart').value = ''; $('evRepEvery').value = '';
  renderEvents();
});

// ---- 待办 ----
let todoDate = todayKey();
function bindTodoTab() {
  $('todoDate').value = todoDate;
  $('todoDate').addEventListener('change', (e) => { todoDate = e.target.value || todayKey(); refreshTodoList(); });
  $('btnAddTodo').addEventListener('click', addTodo);
  $('todoText').addEventListener('keydown', (e) => { if (e.key === 'Enter') addTodo(); });
}
function refreshTodoList() {
  const list = $('todoList');
  $('todoDateLabel').textContent = `${todoDate} 周${weekdayCN(todoDate)}`;
  const todos = data.todos[todoDate] || [];
  list.innerHTML = '';
  if (!todos.length) { list.innerHTML = '<li class="txt" style="color:#9aa1b2">这一天暂无待办</li>'; return; }
  todos.forEach((t) => {
    const li = document.createElement('li');
    li.innerHTML = `<input type="checkbox" ${t.done ? 'checked' : ''} class="t-done">
      <span class="txt ${t.done ? 'done' : ''}">${esc(t.text)}${t.deadline ? '  ⏰' + esc(t.deadline) : ''}${fmtPoints(t.reminders) ? '（' + fmtPoints(t.reminders) + '）' : ''}</span>
      <button class="ghost small t-del">删除</button>`;
    li.querySelector('.t-done').addEventListener('change', (e) => { t.done = e.target.checked; refreshTodoList(); });
    li.querySelector('.t-del').addEventListener('click', () => {
      data.todos[todoDate] = data.todos[todoDate].filter(x => x.id !== t.id);
      if (!data.todos[todoDate].length) delete data.todos[todoDate];
      refreshTodoList();
    });
    list.appendChild(li);
  });
}
function addTodo() {
  const text = $('todoText').value.trim();
  if (!text) return;
  if (!data.todos[todoDate]) data.todos[todoDate] = [];
  data.todos[todoDate].push({
    id: uid(), text, deadline: $('tdTime').value || null, done: false, createdAt: Date.now(),
    reminders: normReminders(parsePoints($('tdPoints').value), parseRepeat($('tdRepStart'), $('tdRepEvery')))
  });
  $('todoText').value = ''; $('tdTime').value = ''; $('tdPoints').value = ''; $('tdRepStart').value = ''; $('tdRepEvery').value = '';
  refreshTodoList();
}

// ---- 倒数日 ----
function renderCountdowns() {
  const list = $('countdownList');
  if (!list) return;
  const items = [...(data.countdowns || [])].sort((a, b) => a.date.localeCompare(b.date));
  list.innerHTML = '';
  if (!items.length) { list.innerHTML = '<li class="txt" style="color:#9aa1b2">暂无倒数日</li>'; return; }
  for (const cd of items) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="txt">🎯 <b>${esc(cd.title)}</b> · ${cd.date}${cd.color ? ` <span style="display:inline-block;width:10px;height:10px;background:${esc(cd.color)};border-radius:50%;vertical-align:middle"></span>` : ''}</span>
      <button class="ghost small cd-del">删除</button>`;
    li.querySelector('.cd-del').addEventListener('click', () => {
      data.countdowns = data.countdowns.filter(x => x.id !== cd.id);
      renderCountdowns();
    });
    list.appendChild(li);
  }
}
$('btnAddCountdown').addEventListener('click', () => {
  const title = $('cdTitle').value.trim();
  const date = $('cdDate').value;
  if (!title || !date) { toast('⚠ 请填写名称和日期'); return; }
  if (!data.countdowns) data.countdowns = [];
  data.countdowns.push({ id: uid(), title, date, color: $('cdColor').value || null });
  $('cdTitle').value = ''; $('cdDate').value = ''; $('cdColor').value = '';
  renderCountdowns();
  toast('✅ 已添加倒数日');
});

// ---- 设置 ----
function renderSettings() {
  $('setRemind').value = data.settings.remindMinutes;
  $('setSemester').value = data.settings.semesterStart || '';
  $('setWidth').value = data.settings.widgetWidth || 900;
  $('setCompact').checked = !!data.settings.widgetCompact;
  $('setWeekStrip').checked = !!data.settings.showWeekStrip;
  $('setClickThrough').checked = !!data.settings.clickThrough;
  $('setAutostart').checked = !!data.settings.autostart;
  $('setShowCountdown').checked = !!data.settings.showCountdown;
  $('setBell').checked = !!data.settings.bellEnabled;
  const presetSel = $('setBellPreset');
  presetSel.innerHTML = '';
  for (const p of CHIME_PRESETS) {
    const opt = document.createElement('option');
    opt.value = p.id; opt.textContent = p.label;
    presetSel.appendChild(opt);
  }
  presetSel.value = data.settings.bellPreset || 'school-bell';
  const vol = Math.round((data.settings.bellVolume != null ? data.settings.bellVolume : 0.8) * 100);
  $('setBellVolume').value = vol;
  $('bellVolLabel').textContent = vol + '%';
}
$('setRemind').addEventListener('change', (e) => { data.settings.remindMinutes = Math.max(0, parseInt(e.target.value, 10) || 0); });
$('setSemester').addEventListener('change', (e) => { data.settings.semesterStart = e.target.value || null; });
$('setWidth').addEventListener('change', async (e) => {
  data.settings.widgetWidth = Math.min(1600, Math.max(560, parseInt(e.target.value, 10) || 900));
  if (window.api.setWidgetBounds) await window.api.setWidgetBounds({ width: data.settings.widgetWidth });
});
if ($('btnSnapBR')) $('btnSnapBR').addEventListener('click', async () => { if (window.api.snapCorner) await window.api.snapCorner('bottomRight'); });
if ($('btnSnapTR')) $('btnSnapTR').addEventListener('click', async () => { if (window.api.snapCorner) await window.api.snapCorner('topRight'); });
$('setCompact').addEventListener('change', (e) => { data.settings.widgetCompact = e.target.checked; });
$('setWeekStrip').addEventListener('change', (e) => { data.settings.showWeekStrip = e.target.checked; });
$('setClickThrough').addEventListener('change', async (e) => { data.settings.clickThrough = e.target.checked; await window.api.setClickThrough(e.target.checked); });
$('setAutostart').addEventListener('change', async (e) => { data.settings.autostart = e.target.checked; await window.api.setAutostart(e.target.checked); });
$('setShowCountdown').addEventListener('change', (e) => { data.settings.showCountdown = e.target.checked; });
$('setBell').addEventListener('change', (e) => { data.settings.bellEnabled = e.target.checked; });
$('setBellPreset').addEventListener('change', (e) => { data.settings.bellPreset = e.target.value; });
$('setBellVolume').addEventListener('input', (e) => {
  const v = parseInt(e.target.value, 10) || 0;
  data.settings.bellVolume = v / 100;
  $('bellVolLabel').textContent = v + '%';
});
$('btnTestBell').addEventListener('click', () => {
  playChime(data.settings.bellPreset || 'school-bell', data.settings.bellVolume != null ? data.settings.bellVolume : 0.8);
});
$('btnTestNotify').addEventListener('click', () => window.api.testNotify());
$('btnExport').addEventListener('click', async () => { const r = await window.api.exportData(); toast(r.ok ? `✅ 已导出：${r.path}` : '已取消'); });
$('btnImport').addEventListener('click', async () => {
  const r = await window.api.importData();
  if (r.ok) { data = await window.api.getData(); renderPeriods(); renderGrid(); renderEvents(); renderCountdowns(); renderSettings(); refreshTodoList(); toast(`✅ 已导入：${r.path}`); }
  else if (r.error) toast('❌ ' + r.error);
});

init();