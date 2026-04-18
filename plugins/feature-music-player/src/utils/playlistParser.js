const M3U_EXTINF_PATTERN = /^#EXTINF:\s*(?:-?\d+)\s*,\s*(.+)$/m
const M3U_FILE_PATTERN = /^(?!#).+$/gm

const PLS_FILE_PATTERN = /^File\d+=(.+)$/gm
const PLS_TITLE_PATTERN = /^Title\d+=(.+)$/gm

export function parseM3U(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const tracks = []
  let currentName = ''
  let idCounter = 0

  for (const line of lines) {
    if (line.startsWith('#EXTINF:')) {
      const match = line.match(M3U_EXTINF_PATTERN)
      currentName = match?.[1]?.trim() || ''
    } else if (line.startsWith('#')) {
      continue
    } else if (line) {
      tracks.push({
        id: `m3u-${Date.now()}-${idCounter++}`,
        name: currentName || line.split('/').pop().replace(/\.[^.]+$/, '') || '未知曲目',
        path: line,
        source: 'playlist',
      })
      currentName = ''
    }
  }
  return tracks
}

export function parsePLS(text) {
  const files = []
  const titles = []
  let m

  const fileRe = /^File\d+=(.+)$/gm
  while ((m = fileRe.exec(text))) files.push(m[1].trim())

  const titleRe = /^Title\d+=(.+)$/gm
  while ((m = titleRe.exec(text))) titles.push(m[1].trim())

  return files.map((path, i) => ({
    id: `pls-${Date.now()}-${i}`,
    name: titles[i] || path.split('/').pop().replace(/\.[^.]+$/, '') || '未知曲目',
    path,
    source: 'playlist',
  }))
}

export function parsePlaylistJSON(text) {
  try {
    const data = JSON.parse(text)
    const items = Array.isArray(data) ? data : (data.tracks || data.songs || [])
    return items.map((item, i) => ({
      id: `json-${Date.now()}-${i}`,
      name: item.name || item.title || item.file || `曲目 ${i + 1}`,
      path: item.path || item.url || item.file || item.src,
      source: 'playlist',
      artist: item.artist || item.ar || '',
      lrcPath: item.lrc || item.lyric || item.lrcPath || '',
    })).filter(t => t.path)
  } catch {
    return []
  }
}

export function parsePlaylist(text, format) {
  const fmt = format?.toLowerCase()
  if (fmt === 'json') return parsePlaylistJSON(text)
  if (fmt === 'pls') return parsePLS(text)
  if (fmt === 'm3u' || fmt === 'm3u8') return parseM3U(text)

  // Auto-detect
  if (text.includes('"tracks"') || text.startsWith('[')) return parsePlaylistJSON(text)
  if (text.includes('[playlist]') || /^File\d=/m.test(text)) return parsePLS(text)
  return parseM3U(text)
}
