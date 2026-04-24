/**
 * useCharacterState.js — Vue composable 包装层
 * 为 Vue 组件提供响应式的角色状态访问
 */
import { computed, ref } from 'vue'
import {
  getCharacterState,
  updateCharacterState,
  applyDelta,
  removeCharacterState,
} from '../services/characterStateStore.js'

/**
 * @param {string} bookId
 * @param {string} charId
 * @returns {{ state: import('vue').Ref, loading: import('vue').Ref, update: Function, applyDelta: Function, refresh: Function, remove: Function }}
 */
export function useCharacterState(bookId, charId) {
  const state = ref(null)
  const loading = ref(false)

  async function refresh() {
    loading.value = true
    try {
      state.value = await getCharacterState(bookId, charId)
    } finally {
      loading.value = false
    }
  }

  async function update(partial) {
    const updated = await updateCharacterState(bookId, charId, partial)
    state.value = updated
    return updated
  }

  async function applyDeltaFn(deltas, reason = '') {
    const result = await applyDelta(bookId, charId, deltas, reason)
    state.value = result.newState
    return result
  }

  async function remove() {
    await removeCharacterState(bookId, charId)
    state.value = null
  }

  const affection = computed(() => state.value?.affection ?? 0)
  const energy = computed(() => state.value?.energy ?? 50)
  const mood = computed(() => state.value?.mood ?? '平静')
  const favor = computed(() => state.value?.favor ?? 0)
  const relationshipStage = computed(() => state.value?.relationshipStage ?? 'stranger')

  return {
    state,
    loading,
    affection,
    energy,
    mood,
    favor,
    relationshipStage,
    update,
    applyDelta: applyDeltaFn,
    refresh,
    remove,
  }
}
