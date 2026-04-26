<script setup>
/**
 * 战斗主界面
 * 新流程：点击己方角色→出招→全部行动完→敌方阶段→循环
 */

import { ref, computed, nextTick, watch } from 'vue'
import { useDormBattle, createBattleSession, loadBattleSession, clearBattleSession } from '../composables/useDormBattle.js'
import { generateBattleData, validateBattleData, createDefaultBattleData } from '../services/battleGenerationService.js'
import BattleSkillPanel from './BattleSkillPanel.vue'
import BattleBackpackPanel from './BattleBackpackPanel.vue'

// BGM 管理
let bgmAudio = null
function startBGM() {
  if (bgmAudio) return
  bgmAudio = new Audio('/data/audio/battle-bgm.mp3')
  bgmAudio.loop = true
  bgmAudio.volume = 0.35
  bgmAudio.play().catch(() => {})
}
function stopBGM() {
  if (bgmAudio) {
    bgmAudio.pause()
    bgmAudio = null
  }
}

const props = defineProps({
  isOpen: { type: Boolean, default: false },
  taskId: { type: String, default: '' },
  boardId: { type: String, default: '' },
  worldBook: { type: Object, default: () => ({}) },
  selectedCharacters: { type: Array, default: () => [] },
  userProfile: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['close', 'battle-victory', 'battle-defeat'])

const {
  session,
  currentWaveEnemies,
  aliveEnemies,
  aliveTeammates,
  isBattleOver,
  isWaveComplete,
  isEnemyPhase,
  isAllPlayersActed,
  remainingPlayerCount,
  startWave,
  startNextWave,
  selectPlayerCharacter,
  deselectPlayerCharacter,
  skipPlayerTurn,
  endRound,
  selectSkill,
  selectTarget,
  useBattleItem,
  getAvailableTargets,
  getAllyTargets,
  createBattleSession: createSession,
  saveBattleSession,
  loadBattleSession: loadSession,
  onAnimationTrigger,
} = useDormBattle()

// 注册动画回调
onAnimationTrigger.value = {
  triggerAttack: (charId) => triggerAnimation(charId, 'attack'),
  triggerHit: (charId) => triggerAnimation(charId, 'hit'),
  showDamage: (targetId, value, isCrit) => showFloatingNumber(targetId, value, isCrit),
}

const generating = ref(false)
const generateMessage = ref('正在生成战斗信息中...')
const battleLogEl = ref(null)
const showBackpack = ref(false)

// 动画效果状态
const activeAnimations = ref(new Map())
const floatingNumbers = ref([])
const characterPositions = ref({})
const cardRefs = ref(new Map())
let floatingIdCounter = 0

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
    startBGM()
    // 先尝试恢复
    const saved = loadSession()
    if (saved && saved.taskId === props.taskId) {
      Object.assign(session, saved)
      return
    }
    // 生成新战斗数据
    await generateBattle()
  } else {
    stopBGM()
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

    // 检查 session 状态
    console.log('[BattleScreen] session.status:', session.status, 'session.battleData:', session.battleData ? 'exists' : 'null', 'waves:', session.battleData?.waves?.length)

    // 开始第一场战斗
    startWave()

    console.log('[BattleScreen] startWave 调用后, session.currentWave:', session.currentWave, 'phase:', session.phase)
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
 * 处理道具对己方目标使用
 */
function handleItemTarget(targetId) {
  if (!session.pendingItem) return
  selectPlayerCharacter(targetId)
}

/**
 * 处理技能选择
 */
function handleSkillSelect(skill) {
  selectSkill(skill)
}

/**
 * 处理目标选择
 */
function handleTargetSelect(targetId) {
  selectTarget(targetId)
}

/**
 * 处理道具使用 — 关闭背包，进入选目标模式
 */
function handleItemUse(item) {
  showBackpack.value = false
  const targetMode = item.targetMode
  if (targetMode === 'enemy_single') {
    // 伤害类道具：设置 pendingAction，选择敌方目标
    // 如果还没有选中玩家，自动选第一个活着的
    if (!session.selectedPlayerId) {
      const firstAlive = session.teamMembers?.find(m => m.isAlive)
      if (firstAlive) {
        session.selectedPlayerId = firstAlive.id
        session.pendingAction = { type: 'item', item }
        session.battleLog.push(`请点击要使用 [${item.icon} ${item.name}] 的敌方目标`)
        saveBattleSession(session)
      }
    } else {
      session.pendingAction = { type: 'item', item }
      session.battleLog.push(`请点击要使用 [${item.icon} ${item.name}] 的敌方目标`)
      saveBattleSession(session)
    }
  } else {
    // 治疗/增益类：进入己方选择模式
    session.pendingItem = item
    session.battleLog.push(`请点击要使用 [${item.icon} ${item.name}] 的己方角色`)
    saveBattleSession(session)
  }
}

/**
 * 处理波次间下一步
 */
function handleNextWave() {
  if (session.status === 'victory') {
    stopBGM()
    emit('battle-victory')
  } else {
    startNextWave()
  }
}

/**
 * 处理战斗失败退出
 */
function handleDefeatExit() {
  stopBGM()
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
 * 获取角色的动画 class
 */
function getAnimClass(character) {
  const anim = activeAnimations.value.get(character.id)
  if (anim === 'attack') return 'anim-attack'
  if (anim === 'hit') return 'anim-hit'
  return ''
}

/**
 * 注册角色卡片元素并记录位置
 */
function registerCard(el, character) {
  if (el) {
    cardRefs.value.set(character.id, el)
    const rect = el.getBoundingClientRect()
    characterPositions.value[character.id] = {
      top: rect.top,
      left: rect.left + rect.width / 2,
    }
  }
}

/**
 * 判断战斗日志条目类型
 */
function getLogClass(log) {
  if (log.startsWith('━━━')) return 'log-divider'
  if (log.includes('造成') && log.includes('点伤害')) return 'log-damage'
  if (log.includes('暴击')) return 'log-crit'
  if (log.includes('恢复了') && log.includes('生命值')) return 'log-heal'
  if (log.includes('获得掉落')) return 'log-drop'
  if (log.includes('被击败')) return 'log-kill'
  if (log.includes('跳过')) return 'log-skip'
  return 'log-normal'
}

/**
 * 格式化战斗日志 — 给角色名和技能名着色
 */
function formatLogEntry(log) {
  // 分隔线
  if (log.startsWith('━━━')) {
    return `<span class="log-divider-text">${log}</span>`
  }
  // 高亮角色名（被「」或空格包裹的名称）和技能名（被 [] 包裹）
  let formatted = log
    .replace(/\[([^\]]+)\]/g, '<span class="log-skill">[$1]</span>')
    .replace(/💥暴击/g, '<span class="log-crit-badge">💥暴击</span>')
  return formatted
}

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

function getHpGradient(percent) {
  if (percent > 60) return 'linear-gradient(90deg, #06b6d4, #22c55e)'
  if (percent > 30) return 'linear-gradient(90deg, #eab308, #f59e0b)'
  return 'linear-gradient(90deg, #dc2626, #ef4444)'
}

/**
 * 判断己方角色是否可以点击
 */
function canSelectMember(member) {
  if (session.phase !== 'player') return false
  if (session.status !== 'battle') return false
  // 有道具待使用时：即使已行动也可以点击（只要活着）
  if (session.pendingItem) return member.isAlive
  if (!member.isAlive || member.hasActed) return false
  return true
}

/**
 * 点击己方角色卡片
 */
function handleSelectMember(charId) {
  selectPlayerCharacter(charId)
}

/**
 * 获取当前选中的角色
 */
function getSelectedMember() {
  if (!session.selectedPlayerId) return null
  return session.teamMembers?.find(m => m.id === session.selectedPlayerId) || null
}

/**
 * 触发角色动画
 */
function triggerAnimation(characterId, type) {
  activeAnimations.value.set(characterId, type)
  setTimeout(() => {
    activeAnimations.value.delete(characterId)
  }, type === 'attack' ? 400 : 350)
}

/**
 * 显示浮动伤害数字
 */
function showFloatingNumber(targetId, value, isCrit) {
  const id = ++floatingIdCounter
  const pos = characterPositions.value[targetId]
  floatingNumbers.value.push({
    id,
    targetId,
    value,
    isCrit,
    color: isCrit ? '#ff4444' : '#ffffff',
    fontSize: isCrit ? '1.6rem' : '1.2rem',
    top: pos ? pos.top - 20 : '40%',
    left: pos ? pos.left : '50%',
  })
  // 动画结束后移除
  setTimeout(() => {
    floatingNumbers.value = floatingNumbers.value.filter(n => n.id !== id)
  }, 1000)
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
              <div class="region-divider enemy-divider"></div>
              <div class="character-row">
                <div
                  v-for="enemy in currentWaveEnemies"
                  :key="enemy.id"
                  class="character-card enemy-card"
                  :class="[
                    {
                      'is-active-turn': enemy.isHighlighted,
                      'is-dead': !enemy.isAlive,
                      'is-targetable': isTargetableEnemy(enemy),
                    },
                    getAnimClass(enemy),
                  ]"
                  :ref="el => registerCard(el, enemy)"
                  @click="isTargetableEnemy(enemy) ? handleTargetSelect(enemy.id) : null"
                >
                  <div class="card-portrait">
                    <span v-if="enemy.portrait" class="portrait-img">
                      <img :src="enemy.portrait" :alt="enemy.name" />
                    </span>
                    <span v-else class="portrait-placeholder">👹</span>
                  </div>
                  <div class="card-info">
                    <div class="card-name">{{ enemy.name }}</div>
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
              <div class="log-entry" v-for="(log, i) in session.battleLog" :key="i" :class="getLogClass(log)">
                <span v-html="formatLogEntry(log)"></span>
              </div>
              <div v-if="!session.battleLog?.length" class="log-entry log-empty">
                战斗即将开始...
              </div>
            </div>

            <!-- 波次间/战斗结束（放在中间区域） -->
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
                  继续战斗
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

            <!-- 我方区域 -->
            <div class="battle-team-area">
              <div class="region-divider team-divider"></div>

              <!-- 技能面板（在队伍卡片上方） -->
              <Transition name="skill-panel">
                <div v-if="session.selectedPlayerId && session.phase === 'player'" class="skill-panel-wrapper">
                  <div class="skill-panel-header">
                    <button type="button" class="deselect-btn" @click="deselectPlayerCharacter">✕</button>
                    <span class="selected-name">{{ getSelectedMember()?.name }} 的回合</span>
                    <button type="button" class="skip-btn" @click="skipPlayerTurn">跳过</button>
                  </div>
                  <BattleSkillPanel
                    :actor="getSelectedMember()"
                    :available-targets="getAvailableTargets()"
                    @select-skill="handleSkillSelect"
                  />
                </div>
              </Transition>

              <!-- 回合阶段提示 -->
              <div class="phase-indicator">
                <span v-if="session.phase === 'player'" class="phase-badge player-phase">
                  玩家阶段 · 剩余 {{ remainingPlayerCount }} 人
                </span>
                <span v-else class="phase-badge enemy-phase">
                  敌方行动中...
                </span>
              </div>

              <!-- 道具选择提示 -->
              <div v-if="session.pendingItem" class="item-target-hint">
                请点击要使用 [{{ session.pendingItem.icon }} {{ session.pendingItem.name }}] 的己方角色
                <button type="button" class="hint-cancel-btn" @click="session.pendingItem = null">✕</button>
              </div>

              <div class="character-row">
                <div
                  v-for="member in session.teamMembers"
                  :key="member.id"
                  class="character-card team-card"
                  :class="[
                    {
                      'is-active-turn': session.selectedPlayerId === member.id,
                      'has-acted': member.hasActed,
                      'is-dead': !member.isAlive,
                      'is-item-target': session.pendingItem && member.isAlive,
                    },
                    getAnimClass(member),
                  ]"
                  :ref="el => registerCard(el, member)"
                  @click="canSelectMember(member) ? handleSelectMember(member.id) : (session.pendingItem && member.isAlive ? handleItemTarget(member.id) : null)"
                >
                  <div class="card-portrait">
                    <span v-if="member.portrait" class="portrait-img">
                      <img :src="member.portrait" :alt="member.name" />
                    </span>
                    <span v-else class="portrait-placeholder">
                      {{ member.isPlayer ? '🧑' : '👤' }}
                    </span>
                    <!-- 选中光效 -->
                    <span v-if="session.selectedPlayerId === member.id" class="card-glow"></span>
                  </div>
                  <div class="card-info">
                    <div class="card-name">{{ member.name }}</div>
                    <div class="card-hp-bar">
                      <div
                        class="hp-bar-fill"
                        :style="{
                          width: getHpPercent(member) + '%',
                          background: getHpGradient(getHpPercent(member)),
                        }"
                      ></div>
                      <span class="hp-bar-text">{{ enemy ? '' : '' }}{{ member.hp }}/{{ member.maxHp }}</span>
                    </div>
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
          </template>
        </section>

        <!-- 背包面板 -->
        <BattleBackpackPanel
          :is-open="showBackpack"
          :items="session.battleBackpack || []"
          @close="showBackpack = false"
          @use-item="handleItemUse"
        />

        <!-- 浮动伤害数字 -->
        <div class="floating-numbers-layer">
          <div
            v-for="num in floatingNumbers"
            :key="num.id"
            class="floating-damage"
            :class="{ 'is-crit': num.isCrit }"
            :style="{
              color: num.color,
              fontSize: num.fontSize,
              top: num.top + 'px',
              left: num.left + 'px',
            }"
          >
            {{ num.value }}
          </div>
        </div>

        <!-- 回合结束按钮（屏幕正中间） -->
        <div v-if="isAllPlayersActed && session.phase === 'player'" class="round-end-overlay" @click.self="endRound">
          <div class="round-end-content">
            <p class="round-end-label">全部已行动</p>
            <button type="button" class="round-end-btn" @click="endRound">
              回合结束
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* ===== 全局布局 ===== */
.battle-modal-enter-active { transition: opacity 0.3s ease; }
.battle-modal-leave-active { transition: opacity 0.25s ease; }
.battle-modal-enter-from,
.battle-modal-leave-to { opacity: 0; }

