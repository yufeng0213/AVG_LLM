<script setup>
/**
 * 战斗主界面
 * 手机竖屏卡片对战
 */

import { ref, computed, nextTick, watch, onMounted, onBeforeUnmount } from 'vue'
import { useDormBattle, createBattleSession, loadBattleSession, clearBattleSession } from '../composables/useDormBattle.js'
import { generateBattleData, validateBattleData, createDefaultBattleData } from '../services/battleGenerationService.js'
import BattleSkillPanel from './BattleSkillPanel.vue'
import BattleBackpackPanel from './BattleBackpackPanel.vue'

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false,
  },
  taskId: {
    type: String,
    default: '',
  },
  boardId: {
    type: String,
    default: '',
  },
  worldBook: {
    type: Object,
    default: () => ({}),
  },
  selectedCharacters: {
    type: Array,
    default: () => [],
  },
  userProfile: {
    type: Object,
    default: () => ({}),
  },
})

const emit = defineEmits(['close', 'battle-victory', 'battle-defeat'])

const {
  session,
  isLoading,
  currentWaveEnemies,
  aliveEnemies,
  aliveTeammates,
  isBattleOver,
  isWaveComplete,
  isMyTurn,
  startWave,
  nextTurn,
  getCurrentActor,
  startNextWave,
  selectSkill,
  selectTarget,
  useBattleItem,
  getAvailableTargets,
  getAllyTargets,
  executeEnemyTurn,
  skipTurn,
  createBattleSession: createSession,
  saveBattleSession,
  loadBattleSession: loadSession,
} = useDormBattle()

const generating = ref(false)
const generateMessage = ref('正在生成战斗信息中...')
const battleLogEl = ref(null)
const showBackpack = ref(false)
const isAnimating = ref(false)

// 战斗日志自动滚动
watch(() => session.battleLog?.length, () => {
  nextTick(() => {
    if (battleLogEl.value) {
      battleLogEl.value.scrollTop = battleLogEl.value.scrollHeight
    }
  })
})

// 监听弹窗打开
watch(() => props.isOpen, async (val) => {
  if (val) {
    // 先尝试恢复
    const saved = loadSession()
    if (saved && saved.taskId === props.taskId) {
      Object.assign(session, saved)
      return
    }
    // 生成新战斗数据
    await generateBattle()
  } else {
    generating.value = false
    showBackpack.value = false
  }
})

/**
 * 生成战斗数据
 */
async function generateBattle() {
  console.log('[BattleScreen] generateBattle 开始')
  generating.value = true
  generateMessage.value = '正在生成战斗信息中...'

  try {
    console.log('[BattleScreen] 调用 generateBattleData...')
    const result = await generateBattleData({
      task: { name: props.taskId, id: props.taskId },
      selectedCharacters: props.selectedCharacters,
      worldBook: props.worldBook,
      userProfile: props.userProfile,
    })

    console.log('[BattleScreen] generateBattleData 返回:', result.success ? '成功' : '失败', result)

    if (!result.success || !result.data) {
      throw new Error(result.error || '生成失败')
    }

    // 校验数据
    const validation = validateBattleData(result.data)
    if (!validation.valid) {
      console.warn('[BattleScreen] 战斗数据校验警告:', validation.errors)
    } else {
      console.log('[BattleScreen] 战斗数据校验通过, 队伍人数:', result.data.teamMembers?.length, '波次数:', result.data.waves?.length)
    }

    // 创建会话
    const newSession = createSession({
      taskId: props.taskId,
      boardId: props.boardId,
      battleData: result.data,
    })
    Object.assign(session, newSession)
    console.log('[BattleScreen] 战斗会话已创建, 状态:', session.status)

    generating.value = false
    console.log('[BattleScreen] generating 设为 false, 准备开始战斗')

    // 开始第一场战斗
    startWave()
  } catch (error) {
    console.error('[BattleScreen] 战斗数据生成失败:', error)
    generateMessage.value = `生成失败：${error.message}，正在使用默认数据...`

    // 使用默认数据
    const fallback = createDefaultBattleData({
      selectedCharacters: props.selectedCharacters,
      userProfile: props.userProfile,
      task: { name: props.taskId },
    })

    if (fallback.success) {
      const newSession = createSession({
        taskId: props.taskId,
        boardId: props.boardId,
        battleData: fallback.data,
      })
      Object.assign(session, newSession)
      generating.value = false
      startWave()
    } else {
      generating.value = false
    }
  }
}

/**
 * 处理技能选择
 */
function handleSkillSelect(skill) {
  if (isAnimating.value) return
  selectSkill(skill)
}

