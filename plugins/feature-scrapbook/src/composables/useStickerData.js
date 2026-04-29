/**
 * useStickerData.js - 贴纸/模板数据管理
 */
import { kvStorage } from '../../../../src/storage/index.js'

const STORAGE_KEY = 'scrapbook_templates'

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9)
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export async function loadTemplates() {
  const data = await kvStorage.get(STORAGE_KEY)
  if (!data) return []
  return data.templates || []
}

export async function addTemplate(template) {
  const templates = await loadTemplates()
  const entry = {
    id: template.id || generateId(),
    name: template.name || '未命名贴纸',
    category: template.category || 'default',
    imageData: template.imageData,
    importedAt: Date.now(),
  }
  templates.unshift(entry)
  await kvStorage.set(STORAGE_KEY, { templates })
  return entry
}

export async function deleteTemplate(templateId) {
  const templates = await loadTemplates()
  const filtered = templates.filter(t => t.id !== templateId)
  await kvStorage.set(STORAGE_KEY, { templates: filtered })
}

export async function importFolderFiles(files) {
  const templates = []
  const imageExts = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg']

  const imageFiles = Array.from(files).filter(f => {
    const ext = '.' + f.name.split('.').pop().toLowerCase()
    return imageExts.includes(ext)
  })

  for (const file of imageFiles) {
    const imageData = await fileToDataUrl(file)
    templates.push({
      name: file.name.replace(/\.[^.]+$/, ''),
      imageData,
    })
  }

  const saved = []
  for (const t of templates) {
    const entry = await addTemplate(t)
    saved.push(entry)
  }

  return saved
}
