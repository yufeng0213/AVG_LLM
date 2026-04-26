import { ref, computed, watch } from 'vue'
import { generateBaseConfig } from '../services/baseConfigGeneration.js'
import { generateRandomEvent } from '../services/baseEventGeneration.js'

const TICK_INTERVAL_MS = 60000 // 1 minute per tick
const STORAGE_KEY_CONFIG = 'avg_llm_base_config'
const STORAGE_KEY_STATE = (worldBookId) => `avg_llm_base_state_${worldBookId}`

function loadConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CONFIG)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function saveConfig(config) {
  try { localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(config)) } catch {}
}

function loadState(worldBookId) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_STATE(worldBookId))
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function saveState(worldBookId, state) {
  try { localStorage.setItem(STORAGE_KEY_STATE(worldBookId), JSON.stringify(state)) } catch {}
}

function createDefaultState() {
  return {
    version: 1,
    unlocked: false,
    day: 1,
    lastTickTimestamp: Date.now(),
    resources: {},
    facilities: {},
    workers: {},
    activeEvents: [],
    eventLog: [],
    stats: { daysSurvived: 0, totalProduced: {}, eventsResolved: 0 },
  }
}

function parseOutputString(output) {
  // "resource_id:count" or "capacity:50"
  const parts = output.split(':')
  return { resourceId: parts[0], count: parseInt(parts[1], 10) || 0 }
}

