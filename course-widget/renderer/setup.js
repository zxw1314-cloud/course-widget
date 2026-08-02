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
  bindTabs(); bindHeader(); bindCloseConfirm(); renderPeriods(); renderGrid(); renderEvents(); renderSettings(); bindTodoTab(); refreshTodoList(); renderCountdowns(); renderAbbrs();
}
function toast(msg) { $('toast').textContent = msg; setTimeout(() => { if ($('toast').textContent === msg) $('toast').textContent = ''; }, 3000); }

// ---- 未保存修改提醒 ----
let dirty = false;
function markDirty() {
  if (dirty) return;
  dirty = true;
  const b = $('dirtyBadge'); if (b) b.classList.remove('hidden');
  if (window.api.setSetupDirty) window.api.setSetupDirty(true);
}
function clearDirty() {
  dirty = false;
  const b = $('dirtyBadge'); if (b) b.classList.add('hidden');
  if (window.api.setSetupDirty) window.api.setSetupDirty(false);
}
function copyText(t) {
  try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(t).then(() => {}, () => {}); return true; } } catch (e) {}
  const ta = document.createElement('textarea');
  ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  let ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
  document.body.removeChild(ta);
  return ok;
}

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
  $('btnSave').addEventListener('click', async () => { await window.api.setData(data); clearDirty(); toast('✅ 已保存（别忘了应用到桌面挂件）'); });
  $('btnApplyWidget').addEventListener('click', async () => {
    data.settings.widgetApplied = true; data.settings.firstRun = false;
    await window.api.setData(data); await window.api.showWidget(); clearDirty();
    toast('✅ 已保存，挂件已应用到桌面（软件在托盘）');
  });
}
function bindCloseConfirm() {
  if (!window.api.onAskClose) return;
  window.api.onAskClose(() => { $('closeModal').classList.remove('hidden'); });
  $('btnCloseCancel').addEventListener('click', () => $('closeModal').classList.add('hidden'));
  $('btnCloseDiscard').addEventListener('click', () => { clearDirty(); window.api.forceCloseSetup(); });
  $('btnCloseSave').addEventListener('click', async () => {
    await window.api.setData(data); clearDirty(); window.api.forceCloseSetup();
  });
  $('btnCloseSaveApply').addEventListener('click', async () => {
    data.settings.widgetApplied = true; data.settings.firstRun = false;
    await window.api.setData(data); await window.api.showWidget(); clearDirty(); window.api.forceCloseSetup();
  });
}

// ---- 节次 ----
function renderPeriods() {
  const box = $('periods'); box.innerHTML = '';
  data.periods.sort((a, b) => a.index - b.index);
  data.periods.forEach((p) => {
    const row = document.createElement('div'); row.className = 'period-row';
    row.innerHTML = `<span class="idx">${esc(p.label || ('第' + p.index + '节'))}</span>
      <input type="time" value="${p.start}" class="p-start"><span>~</span>
      <input type="time" value="${p.end}" class="p-end">
      <button class="ghost small p-del">删除</button>`;
    row.querySelector('.p-start').addEventListener('change', (e) => { p.start = e.target.value || '00:00'; markDirty(); });
    row.querySelector('.p-end').addEventListener('change', (e) => { p.end = e.target.value || '00:00'; markDirty(); });
    row.querySelector('.p-del').addEventListener('click', () => {
      data.periods = data.periods.filter(x => x.index !== p.index);
      data.courses = data.courses.filter(c => c.period !== p.index);
      renderPeriods(); renderGrid(); markDirty();
    });
    box.appendChild(row);
  });
}
$('btnAddPeriod').addEventListener('click', () => {
  const next = data.periods.length ? Math.max(...data.periods.map(p => p.index)) + 1 : 1;
  data.periods.push({ index: next, label: '第' + next + '节', start: '08:00', end: '08:45' });
  renderPeriods(); renderGrid(); markDirty();
});