.battle-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  background: radial-gradient(ellipse at 50% 0%, #1a0a2e 0%, #0d0d1a 50%, #050508 100%);
  color: var(--foreground, #ffffff);
  overflow: hidden;
}

/* 背景能量线动画 */
.battle-overlay::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    linear-gradient(90deg, transparent 49.5%, rgba(96, 165, 250, 0.03) 49.5%, rgba(96, 165, 250, 0.03) 50.5%, transparent 50.5%),
    linear-gradient(0deg, transparent 49.5%, rgba(96, 165, 250, 0.03) 49.5%, rgba(96, 165, 250, 0.03) 50.5%, transparent 50.5%);
  background-size: 40px 40px;
  animation: grid-scroll 20s linear infinite;
  pointer-events: none;
}
@keyframes grid-scroll {
  to { transform: translate(40px, 40px); }
}

.battle-panel {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
  z-index: 1;
}

/* ===== Header ===== */
.battle-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  flex-shrink: 0;
  background: linear-gradient(180deg, rgba(26, 10, 46, 0.9), rgba(13, 13, 26, 0.6));
  backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(96, 165, 250, 0.15);
}

.battle-back-btn,
.battle-backpack-btn {
  width: 38px;
  height: 38px;
  border: 1px solid rgba(96, 165, 250, 0.2);
  background: rgba(96, 165, 250, 0.08);
  color: #60a5fa;
  font-size: 18px;
  border-radius: 10px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}
