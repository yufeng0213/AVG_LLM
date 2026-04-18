const AUDIO_EXTENSIONS = new Map([
  ['.mp3', 'audio/mpeg'],
  ['.wav', 'audio/wav'],
  ['.ogg', 'audio/ogg'],
  ['.m4a', 'audio/mp4'],
  ['.aac', 'audio/aac'],
  ['.flac', 'audio/flac'],
  ['.opus', 'audio/opus'],
  ['.weba', 'audio/webm'],
])

export function getAudioMimeType(filename) {
  if (!filename) return null
  const ext = '.' + filename.split('.').pop().toLowerCase()
  return AUDIO_EXTENSIONS.get(ext) || null
}

export function isAudioFile(filename) {
  return getAudioMimeType(filename) !== null
}