// ---- 课表网格 ----
function renderGrid() {
  const table = $('courseGrid');
  let html = '<tr><th style="width:52px">节次</th>' + WEEKDAYS.map(d => `<th>${d}</th>`).join('') + '</tr>';
  data.periods.sort((a, b) => a.index - b.index);
  for (const p of data.periods) {
    html += `<tr><td class="idx" style="font-size:11px;color:#6b7280">${esc(p.label || ('第' + p.index + '节'))}<br>${p.start}~${p.end}</td>`;
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
    const p0 = data.periods.find(x => x.index === period);
  $('modalTitle').textContent = `${WEEKDAYS[day - 1]} ${p0 ? (p0.label || ('第' + period + '节')) : ('第' + period + '节')}`;
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
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  closeEditor();
  if ($('jsonModal')) $('jsonModal').classList.add('hidden');
  if ($('closeModal')) $('closeModal').classList.add('hidden');
});
$('modal').addEventListener('click', modalBackdrop);
$('mCancel').addEventListener('click', closeEditor);
$('mDelete').addEventListener('click', () => {
  if (editing && editing.course) {
    data.courses = data.courses.filter(x => x.id !== editing.course.id);
    renderGrid(); closeEditor(); markDirty();
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
  renderGrid(); closeEditor(); markDirty(); toast('✅ 已保存课程：' + name);
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
    li.querySelector('.ev-del').addEventListener('click', () => { data.events = data.events.filter(x => x.id !== ev.id); renderEvents(); markDirty(); });
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
  renderEvents(); markDirty();
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
    li.querySelector('.t-done').addEventListener('change', (e) => { t.done = e.target.checked; refreshTodoList(); markDirty(); });
    li.querySelector('.t-del').addEventListener('click', () => {
      data.todos[todoDate] = data.todos[todoDate].filter(x => x.id !== t.id);
      if (!data.todos[todoDate].length) delete data.todos[todoDate];
      refreshTodoList(); markDirty();
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
  refreshTodoList(); markDirty();
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
    const meta = [cd.time ? '🕒 ' + cd.time : '', cd.location ? '📍 ' + cd.location : ''].filter(Boolean).join(' · ');
    li.innerHTML = `<span class="txt">🎯 <b>${esc(cd.title)}</b> · ${cd.date}${meta ? ' · ' + esc(meta) : ''}${cd.color ? ` <span style="display:inline-block;width:10px;height:10px;background:${esc(cd.color)};border-radius:50%;vertical-align:middle"></span>` : ''}</span>
      <button class="ghost small cd-del">删除</button>`;
    li.querySelector('.cd-del').addEventListener('click', () => {
      data.countdowns = data.countdowns.filter(x => x.id !== cd.id);
      renderCountdowns(); markDirty();
    });
    list.appendChild(li);
  }
}
$('btnAddCountdown').addEventListener('click', () => {
  const title = $('cdTitle').value.trim();
  const date = $('cdDate').value;
  if (!title || !date) { toast('⚠ 请填写名称和日期'); return; }
  if (!data.countdowns) data.countdowns = [];
  data.countdowns.push({ id: uid(), title, date, time: $('cdTime').value || null, location: $('cdLoc').value.trim() || null, color: $('cdColor').value || null });
  $('cdTitle').value = ''; $('cdDate').value = ''; $('cdTime').value = ''; $('cdLoc').value = ''; $('cdColor').value = '';
  renderCountdowns(); markDirty();
  toast('✅ 已添加倒数日');
});

// ---- 设置 ----
function renderSettings() {
  $('setRemind').value = data.settings.remindMinutes;
  $('setSemester').value = data.settings.semesterStart || '';
  $('setWidth').value = data.settings.widgetWidth || 900;
  const opPct = Math.round(((data.settings.widgetOpacity != null ? data.settings.widgetOpacity : 0.66) || 0.66) * 100);
  $('setOpacity').value = opPct;
  $('opacityLabel').textContent = opPct + '%';
  $('setCompact').checked = !!data.settings.widgetCompact;
  $('setWeekStrip').checked = !!data.settings.showWeekStrip;
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
$('setRemind').addEventListener('change', (e) => { data.settings.remindMinutes = Math.max(0, parseInt(e.target.value, 10) || 0); markDirty(); });
$('setSemester').addEventListener('change', (e) => { data.settings.semesterStart = e.target.value || null; markDirty(); });
$('setWidth').addEventListener('change', async (e) => {
  data.settings.widgetWidth = Math.min(1600, Math.max(560, parseInt(e.target.value, 10) || 900));
  if (window.api.setWidgetBounds) await window.api.setWidgetBounds({ width: data.settings.widgetWidth, correct: true });
});
$('setOpacity').addEventListener('input', (e) => {
  const v = parseInt(e.target.value, 10) || 66;
  data.settings.widgetOpacity = Math.max(20, Math.min(100, v)) / 100;
  $('opacityLabel').textContent = Math.round(data.settings.widgetOpacity * 100) + '%';
  if (window.api.setOpacity) window.api.setOpacity(data.settings.widgetOpacity);
});
if ($('btnSnapBR')) $('btnSnapBR').addEventListener('click', async () => { if (window.api.snapCorner) await window.api.snapCorner('bottomRight'); });
if ($('btnSnapTR')) $('btnSnapTR').addEventListener('click', async () => { if (window.api.snapCorner) await window.api.snapCorner('topRight'); });
$('setCompact').addEventListener('change', (e) => { data.settings.widgetCompact = e.target.checked; markDirty(); });
$('setWeekStrip').addEventListener('change', (e) => { data.settings.showWeekStrip = e.target.checked; markDirty(); });
$('setAutostart').addEventListener('change', async (e) => { data.settings.autostart = e.target.checked; await window.api.setAutostart(e.target.checked); });
$('setShowCountdown').addEventListener('change', (e) => { data.settings.showCountdown = e.target.checked; markDirty(); });
$('setBell').addEventListener('change', (e) => { data.settings.bellEnabled = e.target.checked; markDirty(); });
$('setBellPreset').addEventListener('change', (e) => { data.settings.bellPreset = e.target.value; markDirty(); });
$('setBellVolume').addEventListener('input', (e) => {
  const v = parseInt(e.target.value, 10) || 0;
  data.settings.bellVolume = v / 100;
  $('bellVolLabel').textContent = v + '%';
  markDirty();
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


// ---- 课程简写映射（挂件显示用） ----
function renderAbbrs() {
  const box = $('abbrList');
  if (!box) return;
  if (!data.settings.courseAbbr) data.settings.courseAbbr = {};
  const map = data.settings.courseAbbr;
  const names = [...new Set((data.courses || []).map(c => c.name).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh'));
  box.innerHTML = '';
  if (!names.length) { box.innerHTML = '<div style="color:#9aa1b2;font-size:12px">暂无课程，先在课表网格里添加课程，再回来配简写</div>'; return; }
  for (const n of names) {
    const row = document.createElement('div');
    row.className = 'abbr-row';
    const input = document.createElement('input');
    input.placeholder = '简写（留空 = 挂件显示全称）';
    input.value = map[n] || '';
    input.addEventListener('input', () => {
      const v = input.value.trim();
      if (v) map[n] = v; else delete map[n];
      markDirty();
    });
    const span = document.createElement('span');
    span.className = 'abbr-name';
    span.title = n;
    span.textContent = n;
    row.appendChild(span);
    row.appendChild(input);
    box.appendChild(row);
  }
}

// ---- JSON 导入 / 导出 / AI 提示词 ----
const AI_IMPORT_PROMPT = `你是课表信息提取助手。用户会提供一张课表/作息表的截图或照片，请把其中的信息提取为严格 JSON，只输出 JSON 本身，不要任何解释文字或 Markdown 代码块。

提取规则：
1. 作息时间表：逐节提取到 periods 数组。index 从 1 开始递增；label 写图片上的节次名（如 "第1节"、"中午1节"）；start/end 为 24 小时制 "HH:MM"。
2. 课程表：每个课程一条记录放到 courses 数组。跨节次的课（如 "3-5节"）合并成一条，periods 写范围字符串 "3-5" 或数组 [3,4,5]；day 用 1~7（周一=1，周日=7）；weeks 写周次数组（每周都上写 null）；location/teacher 原样抄录，没有就 null。
3. 为每门课建议 2~4 字的简写放到 abbr 字段（如 "数据结构与算法"→"数算"、"计算机组成原理"→"计组"、"大学物理实验"→"大物"）。颜色可从预设选：#77b5e8 蓝 / #67bfa4 绿 / #f6c85f 黄 / #f28b82 红 / #a88ad8 紫 / #5bc0d1 青 / #e887b0 粉 / #8bc6a3 灰绿。
4. 图片里若有学期起始日/开学日期，填入 semesterStart（YYYY-MM-DD，第 1 周的周一），没有就省略。
5. 所有课程的简写再单独汇总到顶层 "abbr": { "课程全名": "简写" }。

输出 JSON 结构：
{
  "semesterStart": "2026-09-07",
  "periods": [ { "index": 1, "label": "第1节", "start": "08:00", "end": "08:45" } ],
  "courses": [
    { "name": "数据结构与算法", "abbr": "数算", "day": 3, "periods": "11-12", "location": "金明校区金明综合楼2", "teacher": null, "weeks": null, "color": "#77b5e8" }
  ],
  "abbr": { "数据结构与算法": "数算" }
}`;

function groupCoursesForExport() {
  const groups = []; const byKey = {};
  for (const c of (data.courses || [])) {
    const key = [c.name, c.day, c.location || '', c.teacher || '', c.weeks ? JSON.stringify(c.weeks) : '', c.color || ''].join('|');
    if (!byKey[key]) {
      byKey[key] = { name: c.name, day: c.day, location: c.location || null, teacher: c.teacher || null, weeks: c.weeks || null, color: c.color || null, periods: [] };
      groups.push(byKey[key]);
    }
    byKey[key].periods.push(c.period);
  }
  return groups.map(g => Object.assign({}, g, { periods: g.periods.sort((a, b) => a - b) }));
}
function buildTimetableJson() {
  const abbr = {};
  for (const k of Object.keys(data.settings.courseAbbr || {})) if (data.settings.courseAbbr[k]) abbr[k] = data.settings.courseAbbr[k];
  return JSON.stringify({
    semesterStart: data.settings.semesterStart || null,
    periods: (data.periods || []).slice().sort((a, b) => a.index - b.index).map(p => ({ index: p.index, label: p.label || ('第' + p.index + '节'), start: p.start, end: p.end })),
    courses: groupCoursesForExport(),
    abbr: abbr
  }, null, 2);
}
const DAY_MAP = { '周一':1,'周二':2,'周三':3,'周四':4,'周五':5,'周六':6,'周日':7, '星期一':1,'星期二':2,'星期三':3,'星期四':4,'星期五':5,'星期六':6,'星期日':7, '一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'日':7 };
function parseDay(d) {
  const s = String(d == null ? '' : d).trim();
  if (/^[1-7]$/.test(s)) return +s;
  if (DAY_MAP[s] != null) return DAY_MAP[s];
  for (const k of Object.keys(DAY_MAP)) if (s.includes(k)) return DAY_MAP[k];
  return null;
}
function parsePeriods(p) {
  if (p == null) return null;
  if (Array.isArray(p)) { const a = p.map(Number).filter(n => Number.isFinite(n) && n > 0); return a.length ? a : null; }
  if (typeof p === 'number') return [p];
  const s = String(p).trim();
  if (!s) return null;
  const out = [];
  for (const part of s.split(/[,，、;；]/)) {
    const m = part.match(/^(\d+)\s*[-~–—]\s*(\d+)$/);
    if (m) { const a = +m[1], b = +m[2]; for (let i = Math.min(a, b); i <= Math.max(a, b); i++) out.push(i); }
    else if (/^\d+$/.test(part)) out.push(+part);
  }
  return out.length ? out : null;
}
function importWeeks(w) {
  if (w == null) return null;
  if (Array.isArray(w)) { const a = w.map(Number).filter(n => Number.isFinite(n) && n > 0); return a.length ? a : null; }
  if (typeof w === 'number') return [w];
  return parseWeeks(String(w));
}
function parseTimetableJson(text) {
  const raw = JSON.parse(text);
  const src = Array.isArray(raw) ? { courses: raw } : (raw && typeof raw === 'object' ? raw : {});
  const errors = [], warnings = [];
  const courses = [];
  const existingPeriods = new Set((data.periods || []).map(p => p.index));
  for (const [i, c] of (src.courses || []).entries()) {
    const name = String(c.name || '').trim();
    if (!name) { errors.push('第' + (i + 1) + '条缺课程名'); continue; }
    const day = parseDay(c.day);
    if (!day) { errors.push('第' + (i + 1) + '条「' + name + '」星期无效：' + c.day); continue; }
    const periods = parsePeriods(c.periods);
    if (!periods || !periods.length) { errors.push('第' + (i + 1) + '条「' + name + '」节次无效：' + JSON.stringify(c.periods)); continue; }
    const missing = periods.filter(p => !existingPeriods.has(p));
    if (missing.length) warnings.push('「' + name + '」节次 ' + missing.join(',') + ' 不在当前作息表中，已忽略');
    const weeks = importWeeks(c.weeks);
    for (const p of periods) {
      if (!existingPeriods.has(p)) continue;
      courses.push({ id: uid(), name, day, period: p, weeks, location: c.location || null, teacher: c.teacher || null, color: c.color || null, reminders: { points: [10], repeat: null } });
    }
  }
  const periods = Array.isArray(src.periods) ? src.periods.map((p, i) => {
    const idx = Number(p.index) || (i + 1);
    return { index: idx, label: String(p.label || ('第' + idx + '节')), start: String(p.start || '08:00'), end: String(p.end || '08:45') };
  }) : null;
  return { periods, courses, semesterStart: src.semesterStart || null, abbr: src.abbr || null, errors, warnings };
}

// ---- JSON 面板事件 ----
let parsedJson = null;
$('btnJsonImport').addEventListener('click', () => {
  parsedJson = null; $('btnJsonApply').classList.add('hidden');
  $('jsonPreview').innerHTML = ''; $('jsonText').value = '';
  $('jsonModal').classList.remove('hidden');
});
$('btnJsonExport').addEventListener('click', () => {
  const json = buildTimetableJson();
  $('jsonText').value = json;
  $('jsonPreview').innerHTML = '<div style="color:#2b2f38">已生成当前课表 JSON（可复制后让 AI 修改，再粘回此处导入）。</div>';
  $('btnJsonApply').classList.add('hidden');
  $('jsonModal').classList.remove('hidden');
  copyText(json);
});
$('btnJsonPrompt').addEventListener('click', () => {
  copyText(AI_IMPORT_PROMPT);
  toast('✅ AI 提取提示词已复制到剪贴板');
});
$('btnJsonCancel').addEventListener('click', () => $('jsonModal').classList.add('hidden'));
$('jsonModal').addEventListener('click', (e) => { if (e.target === $('jsonModal')) $('jsonModal').classList.add('hidden'); });
$('btnJsonParse').addEventListener('click', () => {
  const text = $('jsonText').value;
  if (!text.trim()) { toast('⚠ 请先粘贴 JSON'); return; }
  let parsed;
  try { parsed = parseTimetableJson(text); }
  catch (e) { $('jsonPreview').innerHTML = '<div style="color:#d23c2f">❌ JSON 解析失败：' + esc(e.message) + '</div>'; return; }
  parsedJson = parsed;
  if (parsed.errors.length) {
    $('jsonPreview').innerHTML = '<div style="color:#d23c2f">❌ ' + esc(parsed.errors.join('；')) + '</div>';
    $('btnJsonApply').classList.add('hidden');
    return;
  }
  const lines = ['✔ 解析成功：课程 ' + parsed.courses.length + ' 条' + (parsed.periods ? '，作息表 ' + parsed.periods.length + ' 节' : '')];
  if (parsed.warnings.length) lines.push('<span style="color:#a17700">⚠ ' + esc(parsed.warnings.join('；')) + '</span>');
  const sample = {};
  for (const c of parsed.courses) sample[c.name] = (sample[c.name] || 0) + 1;
  lines.push(Object.keys(sample).slice(0, 30).map(n => esc(n) + '×' + sample[n]).join('、'));
  $('jsonPreview').innerHTML = lines.join('<br>');
  $('btnJsonApply').classList.remove('hidden');
});
$('btnJsonApply').addEventListener('click', () => {
  if (!parsedJson) return;
  const parsed = parsedJson;
  if (parsed.periods) { data.periods = parsed.periods; data.courses = []; }
  data.courses = parsed.courses;
  if (parsed.semesterStart) data.settings.semesterStart = parsed.semesterStart;
  if (parsed.abbr && typeof parsed.abbr === 'object') {
    if (!data.settings.courseAbbr) data.settings.courseAbbr = {};
    for (const k of Object.keys(parsed.abbr)) if (parsed.abbr[k]) data.settings.courseAbbr[k] = String(parsed.abbr[k]);
  }
  renderPeriods(); renderGrid(); renderAbbrs();
  $('jsonModal').classList.add('hidden');
  markDirty();
  toast('✅ 课表已导入，记得点「保存并应用到桌面」');
});

init();