.battle-back-btn:hover,
.battle-backpack-btn:hover {
  background: rgba(96, 165, 250, 0.15);
  border-color: rgba(96, 165, 250, 0.4);
  box-shadow: 0 0 12px rgba(96, 165, 250, 0.2);
}

.battle-wave-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.wave-label {
  font-size: 15px;
  font-weight: 700;
  background: linear-gradient(90deg, #60a5fa, #a78bfa);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.boss-badge {
  padding: 3px 10px;
  background: linear-gradient(135deg, #dc2626, #991b1b);
  border-radius: 6px;
  font-size: 11px;
  font-weight: 800;
  color: #fff;
  text-shadow: 0 0 8px rgba(220, 38, 38, 0.5);
  animation: boss-pulse 2s ease-in-out infinite;
}
@keyframes boss-pulse {
  0%, 100% { box-shadow: 0 0 8px rgba(220, 38, 38, 0.3); }
  50% { box-shadow: 0 0 20px rgba(220, 38, 38, 0.6); }
}

/* ===== Generating ===== */
.battle-generating {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
}

.generating-spinner {
  width: 56px;
  height: 56px;
  border: 3px solid rgba(96, 165, 250, 0.1);
  border-top-color: #60a5fa;
  border-right-color: #a78bfa;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.generating-text {
  font-size: 14px;
  color: rgba(96, 165, 250, 0.6);
  text-align: center;
  animation: text-fade 1.5s ease-in-out infinite;
}
@keyframes text-fade {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}

/* ===== Enemy area ===== */
.battle-enemy-area {
  padding: 6px 12px 10px;
  flex-shrink: 0;
}

/* ===== Team area — 紧贴底部 ===== */
.battle-team-area {
  padding: 0 12px 0;
  flex-shrink: 0;
  margin-top: auto;
  position: relative;
}

/* ===== Region divider ===== */
.region-divider {
  height: 2px;
  margin: 0 0 8px;
  border-radius: 1px;
  background: linear-gradient(90deg, transparent 0%, rgba(239, 68, 68, 0.5) 50%, transparent 100%);
  position: relative;
}
.region-divider.enemy-divider {
  animation: energy-line-red 3s ease-in-out infinite;
}
@keyframes energy-line-red {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}
.region-divider.team-divider {
  background: linear-gradient(90deg, transparent 0%, rgba(96, 165, 250, 0.5) 50%, transparent 100%);
  margin: 0 0 4px;
  animation: energy-line-blue 3s ease-in-out infinite;
}
@keyframes energy-line-blue {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}

/* ===== Phase indicator ===== */
.phase-indicator {
  text-align: center;
  padding: 3px 0 6px;
}
.phase-badge {
  display: inline-block;
  padding: 3px 14px;
  border-radius: 14px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1px;
  text-transform: uppercase;
}
.phase-badge.player-phase {
  background: linear-gradient(135deg, rgba(96, 165, 250, 0.15), rgba(139, 92, 246, 0.15));
  border: 1px solid rgba(96, 165, 250, 0.3);
  color: #60a5fa;
  box-shadow: 0 0 12px rgba(96, 165, 250, 0.1);
}
.phase-badge.enemy-phase {
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.15), rgba(220, 38, 38, 0.15));
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #f87171;
  animation: enemy-pulse 1.5s ease-in-out infinite;
}
@keyframes enemy-pulse {
  0%, 100% { opacity: 1; box-shadow: 0 0 8px rgba(239, 68, 68, 0.1); }
  50% { opacity: 0.6; box-shadow: 0 0 16px rgba(239, 68, 68, 0.3); }
}

