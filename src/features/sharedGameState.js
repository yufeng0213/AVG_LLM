const STORAGE_KEY = 'avg_llm_shared_game_state_v1'
const EVENT_NAME = 'shared-game-state-changed'

let state = {
  flags: {},
  currentChapter: null,
  baseBuilding: null,
}

const readState = () => {
  if (typeof window === 'undefined' || !window.localStorage) return state
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      state = { ...state, ...parsed }
    }
  } catch {
    // ignore
  }
  return state
}

const writeState = () => {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // ignore
  }
}

const dispatchChange = () => {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { state: { ...state } } }))
}

export const getSharedGameState = () => ({ ...readState() })

export const setSharedGameStateFlag = (key, value) => {
  readState()
  state.flags[key] = value
  writeState()
  dispatchChange()
}

export const clearSharedGameStateFlag = (key) => {
  readState()
  delete state.flags[key]
  writeState()
  dispatchChange()
}

export const setSharedGameState = (partial) => {
  readState()
  Object.assign(state, partial)
  writeState()
  dispatchChange()
}

export const resetSharedGameState = () => {
  state = { flags: {}, currentChapter: null, baseBuilding: null }
  if (typeof window !== 'undefined' && window.localStorage) {
    try { window.localStorage.removeItem(STORAGE_KEY) } catch {}
  }
  dispatchChange()
}

export const subscribeSharedGameState = (listener) => {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return () => {}
  if (typeof listener !== 'function') return () => {}

  const handler = (event) => {
    listener(event?.detail?.state || getSharedGameState())
  }

  window.addEventListener(EVENT_NAME, handler)
  return () => window.removeEventListener(EVENT_NAME, handler)
}
