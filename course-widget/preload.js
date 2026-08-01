const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  getData: () => ipcRenderer.invoke('data:get'),
  setData: (obj) => ipcRenderer.invoke('data:set', obj),
  openSetup: () => ipcRenderer.invoke('ui:openSetup'),
  openPopup: (date) => ipcRenderer.invoke('ui:openPopup', date),
  showWidget: () => ipcRenderer.invoke('widget:show'),
  hideWidget: () => ipcRenderer.invoke('widget:hide'),
  resizeWidget: (w, h) => ipcRenderer.invoke('widget:resize', w, h),
  repositionWidget: () => ipcRenderer.invoke('widget:reposition'),
  setClickThrough: (on) => ipcRenderer.invoke('widget:clickThrough', on),
  setAutostart: (on) => ipcRenderer.invoke('settings:autostart', on),
  testNotify: () => ipcRenderer.invoke('notify:test'),
  exportData: () => ipcRenderer.invoke('data:export'),
  importData: () => ipcRenderer.invoke('data:import'),
  logError: (msg) => ipcRenderer.send('log:error', msg),
  quit: () => ipcRenderer.invoke('app:quit')
});