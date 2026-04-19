const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('mascotIPC', {
  onState: (callback) => {
    ipcRenderer.on('mascot-state', (_event, state) => callback(state))
  },
  onCommand: (callback) => {
    ipcRenderer.on('mascot-command', (_event, data) => callback(data))
  },
  setIgnoreMouse: (ignore) => {
    ipcRenderer.invoke('mascot:set-ignore-mouse', ignore)
  },
})

contextBridge.exposeInMainWorld('electronAPI', { isElectron: true })
