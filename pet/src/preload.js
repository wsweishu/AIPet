// Narrow bridge between the sandboxed pages and the main process.
const { contextBridge, ipcRenderer } = require('electron');

const on = (channel, fn) => {
  const handler = (_e, payload) => fn(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld('pet', {
  setInteractive: on => ipcRenderer.send('pet:interactive', Boolean(on)),
  drag: (dx, dy) => ipcRenderer.send('pet:drag', { dx, dy }),
  openMenu: () => ipcRenderer.send('pet:menu'),
  chat: (id, message, history) => ipcRenderer.invoke('chat:send', { id, message, history }),
  cancel: id => ipcRenderer.send('chat:cancel', id),
  onTool: fn => on('chat:tool', fn),
  onChunk: fn => on('chat:chunk', fn),
  onDone: fn => on('chat:done', fn),
  onError: fn => on('chat:error', fn),
  onStatus: fn => on('pet:status', fn),
  onClear: fn => on('pet:clear', fn),
  onSelftest: fn => on('pet:selftest', fn),
  selftestDone: result => ipcRenderer.send('selftest:done', result),
});

contextBridge.exposeInMainWorld('settings', {
  get: () => ipcRenderer.invoke('settings:get'),
  save: patch => ipcRenderer.invoke('settings:save', patch),
  importKeyFile: () => ipcRenderer.invoke('settings:importKeyFile'),
  login: () => ipcRenderer.invoke('settings:login'),
  logout: () => ipcRenderer.invoke('settings:logout'),
});
