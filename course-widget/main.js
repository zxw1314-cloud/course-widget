const { app, BrowserWindow, Tray, Menu, Notification, ipcMain, dialog, screen, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const os = require('os');

const APP_ID = 'com.course-widget.desktop';
app.setAppUserModelId(APP_ID);
app.setPath('userData', path.join(app.getPath('appData'), 'course-widget'));

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }

const DATA_FILE = () => path.join(app.getPath('userData'), 'data.json');
const ICON = path.join(__dirname, 'assets', 'icon.png');

let data = defaultData();
let setupWin = null;
let setupDirty = false; // 设置窗口是否有未保存修改（渲染进程上报），关闭时提醒保存
let widgetWin = null;
let popupWin = null;
let tray = null;
let quitting = false;
const notified = new Set();

function pad(n) { return String(n).padStart(2, '0'); }
function dateKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function weekdayIndex(d) { const w = d.getDay(); return w === 0 ? 7 : w; }
function toMinutes(t) { if (!t) return null; const p = t.split(':').map(Number); return p[0] * 60 + p[1]; }
function parseDateKey(key) { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); }
function mondayOf(d) { const x = new Date(d); const w = x.getDay() === 0 ? 7 : x.getDay(); x.setDate(x.getDate() - (w - 1)); x.setHours(0,0,0,0); return x; }

function defaultData() {
  return {
    settings: {
      firstRun: true, widgetApplied: false, remindMinutes: 10,
      semesterStart: null, showWeekStrip: true, clickThrough: false, autostart: false, widgetOpacity: 0.66,
      courseAbbr: {},  // { 课程全名: 简写 } 挂件显示用
      mergeConsecutive: true, // 挂件把同一课程连续节次合并成一个大框（显示起止时间）
      mobileBridgeEnabled: false, mobileBridgeMode: 'both', mobileToken: null, // 手机远程桥（局域网/樱花frp）
      widgetWidth: 900, widgetHeight: null, widgetX: null, widgetY: null, widgetCorner: 'bottomRight',
      bellEnabled: false, bellVolume: 0.8, bellPreset: 'school-bell', showCountdown: true
    },
    periods: [
      { index: 1, start: '08:00', end: '08:45' }, { index: 2, start: '09:00', end: '09:45' },
      { index: 3, start: '10:00', end: '10:45' }, { index: 4, start: '11:00', end: '11:45' },
      { index: 5, start: '14:00', end: '14:45' }, { index: 6, start: '15:00', end: '15:45' },
      { index: 7, start: '16:00', end: '16:45' }, { index: 8, start: '19:00', end: '20:40' }
    ],
    courses: [],  // { id, name, day(1-7), period, weeks:[]|null, location, reminders:{points:[],repeat:null} }
    todos: {},    // { 'YYYY-MM-DD': [ {id, text, deadline:'HH:MM'|null, done, reminders:{points:[],repeat:null}} ] }
    events: [],   // { id, title, date, time:'HH:MM'|null, location:'string'|null, reminders:{points:[],repeat:null} }
    countdowns: [] // { id, title, date:'YYYY-MM-DD', color:'#xxxxxx'|null }
  };
}

function migrate(raw) {
  const d = defaultData();
  const out = Object.assign(d, raw, { settings: Object.assign(d.settings, raw.settings || {}) });
  // 旧字段迁移：remindMinutes -> reminders.points
  out.periods = (out.periods || []).map(p => ({ index: p.index, label: p.label || ('第' + p.index + '节'), start: p.start, end: p.end }));
  out.courses = (out.courses || []).map(c => ({
    id: c.id, name: c.name, day: c.day, period: c.period, weeks: c.weeks || null, location: c.location || null,
    reminders: c.reminders || normReminders(c.remindMinutes),
    teacher: c.teacher || null, color: c.color || null
  }));
  out.events = (out.events || []).map(ev => ({
    id: ev.id, title: ev.title, date: ev.date, time: ev.time || null, location: ev.location || null,
    reminders: ev.reminders || normReminders(ev.remindMinutes)
  }));
  for (const k of Object.keys(out.todos || {})) {
    out.todos[k] = (out.todos[k] || []).map(t => ({
      id: t.id, text: t.text, deadline: t.deadline != null ? t.deadline : null, done: !!t.done, createdAt: t.createdAt || 0,
      reminders: t.reminders || normReminders(t.remindMinutes)
    }));
  }
  out.countdowns = (out.countdowns || [])
    .map(cd => ({
      id: cd.id, title: cd.title || '倒数日', date: cd.date || '', time: cd.time || null, location: cd.location || null, color: cd.color || null
    }))
    .filter(cd => !!cd.date);
  return out;
}
function normReminders(mins) {
  const points = [];
  if (mins != null && mins >= 0) points.push(mins);
  return { points, repeat: null };
}

