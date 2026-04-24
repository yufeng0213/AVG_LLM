<script setup>
/**
 * 角色梦境浏览组件 — 查看各个角色的梦境/深夜独白
 */
import './DreamScreen.css'
import { computed, onMounted, ref, watch } from 'vue'
import { loadWorldBooks, getActiveWorldBookId } from '../worldbook/worldBookStore.js'
import { getWorldMemory } from '../memory/worldMemoryStore.js'

const emit = defineEmits(['back'])

const loading = ref(false)
const worldBook = ref(null)
const worldMemory = ref(null)
const selectedCharId = ref(null)
const charDreams = ref({})

onMounted(async () => {
  await loadData()
})

async function loadData() {
  try {
    const books = await loadWorldBooks()
    const activeId = await getActiveWorldBookId()
    worldBook.value = books.find(b => b.id === activeId) || books[0] || null

    if (worldBook.value) {
      worldMemory.value = await getWorldMemory(worldBook.value.id)
      loadDreamsFromMemory()
    }
  } catch (e) {
    console.warn('[Dreams] load data failed:', e.message)
  }
}

function loadDreamsFromMemory() {
  const dreams = {}
  const events = worldMemory.value?.events || []

  for (const evt of events) {
    if (evt.type === 'character_dream' && evt.participants?.length > 0) {
      const charId = evt.participants[0]
      if (!dreams[charId]) dreams[charId] = []
      dreams[charId].push({
        id: evt.id,
        characterName: resolveName(charId),
        text: evt.summary || '',
        createdAt: evt.createdAt,
        dreamMood: evt.dreamMood,
        type: 'dream',
        charId,
      })
    }

    const charMemories = worldMemory.value?.characterMemories
    if (charMemories) {
      for (const [charId, memories] of Object.entries(charMemories)) {
        if (Array.isArray(memories)) {
          for (const mem of memories) {
            if (mem.type === 'dream') {
              if (!dreams[charId]) dreams[charId] = []
              dreams[charId].push({
                id: mem.id,
                characterName: resolveName(charId),
                text: mem.content || '',
                createdAt: mem.createdAt,
                dreamMood: null,
                type: 'dream',
                charId,
              })
            }
          }
        }
      }
    }
  }

  charDreams.value = dreams
}

const characters = computed(() => worldBook.value?.characters || [])

const displayDreams = computed(() => {
  if (selectedCharId.value) {
    return charDreams.value[selectedCharId.value] || []
  }
  const all = []
  for (const [, dreams] of Object.entries(charDreams.value)) {
    all.push(...dreams)
  }
  return all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
})

async function refresh() {
  if (loading.value) return
  loading.value = true
  try {
    const { runDreamGeneration } = await import('../services/characterDreamService.js')
    await runDreamGeneration({
      worldBook: worldBook.value,
      worldMemory: worldMemory.value,
      relationships: worldBook.value?.relationships,
    })
    worldMemory.value = await getWorldMemory(worldBook.value.id)
    loadDreamsFromMemory()
  } catch (e) {
    console.warn('[Dreams] generate failed:', e.message)
  } finally {
    loading.value = false
  }
}

function resolveName(charId) {
  if (charId === '__player__') return '玩家'
  const char = worldBook.value?.characters?.find(c => c.id === charId)
  return char?.name || charId
}

function formatTime(iso) {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    const now = new Date()
    const diffMs = now - d
    const diffMin = Math.floor(diffMs / 60000)
    if (diffMin < 1) return '刚刚'
    if (diffMin < 60) return `${diffMin}分钟前`
    const diffHour = Math.floor(diffMin / 60)
    if (diffHour < 24) return `${diffHour}小时前`
    const diffDay = Math.floor(diffHour / 24)
    if (diffDay < 7) return `${diffDay}天前`
    return `${d.getMonth() + 1}/${d.getDate()}`
  } catch {
    return ''
  }
}

watch(() => worldMemory.value, () => {
  loadDreamsFromMemory()
})
</script>

<template>
  <div class="dream-screen">
    <div class="dream-header">
      <button class="dream-back-btn" @click="$emit('back')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        返回
      </button>
      <span class="dream-title">
        <span class="dream-title-glow"></span>
        梦境
      </span>
      <button class="dream-refresh-btn" @click="refresh" :disabled="loading">
        {{ loading ? '生成中...' : '✨ 生成' }}
      </button>
    </div>

    <div class="dream-content">
      <!-- 角色选择 -->
      <div class="dream-char-bar">
        <div
          v-for="char in characters"
          :key="char.id"
          class="dream-char-item"
          :class="{ active: selectedCharId === char.id }"
          @click="selectedCharId = selectedCharId === char.id ? null : char.id"
        >
          <div class="dream-char-avatar">{{ char.name?.charAt(0) || '?' }}</div>
          <span class="dream-char-name">{{ char.name }}</span>
          <span v-if="charDreams[char.id]?.length" class="dream-char-count">
            {{ charDreams[char.id].length }}
          </span>
        </div>
      </div>

      <!-- 梦境列表 -->
      <div class="dream-list" v-if="displayDreams.length > 0">
        <div
          v-for="dream in displayDreams"
          :key="dream.id"
          class="dream-card"
        >
          <div class="dream-card-header">
            <span class="dream-card-char">
              <span class="dream-card-char-avatar">{{ dream.characterName?.charAt(0) || '?' }}</span>
              {{ dream.characterName }}
            </span>
            <span class="dream-card-time">{{ formatTime(dream.createdAt) }}</span>
          </div>
          <div class="dream-card-body">
            {{ dream.text }}
          </div>
          <div class="dream-card-footer">
            <span class="dream-card-mood" v-if="dream.dreamMood">🌙 {{ dream.dreamMood }}</span>
            <span class="dream-card-type" v-if="dream.type === 'dream'">梦境</span>
          </div>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-else class="dream-empty">
        <div class="dream-empty-icon">🌙</div>
        <p class="dream-empty-text">暂无梦境</p>
        <p class="dream-empty-hint">
          点击右上角「生成」为角色们生成梦境，<br>
          或等待每晚 23:00 自动触发。
        </p>
      </div>
    </div>
  </div>
</template>
