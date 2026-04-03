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
    readText: (filePath) => ipcRenderer.invoke('file:read-text', filePath),
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
  background: {
    selectFolder: () => ipcRenderer.invoke('background:select-folder'),
    scanFolder: (folderPath) => ipcRenderer.invoke('background:scan-folder', folderPath),
    readImage: (filePath) => ipcRenderer.invoke('background:read-image', filePath),
  },
  plugins: {
    // 扫描插件目录
    scan: () => ipcRenderer.invoke('plugins:scan'),
    // 加载插件元数据
    loadManifest: (pluginId) => ipcRenderer.invoke('plugins:load-manifest', pluginId),
    // 加载插件组件代码（返回组件源码）
    loadComponent: (pluginId) => ipcRenderer.invoke('plugins:load-component', pluginId),
    // 选择插件文件夹
    selectFolder: () => ipcRenderer.invoke('plugins:select-folder'),
    // 安装插件
    install: (sourcePath) => ipcRenderer.invoke('plugins:install', sourcePath),
    // 卸载插件
    uninstall: (pluginId) => ipcRenderer.invoke('plugins:uninstall', pluginId),
  },
  comfyui: {
    // 检查 ComfyUI 服务是否可用
    checkAvailable: (serverUrl) => ipcRenderer.invoke('comfyui:check-available', serverUrl),
    // 获取对象信息（模型、VAE、CLIP等）
    getObjectInfo: (serverUrl, objectType) => ipcRenderer.invoke('comfyui:get-object-info', serverUrl, objectType),
    // 提交工作流
    submitWorkflow: (serverUrl, workflow) => ipcRenderer.invoke('comfyui:submit-workflow', serverUrl, workflow),
    // 获取执行历史
    getHistory: (serverUrl, promptId) => ipcRenderer.invoke('comfyui:get-history', serverUrl, promptId),
    // 获取生成的图片
    getImage: (serverUrl, filename, subfolder, type) =>
      ipcRenderer.invoke('comfyui:get-image', serverUrl, filename, subfolder, type),
  },
}

try {
  contextBridge.exposeInMainWorld('avgLLM', bridgeApi)
} catch {
  // Fallback for non-isolated contexts during troubleshooting.
  window.avgLLM = bridgeApi
}
