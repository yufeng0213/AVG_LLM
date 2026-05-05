/**
 * useBookImport.js - 本地书籍导入（TXT / EPUB / PDF）
 * 负责文件选择、格式解析、存储保存。
 */
import JSZip from 'jszip'
import {
  loadStories,
  saveStories,
  addStory,
  isSQLiteAvailable,
  insertChapter as _insertChapter,
} from './useReaderData.js'
import { kvStorage } from '../../../../src/storage/index.js'

const STORIES_KEY = 'reader_stories'
const MAX_FILE_SIZE = 100 * 1024 * 1024 // 100MB

// ============================================================
// 公共 API
// ============================================================

export function detectFormat(file) {
  const ext = file.name.split('.').pop().toLowerCase()
  if (ext === 'txt') return 'txt'
  if (ext === 'epub') return 'epub'
  if (ext === 'pdf') return 'pdf'
  return 'unsupported'
}

export async function pickBookFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.txt,.epub,.pdf'
    input.onchange = () => {
      const file = input.files?.[0] || null
      resolve(file)
    }
    input.click()
  })
}

export async function parseBookFile(file) {
  const format = detectFormat(file)
  if (format === 'unsupported') {
    throw new Error('不支持的文件格式，请使用 .txt / .epub / .pdf 文件')
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new Error('文件过大，最大支持 100MB')
  }

  let result
  if (format === 'txt') {
    result = await parseTXT(file)
  } else if (format === 'epub') {
    result = await parseEPUB(file)
  } else if (format === 'pdf') {
    result = await parsePDF(file)
  }

  if (!result || result.chapters.length === 0) {
    throw new Error('未能从文件中提取到文字内容')
  }

  return {
    format,
    title: result.title || file.name.replace(/\.[^.]+$/, ''),
    author: result.author || '',
    chapters: result.chapters,
  }
}

export async function saveImportedBook(parsedBook) {
  const storyId = `imported_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  const now = new Date().toISOString()

  const story = {
    id: storyId,
    title: parsedBook.title,
    author: parsedBook.author,
    genre: '',
    summary: '',
    worldBookId: '',
    sourceType: 'imported',
    importFormat: parsedBook.format,
    chapters: [],
    lastReadChapter: 0,
    settings: { fontSize: 16, lineHeight: 1.8, theme: 'dark' },
    createdAt: now,
    updatedAt: now,
  }

  if (isSQLiteAvailable()) {
    const { exec } = await import('../../../../src/db/connection.js')
    await exec(
      `INSERT INTO reader_stories (id, title, author, genre, summary, world_book_id, source_type, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [story.id, story.title, story.author, story.genre, story.summary, story.worldBookId, 'imported', now, now]
    )
    for (let i = 0; i < parsedBook.chapters.length; i++) {
      const ch = parsedBook.chapters[i]
      await _insertChapter(storyId, {
        title: ch.title || `第 ${i + 1} 章`,
        content: ch.content,
        wordCount: ch.content.length,
      })
    }
  } else {
    const stories = await loadStories()
    const updated = addStory(stories, { ...story, chapters: parsedBook.chapters })
    await kvStorage.set(STORIES_KEY, updated)
  }

  // 重新加载以获取完整数据
  const stories = await loadStories()
  return stories.find(s => s.id === storyId)
}

// ============================================================
// TXT 解析
// ============================================================

const CHAPTER_RE = [
  /^(第[一二三四五六七八九十百千万零\d]+[章节回卷篇集幕幕].*)/gm,
  /^(Chapter\s+\d+.*)/gim,
  /^#{1,3}\s+(.+)/gm,
]

async function parseTXT(file) {
  let text = await readTextFile(file)
  // 去除 BOM
  text = text.replace(/^﻿/, '')

  const title = extractTXTTitle(text) || file.name.replace(/\.txt$/i, '')
  const chapters = splitTXTIntoChapters(text)

  return { title, author: '', chapters }
}

async function readTextFile(file) {
  // 先尝试 UTF-8
  const buffer = await file.arrayBuffer()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  try {
    return decoder.decode(buffer)
  } catch {
    // 尝试 GB18030（中文编码）
    try {
      const gbDecoder = new TextDecoder('gb18030')
      return gbDecoder.decode(buffer)
    } catch {
      // 最终回退：直接用 file.text()
      return await file.text()
    }
  }
}