/* ===== Item targeting hint ===== */
.item-targeting-hint {
  text-align: center;
  padding: 6px 12px;
  font-size: 12px;
  color: #fbbf24;
  animation: hint-blink 1.2s ease-in-out infinite;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
@keyframes hint-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.hint-cancel-btn {
  width: 22px;
  height: 22px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  font-size: 12px;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.15s;
}
.hint-cancel-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  border-color: rgba(255, 255, 255, 0.4);
}

/* ===== Character row ===== */
.character-row {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
}
.character-row::-webkit-scrollbar { display: none; }

/* ===== Character card ===== */
.character-card {
  flex: 1;
  min-width: 60px;
  max-width: 95px;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 6px 4px 6px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.04) 0%, rgba(255, 255, 255, 0.01) 100%);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  transition: transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease;
  position: relative;
  overflow: visible;
}

/* 立绘区域 */
.card-portrait {
  width: 100%;
  aspect-ratio: 3 / 4;
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(ellipse at 50% 30%, rgba(255, 255, 255, 0.06) 0%, rgba(0, 0, 0, 0.3) 100%);
  margin-bottom: 4px;
  flex-shrink: 0;
  position: relative;
}

.portrait-img {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.portrait-img img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: top center;
  filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.5));
}

.portrait-placeholder {
  font-size: 1.8rem;
  opacity: 0.3;
}

