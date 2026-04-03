const { contextBridge, ipcRenderer } = require('electron')

const bridgeApi = {
  display: {
    getSettings: () => ipcRenderer.invoke('display:get-settings'),
    applySettings: (settings) => ipcRenderer.invoke('display:apply-settings', settings),
    getSupportedResolutions: () =>
      ipcRenderer.invoke('display:get-supported-resolutions'),
  },
  dialog: {
    selectPortrait: () => ipcRenderer.invoke('dialog:select-portrait'),
  },
  file: {
    readImage: (filePath) => ipcRenderer.invoke('file:read-image', filePath),
  },
  save: {
    getSaveDir: () => ipcRenderer.invoke('save:get-dir'),
    getSaveList: () => ipcRenderer.invoke('save:get-list'),
    saveGame: (saveData, slotId) => ipcRenderer.invoke('save:game', saveData, slotId),
    loadGame: (slotId) => ipcRenderer.invoke('save:load', slotId),
    deleteSave: (slotId) => ipcRenderer.invoke('save:delete', slotId),
  },
  backup: {
    getBackupList: () => ipcRenderer.invoke('backup:get-list'),
    createBackup: (backupData) => ipcRenderer.invoke('backup:create', backupData),
    loadBackup: (backupId) => ipcRenderer.invoke('backup:load', backupId),
    deleteBackup: (backupId) => ipcRenderer.invoke('backup:delete', backupId),
  },
  bgm: {
    selectFolder: () => ipcRenderer.invoke('bgm:select-folder'),
    loadFolder: (folderPath) => ipcRenderer.invoke('bgm:load-folder', folderPath),
    readAudio: (filePath) => ipcRenderer.invoke('bgm:read-audio', filePath),
  },
}

try {
  contextBridge.exposeInMainWorld('avgLLM', bridgeApi)
} catch {
  // Fallback for non-isolated contexts during troubleshooting.
  window.avgLLM = bridgeApi
}
