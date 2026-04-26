<script setup>
/**
 * 采集主界面
 * 三阶段：探索 → 小游戏 → 撤离 → 结算
 */

import { ref, computed, watch, nextTick } from 'vue'
import { useCollectGame } from './composables/useCollectGame.js'
import { generateCollectData } from './services/collectGenerationService.js'
import CollectMiniGame from './components/CollectMiniGame.vue'
import CollectBackpackPanel from './components/CollectBackpackPanel.vue'

const props = defineProps({
  isOpen: { type: Boolean, default: false },
  taskId: { type: String, default: '' },
  worldBook: { type: Object, default: () => ({}) },
  userProfile: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['close', 'collect-success', 'collect-fail'])

const {
  session,
  phase,
  exploreCount,
  collectedResources,
  totalPoints,
  miniGamesCompleted,
  createCollectSession,
  startExplore,
  revealCell,
  completeMiniGame,
  safeExit,
  moveEvacuation,
  reset,
  saveSession,
  loadSession: loadCollectSession,
  clearSession: clearCollectSession,
} = useCollectGame()

const generating = ref(false)
const generatingMessage = ref('正在生成采集区域...')
const showBackpack = ref(false)
const showIntro = ref(true)
const logEl = ref(null)

// 日志自动滚动
watch(() => session.log?.length, () => {
  nextTick(() => {
    if (logEl.value) logEl.value.scrollTop = logEl.value.scrollHeight
  })
})

watch(() => props.isOpen, async (val) => {
  if (val) {
    // 先尝试恢复
    const saved = loadCollectSession()
    if (saved && saved.taskId === props.taskId && saved.status === 'playing') {
      Object.assign(session, saved)
      showIntro.value = false
      generating.value = false
      return
    }
    // 开始探索开场故事
    await startCollect()
  } else {
    generating.value = false
    showBackpack.value = false
    if (showIntroTimer.value) clearTimeout(showIntroTimer.value)
  }
})

async function startCollect() {
  generating.value = true
  generatingMessage.value = '正在生成采集区域...'

  try {
    const result = await generateCollectData({
      task: { name: props.taskId, id: props.taskId },
      worldBook: props.worldBook,
      userProfile: props.userProfile,
    })

    if (!result.success || !result.data) {
      throw new Error(result.error || '生成失败')
    }

    const newSession = createCollectSession({
      taskId: props.taskId,
      collectData: result.data,
    })
    Object.assign(session, newSession)

    generating.value = false
    showIntro.value = true
  } catch (error) {
    console.error('[CollectScreen] 采集生成失败:', error)
    generating.value = false
    generatingMessage.value = `生成失败：${error.message}`
  }
}

function handleIntroClick() {
  showIntro.value = false
  startExplore()
}

function handleCellClick(index) {
  const result = revealCell(index)
  if (result?.type === 'event') {
    // 小游戏在组件内部触发
  }
}

function handleMiniGameComplete(success, bonus) {
  completeMiniGame(success, bonus)
}

function handleEvacClick(row, col) {
  moveEvacuation(row, col)
}

function handleSafeExit() {
  safeExit()
}

function handleCollectSuccess() {
  clearCollectSession()
  emit('collect-success', { taskId: props.taskId })
}

function handleCollectFail() {
  reset()
  emit('collect-fail', { taskId: props.taskId })
}

// ===== 工具方法 =====

function getCellClass(index) {
  if (!session.revealed?.[index]) return 'cell-hidden'
  const cell = session.grid?.[index]
  if (!cell) return 'cell-empty'
  return `cell-${cell.type} cell-revealed`
}

function getCellContent(index) {
  if (!session.revealed?.[index]) return ''
  const cell = session.grid?.[index]
  return cell?.icon || '·'
}

function getCellLabel(index) {
  if (!session.revealed?.[index]) return ''
  const cell = session.grid?.[index]
  if (cell?.type === 'resource') return cell.name
  if (cell?.type === 'trap') return cell.name
  if (cell?.type === 'obstacle') return cell.name
  if (cell?.type === 'event') return '特殊事件'
  return ''
}

function getEvacCellClass(row, col) {
  const idx = row * 3 + col
  if (row === session.evacPosition?.row && col === session.evacPosition?.col) return 'evac-current'
  const cell = session.evacuationGrid?.[idx]
  if (cell?.startsWith('revealed_')) return `evac-revealed-${cell.split('_')[1]}`
  return 'evac-hidden'
}

function getEvacContent(row, col) {
  const idx = row * 3 + col
  if (row === session.evacPosition?.row && col === session.evacPosition?.col) return '🧑'
  const cell = session.evacuationGrid?.[idx]
  if (cell?.startsWith('revealed_')) {
    const sub = cell.split('_')[1]
    return sub === 'danger' ? '💀' : sub === 'treasure' ? '💎' : '✓'
  }
  return '?'
}

function getLogClass(log) {
  if (log.startsWith('━━━')) return 'log-divider'
  if (log.includes('发现了')) return 'log-discover'
  if (log.includes('踩到了') || log.includes('触发了')) return 'log-trap'
  if (log.includes('失去')) return 'log-loss'
  if (log.includes('奖励') || log.includes('获得')) return 'log-bonus'
  return 'log-normal'
}

function formatLog(log) {
  if (log.startsWith('━━━')) return `<span class="log-divider-text">${log}</span>`
  return log.replace(/([📜🔮🍄⚡💎✨🌟🪨🌫️🕸️🧑💀✓])/g, '<span class="log-emoji">$1</span>')
}

function getRatingInfo() {
  const map = {
    perfect: { label: '完美采集', icon: '🌟', color: '#fbbf24', desc: '全部资源 + 小游戏成功 + 成功撤离' },
    excellent: { label: '优秀', icon: '✨', color: '#60a5fa', desc: '保存了70%以上资源' },
    normal: { label: '一般', icon: '👍', color: '#22c55e', desc: '保存了40%以上资源' },
    barely: { label: '勉强完成', icon: '😅', color: '#f97316', desc: '只带回少量资源' },
    failure: { label: '失败', icon: '💀', color: '#ef4444', desc: '没有带回任何资源' },
  }
  return map[session.rating] || map.failure
}

function canSelectEvac(row, col) {
  if (phase.value !== 'evacuate') return false
  if (session.evacStepsLeft <= 0) return false
  const { evacPosition } = session
  if (!evacPosition) return false
  const dRow = Math.abs(row - evacPosition.row)
  const dCol = Math.abs(col - evacPosition.col)
  return dRow + dCol === 1
}
</script>

<template>
  <Teleport to="body">
    <Transition name="collect-modal">
      <div v-if="isOpen" class="collect-overlay" @click.self="$emit('close')">
        <section class="collect-panel">
          <!-- Header -->
          <header class="collect-header">
            <button v-if="!generating && phase !== 'intro'" type="button" class="collect-back-btn" @click="$emit('close')">
              ←
            </button>
            <div class="collect-info" v-if="!generating && phase !== 'intro'">
              <span class="collect-phase-label">
                <span v-if="phase === 'explore'">🔍 探索中</span>
                <span v-else-if="phase === 'miniGame'">⭐ 特殊事件</span>
                <span v-else-if="phase === 'evacuate'">🏃 撤离中</span>
                <span v-else-if="phase === 'settle'">📊 结算</span>
              </span>
            </div>
            <button v-if="phase === 'explore'" type="button" class="collect-backpack-btn" @click="showBackpack = true">
              🎒
            </button>
          </header>

          <!-- 生成中 -->
          <div v-if="generating" class="collect-generating">
            <div class="generating-spinner"></div>
            <p class="generating-text">{{ generatingMessage }}</p>
          </div>

          <!-- 开场故事 -->
          <div v-else-if="showIntro && session.story" class="collect-intro" @click="handleIntroClick">
            <div class="intro-content">
              <h3 class="intro-title">📜 {{ taskId || '采集任务' }}</h3>
              <p class="intro-story">{{ session.story }}</p>
              <p class="intro-hint">— 点击任意位置继续 —</p>
            </div>
          </div>

          <!-- 探索阶段 -->
          <div v-else-if="phase === 'explore' || phase === 'miniGame'" class="collect-explore">
            <!-- 状态栏 -->
            <div class="explore-stats">
              <div class="stat-item">
                <span class="stat-label">探索次数</span>
                <span class="stat-value" :class="{ low: exploreCount <= 2 }">{{ exploreCount }}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">已收集</span>
                <span class="stat-value gold">{{ collectedResources.length }}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">总积分</span>
                <span class="stat-value">{{ totalPoints }}</span>
              </div>
            </div>

            <!-- 网格 -->
            <div class="explore-grid">
              <div
                v-for="(cell, index) in session.grid"
                :key="index"
                class="explore-cell"
                :class="getCellClass(index)"
                @click="handleCellClick(index)"
              >
                <span v-if="!session.revealed[index]" class="cell-question">?</span>
                <template v-else>
                  <span class="cell-icon">{{ getCellContent(index) }}</span>
                  <span class="cell-label">{{ getCellLabel(index) }}</span>
                </template>
              </div>
            </div>

            <!-- 安全退出按钮 -->
            <button v-if="collectedResources.length > 0" type="button" class="safe-exit-btn" @click="handleSafeExit">
              🏃 安全退出（{{ collectedResources.length }} 个资源）
            </button>

            <!-- 小游戏弹窗 -->
            <CollectMiniGame
              v-if="phase === 'miniGame' && session.pendingMiniGame"
              :type="session.pendingMiniGame"
              @complete="handleMiniGameComplete"
            />
          </div>

          <!-- 撤离阶段 -->
          <div v-else-if="phase === 'evacuate'" class="collect-evacuate">
            <div class="evac-story">{{ session.collectData?.evacuationStory || '找到出路...' }}</div>

            <div class="evac-stats">
              <span>携带资源：{{ session.evacuatedResources?.length || 0 }}</span>
              <span>剩余步数：{{ session.evacStepsLeft }}</span>
              <span class="evac-target">目标：→ 右上角</span>
            </div>

            <div class="evac-grid">
              <div
                v-for="row in 3"
                :key="row"
                class="evac-row"
              >
                <div
                  v-for="col in 3"
                  :key="col"
                  class="evac-cell"
                  :class="getEvacCellClass(row - 1, col - 1)"
                  :data-clickable="canSelectEvac(row - 1, col - 1)"
                  @click="canSelectEvac(row - 1, col - 1) ? handleEvacClick(row - 1, col - 1) : null"
                >
                  {{ getEvacContent(row - 1, col - 1) }}
                </div>
              </div>
            </div>

            <div class="evac-legend">
              <span><span class="legend-icon">💀</span> 追兵</span>
              <span><span class="legend-icon">💎</span> 宝藏</span>
              <span><span class="legend-icon">✓</span> 安全</span>
            </div>
          </div>

          <!-- 结算阶段 -->
          <div v-else-if="phase === 'settle'" class="collect-settle">
            <div class="settle-content">
              <div class="settle-rating" :style="{ color: getRatingInfo().color }">
                <span class="settle-icon">{{ getRatingInfo().icon }}</span>
                <h3>{{ getRatingInfo().label }}</h3>
                <p>{{ getRatingInfo().desc }}</p>
              </div>

              <div class="settle-details">
                <div class="detail-row">
                  <span>收集资源</span>
                  <span>{{ collectedResources.length }} 个</span>
                </div>
                <div class="detail-row">
                  <span>带回资源</span>
                  <span>{{ session.savedResources?.length || 0 }} 个</span>
                </div>
                <div class="detail-row" v-if="session.lostResources?.length > 0">
                  <span>丢失资源</span>
                  <span class="loss">{{ session.lostResources.length }} 个</span>
                </div>
                <div class="detail-row">
                  <span>小游戏成功</span>
                  <span>{{ miniGamesCompleted }} 次</span>
                </div>
                <div class="detail-row highlight">
                  <span>倍率</span>
                  <span>×{{ session.multiplier?.toFixed(1) || '0.0' }}</span>
                </div>
                <div class="detail-row total">
                  <span>最终积分</span>
                  <span>{{ session.finalPoints || 0 }}</span>
                </div>
              </div>

              <div class="settle-actions">
                <button
                  v-if="session.status === 'succeeded'"
                  type="button"
                  class="settle-done-btn"
                  @click="handleCollectSuccess"
                >
                  领取奖励
                </button>
                <button
                  v-else
                  type="button"
                  class="settle-retry-btn"
                  @click="handleCollectFail"
                >
                  重试
                </button>
              </div>
            </div>
          </div>

          <!-- 战斗日志风格日志 -->
          <div v-if="!generating && phase !== 'intro' && session.log?.length > 0" class="collect-log" ref="logEl">
            <div class="log-entry" v-for="(log, i) in session.log" :key="i" :class="getLogClass(log)">
              <span v-html="formatLog(log)"></span>
            </div>
          </div>
        </section>

        <!-- 采集背包 -->
        <CollectBackpackPanel
          :is-open="showBackpack"
          :items="collectedResources"
          @close="showBackpack = false"
        />
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.collect-modal-enter-active { transition: opacity 0.3s ease; }
.collect-modal-leave-active { transition: opacity 0.25s ease; }
.collect-modal-enter-from, .collect-modal-leave-to { opacity: 0; }

.collect-overlay {
  position: fixed; inset: 0; z-index: 1000;
  display: flex; flex-direction: column;
  background: radial-gradient(ellipse at 50% 0%, #1a1a0e 0%, #0d0d05 50%, #050502 100%);
  color: #ffffff; overflow: hidden;
}

.collect-panel {
  width: 100%; height: 100%; display: flex; flex-direction: column;
  overflow: hidden; position: relative; z-index: 1;
}

/* Header */
.collect-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 16px; flex-shrink: 0;
  background: linear-gradient(180deg, rgba(26, 26, 14, 0.9), rgba(13, 13, 5, 0.6));
  backdrop-filter: blur(12px); border-bottom: 1px solid rgba(251, 191, 36, 0.15);
}

.collect-back-btn, .collect-backpack-btn {
  width: 38px; height: 38px; border: 1px solid rgba(251, 191, 36, 0.2);
  background: rgba(251, 191, 36, 0.08); color: #fbbf24; font-size: 18px;
  border-radius: 10px; cursor: pointer; display: flex; align-items: center;
  justify-content: center; transition: all 0.2s;
}
.collect-back-btn:hover, .collect-backpack-btn:hover {
  background: rgba(251, 191, 36, 0.15); border-color: rgba(251, 191, 36, 0.4);
}

.collect-info { flex: 1; text-align: center; }
.collect-phase-label { font-size: 14px; font-weight: 700; color: #fbbf24; }

/* Generating */
.collect-generating {
  flex: 1; display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 16px;
}
.generating-spinner {
  width: 56px; height: 56px; border: 3px solid rgba(251, 191, 36, 0.1);
  border-top-color: #fbbf24; border-radius: 50%; animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.generating-text { font-size: 14px; color: rgba(251, 191, 36, 0.6); text-align: center; animation: text-fade 1.5s ease-in-out infinite; }
@keyframes text-fade { 0%, 100% { opacity: 0.6; } 50% { opacity: 1; } }

/* Intro */
.collect-intro {
  flex: 1; display: flex; align-items: center; justify-content: center; padding: 24px; cursor: pointer;
}
.intro-content {
  max-width: 480px; text-align: center;
  animation: intro-fade-in 1.5s ease-out;
}
@keyframes intro-fade-in { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
.intro-title { font-size: 18px; color: #fbbf24; margin-bottom: 16px; }
.intro-story { font-size: 14px; color: rgba(255, 255, 255, 0.7); line-height: 1.8; }
.intro-hint { font-size: 12px; color: rgba(251, 191, 36, 0.4); margin-top: 24px; animation: hint-pulse 2s ease-in-out infinite; }
@keyframes hint-pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }

/* Explore */
.collect-explore { flex: 1; display: flex; flex-direction: column; padding: 12px; gap: 12px; overflow-y: auto; }

.explore-stats {
  display: flex; justify-content: space-around; padding: 8px 12px;
  background: rgba(255, 255, 255, 0.04); border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.06);
}
.stat-item { text-align: center; }
.stat-label { display: block; font-size: 10px; color: rgba(255, 255, 255, 0.4); }
.stat-value { display: block; font-size: 18px; font-weight: 700; color: #fbbf24; }
.stat-value.low { color: #ef4444; animation: pulse-red 1s ease-in-out infinite; }
@keyframes pulse-red { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
.stat-value.gold { color: #22c55e; }

.explore-grid {
  display: grid; grid-template-columns: repeat(5, 1fr);
  gap: 6px; max-width: 360px; margin: 0 auto; width: 100%;
}

.explore-cell {
  aspect-ratio: 1; border-radius: 8px; display: flex; flex-direction: column;
  align-items: center; justify-content: center; cursor: pointer;
  transition: all 0.2s; position: relative; overflow: hidden;
}

.cell-hidden {
  background: linear-gradient(135deg, rgba(251, 191, 36, 0.1), rgba(251, 191, 36, 0.03));
  border: 1px solid rgba(251, 191, 36, 0.15);
}
.cell-hidden:active { transform: scale(0.9); background: rgba(251, 191, 36, 0.2); }
.cell-question { font-size: 18px; font-weight: 700; color: rgba(251, 191, 36, 0.3); }

.cell-revealed { border-width: 2px; }
.cell-resource {
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.15), rgba(34, 197, 94, 0.05));
  border-color: rgba(34, 197, 94, 0.3); animation: cell-reveal 0.4s ease-out;
}
.cell-trap {
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.15), rgba(239, 68, 68, 0.05));
  border-color: rgba(239, 68, 68, 0.3); animation: cell-reveal 0.4s ease-out;
}
.cell-obstacle {
  background: rgba(255, 255, 255, 0.03);
  border-color: rgba(255, 255, 255, 0.08); animation: cell-reveal 0.4s ease-out;
}
.cell-event {
  background: linear-gradient(135deg, rgba(251, 191, 36, 0.2), rgba(168, 85, 247, 0.15));
  border-color: rgba(251, 191, 36, 0.4); animation: cell-reveal 0.4s ease-out;
}
.cell-empty {
  background: rgba(255, 255, 255, 0.02);
  border-color: rgba(255, 255, 255, 0.05);
}

@keyframes cell-reveal { from { opacity: 0; transform: rotateY(90deg); } to { opacity: 1; transform: rotateY(0); } }

.cell-icon { font-size: 20px; }
.cell-label { font-size: 8px; color: rgba(255, 255, 255, 0.5); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }

.safe-exit-btn {
  padding: 10px 20px; border: 1px solid rgba(34, 197, 94, 0.3);
  background: rgba(34, 197, 94, 0.1); color: #22c55e; border-radius: 10px;
  font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s;
  align-self: center;
}
.safe-exit-btn:hover { background: rgba(34, 197, 94, 0.2); }

/* Evacuate */
.collect-evacuate {
  flex: 1; display: flex; flex-direction: column; align-items: center;
  padding: 16px; gap: 16px;
}
.evac-story { text-align: center; font-size: 13px; color: rgba(255, 255, 255, 0.6); max-width: 360px; }
.evac-stats {
  display: flex; gap: 12px; font-size: 12px; color: rgba(255, 255, 255, 0.5);
}
.evac-target { color: #fbbf24; font-weight: 600; }

.evac-grid {
  display: flex; flex-direction: column; gap: 6px;
}
.evac-row { display: flex; gap: 6px; }
.evac-cell {
  width: 60px; height: 60px; border-radius: 10px; display: flex;
  align-items: center; justify-content: center; font-size: 22px;
  transition: all 0.2s;
}
.evac-hidden {
  background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08);
}
.evac-hidden[data-clickable="true"] {
  border-color: rgba(96, 165, 250, 0.4); cursor: pointer;
  background: rgba(96, 165, 250, 0.08);
}
.evac-hidden[data-clickable="true"]:active { transform: scale(0.92); }
.evac-current {
  background: linear-gradient(135deg, rgba(96, 165, 250, 0.2), rgba(96, 165, 250, 0.1));
  border: 2px solid #60a5fa; box-shadow: 0 0 12px rgba(96, 165, 250, 0.3);
}
.evac-revealed-safe {
  background: rgba(34, 197, 94, 0.1); border: 1px solid rgba(34, 197, 94, 0.2);
}
.evac-revealed-danger {
  background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3);
}
.evac-revealed-treasure {
  background: rgba(251, 191, 36, 0.15); border: 1px solid rgba(251, 191, 36, 0.3);
}

.evac-legend { display: flex; gap: 16px; font-size: 11px; color: rgba(255, 255, 255, 0.4); }
.legend-icon { margin-right: 2px; }

/* Settle */
.collect-settle {
  flex: 1; display: flex; align-items: center; justify-content: center; padding: 24px;
}
.settle-content {
  max-width: 380px; width: 100%; display: flex; flex-direction: column;
  align-items: center; gap: 20px; animation: settle-pop 0.5s ease-out;
}
@keyframes settle-pop { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }

.settle-rating { text-align: center; }
.settle-icon { font-size: 48px; display: block; margin-bottom: 8px; }
.settle-rating h3 { font-size: 20px; margin: 0 0 4px; }
.settle-rating p { font-size: 12px; color: rgba(255, 255, 255, 0.4); margin: 0; }

.settle-details {
  width: 100%; background: rgba(255, 255, 255, 0.04); border-radius: 12px;
  padding: 12px 16px; border: 1px solid rgba(255, 255, 255, 0.06);
}
.detail-row {
  display: flex; justify-content: space-between; padding: 6px 0;
  font-size: 13px; border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}
.detail-row:last-child { border-bottom: none; }
.detail-row.highlight { color: #fbbf24; font-weight: 600; }
.detail-row.total { font-size: 16px; font-weight: 700; color: #fbbf24; }
.detail-row .loss { color: #ef4444; }

.settle-actions { display: flex; gap: 12px; }
.settle-done-btn {
  padding: 12px 32px; background: linear-gradient(135deg, #fbbf24, #f59e0b);
  border: none; border-radius: 10px; color: #000; font-size: 14px;
  font-weight: 700; cursor: pointer; transition: transform 0.2s;
}
.settle-done-btn:hover { transform: translateY(-2px); }
.settle-retry-btn {
  padding: 12px 32px; background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 10px;
  color: #ef4444; font-size: 14px; font-weight: 600; cursor: pointer;
  transition: all 0.2s;
}
.settle-retry-btn:hover { background: rgba(239, 68, 68, 0.25); }

/* Log */
.collect-log {
  flex: 1; overflow-y: auto; padding: 6px 14px;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.3), rgba(0, 0, 0, 0.15));
  border-top: 1px solid rgba(251, 191, 36, 0.06); min-height: 60px; max-height: 140px;
  border-radius: 8px; margin: 6px 12px;
}
.collect-log::-webkit-scrollbar { width: 3px; }
.collect-log::-webkit-scrollbar-track { background: transparent; }
.collect-log::-webkit-scrollbar-thumb { background: rgba(251, 191, 36, 0.2); border-radius: 3px; }

.log-entry { font-size: 11px; line-height: 1.5; color: rgba(255, 255, 255, 0.55); padding: 1px 0; }
.log-entry + .log-entry { border-top: 1px solid rgba(255, 255, 255, 0.03); }
.log-divider { text-align: center; color: rgba(251, 191, 36, 0.35); }
.log-divider-text { font-size: 10px; letter-spacing: 3px; font-weight: 600; }
.log-discover { color: rgba(34, 197, 94, 0.8); }
.log-trap { color: #ef4444; }
.log-loss { color: rgba(239, 68, 68, 0.6); }
.log-bonus { color: #fbbf24; }
.log-emoji { font-size: 13px; }
</style>
