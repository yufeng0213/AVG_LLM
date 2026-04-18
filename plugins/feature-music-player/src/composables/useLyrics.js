import { ref, computed } from 'vue'
import { parseLRC, findCurrentLineIndex } from '../utils/lrcParser.js'

let _lrcData = ref(null) // { lines, meta }
let _currentLineIndex = ref(-1)
let _hasLyrics = ref(false)

export function useLyrics() {
  const state = {
    lrcData: _lrcData,
    currentLineIndex: _currentLineIndex,
    currentLine: computed(() =>
      _lrcData.value?.lines?.[_currentLineIndex.value] || null
    ),
    hasLyrics: _hasLyrics,
    meta: computed(() => _lrcData.value?.meta || {}),
    lines: computed(() => _lrcData.value?.lines || []),
  }

  const actions = {
    loadLRC(text) {
      _lrcData.value = parseLRC(text)
      _hasLyrics.value = _lrcData.value.lines.length > 0
      _currentLineIndex.value = -1
    },

    loadFromLrcPath(lrcPath) {
      // For future: fetch lrc file from path
      _lrcData.value = null
      _hasLyrics.value = false
    },

    syncLyrics(currentTime) {
      if (!_lrcData.value?.lines?.length) return
      _currentLineIndex.value = findCurrentLineIndex(
        _lrcData.value.lines,
        currentTime,
        _currentLineIndex.value
      )
    },

    seekToLine(lineIndex) {
      if (!_lrcData.value?.lines?.[lineIndex]) return 0
      return _lrcData.value.lines[lineIndex].time
    },

    clear() {
      _lrcData.value = null
      _currentLineIndex.value = -1
      _hasLyrics.value = false
    },
  }

  return { state, actions }
}
