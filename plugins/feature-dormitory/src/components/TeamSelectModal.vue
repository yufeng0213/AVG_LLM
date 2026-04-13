<script setup>
/**
 * 组队选择界面
 * 从世界书角色中选择队友（最多3人，加上玩家共4人）
 */

import { computed, ref } from 'vue'

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false,
  },
  worldBook: {
    type: Object,
    default: () => ({}),
  },
  userProfile: {
    type: Object,
    default: () => ({}),
  },
})

const emit = defineEmits(['close', 'start-battle'])

const selectedIds = ref(new Set())

const safeCharacters = computed(() => {
  const chars = props.worldBook?.characters
  return Array.isArray(chars) ? chars.filter(Boolean) : []
})

const selectedList = computed(() => {
  return safeCharacters.value.filter(c => selectedIds.value.has(c.id))
})

const teamSize = computed(() => selectedIds.value.size)
const maxSlots = 3

function toggleSelect(charId) {
  const next = new Set(selectedIds.value)
  if (next.has(charId)) {
    next.delete(charId)
  } else {
    if (next.size >= maxSlots) return
    next.add(charId)
  }
  selectedIds.value = next
}

function canStartBattle() {
  return selectedIds.value.size >= 1
}

function handleStartBattle() {
  if (!canStartBattle()) return
  const selected = safeCharacters.value.filter(c => selectedIds.value.has(c.id))
  emit('start-battle', selected)
}

function handleClose() {
  selectedIds.value = new Set()
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <Transition name="team-panel-modal">
      <div v-if="isOpen" class="team-select-overlay" @click.self="handleClose">
        <section class="team-select-panel">
          <!-- Header -->
          <header class="team-select-header">
            <div class="team-header-left">
              <h2 class="team-title">组队</h2>
              <span class="team-count">已选 {{ teamSize }}/{{ maxSlots }}</span>
            </div>
            <button type="button" class="team-close-btn" @click="handleClose">×</button>
          </header>

          <!-- 玩家（自动加入） -->
          <div class="team-player-section">
            <span class="team-player-label">玩家</span>
            <div class="team-player-card">
              <span class="player-icon">🧑</span>
              <span class="player-name">{{ userProfile.name || '玩家' }}</span>
            </div>
          </div>

          <!-- 可选角色列表 -->
          <div class="team-characters-section">
            <p class="section-hint">选择队友（至少1人，最多{{ maxSlots }}人）</p>
            <div class="characters-grid">
              <div
                v-for="char in safeCharacters"
                :key="char.id"
                class="character-card"
                :class="{ selected: selectedIds.has(char.id) }"
                @click="toggleSelect(char.id)"
              >
                <div class="char-avatar">
                  <span v-if="char.portraits?.[0]" class="char-portrait">
                    <img :src="char.portraits[0]" :alt="char.name" />
                  </span>
                  <span v-else class="char-avatar-placeholder">👤</span>
                  <span v-if="selectedIds.has(char.id)" class="char-check">✓</span>
                </div>
                <span class="char-name">{{ char.name }}</span>
                <span v-if="char.identity" class="char-identity">{{ char.identity }}</span>
              </div>

              <div v-if="safeCharacters.length === 0" class="empty-characters">
                世界书中暂无可选角色
              </div>
            </div>
          </div>

          <!-- 已选队伍预览 -->
          <div class="team-preview-section">
            <p class="section-hint">队伍预览</p>
            <div class="team-slots">
              <!-- 玩家固定第一个 -->
              <div class="team-slot is-player">
                <span class="slot-avatar">🧑</span>
                <span class="slot-name">{{ userProfile.name || '玩家' }}</span>
              </div>
              <!-- 已选角色 -->
              <div
                v-for="char in selectedList"
                :key="char.id"
                class="team-slot"
              >
                <span class="slot-avatar">
                  <template v-if="char.portraits?.[0]">
                    <img :src="char.portraits[0]" :alt="char.name" />
                  </template>
                  <template v-else>👤</template>
                </span>
                <span class="slot-name">{{ char.name }}</span>
              </div>
              <!-- 空位 -->
              <div
                v-for="i in (maxSlots - teamSize)"
                :key="'empty-' + i"
                class="team-slot is-empty"
              >
                <span class="slot-avatar">?</span>
                <span class="slot-name">空位</span>
              </div>
            </div>
          </div>

          <!-- 进入战斗按钮 -->
          <div class="team-footer">
            <button
              type="button"
              class="team-start-btn"
              :class="{ disabled: !canStartBattle() }"
              :disabled="!canStartBattle()"
              @click="handleStartBattle"
            >
              ⚔️ 进入战斗
            </button>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.team-panel-modal-enter-active,
.team-panel-modal-leave-active {
  transition: opacity 0.3s ease;
}

.team-panel-modal-enter-from,
.team-panel-modal-leave-to {
  opacity: 0;
}

.team-select-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--background, #0a0a0a);
  color: var(--foreground, #ffffff);
  z-index: 1000;
  display: flex;
  flex-direction: column;
}

.team-select-panel {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Header */
.team-select-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  flex-shrink: 0;
}

.team-header-left {
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.team-title {
  font-size: 20px;
  font-weight: 700;
  margin: 0;
}

.team-count {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
}

.team-close-btn {
  width: 36px;
  height: 36px;
  border: none;
  background: rgba(255, 255, 255, 0.1);
  color: var(--foreground, #fff);
  font-size: 22px;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
}

.team-close-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

/* Player section */
.team-player-section {
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}

.team-player-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  display: block;
  margin-bottom: 8px;
}

.team-player-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 10px;
}

.player-icon {
  font-size: 24px;
}

.player-name {
  font-size: 15px;
  font-weight: 600;
}

/* Characters grid */
.team-characters-section {
  padding: 12px 16px;
  flex: 1;
  overflow-y: auto;
}

.section-hint {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
  margin: 0 0 10px;
}

.characters-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
  gap: 10px;
}