/**
 * 处理目标选择
 */
function handleTargetSelect(targetId) {
  if (isAnimating.value) return
  selectTarget(targetId)
}

/**
 * 处理道具使用
 */
function handleItemUse(item) {
  if (isAnimating.value) return
  useBattleItem(item)
}

/**
 * 处理波次间下一步
 */
function handleNextWave() {
  if (session.status === 'victory') {
    emit('battle-victory')
  } else {
    startNextWave()
  }
}

/**
 * 处理战斗失败退出
 */
function handleDefeatExit() {
  clearBattleSession()
  emit('battle-defeat')
}

/**
 * 检查是否是可选目标
 */
function isTargetable(character) {
  const targets = getAvailableTargets()
  return targets.some(t => t.id === character.id)
}

function isTargetableEnemy(enemy) {
  return isTargetable(enemy)
}

/**
 * 自动执行敌方回合
 */
watch(() => [session.currentTurnIndex, session.status, session.isPlayerChoosing], () => {
  if (session.status !== 'battle' || session.isPlayerChoosing) return

  const actor = getCurrentActor()
  if (!actor || actor.isPlayer || !actor.isAlive) {
    if (actor && !actor.isAlive) {
      nextTurn()
    }
    return
  }

  // 敌方角色，延迟执行动画
  if (!isAnimating.value) {
    isAnimating.value = true
    setTimeout(() => {
      executeEnemyTurn(actor)
      isAnimating.value = false
    }, 600)
  }
}, { deep: true })

function handleClose() {
  emit('close')
}

function getHpPercent(character) {
  if (!character.maxHp) return 0
  return Math.round((character.hp / character.maxHp) * 100)
}

function getHpBarColor(percent) {
  if (percent > 60) return '#22c55e'
  if (percent > 30) return '#eab308'
  return '#ef4444'
}
</script>

