import { ref, computed } from 'vue'

let _tracks = ref([])
let _currentIndex = ref(-1)
let _playMode = ref('sequence') // sequence | shuffle | repeat-one | repeat-all

export function usePlaylist() {
  const state = {
    tracks: _tracks,
    currentIndex: _currentIndex,
    playMode: _playMode,
    currentTrack: computed(() => _tracks.value[_currentIndex.value] || null),
    isEmpty: computed(() => _tracks.value.length === 0),
  }

  const actions = {
    setPlaylist(tracks) {
      _tracks.value = Array.isArray(tracks) ? tracks : []
      _currentIndex.value = _tracks.value.length > 0 ? 0 : -1
    },

    addTrack(track) {
      _tracks.value.push(track)
      if (_currentIndex.value < 0) _currentIndex.value = 0
    },

    addTracks(tracks) {
      _tracks.value.push(...tracks)
      if (_currentIndex.value < 0 && tracks.length > 0) _currentIndex.value = 0
    },

    removeTrack(index) {
      if (index < 0 || index >= _tracks.value.length) return
      _tracks.value.splice(index, 1)
      if (_currentIndex.value >= _tracks.value.length) {
        _currentIndex.value = Math.max(0, _tracks.value.length - 1)
      }
      if (_tracks.value.length === 0) _currentIndex.value = -1
    },

    clearPlaylist() {
      _tracks.value = []
      _currentIndex.value = -1
    },

    reorderTrack(from, to) {
      if (from < 0 || to < 0 || from >= _tracks.value.length || to >= _tracks.value.length) return
      const [item] = _tracks.value.splice(from, 1)
      _tracks.value.splice(to, 0, item)
      if (_currentIndex.value === from) _currentIndex.value = to
      else if (_currentIndex.value === to) _currentIndex.value = from
    },

    playTrackById(id) {
      const idx = _tracks.value.findIndex(t => t.id === id)
      if (idx >= 0) _currentIndex.value = idx
    },

    setPlayMode(mode) {
      _playMode.value = mode
    },

    getNextTrack() {
      if (_tracks.value.length === 0) return null

      if (_playMode.value === 'repeat-one') {
        return _tracks.value[_currentIndex.value]
      }

      if (_playMode.value === 'shuffle') {
        let next
        do {
          next = Math.floor(Math.random() * _tracks.value.length)
        } while (next === _currentIndex.value && _tracks.value.length > 1)
        _currentIndex.value = next
        return _tracks.value[_currentIndex.value]
      }

      // sequence / repeat-all
      const next = _currentIndex.value + 1
      if (next < _tracks.value.length) {
        _currentIndex.value = next
        return _tracks.value[_currentIndex.value]
      }
      if (_playMode.value === 'repeat-all') {
        _currentIndex.value = 0
        return _tracks.value[0]
      }
      return null
    },

    getPrevTrack() {
      if (_tracks.value.length === 0) return null
      const prev = _currentIndex.value - 1
      if (prev >= 0) {
        _currentIndex.value = prev
        return _tracks.value[_currentIndex.value]
      }
      if (_playMode.value === 'repeat-all') {
        _currentIndex.value = _tracks.value.length - 1
        return _tracks.value[_currentIndex.value]
      }
      return null
    },

    updateTrackMetadata(trackId, metadata) {
      const track = _tracks.value.find(t => t.id === trackId)
      if (track) {
        Object.assign(track, metadata)
      }
    },
  }

  return { state, actions }
}