/* 选中光效 */
.card-glow {
  position: absolute;
  inset: -4px;
  border-radius: 12px;
  background: radial-gradient(ellipse, rgba(96, 165, 250, 0.2), transparent 70%);
  animation: glow-pulse 1.5s ease-in-out infinite;
  pointer-events: none;
}
@keyframes glow-pulse {
  0%, 100% { opacity: 0.4; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.05); }
}

/* 名字+血条区域 */
.card-info {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.card-name {
  font-size: 11px;
  font-weight: 700;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  width: 100%;
  line-height: 1.2;
}

.card-hp-bar {
  width: 100%;
  height: 10px;
  background: rgba(0, 0, 0, 0.4);
  border-radius: 5px;
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.hp-bar-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.5s ease;
  position: relative;
}
.hp-bar-fill::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 50%;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.3), transparent);
  border-radius: 4px 4px 0 0;
}

.hp-bar-text {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 7px;
  font-weight: 700;
  color: #fff;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
}

.card-status-effects {
  display: flex;
  gap: 2px;
  margin-top: 3px;
  flex-wrap: wrap;
  justify-content: center;
  min-height: 14px;
}

.status-icon {
  width: 14px;
  height: 14px;
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 8px;
  font-weight: 700;
}
.status-icon.buff {
  background: rgba(34, 197, 94, 0.25);
  color: #4ade80;
  border: 1px solid rgba(34, 197, 94, 0.3);
}
.status-icon.debuff {
  background: rgba(239, 68, 68, 0.25);
  color: #f87171;
  border: 1px solid rgba(239, 68, 68, 0.3);
}

