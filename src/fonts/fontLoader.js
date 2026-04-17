const SUPPORTED_EXTENSIONS = ['ttf', 'woff', 'woff2', 'otf']

/**
 * 从 TTF/OTF 字体文件中提取 family name。
 * 解析 font name table（nameID=1）。
 * @param {ArrayBuffer} buffer - 字体文件二进制数据
 * @returns {string|null} family name，或 null
 */
function extractFontFamilyFromTTF(buffer) {
  const view = new DataView(buffer)

  // 读取格式和表数量
  const numTables = view.getUint16(4)

  // 查找 name table 的偏移量
  for (let i = 0; i < numTables; i++) {
    const offset = 12 + i * 16
    const tag = String.fromCharCode(
      view.getUint8(offset),
      view.getUint8(offset + 1),
      view.getUint8(offset + 2),
      view.getUint8(offset + 3),
    )

    if (tag === 'name') {
      const nameOffset = view.getUint32(offset + 8)
      return parseNameTable(view, nameOffset)
    }
  }

  return null
}

/**
 * 从 WOFF 字体文件中提取 family name。
 * WOFF 头 44 字节后是 table directory，但表数据是 zlib 压缩的，
 * 所以需要先解压。对于 WOFF 我们回退到文件名。
 * @param {ArrayBuffer} buffer
 * @returns {string|null}
 */
function extractFontFamilyFromWOFF(buffer) {
  // WOFF v1: 表数据是 zlib 压缩的，直接解析需要解压
  // WOFF v2: 使用 Brotli 压缩，更难解析
  // 这里先回退到文件名，让调用方处理
  return null
}

/**
 * 解析 name table，提取 family name（nameID=1）。
 */
function parseNameTable(view, nameOffset) {
  const format = view.getUint16(nameOffset)
  const count = view.getUint16(nameOffset + 2)
  const stringOffset = view.getUint16(nameOffset + 4)

  // 查找 nameID=1（Font Family name）的记录
  let familyName = null

  for (let i = 0; i < count; i++) {
    const recordOffset = nameOffset + 6 + i * 12
    const platformID = view.getUint16(recordOffset)
    const nameID = view.getUint16(recordOffset + 6)
    const length = view.getUint16(recordOffset + 8)
    const strOffset = view.getUint16(recordOffset + 10)

    if (nameID === 1 && length > 0) {
      const strStart = nameOffset + stringOffset + strOffset
      familyName = readString(view, strStart, length, platformID)
      // 优先使用 Unicode/Windows 记录
      if (platformID === 0 || platformID === 3) {
        return familyName
      }
    }
  }

  return familyName
}

/**
 * 从字节流读取字符串。
 */
function readString(view, offset, length, platformID) {
  const bytes = []
  for (let i = 0; i < length; i++) {
    bytes.push(view.getUint8(offset + i))
  }

  // platformID: 0=Unicode, 1=Macintosh, 3=Windows
  if (platformID === 0 || platformID === 3) {
    // UTF-16BE
    try {
      const decoder = new TextDecoder('utf-16be')
      const result = decoder.decode(new Uint8Array(bytes))
      // 去除 BOM 和 null 字符
      return result.replace(/\0/g, '').replace(/^\uFEFF/, '').trim()
    } catch {
      return String.fromCharCode(...bytes.filter((b) => b > 0))
    }
  }

  // Macintosh encoding - use latin1 fallback
  return String.fromCharCode(...bytes)
}

/**
 * 从字体文件加载字体。使用 FontFace API 读取 ArrayBuffer 并注册到 document.fonts。
 * @param {File} file - 用户选择的字体文件 (.ttf/.woff/.woff2/.otf)
 * @returns {{ id: string, familyName: string, buffer: ArrayBuffer, fileName: string, fileType: string, fileSize: number }}
 */
export async function loadFontFromFile(file) {
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (!ext || !SUPPORTED_EXTENSIONS.includes(ext)) {
    throw new Error(`不支持的字体格式：.${ext}，仅支持 ${SUPPORTED_EXTENSIONS.join(', ')}`)
  }

  const buffer = await file.arrayBuffer()

  // 尝试从字体文件提取 family name
  let familyName = null
  try {
    if (ext === 'ttf' || ext === 'otf') {
      familyName = extractFontFamilyFromTTF(buffer)
    }
  } catch {
    // 解析失败，回退到文件名
  }

  // 如果没有提取到名称，使用文件名（去掉扩展名）
  if (!familyName) {
    familyName = file.name.replace(/\.[^.]+$/, '')
  }

  // 清理 family name：去掉非法字符
  familyName = familyName.replace(/['"]/g, '').trim()
  if (!familyName) {
    familyName = file.name.replace(/\.[^.]+$/, '')
  }

  // 使用提取的 family name 创建 FontFace
  const font = new FontFace(familyName, buffer)

  try {
    await font.load()
  } catch {
    throw new Error('字体文件解析失败，可能已损坏或格式不受支持')
  }

  // 注册到全局 document.fonts
  document.fonts.add(font)

  return {
    id: `font_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    familyName,
    buffer,
    fileName: file.name,
    fileType: ext,
    fileSize: file.size,
  }
}

/**
 * 从 ArrayBuffer 恢复已存储的字体。
 * @param {ArrayBuffer} buffer - 字体二进制数据
 * @param {string} familyName - 字体族名称
 * @returns {FontFace}
 */
export async function restoreFontFromBuffer(buffer, familyName) {
  const font = new FontFace(familyName, buffer)
  try {
    await font.load()
    document.fonts.add(font)
  } catch (e) {
    console.warn(`[FontLoader] Failed to restore font "${familyName}":`, e)
  }
  return font
}

/**
 * 从 document.fonts 中移除指定字体。
 * @param {string} familyName
 */
export function removeFontFromDocument(familyName) {
  for (const font of document.fonts.values()) {
    if (font.family === familyName) {
      document.fonts.delete(font)
    }
  }
}