export function useBaseBuilding({ worldBookId, worldBook, userProfile, sharedGameState }) {
  const config = ref(loadConfig())
  const state = ref(loadState(worldBookId.value) || createDefaultState())
  const isInitializing = ref(false)
  const isProcessing = ref(false)

  let tickTimer = null

  // Safe computed helpers
  const allResourceDefs = computed(() => {
    if (!config.value) return []
    return config.value.resourceCategories.flatMap(cat =>
      cat.resources.map(r => ({ ...r, category: cat.key, categoryLabel: cat.label }))
    )
  })

  const allFacilityDefs = computed(() => {
    if (!config.value) return []
    return config.value.facilityCategories.flatMap(cat =>
      cat.facilities.map(f => ({ ...f, category: cat.key, categoryLabel: cat.label }))
    )
  })

  const resourceInventory = computed(() => {
    return allResourceDefs.value.map(def => ({
      ...def,
      current: state.value.resources[def.id]?.current || 0,
      max: state.value.resources[def.id]?.max || 999,
    }))
  })

  const facilityInstances = computed(() => {
    return allFacilityDefs.value.map(def => ({
      ...def,
      instance: state.value.facilities[def.id] || null,
    }))
  })

  const workerAssignments = computed(() => state.value.workers)

  // Check if base is unlocked (via sharedGameState flag or state.unlocked)
  const isUnlocked = computed(() => {
    if (state.value.unlocked) return true
    const flags = sharedGameState?.flags || {}
    return Boolean(flags.base_building_unlocked)
  })

  async function initialize() {
    // Sync unlock flag
    if (!state.value.unlocked) {
      const flags = sharedGameState?.flags || {}
      if (flags.base_building_unlocked) {
        state.value.unlocked = true
        saveState(worldBookId.value, state.value)
      }
    }

    if (!isUnlocked.value) return

    if (config.value) return // Already generated

    isInitializing.value = true
    try {
      const newConfig = await generateBaseConfig({
        worldBook: worldBook?.value || worldBook || {},
        userProfile: userProfile || {},
      })
      config.value = newConfig
      saveConfig(newConfig)

      // Initialize resources from config
      const resources = {}
      newConfig.resourceCategories.forEach(cat => {
        cat.resources.forEach(res => {
          resources[res.id] = { current: 0, max: 999 }
        })
      })

      // Give starting resources
      resources.canned_food = { current: 20, max: 999 }
      resources.purified_water = { current: 15, max: 999 }
      resources.scrap_iron = { current: 10, max: 999 }

      state.value.resources = resources
      state.value.unlocked = true
      saveState(worldBookId.value, state.value)
    } finally {
      isInitializing.value = false
    }
  }

  function upgradeFacility(facilityId) {
    const def = allFacilityDefs.value.find(f => f.id === facilityId)
    if (!def) return { ok: false, error: '设施不存在' }

    const instance = state.value.facilities[facilityId] || { level: 1, status: 'active' }
    if (instance.level >= 5) return { ok: false, error: '已达最高等级' }
    if (instance.status === 'building') return { ok: false, error: '正在建造中' }

    const cost = def.upgradeCost || {}
    // Check resources
    for (const [resId, amount] of Object.entries(cost)) {
      const current = state.value.resources[resId]?.current || 0
      if (current < amount) return { ok: false, error: `资源不足: ${resId}` }
    }

    // Deduct resources
    for (const [resId, amount] of Object.entries(cost)) {
      state.value.resources[resId].current -= amount
    }

    instance.status = 'building'
    instance.buildCompletesAt = Date.now() + 5000 // 5 seconds build time for demo
    state.value.facilities[facilityId] = instance
    saveState(worldBookId.value, state.value)

    // Complete after delay
    setTimeout(() => {
      instance.level = (instance.level || 1) + 1
      instance.status = 'active'
      delete instance.buildCompletesAt
      state.value.facilities[facilityId] = instance
      saveState(worldBookId.value, state.value)
    }, 5000)

    return { ok: true }
  }

  function assignWorker(charId, facilityId) {
    const def = allFacilityDefs.value.find(f => f.id === facilityId)
    if (!def) return { ok: false, error: '设施不存在' }

    // Check if character already assigned
    if (state.value.workers[charId]) {
      return { ok: false, error: '角色已在工作中' }
    }

    // Count workers at facility
    const facilityWorkers = Object.values(state.value.workers).filter(w => w.facilityId === facilityId)
    if (facilityWorkers.length >= 3) {
      return { ok: false, error: '设施工人已满' }
    }

    state.value.workers[charId] = {
      facilityId,
      fatigue: 0,
      assignedAt: Date.now(),
    }
    saveState(worldBookId.value, state.value)
    return { ok: true }
  }

  function removeWorker(charId) {
    if (state.value.workers[charId]) {
      delete state.value.workers[charId]
      saveState(worldBookId.value, state.value)
    }
  }

  function tickProduction() {
    state.value.day += 1
    state.value.stats.daysSurvived = state.value.day

    // Process each facility
    allFacilityDefs.value.forEach(def => {
      const instance = state.value.facilities[def.id]
      if (!instance || instance.status !== 'active') return

      const { resourceId, count } = parseOutputString(def.output || ':0')
      if (!resourceId || !count) return

      // Count workers at this facility
      const workersAtFacility = Object.values(state.value.workers).filter(w => w.facilityId === def.id)
      const workerBonus = 1 + workersAtFacility.length * 0.2 // +20% per worker

      const totalOutput = Math.round(count * (instance.level || 1) * workerBonus)

      if (!state.value.resources[resourceId]) {
        state.value.resources[resourceId] = { current: 0, max: 999 }
      }
      state.value.resources[resourceId].current = Math.min(
        state.value.resources[resourceId].current + totalOutput,
        state.value.resources[resourceId].max
      )

      // Track stats
      state.value.stats.totalProduced[resourceId] =
        (state.value.stats.totalProduced[resourceId] || 0) + totalOutput
    })

    // Worker fatigue
    Object.keys(state.value.workers).forEach(charId => {
      const worker = state.value.workers[charId]
      worker.fatigue = Math.min(100, (worker.fatigue || 0) + 5)
      if (worker.fatigue >= 100) {
        delete state.value.workers[charId] // Worker quits from exhaustion
      }
    })

    state.value.lastTickTimestamp = Date.now()
    saveState(worldBookId.value, state.value)
  }

  async function triggerRandomEvent() {
    const shouldTrigger = Math.random() < 0.3 // 30% chance per tick
    if (!shouldTrigger) return null

    isProcessing.value = true
    try {
      const event = await generateRandomEvent({
        worldBook: worldBook?.value || worldBook || {},
        state: state.value,
        config: config.value,
      })

      event.expiresAt = Date.now() + TICK_INTERVAL_MS * 3 // Expires in 3 ticks
      state.value.activeEvents.push(event)
      saveState(worldBookId.value, state.value)
      return event
    } finally {
      isProcessing.value = false
    }
  }

  function resolveEvent(eventId, optionId) {
    const eventIndex = state.value.activeEvents.findIndex(e => e.id === eventId)
    if (eventIndex === -1) return { ok: false, error: '事件不存在' }

    const event = state.value.activeEvents[eventIndex]
    const option = event.options.find(o => o.id === optionId)
    if (!option) return { ok: false, error: '选项不存在' }

    // Apply costs
    if (option.cost) {
      for (const [resId, amount] of Object.entries(option.cost)) {
        if (!state.value.resources[resId]) continue
        state.value.resources[resId].current = Math.max(
          0,
          state.value.resources[resId].current - Math.abs(amount)
        )
      }
    }

    // Apply effects
    if (option.effects) {
      for (const [resId, amount] of Object.entries(option.effects)) {
        if (!state.value.resources[resId]) {
          state.value.resources[resId] = { current: 0, max: 999 }
        }
        state.value.resources[resId].current = Math.max(
          0,
          Math.min(
            state.value.resources[resId].current + amount,
            state.value.resources[resId].max
          )
        )
      }
    }

    // Log
    state.value.eventLog.push({
      eventId,
      optionId,
      title: event.title,
      outcome: option.outcome,
      timestamp: Date.now(),
    })
    state.value.stats.eventsResolved += 1

    // Remove event
    state.value.activeEvents.splice(eventIndex, 1)
    saveState(worldBookId.value, state.value)

    return { ok: true, outcome: option.outcome }
  }

  function startAutoTick() {
    if (tickTimer) return
    tickTimer = setInterval(() => {
      if (!isUnlocked.value) return
      tickProduction()
      triggerRandomEvent()

      // Expire old events
      const now = Date.now()
      state.value.activeEvents = state.value.activeEvents.filter(e => {
        if (e.expiresAt && e.expiresAt < now) return false
        return true
      })
    }, TICK_INTERVAL_MS)
  }

  function stopAutoTick() {
    if (tickTimer) {
      clearInterval(tickTimer)
      tickTimer = null
    }
  }

  function reset() {
    stopAutoTick()
    state.value = createDefaultState()
    saveState(worldBookId.value, state.value)
  }

  // Watch worldBookId changes -> reload state
  watch(worldBookId, (newId) => {
    const saved = loadState(newId)
    state.value = saved || createDefaultState()
  })

  return {
    config,
    state,
    isInitializing,
    isProcessing,
    isUnlocked,
    allResourceDefs,
    allFacilityDefs,
    resourceInventory,
    facilityInstances,
    workerAssignments,
    initialize,
    upgradeFacility,
    assignWorker,
    removeWorker,
    tickProduction,
    triggerRandomEvent,
    resolveEvent,
    startAutoTick,
    stopAutoTick,
    reset,
  }
}
