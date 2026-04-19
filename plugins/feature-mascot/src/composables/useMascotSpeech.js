import { ref } from 'vue'

const STORAGE_KEY_SPEECH = 'avg_llm_mascot_speech_v1'
const DEFAULT_MESSAGES = [
  '今天也要元气满满哦~',
  '有什么想聊的吗？',
  '我在看着你呢！',
  '今天过得怎么样？',
  '加油！你可以的！',
]

const currentMessage = ref('')
const messages = ref([])
let cycleTimer = null
let currentIndex = 0

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SPEECH)
    if (raw) {
      const data = JSON.parse(raw)
      if (Array.isArray(data.messages) && data.messages.length > 0) {
        messages.value = data.messages
      } else {
        messages.value = [...DEFAULT_MESSAGES]
      }
      currentIndex = data.currentIndex || 0
    } else {
      messages.value = [...DEFAULT_MESSAGES]
    }
  } catch {
    messages.value = [...DEFAULT_MESSAGES]
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY_SPEECH, JSON.stringify({
      messages: messages.value,
      currentIndex,
    }))
  } catch (e) {
    console.warn('[Mascot] Failed to persist speech:', e)
  }
}

function stop() {
  if (cycleTimer) {
    clearTimeout(cycleTimer)
    cycleTimer = null
  }
}

function showNext() {
  if (messages.value.length === 0) return
  currentMessage.value = messages.value[currentIndex % messages.value.length]
  currentIndex = (currentIndex + 1) % messages.value.length
  persist()
  cycleTimer = setTimeout(showNext, 8000 + Math.random() * 4000)
}

function start() {
  stop()
  if (messages.value.length > 0) {
    showNext()
  }
}

function forceSpeech(text) {
  currentMessage.value = text || messages.value[Math.floor(Math.random() * messages.value.length)]
  stop()
  cycleTimer = setTimeout(showNext, 8000 + Math.random() * 4000)
}

function addMessage(text) {
  if (text && !messages.value.includes(text)) {
    messages.value.push(text)
    persist()
  }
}

function setCustomMessages(newMessages) {
  messages.value = newMessages.length > 0 ? newMessages : [...DEFAULT_MESSAGES]
  currentIndex = 0
  persist()
  start()
}

load()

export function useMascotSpeech() {
  return { currentMessage, messages, setCustomMessages, addMessage, forceSpeech, stop, start }
}