function extractTXTTitle(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l)
  if (lines.length > 0 && lines[0].length < 50) {
    // 如果第一行看起来像标题（不是章节标题）
    if (!/^第.+[章节回卷篇]/.test(lines[0]) && !/^Chapter\s+\d+/i.test(lines[0])) {
      return lines[0]
    }
  }
  return null
}

function splitTXTIntoChapters(text) {
  // 尝试各种章节正则
  for (const re of CHAPTER_RE) {
    const matches = [...text.matchAll(re)]
    if (matches.length > 1) {
      return buildChaptersFromMatches(text, matches)
    }
  }

  // 按空行分段，每 2000+ 字算一章
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim())
  if (paragraphs.length > 1) {
    return splitByParagraphs(paragraphs, 2000)
  }

  // 终极兜底：全文一章
  return [{ title: '全文', content: text.trim() }]
}

function buildChaptersFromMatches(text, matches) {
  const chapters = []
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index
    const end = i < matches.length - 1 ? matches[i + 1].index : text.length
    let content = text.slice(start, end).trim()
    // 从内容中提取标题行
    const firstLine = content.split(/\r?\n/)[0]?.trim() || ''
    const title = firstLine || `第 ${i + 1} 章`
    // 去掉标题行，保留正文
    const bodyStart = content.indexOf('\n')
    content = bodyStart >= 0 ? content.slice(bodyStart).trim() : ''
    if (content || title) {
      chapters.push({ title, content })
    }
  }
  return chapters.length > 0 ? chapters : [{ title: '全文', content: text.trim() }]
}

function splitByParagraphs(paragraphs, minChars) {
  const chapters = []
  let current = []
  let currentLen = 0

  for (const para of paragraphs) {
    current.push(para)
    currentLen += para.length
    if (currentLen >= minChars) {
      chapters.push({
        title: `第 ${chapters.length + 1} 部分`,
        content: current.join('\n\n').trim(),
      })
      current = []
      currentLen = 0
    }
  }
  if (current.length > 0) {
    chapters.push({
      title: chapters.length > 0 ? `第 ${chapters.length + 1} 部分` : '全文',
      content: current.join('\n\n').trim(),
    })
  }
  return chapters
}

// ============================================================
// EPUB 解析
// ============================================================

async function parseEPUB(file) {
  const zip = await JSZip.loadAsync(file)

  // Step 1: 读 container.xml 找 content.opf 路径
  const containerEntry = zip.file('META-INF/container.xml') || zip.file('OEBPS/META-INF/container.xml')
  if (!containerEntry) {
    // 尝试直接找 content.opf
    const opfFile = findOpfFile(zip)
    if (!opfFile) throw new Error('无法找到 EPUB 的 content.opf 文件')
    return await parseOpfFile(zip, opfFile.name, file.name)
  }

  const containerXml = await containerEntry.async('text')
  const containerDoc = new DOMParser().parseFromString(containerXml, 'text/xml')
  const rootfile = containerDoc.querySelector('rootfile')
  const opfPath = rootfile?.getAttribute('full-path')
  if (!opfPath) {
    const opfFile = findOpfFile(zip)
    if (!opfFile) throw new Error('无法找到 EPUB 的 content.opf 文件')
    return await parseOpfFile(zip, opfFile.name, file.name)
  }

  return await parseOpfFile(zip, opfPath, file.name)
}

function findOpfFile(zip) {
  const candidates = ['content.opf', 'OEBPS/content.opf', 'EPUB/content.opf']
  for (const path of candidates) {
    const entry = zip.file(path)
    if (entry) return entry
  }
  // 遍历所有 .opf 文件
  for (const name of Object.keys(zip.files)) {
    if (name.endsWith('.opf')) return zip.file(name)
  }
  return null
}

