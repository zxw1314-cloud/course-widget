const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  getData: () => ipcRenderer.invoke('data:get'),
  setData: (obj) => ipcRenderer.invoke('data:set', obj),
  openSetup: () => ipcRenderer.invoke('ui:openSetup'),
  openPopup: (date) => ipcRenderer.invoke('ui:openPopup', date),
  showWidget: () => ipcRenderer.invoke('widget:show'),
  hideWidget: () => ipcRenderer.invoke('widget:hide'),
  setWidgetBounds: (opts) => ipcRenderer.invoke('widget:setBounds', opts),
  snapCorner: (corner) => ipcRenderer.invoke('widget:snapCorner', corner),
  setClickThrough: (on) => ipcRenderer.invoke('widget:clickThrough', on),
  setAutostart: (on) => ipcRenderer.invoke('settings:autostart', on),
  testNotify: () => ipcRenderer.invoke('notify:test'),
  exportData: () => ipcRenderer.invoke('data:export'),
  importData: () => ipcRenderer.invoke('data:import'),
  logError: (msg) => ipcRenderer.send('log:error', msg),
  onBellRing: (cb) => { const h = (_e, kind) => cb(kind); ipcRenderer.on('bell:ring', h); return () => ipcRenderer.removeListener('bell:ring', h); },
  quit: () => ipcRenderer.invoke('app:quit')
});