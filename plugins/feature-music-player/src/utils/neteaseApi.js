/**
 * Extract song metadata from Netease Cloud Music URLs.
 * Supports both Electron IPC (desktop) and direct fetch (Android/Capacitor).
 *
 * Supported URL formats:
 *   - http://music.163.com/song/media/outer/url?id=12345.mp3
 *   - https://music.163.com/#/song?id=12345
 *   - https://music.163.com/song?id=12345
 *   - https://music.163.com/playlist?id=67890
 *   - https://music.163.com/#/playlist?id=67890
 */

const NETEASE_SONG_RE = /music\.163\.com.*[?&]song[=]|music\.163\.com\/song\/media\/outer\/url/
const NETEASE_PLAYLIST_RE = /music\.163\.com.*playlist.*[?&]id=(\d+)/
const NETEASE_SONG_ID_RE = /(?:music\.163\.com).*[?&]id=(\d+)/
const NETEASE_PLAYLIST_ID_RE = /^playlist[:_]?(\d+)$/
const NETEASE_ID_RE = /^(\d+)$/

/**
 * Determine if a URL/ID is a playlist or song.
 * Returns 'playlist' | 'song' | null
 */
export function parseNeteaseType(input) {
  const str = String(input).trim()
  if (NETEASE_PLAYLIST_RE.test(str) || NETEASE_PLAYLIST_ID_RE.test(str)) return 'playlist'
  if (NETEASE_SONG_RE.test(str) || NETEASE_ID_RE.test(str)) return 'song'
  return null
}

/**
 * Extract numeric ID (song or playlist) from a Netease URL.
 */
export function parseNeteaseId(input) {
  if (!input) return null
  const str = String(input).trim()

  // playlist:id or playlist_id
  const pm = NETEASE_PLAYLIST_ID_RE.exec(str)
  if (pm) return pm[1]

  // URL with playlist
  const pm2 = NETEASE_PLAYLIST_RE.exec(str)
  if (pm2) return pm2[1]

  // URL with song id
  const sm = NETEASE_SONG_ID_RE.exec(str)
  if (sm) return sm[1]

  // Raw numeric ID
  const m = NETEASE_ID_RE.exec(str)
  if (m) return m[1]

  return null
}

/**
 * Fetch song metadata via Electron IPC.
 */
async function fetchViaElectron(songId) {
  if (!window.avgLLM?.netease?.fetchSongDetail) return null
  const result = await window.avgLLM.netease.fetchSongDetail(songId)
  if (result?.success && result?.data) return result.data
  return null
}

/**
 * Fetch lyrics via Electron IPC.
 */
async function fetchLyricsViaElectron(songId) {
  if (!window.avgLLM?.netease?.fetchLyrics) return null
  const result = await window.avgLLM.netease.fetchLyrics(songId)
  if (result?.success && result?.lrc) return result.lrc
  return null
}

/**
 * Fetch playlist tracks via Electron IPC.
 */
async function fetchPlaylistViaElectron(playlistId) {
  if (!window.avgLLM?.netease?.fetchPlaylist) return null
  const result = await window.avgLLM.netease.fetchPlaylist(playlistId)
  if (result?.success && result?.data) return result.data
  return null
}

/**
 * Fetch song metadata via direct fetch (works in Android WebView).
 */
async function fetchViaDirect(songId) {
  try {
    const response = await fetch(`https://music.163.com/api/song/detail/?id=${songId}&ids=[${songId}]`, {
      headers: { Referer: 'https://music.163.com/' },
    })
    if (!response.ok) return null
    const data = await response.json()
    const song = data.songs?.[0]
    if (!song) return null
    return {
      name: song.name,
      artist: song.artists?.map(a => a.name).join(', ') || '',
      album: song.album?.name || '',
      cover: song.album?.picUrl || '',
    }
  } catch {
    return null
  }
}

/**
 * Fetch lyrics via direct fetch.
 */
async function fetchLyricsViaDirect(songId) {
  try {
    const response = await fetch(`https://music.163.com/api/song/lyric?id=${songId}&lv=1&kv=1&tv=-1`, {
      headers: { Referer: 'https://music.163.com/' },
    })
    if (!response.ok) return null
    const data = await response.json()
    return data.lrc?.lyric || null
  } catch {
    return null
  }
}

/**
 * Fetch playlist tracks via direct fetch.
 */
async function fetchPlaylistViaDirect(playlistId) {
  try {
    const response = await fetch(`https://music.163.com/api/playlist/detail?id=${playlistId}`, {
      headers: { Referer: 'https://music.163.com/' },
    })
    if (!response.ok) return null
    const data = await response.json()
    if (data.result?.tracks?.length) {
      return data.result.tracks.map(song => ({
        id: String(song.id),
        name: song.name,
        artist: song.artists?.map(a => a.name).join(', ') || '',
        album: song.album?.name || '',
        cover: song.album?.picUrl || '',
      }))
    }
    return null
  } catch {
    return null
  }
}

/**
 * Fetch song metadata (name, artist, album, cover) from Netease API.
 * Tries Electron IPC first, falls back to direct fetch (Android).
 */
export async function fetchNeteaseMetadata(songId) {
  return (await fetchViaElectron(songId)) || (await fetchViaDirect(songId))
}

/**
 * Fetch LRC lyrics from Netease API.
 * Returns the raw LRC string.
 */
export async function fetchNeteaseLyrics(songId) {
  return (await fetchLyricsViaElectron(songId)) || (await fetchLyricsViaDirect(songId))
}

/**
 * Fetch playlist tracks from Netease API.
 * Returns array of { id, name, artist, album, cover }.
 */
export async function fetchNeteasePlaylist(playlistId) {
  return (await fetchPlaylistViaElectron(playlistId)) || (await fetchPlaylistViaDirect(playlistId))
}