.character-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 8px;
  background: rgba(255, 255, 255, 0.05);
  border: 2px solid transparent;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
  user-select: none;
  position: relative;
}

.character-card:hover {
  background: rgba(255, 255, 255, 0.1);
}

.character-card.selected {
  border-color: #3b82f6;
  background: rgba(59, 130, 246, 0.15);
}

.char-avatar {
  position: relative;
  width: 50px;
  height: 50px;
  border-radius: 50%;
  overflow: hidden;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.1);
}

.char-portrait img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.char-avatar-placeholder {
  font-size: 24px;
}

.char-check {
  position: absolute;
  bottom: -2px;
  right: -2px;
  width: 20px;
  height: 20px;
  background: #3b82f6;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  color: #fff;
}

.char-name {
  font-size: 13px;
  font-weight: 600;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.char-identity {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.4);
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
  margin-top: 2px;
}

.empty-characters {
  grid-column: 1 / -1;
  text-align: center;
  padding: 32px;
  color: rgba(255, 255, 255, 0.3);
  font-size: 14px;
}

/* Team preview */
.team-preview-section {
  padding: 12px 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}

.team-slots {
  display: flex;
  gap: 10px;
}

.team-slot {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 6px;
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.3);
  border-radius: 10px;
}

.team-slot.is-player {
  background: rgba(234, 179, 8, 0.1);
  border-color: rgba(234, 179, 8, 0.3);
}

.team-slot.is-empty {
  background: rgba(255, 255, 255, 0.03);
  border-color: rgba(255, 255, 255, 0.1);
}

.slot-avatar {
  font-size: 20px;
}

.slot-avatar img {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  object-fit: cover;
}

.slot-name {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.6);
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

/* Footer */
.team-footer {
  padding: 12px 16px;
  padding-bottom: max(12px, env(safe-area-inset-bottom));
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}

.team-start-btn {
  width: 100%;
  padding: 14px;
  border: none;
  border-radius: 12px;
  font-size: 16px;
  font-weight: 700;
  color: #fff;
  background: linear-gradient(135deg, #dc2626, #b91c1c);
  cursor: pointer;
  transition: all 0.2s;
}

.team-start-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #ef4444, #dc2626);
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(220, 38, 38, 0.4);
}

.team-start-btn.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