function loadData() {
  try {
    const raw = JSON.parse(fs.readFileSync(DATA_FILE(), 'utf8').replace(/^\\uFEFF/, ''));
    return migrate(raw);
  } catch (e) { return defaultData(); }
}
function saveData() {
  try {
    const f = DATA_FILE(); fs.mkdirSync(path.dirname(f), { recursive: true });
    const tmp = f + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8'); fs.renameSync(tmp, f);
    return true;
  } catch (e) { console.error('save failed', e); return false; }
}

// ---------------- 窗口 ----------------
function createSetupWindow() {
  if (setupWin) { setupWin.show(); setupWin.focus(); return setupWin; }
  setupWin = new BrowserWindow({
    width: 1080, height: 760, minWidth: 900, minHeight: 620,
    title: '桌面课表备忘录 - 设置', icon: ICON, backgroundColor: '#f5f6fa',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  setupWin.loadFile(path.join(__dirname, 'renderer', 'setup.html'));
  setupWin.on('close', (e) => {
    // 有未保存修改时拦截关闭，通知渲染进程弹确认框（保存并应用/仅保存/放弃）
        if (setupDirty && !quitting) {
      e.preventDefault();
      try { setupWin.webContents.send('setup:askClose'); } catch (err) {}
    }
  });
  setupWin.on('closed', () => { setupWin = null; });
  return setupWin;
}

function anchorPos(w, h, corner) {
  const { workArea } = screen.getPrimaryDisplay();
  const margin = 20;
  const c = corner || data.settings.widgetCorner || 'bottomRight';
  const x = workArea.x + workArea.width - w - margin;
  const y = c === 'topRight' ? workArea.y + margin : workArea.y + workArea.height - h - margin;
  return { x, y };
}
function createWidgetWindow() {
  if (widgetWin) { widgetWin.show(); return widgetWin; }
  const { workArea } = screen.getPrimaryDisplay();
  const w = Math.min(Math.max(data.settings.widgetWidth || 900, 560), workArea.width - 40);
  const h = Math.min(data.settings.widgetHeight || 280, Math.floor(workArea.height * 0.75));
  let pos = { x: data.settings.widgetX, y: data.settings.widgetY };
  if (pos.x == null || pos.y == null) pos = anchorPos(w, h);
  pos.x = Math.min(Math.max(pos.x, workArea.x), workArea.x + workArea.width - w);
  pos.y = Math.min(Math.max(pos.y, workArea.y), workArea.y + workArea.height - h);
  widgetWin = new BrowserWindow({
    width: w, height: h, x: pos.x, y: pos.y,
    show: false, frame: false, transparent: true, resizable: false, focusable: false, skipTaskbar: true, minWidth: 100, minHeight: 100,
    alwaysOnTop: false, hasShadow: false, backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  widgetWin.loadFile(path.join(__dirname, 'renderer', 'widget.html'));
  widgetWin.once('ready-to-show', () => {
    widgetWin.show();
    // 启动时按持久化值精确定位/定尺寸，抵消非 100% 缩放下 setBounds 的 DIP 舍入偏差
    const s = data.settings;
    if (s.widgetX != null && s.widgetY != null && s.widgetWidth && s.widgetHeight) {
      try { readWidgetBounds(); applyWidgetBounds({ x: s.widgetX, y: s.widgetY, width: s.widgetWidth, height: s.widgetHeight }, true); } catch (err) {}
    }
  });

  widgetWin.on('close', (e) => { if (quitting) return; e.preventDefault(); widgetWin.hide(); });
  return widgetWin;
}


function openPopup(date) {
  if (popupWin && popupWin.date === date) { popupWin.win.show(); popupWin.win.focus(); return; }
  if (popupWin) { popupWin.win.destroy(); popupWin = null; }
  const pt = screen.getCursorScreenPoint();
  const win = new BrowserWindow({
    width: 400, height: 560,
    x: Math.max(0, pt.x - 170), y: Math.max(0, pt.y - 40),
    show: false, frame: false, transparent: true, resizable: true,
    alwaysOnTop: true, skipTaskbar: true, hasShadow: false, backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  win.loadFile(path.join(__dirname, 'renderer', 'popup.html'), { query: { date } });
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => { popupWin = null; });
  popupWin = { win, date };
}

function createTray() {
  const icon = nativeImage.createFromPath(ICON);
  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  tray.setToolTip('桌面课表备忘录');
  rebuildTrayMenu();
  tray.on('click', () => createSetupWindow());
}
function rebuildTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开设置', click: () => createSetupWindow() },
    { label: '显示桌面挂件', click: () => { if (widgetWin) widgetWin.show(); else createWidgetWindow(); } },
    { label: '隐藏桌面挂件', click: () => { if (widgetWin) widgetWin.hide(); } },
    { label: '立即检查提醒', click: () => checkReminders(true) },
    { type: 'separator' },
    { label: '开机自启', type: 'checkbox', checked: !!data.settings.autostart, click: (i) => setAutostart(i.checked) },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() }
  ]));
}
function setAutostart(on) {
  data.settings.autostart = !!on;
  app.setLoginItemSettings({ openAtLogin: data.settings.autostart });
  saveData(); rebuildTrayMenu();
}