/* ===== 选中角色 ===== */
.character-card.is-active-turn {
  border-color: #60a5fa;
  background: linear-gradient(180deg, rgba(96, 165, 250, 0.1), rgba(96, 165, 250, 0.02));
  transform: scale(1.08) translateY(-4px);
  box-shadow:
    0 0 20px rgba(96, 165, 250, 0.3),
    0 8px 32px rgba(0, 0, 0, 0.5),
    inset 0 1px 0 rgba(96, 165, 250, 0.2);
  z-index: 10;
}

.character-card.is-item-target {
  border-color: rgba(251, 191, 36, 0.5);
  background: linear-gradient(180deg, rgba(251, 191, 36, 0.08), rgba(251, 191, 36, 0.02));
  animation: item-target-glow 1s ease-in-out infinite;
}
@keyframes item-target-glow {
  0%, 100% { box-shadow: 0 0 8px rgba(251, 191, 36, 0.1); }
  50% { box-shadow: 0 0 20px rgba(251, 191, 36, 0.3); }
}

/* 已行动角色 */
.character-card.has-acted {
  opacity: 0.3;
  filter: grayscale(0.6) brightness(0.7);
  pointer-events: none;
}

.character-card.is-dead {
  opacity: 0.2;
  filter: grayscale(1) brightness(0.5);
  pointer-events: none;
  transform: scale(0.95);
}

.character-card.is-targetable {
  border-color: #4ade80;
  cursor: pointer;
  background: linear-gradient(180deg, rgba(74, 222, 128, 0.08), rgba(74, 222, 128, 0.02));
  animation: targetable-pulse 1.2s ease-in-out infinite;
}
@keyframes targetable-pulse {
  0%, 100% { box-shadow: 0 0 6px rgba(74, 222, 128, 0.15); }
  50% { box-shadow: 0 0 20px rgba(74, 222, 128, 0.4); }
}
.character-card.is-targetable:active {
  background: rgba(74, 222, 128, 0.2);
  transform: scale(1.04);
}

/* ===== 出击/受击动画 ===== */
.character-card.anim-attack {
  animation: attack-lunge 0.4s ease-out;
}
@keyframes attack-lunge {
  0% { transform: translateX(0) scale(1); }
  25% { transform: translateX(14px) scale(1.1); }
  50% { transform: translateX(-6px) scale(1.05); }
  75% { transform: translateX(3px); }
  100% { transform: translateX(0) scale(1); }
}
.enemy-card.anim-attack {
  animation: attack-lunge-enemy 0.4s ease-out;
}
@keyframes attack-lunge-enemy {
  0% { transform: translateX(0) scale(1); }
  25% { transform: translateX(-14px) scale(1.1); }
  50% { transform: translateX(6px) scale(1.05); }
  75% { transform: translateX(-3px); }
  100% { transform: translateX(0) scale(1); }
}

.character-card.anim-hit {
  animation: hit-shake 0.4s ease-out;
}
@keyframes hit-shake {
  0% { transform: translateX(0); filter: brightness(1); }
  8% { transform: translateX(-8px); filter: brightness(2) saturate(0.5); }
  16% { transform: translateX(8px); filter: brightness(2) saturate(0.5); }
  24% { transform: translateX(-5px); }
  32% { transform: translateX(5px); }
  40% { transform: translateX(-3px); }
  50% { transform: translateX(3px); }
  65% { transform: translateX(-1px); }
  80% { transform: translateX(1px); filter: brightness(1.1); }
  100% { transform: translateX(0); filter: brightness(1); }
}

