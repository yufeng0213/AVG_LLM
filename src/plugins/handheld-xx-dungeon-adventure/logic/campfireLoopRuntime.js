export const createEmptyCampfireBubble = () => ({ companionId: '', text: '' })

export const createCampfireLoopRuntimeState = () => ({
  bubbleTimer: null,
  bubbleInitTimer: null,
  bubbleBusy: false,
  frameTimer: null,
})

export const shouldRunCampfireBubbleLoop = (options = {}) => {
  const {
    panelOpen = false,
    currentView = '',
    companionCount = 0,
  } = options || {}
  return Boolean(panelOpen && currentView === 'home' && Number(companionCount) > 0)
}

export const shouldRunCampfireFrameLoop = (options = {}) => {
  const {
    panelOpen = false,
    currentView = '',
  } = options || {}
  return Boolean(panelOpen && currentView === 'home')
}

export const resolveCampfireSpeakerIndex = (cursor = 0, listLength = 0) => {
  const length = Number(listLength) || 0
  if (length <= 0) return 0
  const raw = Number(cursor) || 0
  return ((raw % length) + length) % length
}

export const stopCampfireBubbleLoop = (runtimeState, options = {}) => {
  if (!runtimeState || typeof runtimeState !== 'object') return
  if (runtimeState.bubbleInitTimer) {
    clearTimeout(runtimeState.bubbleInitTimer)
    runtimeState.bubbleInitTimer = null
  }
  if (runtimeState.bubbleTimer) {
    clearInterval(runtimeState.bubbleTimer)
    runtimeState.bubbleTimer = null
  }
  runtimeState.bubbleBusy = false
  if (typeof options?.onStop === 'function') {
    options.onStop()
  }
}

export const startCampfireBubbleLoop = (runtimeState, options = {}) => {
  if (!runtimeState || typeof runtimeState !== 'object') return
  const {
    shouldRun = null,
    rotateOnce = null,
    intervalMs = 6400,
    bootDelayMs = 900,
  } = options || {}
  if (typeof shouldRun !== 'function' || !shouldRun()) return
  if (runtimeState.bubbleTimer || runtimeState.bubbleInitTimer) return
  runtimeState.bubbleInitTimer = setTimeout(() => {
    runtimeState.bubbleInitTimer = null
    if (typeof rotateOnce === 'function') {
      void rotateOnce()
    }
    runtimeState.bubbleTimer = setInterval(() => {
      if (typeof rotateOnce === 'function') {
        void rotateOnce()
      }
    }, intervalMs)
  }, bootDelayMs)
}

export const stopCampfireFrameLoop = (runtimeState) => {
  if (!runtimeState || typeof runtimeState !== 'object') return
  if (runtimeState.frameTimer) {
    clearInterval(runtimeState.frameTimer)
    runtimeState.frameTimer = null
  }
}

export const startCampfireFrameLoop = (runtimeState, options = {}) => {
  if (!runtimeState || typeof runtimeState !== 'object') return
  const {
    shouldRun = null,
    onTick = null,
    intervalMs = 720,
  } = options || {}
  if (typeof shouldRun !== 'function' || !shouldRun()) return
  if (runtimeState.frameTimer) return
  runtimeState.frameTimer = setInterval(() => {
    if (typeof onTick === 'function') {
      onTick()
    }
  }, intervalMs)
}