// ---------------- 提醒 ----------------
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
function notify(title, body) {
  if (!Notification.isSupported()) return;
  try { new Notification({ title, body, icon: ICON }).show(); } catch (e) {}
  // 弹通知时同时播放提示音（开启"提醒声音"时生效），防止错过系统通知
  if (data.settings.bellEnabled) sendBell('remind');
}
function fireReminders(nowMin, todayKey, prefix, startMin, reminders, title, bodyFn) {
  if (startMin == null) return;
  const r = reminders || { points: [], repeat: null };
  const points = Array.isArray(r.points) ? r.points : [];
  for (const off of points) {
    if (off == null || off < 0) continue;
    const diff = startMin - nowMin;
    if (diff >= 0 && diff <= off) {
      const k = prefix + ':p:' + off + ':' + todayKey;
      if (!notified.has(k)) { notified.add(k); notify(diff === 0 ? title.now : title.before, bodyFn(diff, off)); }
    }
  }
  const rep = r.repeat;
  if (rep && rep.start >= 0 && rep.every > 0) {
    const first = startMin - rep.start;
    if (nowMin >= first && nowMin <= startMin) {
      const slot = Math.floor((nowMin - first) / rep.every);
      const at = first + slot * rep.every;
      const k = prefix + ':r:' + slot + ':' + todayKey;
      if (nowMin >= at && !notified.has(k)) {
        notified.add(k);
        notify('重复提醒', bodyFn(0, 0) + '（还有 ' + Math.max(0, startMin - nowMin) + ' 分钟）');
      }
    }
  }
}
function checkReminders(force) {
  const now = new Date();
  const todayKey = dateKey(now);
  const wk = weekdayIndex(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const week = currentWeek();

  for (const c of data.courses) {
    if (c.day !== wk || !weekMatches(c, week)) continue;
    const p = data.periods.find(x => x.index === c.period);
    if (!p) continue;
    const startMin = toMinutes(p.start);
    fireReminders(nowMin, todayKey, 'c:' + c.id, startMin, c.reminders,
      { now: '上课了', before: '即将上课' },
      () => (c.name || '课程') + (c.location ? ' @ ' + c.location : '') + ' (' + p.start + '~' + p.end + ')');
  }
  for (const ev of data.events) {
    if (ev.date !== todayKey || !ev.time) continue;
    const startMin = toMinutes(ev.time);
    fireReminders(nowMin, todayKey, 'e:' + ev.id, startMin, ev.reminders,
      { now: '活动开始', before: '活动提醒' },
      () => ev.title + (ev.location ? ' @ ' + ev.location : '') + ' (' + ev.time + ')');
  }
  for (const cd of (data.countdowns || [])) {
    if (cd.date !== todayKey || !cd.time) continue;
    const startMin = toMinutes(cd.time);
    const mins = data.settings.remindMinutes != null ? data.settings.remindMinutes : 10;
    fireReminders(nowMin, todayKey, 'cd:' + cd.id, startMin, { points: [mins], repeat: null },
      { now: '考试开始', before: '考试提醒' },
      () => (cd.title || '考试') + (cd.location ? ' @ ' + cd.location : '') + ' (' + cd.time + ')');
  }
  for (const t of (data.todos[todayKey] || [])) {
    if (t.done || !t.deadline) continue;
    const startMin = toMinutes(t.deadline);
    fireReminders(nowMin, todayKey, 't:' + t.id, startMin, t.reminders,
      { now: '截止时间到', before: '待办提醒' },
      () => t.text + '（截止 ' + t.deadline + '）');
  }
  // 顺手清理旧 key（保留最近两天）
  if (notified.size > 4000) {
    for (const k of notified) { if (!k.includes(todayKey)) notified.delete(k); }
  }
}

// ---------------- 上下课铃声 ----------------
function sendBell(kind) {
  if (!data.settings.bellEnabled) return;
  const targets = [widgetWin, setupWin].filter(w => w && !w.isDestroyed());
  for (const w of targets) {
    try { w.webContents.send('bell:ring', kind); } catch (e) {}
  }
}
// 数据变更后推送给挂件渲染进程，让挂件即时刷新（不再等 30 秒轮询）
function broadcastDataChanged() {
  if (widgetWin && !widgetWin.isDestroyed()) {
    try { widgetWin.webContents.send('data:changed'); } catch (e) {}
  }
}

// ---------------- 手机远程桥（HTTP 服务：手机网页 + App API） ----------------
const MOBILE_PORT = 8723;
let mobileServer = null;
let mobilePageHtml = null;
function genMobileToken() { return 'cw-' + crypto.randomBytes(18).toString('base64url'); }
function loadMobilePage() {
  try { mobilePageHtml = fs.readFileSync(path.join(__dirname, 'renderer', 'mobile.html'), 'utf8'); } catch (e) { mobilePageHtml = '<h1>mobile.html 缺失</h1>'; }
}
// mobile bridge CORS: allow bundled APK page (file:// origin) to call this server cross-origin
const MOBILE_CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400'
};
function sendJson(res, code, obj) {
  const s = JSON.stringify(obj);
  res.writeHead(code, Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, MOBILE_CORS));
  res.end(s);
}
function mobileAuthOk(req) {
  const t = data.settings.mobileToken || '';
  if (!t) return false;
  const h = req.headers['authorization'] || '';
  return h === 'Bearer ' + t;
}
function localIPs() {
  const out = [];
  try {
    for (const list of Object.values(os.networkInterfaces())) {
      for (const ni of list || []) if (ni.family === 'IPv4' && !ni.internal) out.push(ni.address);
    }
  } catch (e) {}
  return out;
}
function todayPayload() {
  const now = new Date();
  const tk = dateKey(now);
  const wk = weekdayIndex(now);
  const week = currentWeek();
  const abbrMap = data.settings.courseAbbr || {};
  const courses = [];
  for (const c of data.courses) {
    if (c.day !== wk || !weekMatches(c, week)) continue;
    const p = data.periods.find(x => x.index === c.period);
    if (!p) continue;
    courses.push({ name: c.name, abbr: abbrMap[c.name] || c.name, start: p.start, end: p.end, location: c.location || null, period: c.period });
  }
  courses.sort((a, b) => a.period - b.period);
  const todos = (data.todos[tk] || []).map(t => ({ text: t.text, deadline: t.deadline, done: !!t.done }));
  const events = data.events.filter(e => e.date === tk).map(e => ({ title: e.title, time: e.time || null, location: e.location || null }));
  const todayMid = new Date(now); todayMid.setHours(0, 0, 0, 0);
  const countdowns = (data.countdowns || [])
    .filter(c => c.date && c.date >= tk)
    .map(c => ({ title: c.title, time: c.time || null, location: c.location || null, date: c.date, days: Math.round((parseDateKey(c.date) - todayMid) / 86400000) }))
    .sort((a, b) => a.days - b.days)
    .slice(0, 3);
  return { date: tk, weekday: '周' + ['日','一','二','三','四','五','六'][now.getDay()], courses, todos, events, countdowns };
}
function schedulePayload() {
  // full snapshot for the phone's local copy (today / this-week / add-todo / settings-sync)
  const now = new Date();
  const tk = dateKey(now);
  const week = currentWeek();
  const abbrMap = data.settings.courseAbbr || {};
  const courses = [];
  for (const c of data.courses) {
    const p = data.periods.find(x => x.index === c.period);
    if (!p) continue;
    courses.push({ id: c.id, name: c.name, abbr: abbrMap[c.name] || c.name, day: c.day, period: c.period, weeks: c.weeks || null, start: p.start, end: p.end, location: c.location || null, teacher: c.teacher || null });
  }
  courses.sort((a, b) => a.day - b.day || a.period - b.period);
  const todos = {};
  for (const [date, list] of Object.entries(data.todos || {})) {
    todos[date] = (list || []).map(t => ({ id: t.id, text: t.text, deadline: t.deadline || null, done: !!t.done }));
  }
  return {
    date: tk,
    weekday: '\u5468' + ['\u65e5','\u4e00','\u4e8c','\u4e09','\u56db','\u4e94','\u516d'][now.getDay()],
    weekNumber: week,
    periods: (data.periods || []).map(p => ({ index: p.index, start: p.start, end: p.end })),
    courseAbbr: abbrMap,
    courses,
    events: (data.events || []).map(e => ({ id: e.id, title: e.title, date: e.date, time: e.time || null, location: e.location || null })),
    countdowns: (data.countdowns || []).map(c => ({ id: c.id, title: c.title, date: c.date, time: c.time || null, location: c.location || null, color: c.color || null })),
    todos
  };
}
function handleMobileRequest(req, res) {
  if (req.method === 'OPTIONS') { res.writeHead(204, MOBILE_CORS); res.end(); return; }
  let pathname = '';
  try { pathname = new URL(req.url, 'http://x').pathname; } catch (e) { pathname = '/'; }
  // 网页界面
  if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
    const mode = data.settings.mobileBridgeMode || 'both';
    if (mode === 'app') { sendJson(res, 403, { error: '当前设置为仅 App 模式，请在电脑设置中开放网页模式' }); return; }
    if (mobilePageHtml == null) loadMobilePage();
    const page = mobilePageHtml.replace('__CW_MODE__', mode);
    res.writeHead(200, Object.assign({ 'Content-Type': 'text/html; charset=utf-8' }, MOBILE_CORS));
    res.end(page);
    return;
  }
  // 健康检查（无需 token）
  if (req.method === 'GET' && pathname === '/api/health') { sendJson(res, 200, { ok: true, app: 'course-widget', time: new Date().toISOString() }); return; }
  if (!mobileAuthOk(req)) { sendJson(res, 401, { error: 'unauthorized' }); return; }
  if (req.method === 'GET' && pathname === '/api/today') { sendJson(res, 200, todayPayload()); return; }
  if (req.method === 'GET' && pathname === '/api/schedule') { sendJson(res, 200, schedulePayload()); return; }
  if (req.method === 'POST' && pathname === '/api/todo') {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 16384) req.destroy(); });
    req.on('end', () => {
      let o = null;
      try { o = JSON.parse(body); } catch (e) { sendJson(res, 400, { error: 'bad json' }); return; }
      const text = String(o.text || '').trim();
      if (!text) { sendJson(res, 400, { error: 'text required' }); return; }
      let date = String(o.date || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) date = dateKey(new Date());
      const deadline = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(o.deadline || '')) ? String(o.deadline) : null;
      const points = Array.isArray(o.points) ? o.points.map(Number).filter(n => Number.isFinite(n) && n >= 0) : null;
      if (!data.todos[date]) data.todos[date] = [];
      const todo = { id: Math.random().toString(36).slice(2, 10), text, deadline, done: false, createdAt: Date.now(), reminders: { points: (points && points.length) ? points : [10], repeat: null } };
      data.todos[date].push(todo);
      saveData(); broadcastDataChanged();
      sendJson(res, 200, { ok: true, todo });
    });
    return;
  }
  if (req.method === 'POST' && pathname === '/api/event') {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 16384) req.destroy(); });
    req.on('end', () => {
      let o = null;
      try { o = JSON.parse(body); } catch (e) { sendJson(res, 400, { error: 'bad json' }); return; }
      const title = String(o.title || '').trim();
      if (!title) { sendJson(res, 400, { error: 'title required' }); return; }
      let date = String(o.date || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) date = dateKey(new Date());
      const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(o.time || '')) ? String(o.time) : null;
      const location = String(o.location || '').trim() || null;
      const points = Array.isArray(o.points) ? o.points.map(Number).filter(n => Number.isFinite(n) && n >= 0) : null;
      const ev = { id: Math.random().toString(36).slice(2, 10), title, date, time, location, createdAt: Date.now(), reminders: { points: (points && points.length) ? points : [10], repeat: null } };
      data.events.push(ev);
      saveData(); broadcastDataChanged();
      sendJson(res, 200, { ok: true, event: ev });
    });
    return;
  }
  sendJson(res, 404, { error: 'not found' });
}
function startMobileServer() {
  if (mobileServer) return;
  try {
    mobileServer = http.createServer(handleMobileRequest);
    mobileServer.on('error', (e) => { console.error('mobile server error', e.message); mobileServer = null; });
    mobileServer.listen(MOBILE_PORT, '0.0.0.0');
  } catch (e) { console.error('mobile server start failed', e.message); }
}
function stopMobileServer() { if (mobileServer) { try { mobileServer.close(); } catch (e) {} mobileServer = null; } }
function syncMobileServer() {
  if (data.settings.mobileBridgeEnabled) {
    if (!data.settings.mobileToken) { data.settings.mobileToken = genMobileToken(); saveData(); }
    startMobileServer();
  } else { stopMobileServer(); }
}