/* ===== 浮动伤害数字 ===== */
.floating-numbers-layer {
  position: fixed;
  inset: 0;
  z-index: 10001;
  pointer-events: none;
}

.floating-damage {
  position: fixed;
  transform: translateX(-50%);
  font-weight: 900;
  text-shadow: 0 0 10px currentColor, 0 2px 6px rgba(0, 0, 0, 0.8);
  animation: float-damage 1s cubic-bezier(0.2, 0, 0, 1) forwards;
  z-index: 10001;
  pointer-events: none;
}
.floating-damage.is-crit {
  font-size: 2.2rem !important;
  color: #ff4444 !important;
  animation: float-damage-crit 1.2s cubic-bezier(0.2, 0, 0, 1) forwards;
}
@keyframes float-damage {
  0% { opacity: 0; transform: translateX(-50%) translateY(20px) scale(0.3); }
  10% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1.3); }
  20% { transform: translateX(-50%) translateY(-5px) scale(1); }
  100% { opacity: 0; transform: translateX(-50%) translateY(-80px) scale(0.7); }
}
@keyframes float-damage-crit {
  0% { opacity: 0; transform: translateX(-50%) translateY(20px) scale(0.2) rotate(-5deg); }
  10% { opacity: 1; transform: translateX(-50%) translateY(-10px) scale(1.4) rotate(2deg); }
  20% { transform: translateX(-50%) translateY(-15px) scale(1.1) rotate(-1deg); }
  100% { opacity: 0; transform: translateX(-50%) translateY(-100px) scale(0.6) rotate(0deg); }
}

/* ===== Skill panel (above team cards) ===== */
.skill-panel-wrapper {
  margin-bottom: 6px;
  padding: 10px 12px;
  background: linear-gradient(135deg, rgba(20, 15, 40, 0.95), rgba(30, 20, 50, 0.95));
  border: 1px solid rgba(96, 165, 250, 0.2);
  border-radius: 14px;
  backdrop-filter: blur(16px);
  box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.4), 0 0 20px rgba(96, 165, 250, 0.05);
}

/* 技能面板出现动画 */
.skill-panel-enter-active {
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.skill-panel-leave-active {
  transition: all 0.2s ease-in;
}
.skill-panel-enter-from {
  opacity: 0;
  transform: translateY(20px) scale(0.95);
}
.skill-panel-leave-to {
  opacity: 0;
  transform: translateY(10px) scale(0.98);
}

.skill-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  gap: 8px;
}

.deselect-btn,
.skip-btn {
  padding: 4px 12px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.5);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}
.deselect-btn:hover,
.skip-btn:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  border-color: rgba(255, 255, 255, 0.25);
}

.selected-name {
  font-size: 13px;
  font-weight: 700;
  background: linear-gradient(90deg, #60a5fa, #a78bfa);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

/* ===== Battle log ===== */
.battle-log-area {
  flex: 1;
  overflow-y: auto;
  padding: 6px 14px;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.3), rgba(0, 0, 0, 0.15));
  border-top: 1px solid rgba(96, 165, 250, 0.06);
  min-height: 45px;
  max-height: 130px;
  flex-shrink: 1;
  margin: 6px 0;
  border-radius: 8px;
}
.battle-log-area::-webkit-scrollbar { width: 3px; }
.battle-log-area::-webkit-scrollbar-track { background: transparent; }
.battle-log-area::-webkit-scrollbar-thumb { background: rgba(96, 165, 250, 0.2); border-radius: 3px; }

.log-entry {
  font-size: 11px;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.55);
  padding: 1px 0;
  transition: color 0.2s;
}
.log-entry + .log-entry {
  border-top: 1px solid rgba(255, 255, 255, 0.03);
}

.log-entry.log-divider {
  text-align: center;
  padding: 3px 0;
  color: rgba(96, 165, 250, 0.35);
}
.log-divider-text {
  font-size: 10px;
  letter-spacing: 3px;
  font-weight: 600;
}