async function parseOpfFile(zip, opfPath, fallbackName) {
  const opfEntry = zip.file(opfPath)
  if (!opfEntry) throw new Error(`无法读取 ${opfPath}`)

  const opfXml = await opfEntry.async('text')
  const opfDoc = new DOMParser().parseFromString(opfXml, 'text/xml')

  // 提取元数据
  const dcTitle = getDcElement(opfDoc, 'title')
  const dcCreator = getDcElement(opfDoc, 'creator')
  const dcDesc = getDcElement(opfDoc, 'description')

  const title = dcTitle || fallbackName.replace(/\.epub$/i, '')
  const author = dcCreator || ''

  // 构建 manifest 映射
  const manifest = {}
  for (const item of opfDoc.querySelectorAll('manifest > item')) {
    const id = item.getAttribute('id')
    const href = decodeURIComponent(item.getAttribute('href') || '')
    if (id && href) manifest[id] = href
  }

  // 按 spine 顺序读取章节
  const opfDir = opfPath.substring(0, opfPath.lastIndexOf('/') + 1)
  const chapters = []

  const spineItems = opfDoc.querySelectorAll('spine > itemref')
  for (const itemref of spineItems) {
    const itemId = itemref.getAttribute('idref')
    const href = manifest[itemId]
    if (!href) continue

    const fullPath = resolveRelativePath(opfDir, href)
    const contentFile = zip.file(fullPath)
    if (!contentFile) continue

    const xhtmlText = await contentFile.async('text')
    const textContent = extractTextFromXHTML(xhtmlText)
    if (!textContent.trim()) continue

    const chTitle = extractChapterTitle(textContent) || `第 ${chapters.length + 1} 章`
    chapters.push({ title: chTitle, content: textContent.trim() })
  }

  // 如果 spine 没有提取到章节，尝试所有 XHTML/HTML 文件
  if (chapters.length === 0) {
    for (const name of Object.keys(zip.files).sort()) {
      if (!name.match(/\.(xhtml|html?|htm)$/i)) continue
      const entry = zip.file(name)
      if (!entry) continue
      const xhtmlText = await entry.async('text')
      const textContent = extractTextFromXHTML(xhtmlText)
      if (!textContent.trim()) continue
      const chTitle = extractChapterTitle(textContent) || `第 ${chapters.length + 1} 章`
      chapters.push({ title: chTitle, content: textContent.trim() })
    }
  }

  return { title, author, chapters }
}

function getDcElement(doc, tagName) {
  // 尝试多种命名空间
  const ns = 'http://purl.org/dc/elements/1.1/'
  const el = doc.getElementsByTagNameNS(ns, tagName)?.[0]
    || doc.getElementsByTagName(`dc:${tagName}`)?.[0]
    || doc.getElementsByTagName(tagName)?.[0]
  return el?.textContent?.trim() || ''
}

function resolveRelativePath(dir, href) {
  if (href.startsWith('/')) return href.slice(1)
  return dir + href
}

function extractTextFromXHTML(xhtmlString) {
  try {
    const doc = new DOMParser().parseFromString(xhtmlString, 'application/xhtml+xml')
    for (const el of doc.querySelectorAll('script, style, nav')) el.remove()

    // 保留段落结构：将块级元素替换为换行
    let html = doc.body?.innerHTML || ''
    html = html
      .replace(/<(?:p|div|h[1-6]|li|blockquote)[^>]*>/gi, '\n')
      .replace(/<\/(?:p|div|h[1-6]|li|blockquote)>/gi, '\n')
      .replace(/<br[^>]*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#?\w+;/g, ' ')

    // 清理：去除空行，合并多空格
    return html
      .split('\n')
      .map(l => l.trim())
      .filter(l => l)
      .join('\n\n')
  } catch {
    // DOMParser 失败，用正则简单提取
    return xhtmlString
      .replace(/<[^>]+>/g, '\n')
      .replace(/&\w+;/g, ' ')
      .split('\n')
      .map(l => l.trim())
      .filter(l => l)
      .join('\n\n')
  }
}

function extractChapterTitle(text) {
  const lines = text.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.length > 80) continue
    if (/^(第[一二三四五六七八九十百千万零\d]+[章节回卷篇集幕]|Chapter\s+\d+|\d+\.\s+.+)/i.test(trimmed)) {
      return trimmed
    }
  }
  return null
}

// ============================================================
// PDF 解析
// ============================================================

let pdfjsModule = null

async function loadPdfjs() {
  if (pdfjsModule) return pdfjsModule
  pdfjsModule = await import('pdfjs-dist')
  // 使用包内自带的 worker，避免版本不匹配
  pdfjsModule.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).href
  return pdfjsModule
}

