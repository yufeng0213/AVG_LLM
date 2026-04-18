const LRC_LINE_RE = /\[(\d{2}):(\d{2})(?:[.:](\d{1,3}))?\]\s*(.+)/

function parseTime(mm, ss, fraction) {
  const mins = parseInt(mm, 10)
  const secs = parseInt(ss, 10)
  let ms = 0
  if (fraction) {
    const f = fraction.padEnd(3, '0')
    ms = parseInt(f, 10)
  }
  return mins * 60 + secs + ms / 1000
}

export function parseLRC(text) {
  if (!text) return { lines: [], meta: {} }

  const lines = text.split('\n')
  const meta = {}
  const parsed = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // Meta tags
    const metaMatch = trimmed.match(/^\[(ti|ar|al|by|offset|length):(.*)\]/i)
    if (metaMatch) {
      meta[metaMatch[1].toLowerCase()] = metaMatch[2].trim()
      continue
    }

    // Lyric lines
    let lrcMatch = LRC_LINE_RE.exec(trimmed)
    while (lrcMatch) {
      const time = parseTime(lrcMatch[1], lrcMatch[2], lrcMatch[3])
      const lyricText = lrcMatch[4].trim()
      if (lyricText) {
        parsed.push({ time, text: lyricText })
      }
      // Handle multiple timestamps on same line
      const rest = trimmed.slice(lrcMatch.index + lrcMatch[0].length)
      lrcMatch = LRC_LINE_RE.exec(rest)
    }
  }

  parsed.sort((a, b) => a.time - b.time)

  const offset = parseFloat(meta.offset || '0') / 1000
  if (offset) {
    for (const l of parsed) l.time += offset
  }

  return { lines: parsed, meta }
}

export function findCurrentLineIndex(lines, currentTime, lastIndex = -1) {
  if (!lines.length) return -1

  // Optimized forward scan for sequential playback
  if (lastIndex >= 0 && lastIndex < lines.length - 1) {
    if (currentTime >= lines[lastIndex].time && currentTime < lines[lastIndex + 1].time) {
      return lastIndex
    }
    if (currentTime >= lines[lastIndex + 1].time) {
      for (let i = lastIndex + 1; i < lines.length; i++) {
        if (i + 1 < lines.length && currentTime < lines[i + 1].time) return i
      }
      return lines.length - 1
    }
  }

  // Binary search fallback
  let lo = 0, hi = lines.length - 1
  let result = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (lines[mid].time <= currentTime) {
      result = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return result
}