// ---------------- IPC ----------------
ipcMain.handle('data:get', () => data);
ipcMain.handle('data:set', (e, next) => {
  if (next && typeof next === 'object') {
    data = migrate(Object.assign(defaultData(), next, { settings: Object.assign(defaultData().settings, next.settings || {}) }));
    if (data.settings.autostart !== app.getLoginItemSettings().openAtLogin) setAutostart(data.settings.autostart);
    saveData(); rebuildTrayMenu(); broadcastDataChanged(); syncMobileServer();
  }
  return true;
});
ipcMain.handle('mobile:info', () => {
  const t = data.settings.mobileToken || '';
  if (data.settings.mobileBridgeEnabled && !t) { data.settings.mobileToken = genMobileToken(); saveData(); }
  return {
    enabled: !!data.settings.mobileBridgeEnabled,
    mode: data.settings.mobileBridgeMode || 'both',
    token: data.settings.mobileToken || '',
    port: MOBILE_PORT,
    localIPs: localIPs()
  };
});
ipcMain.handle('ui:openSetup', () => { createSetupWindow(); return true; });
ipcMain.handle('ui:openPopup', (e, date) => { openPopup(String(date)); return true; });
ipcMain.handle('widget:show', () => { createWidgetWindow(); return true; });
ipcMain.handle('widget:hide', () => { if (widgetWin) widgetWin.hide(); return true; });
// 点击穿透：主进程每 50ms 轮询光标，命中交互区矩形才取消穿透（不依赖渲染进程的鼠标事件转发，转发在本机不可用）
let interactiveAreas = [];
let forceInteractive = false;
let lastIgnored = null;
function tickClickThrough() {
  if (!widgetWin || widgetWin.isDestroyed()) return;
  let interactive = forceInteractive;
  if (!interactive) {
    const b = widgetWin.getBounds();
    const pt = screen.getCursorScreenPoint();
    const rx = pt.x - b.x, ry = pt.y - b.y;
    if (rx >= 0 && ry >= 0 && rx <= b.width && ry <= b.height) {
      for (const a of interactiveAreas) {
        if (rx >= a.x && rx <= a.x + a.w && ry >= a.y && ry <= a.y + a.h) { interactive = true; break; }
      }
    }
  }
  const ignored = !interactive;
  if (ignored !== lastIgnored) {
    lastIgnored = ignored;
    widgetWin.setIgnoreMouseEvents(ignored);
  }
}
ipcMain.handle('widget:setInteractiveAreas', (e, areas) => {
  interactiveAreas = Array.isArray(areas) ? areas : [];
  return true;
});
ipcMain.handle('widget:setDragActive', (e, on) => { forceInteractive = !!on; return true; });
// ---------------- 挂件边界管理 ----------------
// 实测：Windows 非 100% 缩放（如 125%）下，setBounds 传入的 DIP 与 getBounds 读回值存在 ±1~2 的确定性偏差；
// 若把"读回的膨胀值"当新目标写回，会形成自我放大循环（挂件每次拖拽变宽、最终飞走）。
// 对策：始终以 getBounds 读回的真实值为基准；目标与现状相同则跳过 setBounds；
// 需要精确落位时做"两步校正"（先写目标→读回差值→反向补偿一次），使窗口实际边界与目标完全一致。
let widgetBoundsReal = null;
function readWidgetBounds() {
  if (!widgetWin) return null;
  const b = widgetWin.getBounds();
  widgetBoundsReal = { x: b.x, y: b.y, width: b.width, height: b.height };
  return widgetBoundsReal;
}
function persistWidgetBounds(b) {
  data.settings.widgetX = b.x; data.settings.widgetY = b.y;
  data.settings.widgetWidth = b.width; data.settings.widgetHeight = b.height;
  saveData();
}
function clampWidgetBounds(o) {
  const b = widgetBoundsReal || readWidgetBounds();
  const disp = screen.getDisplayMatching({ x: b.x, y: b.y, width: b.width, height: b.height });
  const { workArea } = disp;
  const maxW = Math.max(560, Math.round(workArea.width - 40));
  const maxH = Math.max(120, Math.floor(workArea.height * 0.8));
  const s = (o.start && typeof o.start.w === 'number') ? o.start : { x: b.x, y: b.y, w: b.width, h: b.height };
  const edge = o.edge || '';
  let w = (o.width != null) ? Math.round(o.width) : b.width;
  let h = (o.height != null) ? Math.round(o.height) : b.height;
  let x = (o.x != null) ? Math.round(o.x) : b.x;
  let y = (o.y != null) ? Math.round(o.y) : b.y;
  w = Math.max(560, Math.min(w, maxW));
  h = Math.max(120, Math.min(h, maxH));
  // 缩放：锚定被拖边的对边；宽高被钳制时对边保持不动，窗口不跳变、不飞出屏幕
  if (edge.includes('l')) { w = Math.min(w, s.x + s.w - workArea.x); x = s.x + s.w - w; }
  else if (edge.includes('r')) { w = Math.min(w, workArea.x + workArea.width - s.x); x = s.x; }
  if (edge.includes('t')) { h = Math.min(h, s.y + s.h - workArea.y); y = s.y + s.h - h; }
  else if (edge.includes('b')) { h = Math.min(h, workArea.y + workArea.height - s.y); y = s.y; }
  if (!edge) {
    x = Math.min(Math.max(x, workArea.x), workArea.x + workArea.width - w);
    y = Math.min(Math.max(y, workArea.y), workArea.y + workArea.height - h);
  }
  return { x, y, width: w, height: h };
}
function applyWidgetBounds(target, correct) {
  widgetWin.setBounds(target);
  let applied = readWidgetBounds();
  if (correct) {
    const dx = target.x - applied.x, dy = target.y - applied.y;
    const dw = target.width - applied.width, dh = target.height - applied.height;
    if (dx || dy || dw || dh) {
      const adj = clampWidgetBounds({ x: target.x + dx, y: target.y + dy, width: target.width + dw, height: target.height + dh });
      widgetWin.setBounds(adj);
      applied = readWidgetBounds();
    }
  }
  return applied;
}
ipcMain.handle('widget:getBounds', () => readWidgetBounds());
ipcMain.handle('widget:setBounds', (e, opts) => {
  if (!widgetWin) return { applied: null };
  const o = opts || {};
  const target = clampWidgetBounds(o);
  const cur = widgetBoundsReal || readWidgetBounds();
  const same = target.x === cur.x && target.y === cur.y && target.width === cur.width && target.height === cur.height;
  let applied;
  if (same && !o.correct) {
    applied = cur;
  } else {
    applied = applyWidgetBounds(target, !!o.correct);
  }
  if (o.persist) persistWidgetBounds(applied);
  return { applied, target, changed: !same };
});
ipcMain.handle('widget:snapCorner', (e, corner) => {
  if (!widgetWin) return true;
  const b = readWidgetBounds();
  const p = anchorPos(b.width, b.height, corner);
  const applied = applyWidgetBounds({ x: p.x, y: p.y, width: b.width, height: b.height }, true);
  persistWidgetBounds(applied);
  return true;
});
ipcMain.handle('settings:autostart', (e, on) => { setAutostart(!!on); return data.settings.autostart; });
ipcMain.handle('notify:test', () => { notify('提醒测试', '课程提醒功能正常 ✅'); return true; });
ipcMain.handle('data:export', async () => {
  const r = await dialog.showSaveDialog({ title: '导出数据备份', defaultPath: 'course-widget-backup-' + dateKey(new Date()) + '.json', filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (r.canceled || !r.filePath) return { ok: false };
  try { fs.writeFileSync(r.filePath, JSON.stringify(data, null, 2), 'utf8'); return { ok: true, path: r.filePath }; }
  catch (err) { return { ok: false, error: String(err) }; }
});
ipcMain.handle('data:import', async () => {
  const r = await dialog.showOpenDialog({ title: '导入数据备份', filters: [{ name: 'JSON', extensions: ['json'] }], properties: ['openFile'] });
  if (r.canceled || !r.filePaths.length) return { ok: false };
  try {
    const parsed = JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8'));
    if (parsed && typeof parsed === 'object') {
      data = migrate(Object.assign(defaultData(), parsed, { settings: Object.assign(defaultData().settings, parsed.settings || {}) }));
      saveData(); rebuildTrayMenu(); broadcastDataChanged(); syncMobileServer();
      return { ok: true, path: r.filePaths[0] };
    }
    return { ok: false, error: '文件格式不正确' };
  } catch (err) { return { ok: false, error: String(err) }; }
});
ipcMain.on('log:error', (e, m) => console.error('renderer error:', m));
ipcMain.handle('app:quit', () => app.quit());

ipcMain.on('setup:setDirty', (e, on) => { setupDirty = !!on; });
ipcMain.on('setup:forceClose', () => {
  setupDirty = false;
  if (setupWin && !setupWin.isDestroyed()) setupWin.close();
});
ipcMain.handle('settings:setOpacity', (e, v) => {
  const a = Math.max(0.2, Math.min(1, Number(v)));
  data.settings.widgetOpacity = isNaN(a) ? 0.66 : a;
  saveData(); broadcastDataChanged();
  return data.settings.widgetOpacity;
});
app.on('second-instance', () => createSetupWindow());
app.on('window-all-closed', () => {});
app.on('before-quit', () => { quitting = true; if (tray) { tray.destroy(); tray = null; } });

app.whenReady().then(() => {
  if (!gotLock) return;
  data = loadData();
  if (data.settings.autostart) app.setLoginItemSettings({ openAtLogin: true });
  createTray();
  if (data.settings.firstRun || !data.settings.widgetApplied) {
    createSetupWindow();
  } else {
    createWidgetWindow();
  }
  setInterval(tickClickThrough, 50);
  setInterval(() => checkReminders(false), 30000);
  syncMobileServer();
});