.log-entry.log-damage { color: rgba(255, 255, 255, 0.75); }
.log-entry.log-crit { color: #f87171; font-weight: 700; }
.log-entry.log-heal { color: #4ade80; }
.log-entry.log-drop { color: #fbbf24; font-size: 11px; }
.log-entry.log-kill { color: #ef4444; font-weight: 700; }
.log-entry.log-skip { color: rgba(255, 255, 255, 0.25); font-style: italic; }
.log-entry.log-empty { color: rgba(255, 255, 255, 0.2); font-style: italic; text-align: center; }

.log-skill {
  color: #a78bfa;
  font-weight: 700;
}
.log-crit-badge {
  color: #ff4444;
  font-weight: 800;
}

/* ===== Round end overlay ===== */
.round-end-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(ellipse at center, rgba(10, 5, 20, 0.7), rgba(5, 5, 10, 0.85));
  backdrop-filter: blur(8px);
  animation: round-end-fade-in 0.35s ease-out;
}
@keyframes round-end-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.round-end-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 36px 52px;
  background: linear-gradient(135deg, rgba(20, 15, 40, 0.98), rgba(30, 20, 50, 0.98));
  border: 1px solid rgba(245, 158, 11, 0.25);
  border-radius: 20px;
  box-shadow:
    0 0 40px rgba(245, 158, 11, 0.08),
    0 16px 64px rgba(0, 0, 0, 0.6);
  animation: round-end-pop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes round-end-pop {
  from { transform: scale(0.7) translateY(20px); opacity: 0; }
  to { transform: scale(1) translateY(0); opacity: 1; }
}

.round-end-label {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.4);
  margin: 0;
  letter-spacing: 2px;
  text-transform: uppercase;
}

.round-end-btn {
  padding: 14px 52px;
  border: none;
  border-radius: 14px;
  font-size: 17px;
  font-weight: 800;
  letter-spacing: 1px;
  color: #fff;
  background: linear-gradient(135deg, #f59e0b, #d97706);
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 4px 24px rgba(245, 158, 11, 0.3);
  text-transform: uppercase;
}
.round-end-btn:hover {
  transform: translateY(-2px) scale(1.03);
  box-shadow: 0 8px 36px rgba(245, 158, 11, 0.5);
  background: linear-gradient(135deg, #fbbf24, #f59e0b);
}
.round-end-btn:active {
  transform: translateY(0) scale(0.98);
}

/* ===== Result area — 固定在屏幕正中间 ===== */
.battle-result-area {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 50;
  padding: 28px 32px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  background: rgba(10, 10, 18, 0.92);
  border: 1px solid rgba(96, 165, 250, 0.2);
  border-radius: 16px;
  backdrop-filter: blur(12px);
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.6);
  min-width: 280px;
  animation: result-pop 0.3s ease-out;
}

@keyframes result-pop {
  0% { opacity: 0; transform: translate(-50%, -50%) scale(0.9); }
  100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}

.result-victory h3,
.result-wave-clear h3,
.result-defeat h3 {
  margin: 0;
  font-size: 22px;
  font-weight: 800;
}
.result-victory h3 { color: #4ade80; text-shadow: 0 0 20px rgba(74, 222, 128, 0.3); }
.result-wave-clear h3 { color: #60a5fa; text-shadow: 0 0 20px rgba(96, 165, 250, 0.3); }
.result-defeat h3 { color: #ef4444; text-shadow: 0 0 20px rgba(239, 68, 68, 0.3); }

.result-victory p,
.result-defeat p {
  margin: 0;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.4);
}

.drop-list {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
}
.drop-item {
  padding: 4px 12px;
  background: rgba(234, 179, 8, 0.1);
  border: 1px solid rgba(234, 179, 8, 0.25);
  border-radius: 8px;
  font-size: 12px;
  color: #fbbf24;
}

.result-wave-clear {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.result-wave-clear .drop-list {
  margin-bottom: 8px;
}

.result-btn {
  padding: 12px 32px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.05em;
  color: #fff;
  background: rgba(255, 255, 255, 0.08);
  cursor: pointer;
  transition: all 0.2s;
}
.result-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(96, 165, 250, 0.4);
  box-shadow: 0 4px 20px rgba(96, 165, 250, 0.15);
}
.result-btn.defeat-btn {
  border-color: rgba(239, 68, 68, 0.3);
  background: rgba(239, 68, 68, 0.1);
}
.result-btn.defeat-btn:hover {
  background: rgba(239, 68, 68, 0.2);
  border-color: rgba(239, 68, 68, 0.5);
  box-shadow: 0 4px 20px rgba(239, 68, 68, 0.15);
}
</style>
