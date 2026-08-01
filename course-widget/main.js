const { app, BrowserWindow, Tray, Menu, Notification, ipcMain, dialog, screen, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const APP_ID = 'com.course-widget.desktop';
app.setAppUserModelId(APP_ID);
app.setPath('userData', path.join(app.getPath('appData'), 'course-widget'));

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }

const DATA_FILE = () => path.join(app.getPath('userData'), 'data.json');
const ICON = path.join(__dirname, 'assets', 'icon.png');
const HELPER = path.join(__dirname, 'helper', 'WallpaperEmbed.exe');

let data = defaultData();
let setupWin = null;
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
      semesterStart: null, showWeekStrip: true, clickThrough: false, autostart: false,
      widgetWidth: 900, widgetHeight: null, widgetCorner: 'bottomRight'
    },
    periods: [
      { index: 1, start: '08:00', end: '08:45' }, { index: 2, start: '09:00', end: '09:45' },
      { index: 3, start: '10:00', end: '10:45' }, { index: 4, start: '11:00', end: '11:45' },
      { index: 5, start: '14:00', end: '14:45' }, { index: 6, start: '15:00', end: '15:45' },
      { index: 7, start: '16:00', end: '16:45' }, { index: 8, start: '19:00', end: '20:40' }
    ],
    courses: [],  // { id, name, day(1-7), period, weeks:[]|null, location, reminders:{points:[],repeat:null} }
    todos: {},    // { 'YYYY-MM-DD': [ {id, text, deadline:'HH:MM'|null, done, reminders:{points:[],repeat:null}} ] }
    events: []    // { id, title, date, time:'HH:MM'|null, reminders:{points:[],repeat:null} }
  };
}

function migrate(raw) {
  const d = defaultData();
  const out = Object.assign(d, raw, { settings: Object.assign(d.settings, raw.settings || {}) });
  // 旧字段迁移：remindMinutes -> reminders.points
  out.courses = (out.courses || []).map(c => ({
    id: c.id, name: c.name, day: c.day, period: c.period, weeks: c.weeks || null, location: c.location || null,
    reminders: c.reminders || normReminders(c.remindMinutes)
  }));
  out.events = (out.events || []).map(ev => ({
    id: ev.id, title: ev.title, date: ev.date, time: ev.time || null,
    reminders: ev.reminders || normReminders(ev.remindMinutes)
  }));
  for (const k of Object.keys(out.todos || {})) {
    out.todos[k] = (out.todos[k] || []).map(t => ({
      id: t.id, text: t.text, deadline: t.deadline != null ? t.deadline : null, done: !!t.done, createdAt: t.createdAt || 0,
      reminders: t.reminders || normReminders(t.remindMinutes)
    }));
  }
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
  setupWin.on('closed', () => { setupWin = null; });
  return setupWin;
}