async function parsePDF(file) {
  const pdfjs = await loadPdfjs()

  const arrayBuffer = await file.arrayBuffer()

  let pdfDoc
  try {
    pdfDoc = await pdfjs.getDocument({ data: arrayBuffer }).promise
  } catch (e) {
    if (e.name === 'PasswordException') {
      throw new Error('该 PDF 已加密，无法解析')
    }
    throw new Error(`PDF 解析失败：${e.message}`)
  }

  const numPages = pdfDoc.numPages
  const pageTexts = []

  for (let i = 1; i <= numPages; i++) {
    const page = await pdfDoc.getPage(i)
    const textContent = await page.getTextContent()
    const pageText = textContent.items.map(item => item.str).join('')
    pageTexts.push(pageText)
  }

  // 检测扫描版 PDF（所有页都为空）
  const totalChars = pageTexts.join('').replace(/\s/g, '').length
  if (totalChars === 0) {
    throw new Error('该 PDF 为扫描版，未包含可提取的文字内容')
  }

  const chapters = splitPDFIntoChapters(pageTexts, file.name)

  return {
    title: file.name.replace(/\.pdf$/i, ''),
    author: '',
    chapters,
  }
}

function splitPDFIntoChapters(pageTexts, fileName) {
  const CHAPTER_HEADING_RE = /^(第[一二三四五六七八九十百千万零\d]+[章节回卷篇集幕]|Chapter\s+\d+|\d+[\.\、]\s*.+)$/m

  const chapters = []
  let currentLines = []
  let currentTitle = ''

  for (let i = 0; i < pageTexts.length; i++) {
    const pageText = pageTexts[i]
    const lines = pageText.split(/\r?\n/).map(l => l.trim()).filter(l => l)
    if (lines.length === 0) continue

    // 检查页首是否有章节标题
    const firstLine = lines[0]
    if (CHAPTER_HEADING_RE.test(firstLine)) {
      // 保存上一章
      if (currentLines.length > 0) {
        chapters.push({
          title: currentTitle || `第 ${chapters.length + 1} 部分`,
          content: currentLines.join('\n\n').trim(),
        })
      }
      currentTitle = firstLine
      currentLines = lines.slice(1).filter(l => l.length > 1)
    } else {
      currentLines.push(...lines.filter(l => l.length > 1))
    }
  }

  // 保存最后一章
  if (currentLines.length > 0) {
    chapters.push({
      title: currentTitle || `第 ${chapters.length + 1} 部分`,
      content: currentLines.join('\n\n').trim(),
    })
  }

  // 如果只有一章且内容巨大（>50000 字），拆分
  if (chapters.length === 1 && chapters[0].content.length > 50000) {
    return splitLargeChapter(chapters[0])
  }

  // 如果完全没有检测到章节，按页分组（每 5 页一章）
  if (chapters.length === 0 && pageTexts.length > 0) {
    return groupPagesIntoChapters(pageTexts)
  }

  return chapters
}

function splitLargeChapter(chapter) {
  const paragraphs = chapter.content.split(/\n\n+/).filter(p => p.trim())
  const chunks = []
  let current = []
  let currentLen = 0

  for (const para of paragraphs) {
    current.push(para)
    currentLen += para.length
    if (currentLen >= 3000) {
      chunks.push({
        title: chunks.length === 0 ? chapter.title : `第 ${chunks.length + 1} 部分`,
        content: current.join('\n\n').trim(),
      })
      current = []
      currentLen = 0
    }
  }
  if (current.length > 0) {
    chunks.push({
      title: `第 ${chunks.length + 1} 部分`,
      content: current.join('\n\n').trim(),
    })
  }
  return chunks
}

function groupPagesIntoChapters(pageTexts) {
  const PAGES_PER_CHAPTER = 5
  const chapters = []

  for (let i = 0; i < pageTexts.length; i += PAGES_PER_CHAPTER) {
    const group = pageTexts.slice(i, i + PAGES_PER_CHAPTER).join('\n\n')
    if (group.trim()) {
      chapters.push({
        title: `第 ${chapters.length + 1} 部分`,
        content: group.trim(),
      })
    }
  }

  return chapters.length > 0 ? chapters : [{ title: '全文', content: pageTexts.join('\n\n').trim() }]
}