<template>
  <Teleport to="body">
    <Transition name="battle-modal">
      <div v-if="isOpen" class="battle-overlay" @click.self="handleClose">
        <section class="battle-panel">
          <!-- Header -->
          <header class="battle-header">
            <button v-if="!generating" type="button" class="battle-back-btn" @click="handleClose">
              ←
            </button>
            <div class="battle-wave-info" v-if="!generating && session.currentWaveData">
              <span class="wave-label">第 {{ session.currentWave + 1 }}/3 场</span>
              <span v-if="currentWaveData?.isBossWave" class="boss-badge">BOSS</span>
            </div>
            <button v-if="!generating" type="button" class="battle-backpack-btn" @click="showBackpack = !showBackpack">
              🎒
            </button>
          </header>

          <!-- 生成中 -->
          <div v-if="generating" class="battle-generating">
            <div class="generating-spinner"></div>
            <p class="generating-text">{{ generateMessage }}</p>
          </div>

          <!-- 战斗区域 -->
          <template v-if="!generating && session.status">
            <!-- 敌方区域 -->
            <div class="battle-enemy-area">
              <div class="enemy-label">敌方</div>
              <div class="character-row">
                <div
                  v-for="enemy in currentWaveEnemies"
                  :key="enemy.id"
                  class="character-card enemy-card"
                  :class="{
                    'is-highlighted': enemy.isHighlighted,
                    'is-dead': !enemy.isAlive,
                    'is-targetable': isTargetableEnemy(enemy),
                  }"
                  @click="isTargetableEnemy(enemy) ? handleTargetSelect(enemy.id) : null"
                >
                  <div class="card-name">{{ enemy.name }}</div>
                  <div class="card-portrait">
                    <span class="portrait-placeholder">👹</span>
                  </div>
                  <div class="card-hp-bar">
                    <div
                      class="hp-bar-fill"
                      :style="{
                        width: getHpPercent(enemy) + '%',
                        backgroundColor: getHpBarColor(getHpPercent(enemy)),
                      }"
                    ></div>
                    <span class="hp-bar-text">{{ enemy.hp }}/{{ enemy.maxHp }}</span>
                  </div>
                  <div class="card-status-effects">
                    <span
                      v-for="(debuff, i) in (enemy.debuffs || [])"
                      :key="'db' + i"
                      class="status-icon debuff"
                      :title="debuff.name"
                    >{{ debuff.name?.[0] || '?' }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- 战斗日志 -->
            <div class="battle-log-area" ref="battleLogEl">
              <div class="log-entry" v-for="(log, i) in session.battleLog" :key="i">
                {{ log }}
              </div>
              <div v-if="!session.battleLog?.length" class="log-entry log-empty">
                战斗即将开始...
              </div>
            </div>

            <!-- 我方区域 -->
            <div class="battle-team-area">
              <div class="team-label">我方</div>
              <div class="character-row">
                <div
                  v-for="member in session.teamMembers"
                  :key="member.id"
                  class="character-card team-card"
                  :class="{
                    'is-highlighted': member.isHighlighted,
                    'is-dead': !member.isAlive,
                    'is-player': member.isPlayer,
                  }"
                >
                  <div class="card-name">{{ member.name }}</div>
                  <div class="card-portrait">
                    <span v-if="member.portrait" class="portrait-img">
                      <img :src="member.portrait" :alt="member.name" />
                    </span>
                    <span v-else class="portrait-placeholder">
                      {{ member.isPlayer ? '🧑' : '👤' }}
                    </span>
                  </div>
                  <div class="card-hp-bar">
                    <div
                      class="hp-bar-fill"
                      :style="{
                        width: getHpPercent(member) + '%',
                        backgroundColor: getHpBarColor(getHpPercent(member)),
                      }"
                    ></div>
                    <span class="hp-bar-text">{{ member.hp }}/{{ member.maxHp }}</span>
                  </div>
                  <div class="card-status-effects">
                    <span
                      v-for="(buff, i) in (member.buffs || [])"
                      :key="'bf' + i"
                      class="status-icon buff"
                      :title="buff.name"
                    >{{ buff.name?.[0] || '?' }}</span>
                    <span
                      v-for="(debuff, i) in (member.debuffs || [])"
                      :key="'db' + i"
                      class="status-icon debuff"
                      :title="debuff.name"
                    >{{ debuff.name?.[0] || '?' }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- 技能/道具选择面板 -->
            <div v-if="isMyTurn && !isAnimating" class="battle-action-area">
              <BattleSkillPanel
                :actor="getCurrentActor()"
                :available-targets="getAvailableTargets()"
                @select-skill="handleSkillSelect"
              />
              <button type="button" class="skip-turn-btn" @click="skipTurn">
                跳过回合
              </button>
            </div>

            <!-- 波次间/战斗结束 -->
            <div v-if="isWaveComplete || isBattleOver" class="battle-result-area">
              <div v-if="session.status === 'victory'" class="result-victory">
                <h3>🎉 战斗胜利！</h3>
                <p>全部三场战斗已通关</p>
                <button type="button" class="result-btn" @click="handleNextWave">
                  返回任务面板
                </button>
              </div>
              <div v-else-if="session.status === 'wave_clear'" class="result-wave-clear">
                <h3>✓ 本场胜利</h3>
                <div class="drop-list">
                  <span v-for="drop in session.waveDropHistory.slice(-5)" :key="drop.id" class="drop-item">
                    {{ drop.icon }} {{ drop.name }}
                  </span>
                </div>
                <button type="button" class="result-btn" @click="handleNextWave">
                  下一场战斗 →
                </button>
              </div>
              <div v-else-if="session.status === 'defeat'" class="result-defeat">
                <h3>💀 战斗失败</h3>
                <p>队伍全灭，任务失败</p>
                <button type="button" class="result-btn defeat-btn" @click="handleDefeatExit">
                  返回任务面板
                </button>
              </div>
            </div>
          </template>
        </section>

        <!-- 背包面板 -->
        <BattleBackpackPanel
          :is-open="showBackpack"
          :items="session.battleBackpack || []"
          @close="showBackpack = false"
          @use-item="handleItemUse"
        />
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.battle-modal-enter-active,
.battle-modal-leave-active {
  transition: opacity 0.3s ease;
}

.battle-modal-enter-from,
.battle-modal-leave-to {
  opacity: 0;
}

.battle-overlay {
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

.battle-panel {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Header */
.battle-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
}

.battle-back-btn,
.battle-backpack-btn {
  width: 36px;
  height: 36px;
  border: none;
  background: rgba(255, 255, 255, 0.1);
  color: var(--foreground, #fff);
  font-size: 18px;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.battle-wave-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.wave-label {
  font-size: 14px;
  font-weight: 600;
}

.boss-badge {
  padding: 2px 8px;
  background: linear-gradient(135deg, #dc2626, #991b1b);
  border-radius: 4px;
  font-size: 11px;
  font-weight: 700;
  color: #fff;
}

/* Generating overlay */
.battle-generating {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
}

.generating-spinner {
  width: 48px;
  height: 48px;
  border: 4px solid rgba(255, 255, 255, 0.15);
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.generating-text {
  font-size: 15px;
  color: rgba(255, 255, 255, 0.6);
  text-align: center;
}

/* Enemy area */
.battle-enemy-area {
  padding: 10px 12px;
  flex-shrink: 0;
  background: rgba(239, 68, 68, 0.05);
}

.enemy-label,
.team-label {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 6px;
}

/* Team area */
.battle-team-area {
  padding: 10px 12px;
  flex-shrink: 0;
  background: rgba(59, 130, 246, 0.05);
}

/* Character row */
.character-row {
  display: flex;
  gap: 8px;
  overflow-x: auto;
}

/* Character card */
.character-card {
  flex: 1;
  min-width: 70px;
  max-width: 120px;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 6px;
  background: rgba(255, 255, 255, 0.06);
  border: 2px solid transparent;
  border-radius: 10px;
  transition: all 0.3s;
  position: relative;
}

.character-card.is-highlighted {
  border-color: #fbbf24;
  background: rgba(251, 191, 36, 0.15);
  transform: scale(1.08);
  box-shadow: 0 0 20px rgba(251, 191, 36, 0.3);
  animation: pulse-highlight 1.5s ease-in-out infinite;
}

@keyframes pulse-highlight {
  0%, 100% { box-shadow: 0 0 12px rgba(251, 191, 36, 0.2); }
  50% { box-shadow: 0 0 24px rgba(251, 191, 36, 0.5); }
}

.character-card.is-dead {
  opacity: 0.3;
  filter: grayscale(1);
  pointer-events: none;
}

.character-card.is-targetable {
  border-color: #22c55e;
  cursor: pointer;
  background: rgba(34, 197, 94, 0.1);
}

.character-card.is-targetable:active {
  background: rgba(34, 197, 94, 0.25);
}

.character-card.is-player {
  border-color: rgba(234, 179, 8, 0.3);
}

.card-name {
  font-size: 11px;
  font-weight: 600;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  width: 100%;
  margin-bottom: 4px;
}

.card-portrait {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.08);
  margin-bottom: 6px;
}

.portrait-placeholder {
  font-size: 20px;
}

.portrait-img img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.card-hp-bar {
  width: 100%;
  height: 14px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 7px;
  position: relative;
  overflow: hidden;
}

.hp-bar-fill {
  height: 100%;
  border-radius: 7px;
  transition: width 0.4s ease, background-color 0.3s;
}

.hp-bar-text {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 8px;
  font-weight: 700;
  color: #fff;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
}

.card-status-effects {
  display: flex;
  gap: 2px;
  margin-top: 4px;
  flex-wrap: wrap;
  justify-content: center;
}

.status-icon {
  width: 16px;
  height: 16px;
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  font-weight: 700;
}

.status-icon.buff {
  background: rgba(34, 197, 94, 0.3);
  color: #22c55e;
}

.status-icon.debuff {
  background: rgba(239, 68, 68, 0.3);
  color: #ef4444;
}

/* Battle log */
.battle-log-area {
  flex: 1;
  overflow-y: auto;
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.3);
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  min-height: 60px;
  max-height: 160px;
}

.log-entry {
  font-size: 12px;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.7);
  padding: 2px 0;
}

.log-entry.log-empty {
  color: rgba(255, 255, 255, 0.3);
  font-style: italic;
}

/* Action area */
.battle-action-area {
  padding: 8px 12px;
  flex-shrink: 0;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.skip-turn-btn {
  width: 100%;
  padding: 10px;
  margin-top: 6px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.6);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.skip-turn-btn:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

/* Result area */
.battle-result-area {
  padding: 20px 12px;
  padding-bottom: max(20px, env(safe-area-inset-bottom));
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.result-victory h3,
.result-wave-clear h3,
.result-defeat h3 {
  margin: 0;
  font-size: 20px;
}

.result-victory p,
.result-defeat p {
  margin: 0;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
}

.drop-list {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
}

.drop-item {
  padding: 4px 10px;
  background: rgba(234, 179, 8, 0.15);
  border: 1px solid rgba(234, 179, 8, 0.3);
  border-radius: 6px;
  font-size: 12px;
}

.result-btn {
  padding: 12px 32px;
  border: none;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 700;
  color: #fff;
  background: linear-gradient(135deg, #22c55e, #16a34a);
  cursor: pointer;
  transition: all 0.2s;
}

.result-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(34, 197, 94, 0.4);
}

.result-btn.defeat-btn {
  background: linear-gradient(135deg, #ef4444, #dc2626);
}

.result-btn.defeat-btn:hover {
  box-shadow: 0 4px 16px rgba(239, 68, 68, 0.4);
}
</style>
