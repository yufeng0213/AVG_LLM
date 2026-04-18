/**
 * Extract metadata (title, artist, album, cover) from audio files.
 * Uses music-metadata-browser for ID3 and other tag formats.
 */
import { parseBlob, parseFile } from 'music-metadata-browser'

/**
 * Extract cover image from parsed metadata, return data URL.
 */
function extractCoverDataUrl(metadata) {
  if (!metadata?.common?.picture?.length) return null
  const pic = metadata.common.picture[0]
  const base64 = btoa(String.fromCharCode(...pic.data))
  return `data:${pic.format};base64,${base64}`
}

/**
 * Read metadata from a browser File object.
 */
export async function extractFromFile(file) {
  try {
    const metadata = await parseBlob(file)
    const cover = extractCoverDataUrl(metadata)
    return {
      title: metadata.common.title || null,
      artist: metadata.common.artist || null,
      album: metadata.common.album || null,
      cover,
    }
  } catch {
    return { title: null, artist: null, album: null, cover: null }
  }
}

/**
 * Read metadata from an Electron file path.
 * We need to use window.avgLLM.bgm to read the file as ArrayBuffer,
 * then parse it via parseBlob by wrapping it.
 */
export async function extractFromElectronFile(path) {
  if (!window.avgLLM?.bgm?.readAudio) {
    return { title: null, artist: null, album: null, cover: null }
  }
  try {
    const result = await window.avgLLM.bgm.readAudio(path)
    if (!result?.base64 || !result?.mimeType) {
      return { title: null, artist: null, album: null, cover: null }
    }
    const binaryString = atob(result.base64)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }
    const blob = new Blob([bytes], { type: result.mimeType })
    const metadata = await parseBlob(blob)
    const cover = extractCoverDataUrl(metadata)
    return {
      title: metadata.common.title || null,
      artist: metadata.common.artist || null,
      album: metadata.common.album || null,
      cover,
    }
  } catch {
    return { title: null, artist: null, album: null, cover: null }
  }
}