function anchorPos(w, h) {
  const { workArea } = screen.getPrimaryDisplay();
  const margin = 20;
  const corner = data.settings.widgetCorner || 'bottomRight';
  const x = workArea.x + workArea.width - w - margin;
  const y = corner === 'topRight' ? workArea.y + margin : workArea.y + workArea.height - h - margin;
  return { x, y };
}
function createWidgetWindow() {
  if (widgetWin) { widgetWin.show(); return widgetWin; }
  const { workArea } = screen.getPrimaryDisplay();
  const w = Math.min(Math.max(data.settings.widgetWidth || 900, 560), workArea.width - 40);
  const h = Math.min(data.settings.widgetHeight || 280, Math.floor(workArea.height * 0.75));
  const pos = anchorPos(w, h);
  widgetWin = new BrowserWindow({
    width: w, height: h, x: pos.x, y: pos.y,
    show: false, frame: false, transparent: true, resizable: false, skipTaskbar: true,
    alwaysOnTop: false, hasShadow: false, backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  widgetWin.loadFile(path.join(__dirname, 'renderer', 'widget.html'));
  widgetWin.once('ready-to-show', () => {
    embedIntoWallpaper(widgetWin);
    widgetWin.show();
    if (data.settings.clickThrough) widgetWin.setIgnoreMouseEvents(true, { forward: true });
  });
  widgetWin.on('close', (e) => { if (quitting) return; e.preventDefault(); widgetWin.hide(); });
  widgetWin.on('moved', () => {
    if (!widgetWin) return;
    const b = widgetWin.getBounds();
    const p = anchorPos(b.width, b.height);
    if (Math.abs(b.x - p.x) > 4 || Math.abs(b.y - p.y) > 4) widgetWin.setPosition(p.x, p.y);
  });
  return widgetWin;
}

function embedIntoWallpaper(win) {
  try {
    const buf = win.getNativeWindowHandle();
    const hwnd = buf.length >= 8 ? buf.readBigUInt64LE(0).toString() : buf.readUInt32LE(0).toString();
    if (!fs.existsSync(HELPER)) return;
    const child = spawn(HELPER, [hwnd], { windowsHide: true });
    child.on('error', (e) => console.warn('embed helper error', e.message));
    child.stdout.on('data', (d) => console.log('[embed]', String(d).trim()));
    child.stderr.on('data', (d) => console.warn('[embed]', String(d).trim()));
  } catch (e) { console.warn('embed failed', e); }
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
    { label: '显示桌面挂件', click: () => { if (widgetWin) { widgetWin.show(); embedIntoWallpaper(widgetWin); } else { createWidgetWindow(); } } },
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
      () => ev.title + ' (' + ev.time + ')');
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

// ---------------- IPC ----------------
ipcMain.handle('data:get', () => data);
ipcMain.handle('data:set', (e, next) => {
  if (next && typeof next === 'object') {
    data = migrate(Object.assign(defaultData(), next, { settings: Object.assign(defaultData().settings, next.settings || {}) }));
    if (data.settings.autostart !== app.getLoginItemSettings().openAtLogin) setAutostart(data.settings.autostart);
    saveData(); rebuildTrayMenu();
  }
  return true;
});
ipcMain.handle('ui:openSetup', () => { createSetupWindow(); return true; });
ipcMain.handle('ui:openPopup', (e, date) => { openPopup(String(date)); return true; });
ipcMain.handle('widget:show', () => { createWidgetWindow(); return true; });
ipcMain.handle('widget:hide', () => { if (widgetWin) widgetWin.hide(); return true; });
ipcMain.handle('widget:resize', (e, w, h) => {
  if (widgetWin) {
    const b = widgetWin.getBounds();
    const cw = (w != null) ? Math.max(560, Math.min(Math.round(w), 1600)) : b.width;
    const ch = Math.max(120, Math.min(Math.round(h) || b.height, Math.floor(screen.getPrimaryDisplay().workArea.height * 0.8)));
    const p = anchorPos(cw, ch);
    widgetWin.setBounds({ x: p.x, y: p.y, width: cw, height: ch });
    data.settings.widgetHeight = ch;
  }
  return true;
});
ipcMain.handle('widget:reposition', () => {
  if (widgetWin) { const b = widgetWin.getBounds(); const p = anchorPos(b.width, b.height); widgetWin.setPosition(p.x, p.y); }
  return true;
});
ipcMain.handle('widget:clickThrough', (e, on) => {
  if (widgetWin) widgetWin.setIgnoreMouseEvents(!!on, { forward: true });
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
      saveData(); rebuildTrayMenu();
      return { ok: true, path: r.filePaths[0] };
    }
    return { ok: false, error: '文件格式不正确' };
  } catch (err) { return { ok: false, error: String(err) }; }
});
ipcMain.on('log:error', (e, m) => console.error('renderer error:', m));
ipcMain.handle('app:quit', () => app.quit());

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
  setInterval(() => checkReminders(false), 30000);
});