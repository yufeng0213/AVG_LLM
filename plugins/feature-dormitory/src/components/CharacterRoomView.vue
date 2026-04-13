<script setup>
/**
 * 角色房间视图组件
 * 包含角色房间显示、覆盖面板、聊天界面等所有房间相关功能
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import RedPacket from './RedPacket.vue'
import DailyCyclePanel from './DailyCyclePanel.vue'
import StatusPanel from './StatusPanel.vue'
import BackpackPanel from './BackpackPanel.vue'
import DiaryPanel from './DiaryPanel.vue'
import PolaroidCameraScreen from '../PolaroidCameraScreen.vue'
import GiftItemConfirmModal from './GiftItemConfirmModal.vue'
import DiaryGeneratingModal from './DiaryGeneratingModal.vue'

const dormChatHistoryRef = ref(null)
const isDormMenuOpen = ref(false)
const DORM_OVERLAY_PANEL_OPTIONS = [
  { id: 'interaction', label: '互动' },
  { id: 'drift', label: '漂流瓶' },
  { id: 'backpack', label: '背包' },
  { id: 'scene', label: '场景' },
  { id: 'schedule', label: '日程' },
  { id: 'status', label: '状态' },
  { id: 'journal', label: '记录' },
  { id: 'diary', label: '日记' },
  { id: 'appointment', label: '约定' },
]

const activeDormOverlayPanelId = ref('')
  // 面板相关
const isDormOverlayPanelExpanded = ref(false)


defineExpose({
  dormChatHistoryRef
})

const props = defineProps({
  // 角色相关
  selectedCharacter: {
    type: Object,
    default: null
  },
  selectedCharacterPortraitUrl: {
    type: String,
    default: ''
  },
  selectedCharacterArchetypeLabels: {
    type: String,
    default: ''
  },



  // 状态相关
  selectedDormState: {
    type: Object,
    default: () => ({})
  },
  selectedDormAffectionStyle: {
    type: Object,
    default: () => ({})
  },
  selectedDormEnergyStyle: {
    type: Object,
    default: () => ({})
  },
  selectedDormRelationshipStageLabel: {
    type: String,
    default: ''
  },
  selectedDormRelationshipProgressHint: {
    type: String,
    default: ''
  },
  selectedDormUnlockedEventChainCount: {
    type: Number,
    default: 0
  },
  selectedDormUnlockedEventChainHint: {
    type: String,
    default: ''
  },

  // 场景相关
  generatedDormSubScenes: {
    type: Array,
    default: () => []
  },
  activeDormSubScene: {
    type: Object,
    default: null
  },
  activeDormSubSceneVisitCount: {
    type: Number,
    default: 0
  },
  activeDormSubSceneFacilityLevel: {
    type: Number,
    default: 1
  },
  activeDormSubSceneFacilityBonusPercent: {
    type: Number,
    default: 0
  },
  DORM_SCENE_FACILITY_MAX_LEVEL: {
    type: Number,
    default: 10
  },
  canUpgradeActiveSceneFacility: {
    type: Boolean,
    default: false
  },
  activeSceneUpgradeButtonText: {
    type: String,
    default: '升级'
  },
  activeDormSubSceneActivityOptions: {
    type: Array,
    default: () => []
  },
  selectedDormSubSceneActivity: {
    type: Object,
    default: null
  },

  // 日程相关
  currentDormTimeSlotLabel: {
    type: String,
    default: ''
  },
  remainingDormActionSlots: {
    type: Number,
    default: 0
  },
  completedTodayWishCount: {
    type: Number,
    default: 0
  },
  totalTodayWishCount: {
    type: Number,
    default: 0
  },
  isDormDayActionClosed: {
    type: Boolean,
    default: false
  },

  // 背包相关
  activeBookInventory: {
    type: Array,
    default: () => []
  },
  isGiftItemProcessing: {
    type: Boolean,
    default: false
  },

  // 漂流瓶相关
  selectedDormDriftRemainingThrowCount: {
    type: Number,
    default: 0
  },
  selectedDormDriftRemainingPickCount: {
    type: Number,
    default: 0
  },
  selectedDormDriftPickHint: {
    type: String,
    default: ''
  },
  selectedDormDriftInbox: {
    type: Array,
    default: () => []
  },
  selectedDormDriftMyThrowList: {
    type: Array,
    default: () => []
  },
  isDormDriftPicking: {
    type: Boolean,
    default: false
  },
  DORM_DRIFT_BOTTLE_DAILY_THROW_LIMIT: {
    type: Number,
    default: 3
  },
  DORM_DRIFT_BOTTLE_DAILY_PICK_LIMIT: {
    type: Number,
    default: 5
  },
  DORM_DRIFT_BOTTLE_TEXT_LIMIT: {
    type: Number,
    default: 140
  },
  driftBottleDraft: {
    type: String,
    default: ''
  },
  canThrowDormDriftBottle: {
    type: Boolean,
    default: false
  },
  canPickDormDriftBottle: {
    type: Boolean,
    default: false
  },
  canAskDormDriftBottleFollowUp: {
    type: Function,
    default: () => false
  },

  // 聊天相关
  dormChatOverlayHeight: {
    type: Number,
    default: 300
  },
  selectedDormChatHistory: {
    type: Array,
    default: () => []
  },
  dormChatDraft: {
    type: String,
    default: ''
  },
  isDormChatSending: {
    type: Boolean,
    default: false
  },
  canSendDormChat: {
    type: Boolean,
    default: false
  },
  dormChatError: {
    type: String,
    default: ''
  },

  // 互动相关
  dormQuickActionType: {
    type: String,
    default: 'chat'
  },
  DORM_QUICK_ACTION_OPTIONS: {
    type: Array,
    default: () => []
  },
  canRunDormQuickAction: {
    type: Boolean,
    default: false
  },
  dormQuickActionRunButtonText: {
    type: String,
    default: '执行'
  },
  actionFeedback: {
    type: String,
    default: ''
  },
  stageUpgradeToast: {
    type: Object,
    default: null
  },
  activeDormEvent: {
    type: Object,
    default: null
  },
  activeDormEventChainProgressText: {
    type: String,
    default: ''
  },

  // 日记相关
  diaryList: {
    type: Array,
    default: () => []
  },
  selectedDiary: {
    type: Object,
    default: null
  },
  diaryMode: {
    type: String,
    default: 'list'
  },

  // 拍立得
  isPolaroidScreenOpen: {
    type: Boolean,
    default: false
  },

  // 经济
  activeBookEconomyCoins: {
    type: Number,
    default: 0
  },

  // Composable 对象（用于访问 .value ref）
  gift: {
    type: Object,
    default: () => ({})
  },
  diary: {
    type: Object,
    default: () => ({})
  },
  redPacket: {
    type: Object,
    default: () => ({})
  },
  task: {
    type: Object,
    default: () => ({})
  }
})


const emit = defineEmits([
  'close-overlay-panel',
  'select-dorm-overlay-panel',
  'select-dorm-sub-scene',
  'upgrade-scene-facility',
  'select-dorm-sub-scene-activity',
  'run-dorm-sub-scene-activity',
  'advance-dorm-day',
  'gift-dorm-item',
  'throw-drift-bottle',
  'pick-drift-bottle',
  'ask-drift-follow-up',
  'toggle-drift-star',
  'delete-drift-inbox-entry',
  'send-dorm-chat',
  'start-drag-resize',
  'start-drag-resize-touch',
  'run-dorm-quick-action',
  'handle-dorm-event-option',
  'open-diary-detail',
  'back-to-diary-list',
  'update-dorm-chat-draft',
  'update-drift-bottle-draft',
  'update-dorm-quick-action-type',
  'task-invite-click',
  'task-invite-toggle',
  'red-packet-opened',
  'red-packet-send',
  // 拍立得
  'polaroid-back',
  'polaroid-complete',
  // 约定
  'open-appointment',
])

function handleCloseOverlayPanel() {
  isDormOverlayPanelExpanded.value = false
}

function handleSelectOverlayPanel(panelId) {
  console.log('[菜单] 选择面板:', panelId)
  activeDormOverlayPanelId.value = panelId
  console.log('[菜单] activeDormOverlayPanelId:', activeDormOverlayPanelId.value)
  isDormOverlayPanelExpanded.value = true
  isDormMenuOpen.value = false
}

function handleToggleMenu() {
  isDormMenuOpen.value = !isDormMenuOpen.value
  console.log('[菜单] isDormMenuOpen:', isDormMenuOpen.value, '选项:', DORM_OVERLAY_PANEL_OPTIONS)
}

function handleSubSceneSelectChange(event) {
  emit('select-dorm-sub-scene', event.target.value)
}

function handleUpgradeFacility() {
  emit('upgrade-scene-facility')
}

function handleActivitySelectChange(event) {
  emit('select-dorm-sub-scene-activity', event.target.value)
}

function handleRunActivity() {
  emit('run-dorm-sub-scene-activity')
}

function handleAdvanceDay() {
  emit('advance-dorm-day')
}

function handleGiftItem(item) {
  emit('gift-dorm-item', item)
}

function handleThrowBottle() {
  emit('throw-drift-bottle')
}

function handlePickBottle() {
  emit('pick-drift-bottle')
}

function handleAskFollowUp(entryId) {
  emit('ask-drift-follow-up', entryId)
}

function handleToggleStar(entryId) {
  emit('toggle-drift-star', entryId)
}

function handleDeleteInboxEntry(entryId) {
  emit('delete-drift-inbox-entry', entryId)
}

function handleSendChat() {
  emit('send-dorm-chat')
}

function handleStartDragResize(event) {
  emit('start-drag-resize', event)
}

function handleStartDragResizeTouch(event) {
  emit('start-drag-resize-touch', event)
}

function handleRunQuickAction() {
  emit('run-dorm-quick-action')
}

function handleDormEventOption(option) {
  emit('handle-dorm-event-option', option)
}

function handleOpenDiary(diary) {
  emit('open-diary-detail', diary)
}

function handleBackToDiaryList() {
  emit('back-to-diary-list')
}

function handleChatDraftInput(event) {
  emit('update-dorm-chat-draft', event.target.value)
}

function handleDriftDraftInput(event) {
  emit('update-drift-bottle-draft', event.target.value)
}

function handleDormQuickActionTypeChange(event) {
  emit('update-dorm-quick-action-type', event.target.value)
}

function handleTaskInviteClick(taskId) {
  emit('task-invite-click', taskId)
}

function handleTaskInviteToggle() {
  isDormMenuOpen.value = false
  emit('task-invite-toggle')
}

function handleRedPacketOpened(packet) {
  emit('red-packet-opened', packet)
}

function handleRedPacketSend() {
  emit('red-packet-send')
}

function handlePolaroidBack() {
  emit('polaroid-back')
}

function handlePolaroidComplete(photoData) {
  emit('polaroid-complete', photoData)
}

function isDriftFollowUpPending(entryId) {
  const entry = props.selectedDormDriftInbox.find(e => e.id === entryId)
  return entry?.replyState === 'pending'
}

// 来访类型工具
const VISIT_TYPE_ICONS = { note: '📝', message: '💬', redPacket: '🧧', gift: '🎁' }
const VISIT_TYPE_LABELS = { note: '纸条', message: '留言', redPacket: '红包', gift: '礼物' }

function visitTypeIcon(type) {
  return VISIT_TYPE_ICONS[type] || '📝'
}

function visitTypeLabel(type) {
  return VISIT_TYPE_LABELS[type] || '内容'
}

function formatVisitTime(timestamp) {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now - date
  const mins = Math.floor(diff / (1000 * 60))
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins} 分钟前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  return `${days} 天前`
}
</script>

<template>
  <section class="character-room-stage">
    <article class="character-room-overlay-card">
      <img class="character-room-portrait" :src="selectedCharacterPortraitUrl" :alt="selectedCharacter?.label || '角色'" />
      <div class="character-room-overlay-mask" aria-hidden="true" />

      <!-- 覆盖面板 -->
      <section v-if="isDormOverlayPanelExpanded" class="dorm-overlay-panel" aria-label="寝室二级操作">
        <header class="dorm-overlay-panel-head">
          <button type="button" class="dorm-overlay-panel-close" @click="handleCloseOverlayPanel">×</button>
        </header>

        <div class="dorm-overlay-panel-body">
          <!-- 二级场景面板 -->
          <section v-if="activeDormOverlayPanelId === 'scene'" class="sub-scene-panel">
            <div class="sub-scene-head">
              <p class="sub-scene-title">二级场景</p>
              <p class="sub-scene-personality">性格倾向：{{ selectedCharacterArchetypeLabels }}</p>
            </div>

            <div v-if="generatedDormSubScenes.length === 0" class="sub-scene-empty">当前角色暂无可生成的二级场景。</div>
            <template v-else>
              <div class="sub-scene-select-row">
                <label class="sub-scene-select-wrap">
                  <span class="sub-scene-select-label">当前场景</span>
                  <select class="sub-scene-select" :value="activeDormSubScene?.id || ''" @change="handleSubSceneSelectChange">
                    <option
                      v-for="scene in generatedDormSubScenes"
                      :key="scene.id"
                      :value="scene.id"
                    >
                      {{ scene.name }} · {{ scene.subtitle }}
                    </option>
                  </select>
                </label>
              </div>

              <article v-if="activeDormSubScene" class="sub-scene-card">
                <p class="sub-scene-card-title">{{ activeDormSubScene.name }}</p>
                <p class="sub-scene-card-desc">{{ activeDormSubScene.ambience }}</p>
                <p class="sub-scene-card-meta">
                  访问 {{ activeDormSubSceneVisitCount }} 次
                  ·
                  {{
                    activeDormSubScene.matchedArchetypes.length > 0
                      ? `匹配：${activeDormSubScene.matchedArchetypes.join(' / ')}`
                      : '通用场景'
                  }}
                </p>

                <div class="sub-scene-facility-row">
                  <p class="sub-scene-facility-meta">
                    设施等级 Lv{{ activeDormSubSceneFacilityLevel }} / {{ DORM_SCENE_FACILITY_MAX_LEVEL }}
                    · 场景收益 +{{ activeDormSubSceneFacilityBonusPercent }}%
                  </p>
                  <button
                    type="button"
                    class="sub-scene-upgrade-btn"
                    :disabled="!canUpgradeActiveSceneFacility"
                    @click="handleUpgradeFacility"
                  >
                    {{ activeSceneUpgradeButtonText }}
                  </button>
                </div>

                <div class="sub-scene-decor-row">
                  <span v-for="decor in activeDormSubScene.decor" :key="`${activeDormSubScene.id}_${decor}`" class="sub-scene-decor-chip">
                    {{ decor }}
                  </span>
                </div>

                <div class="sub-scene-action-compact">
                  <label class="sub-scene-action-select-wrap">
                    <span class="sub-scene-action-label">场景互动</span>
                    <select
                      class="sub-scene-action-select"
                      :value="selectedDormSubSceneActivity?.id || ''"
                      @change="handleActivitySelectChange"
                    >
                      <option
                        v-for="activity in activeDormSubSceneActivityOptions"
                        :key="activity.id"
                        :value="activity.id"
                      >
                        {{ activity.label }}
                      </option>
                    </select>
                  </label>
                  <button
                    type="button"
                    class="sub-scene-action-run-btn"
                    :disabled="!selectedDormSubSceneActivity"
                    @click="handleRunActivity"
                  >
                    执行场景互动
                  </button>
                </div>
              </article>
            </template>
          </section>

          <!-- 日程面板 -->
          <DailyCyclePanel
            v-if="activeDormOverlayPanelId === 'schedule'"
            :day-index="selectedDormState.dayIndex"
            :current-time-slot-label="currentDormTimeSlotLabel"
            :remaining-dorm-action-slots="remainingDormActionSlots"
            :completed-today-wish-count="completedTodayWishCount"
            :total-today-wish-count="totalTodayWishCount"
            :today-wishes="selectedDormState.todayWishes"
            :is-dorm-day-action-closed="isDormDayActionClosed"
            @advance-day="handleAdvanceDay"
          />

          <!-- 状态面板 -->
          <StatusPanel
            v-if="activeDormOverlayPanelId === 'status'"
            :character-data="selectedCharacter"
            @close="handleCloseOverlayPanel"
          />

          <!-- 背包面板 -->
          <BackpackPanel
            v-if="activeDormOverlayPanelId === 'backpack'"
            :backpack-items="activeBookInventory"
            @close="handleCloseOverlayPanel"
            @give-item="handleGiftItem"
          />

          <!-- 漂流瓶面板 -->
          <section v-if="activeDormOverlayPanelId === 'drift'" class="dorm-drift-panel">
            <div class="dorm-drift-head">
              <p class="dorm-drift-title">漂流瓶海域</p>
              <p class="dorm-drift-meta">
                今日投放 {{ selectedDormState.driftBottleThrowCount }} / {{ DORM_DRIFT_BOTTLE_DAILY_THROW_LIMIT }}
                ·
                捞取 {{ selectedDormState.driftBottlePickCount }} / {{ DORM_DRIFT_BOTTLE_DAILY_PICK_LIMIT }}
              </p>
            </div>

            <label class="dorm-drift-compose">
              <span class="dorm-drift-label">投放新漂流瓶</span>
              <textarea
                :value="driftBottleDraft"
                class="dorm-drift-input"
                :maxlength="DORM_DRIFT_BOTTLE_TEXT_LIMIT"
                placeholder="写下一句话，扔进海里..."
                @input="handleDriftDraftInput"
              />
            </label>

            <div class="dorm-drift-action-row">
              <button
                type="button"
                class="dorm-drift-action-btn throw"
                :disabled="!canThrowDormDriftBottle"
                @click="handleThrowBottle"
              >
                {{ selectedDormDriftRemainingThrowCount > 0 ? '投放漂流瓶' : '今日已投放' }}
              </button>
              <button
                type="button"
                class="dorm-drift-action-btn pick"
                :disabled="!canPickDormDriftBottle"
                @click="handlePickBottle"
              >
                {{ isDormDriftPicking ? '捞取中...' : selectedDormDriftRemainingPickCount > 0 ? '捞一个' : '今日已捞满' }}
              </button>
            </div>

            <p class="dorm-drift-tip">
              剩余投放 {{ selectedDormDriftRemainingThrowCount }} 次 · 剩余捞取 {{ selectedDormDriftRemainingPickCount }} 次
            </p>
            <p class="dorm-drift-tip subtle">{{ selectedDormDriftPickHint }}</p>

            <section class="dorm-drift-group">
              <p class="dorm-drift-group-title">我的捞取记录</p>
              <p v-if="selectedDormDriftInbox.length <= 0" class="dorm-drift-empty">还没有捞到漂流瓶。</p>
              <ul v-else class="dorm-drift-list">
                <li v-for="entry in selectedDormDriftInbox" :key="entry.id" class="dorm-drift-item">
                  <p class="dorm-drift-item-text">"{{ entry.text }}"</p>
                  <p class="dorm-drift-item-meta">来自 {{ entry.authorName }} · 捞取于 {{ entry.pickedAt }}</p>
                  <p v-if="entry.replyState === 'pending'" class="dorm-drift-item-reply pending">
                    {{ entry.replyAuthorName || (selectedCharacter?.label || '角色') }}正在写回信...
                  </p>
                  <p v-else-if="entry.replyText" class="dorm-drift-item-reply">
                    {{ entry.replyAuthorName || (selectedCharacter?.label || '角色') }}：{{ entry.replyText }}
                  </p>
                  <p
                    v-for="(followUpReply, followUpIndex) in entry.followUpReplies || []"
                    :key="`${entry.id}_followup_${followUpIndex}`"
                    class="dorm-drift-item-reply follow-up"
                  >
                    补充 {{ followUpIndex + 1 }}：{{ followUpReply }}
                  </p>
                  <div class="dorm-drift-item-actions">
                    <button
                      type="button"
                      class="dorm-drift-item-btn ask"
                      :disabled="!canAskDormDriftBottleFollowUp(entry)"
                      @click="handleAskFollowUp(entry.id)"
                    >
                      {{
                        isDriftFollowUpPending(entry.id)
                          ? '追问中...'
                          : (entry.followUpReplies?.length || 0) > 0
                            ? '再追问'
                            : '追问'
                      }}
                    </button>
                    <button
                      type="button"
                      class="dorm-drift-item-btn star"
                      :class="{ active: entry.isStarred }"
                      :disabled="isDriftFollowUpPending(entry.id)"
                      @click="handleToggleStar(entry.id)"
                    >
                      {{ entry.isStarred ? '已收藏' : '收藏' }}
                    </button>
                    <button
                      type="button"
                      class="dorm-drift-item-btn danger"
                      :disabled="isDriftFollowUpPending(entry.id)"
                      @click="handleDeleteInboxEntry(entry.id)"
                    >
                      删除
                    </button>
                  </div>
                </li>
              </ul>
            </section>

            <section class="dorm-drift-group">
              <p class="dorm-drift-group-title">我的投放</p>
              <p v-if="selectedDormDriftMyThrowList.length <= 0" class="dorm-drift-empty">你还没有投放过漂流瓶。</p>
              <ul v-else class="dorm-drift-list">
                <li v-for="entry in selectedDormDriftMyThrowList" :key="entry.id" class="dorm-drift-item">
                  <p class="dorm-drift-item-text">"{{ entry.text }}"</p>
                  <p class="dorm-drift-item-meta">投放于 {{ entry.createdAt }}</p>
                </li>
              </ul>
            </section>
          </section>

          <!-- 互动操作 -->
          <div v-if="activeDormOverlayPanelId === 'interaction'" class="dorm-action-compact">
            <label class="dorm-action-select-wrap">
              <span class="dorm-action-select-label">寝室互动</span>
              <select :value="dormQuickActionType" class="dorm-action-select" @change="handleDormQuickActionTypeChange">
                <option
                  v-for="option in DORM_QUICK_ACTION_OPTIONS"
                  :key="option.id"
                  :value="option.id"
                >
                  {{ option.label }}
                </option>
              </select>
            </label>
            <button
              type="button"
              class="dorm-action-run-btn"
              :class="{ event: dormQuickActionType === 'event' }"
              :disabled="!canRunDormQuickAction"
              @click="handleRunQuickAction"
            >
              {{ dormQuickActionRunButtonText }}
            </button>
          </div>

          <p v-if="actionFeedback" class="dorm-feedback">{{ actionFeedback }}</p>
          <Transition name="stage-toast">
            <section v-if="stageUpgradeToast" class="stage-upgrade-toast">
              <p class="stage-upgrade-title">关系阶段提升</p>
              <p class="stage-upgrade-main">{{ stageUpgradeToast.fromLabel }} -> {{ stageUpgradeToast.toLabel }}</p>
              <p v-if="stageUpgradeToast.unlockedChainTitles?.length > 0" class="stage-upgrade-sub">
                新解锁事件链：{{ stageUpgradeToast.unlockedChainTitles.join('、') }}
              </p>
              <p v-else class="stage-upgrade-sub">本次阶段提升暂无新增事件链。</p>
            </section>
          </Transition>

          <!-- 事件框 -->
          <section v-if="activeDormOverlayPanelId === 'interaction' && activeDormEvent" class="dorm-event-box">
            <h3 class="dorm-event-title">{{ activeDormEvent.title }}</h3>
            <p v-if="activeDormEvent.source === 'scene'" class="dorm-event-source">
              场景事件 · {{ activeDormEvent.sourceSceneName || '当前场景' }} · 设施 Lv{{ activeDormEvent.facilityLevel }}（收益 +{{ activeDormEvent.facilityBonusPercent }}%）
            </p>
            <p v-else-if="activeDormEvent.mode === 'chain'" class="dorm-event-chain-meta">
              {{ activeDormEventChainProgressText }} · 当前阶段：{{ activeDormEvent.chainStepTitle || `阶段 ${activeDormEvent.chainStepIndex + 1}` }}
            </p>
            <p v-else class="dorm-event-source">通用寝室事件</p>
            <p v-if="activeDormEvent.mode === 'chain' && activeDormEvent.chainPathLabels?.length > 0" class="dorm-event-chain-path">
              已选路线：{{ activeDormEvent.chainPathLabels.join(' → ') }}
            </p>
            <p class="dorm-event-desc">{{ activeDormEvent.description }}</p>
            <div class="dorm-event-options">
              <button
                v-for="option in activeDormEvent.options"
                :key="option.id"
                type="button"
                class="dorm-event-option-btn"
                @click="handleDormEventOption(option)"
              >
                <span class="event-option-main">{{ option.label }}</span>
                <span class="event-option-sub">{{ option.preview }}</span>
              </button>
            </div>
          </section>

          <!-- 日记面板 -->
          <DiaryPanel
            v-if="activeDormOverlayPanelId === 'diary' || activeDormOverlayPanelId === 'diary-detail'"
            :diary-entries="diaryList"
            :selected-diary="selectedDiary"
            :mode="diaryMode"
            @close="handleCloseOverlayPanel"
            @back="handleBackToDiaryList"
            @select-diary="handleOpenDiary"
          />

          <!-- 约定面板 -->
          <section v-if="activeDormOverlayPanelId === 'appointment'" class="appointment-panel-body">
            <div class="appointment-panel-icon">📝</div>
            <h3 class="appointment-panel-title">设定约定</h3>
            <p class="appointment-panel-desc">选择一个时间，让角色来寝室留下小纸条。</p>
            <button type="button" class="appointment-panel-open-btn" @click="$emit('open-appointment')">打开约定面板</button>
          </section>
        </div>
      </section>

      <!-- 聊天覆盖层 -->
      <section class="dorm-chat-overlay" :style="{ height: dormChatOverlayHeight + 'px' }" aria-label="寝室聊天内容" >
        <div class="dorm-chat-head">
          <span class="drag-handle-icon" @mousedown="handleStartDragResize" @touchstart="handleStartDragResizeTouch">≡</span>
          <p class="dorm-chat-title">和 {{ selectedCharacter?.label || '角色' }} 聊天</p>
          <div class="dorm-chat-menu-wrap">
            <button
              type="button"
              class="dorm-chat-menu-btn"
              aria-label="展开寝室操作菜单"
              @click="handleToggleMenu"
            >
              ···
            </button>
          </div>
        </div>
        <div ref="dormChatHistoryRef" class="dorm-chat-history">
          <p v-if="selectedDormChatHistory.length === 0" class="dorm-chat-empty">输入一句话，开始聊天。</p>
          <article
            v-for="message in selectedDormChatHistory"
            :key="message.id"
            class="dorm-chat-message"
            :class="{ user: message.role === 'user', assistant: message.role === 'assistant' }"
          >
            <!-- 红包消息渲染 -->
            <RedPacket
              v-if="message.type === 'redPacket' && message.redPacket"
              :packet="message.redPacket"
              @opened="handleRedPacketOpened"
            />
            <!-- 任务邀请卡片渲染 -->
            <div
              v-else-if="message.type === 'taskInvite'"
              class="dorm-chat-task-card"
              @click="handleTaskInviteClick(message.taskId)"
            >
              <div class="task-card-accent">
                <span class="task-card-accent-icon">📋</span>
              </div>
              <div class="task-card-content">
                <span class="task-card-label">任务邀请</span>
                <span class="task-card-name">{{ message.taskName }}</span>
                <span class="task-card-target" v-if="message.targetCharacterName">
                  执行者：{{ message.targetCharacterName }}
                </span>
              </div>
              <div class="task-card-arrow">
                <span class="task-card-arrow-icon">›</span>
              </div>
            </div>
            <!-- 礼物卡片渲染 -->
            <div
              v-else-if="message.type === 'gift' && message.gift"
              class="dorm-chat-gift-card"
            >
              <div class="gift-accent"></div>
              <div class="gift-body">
                <div class="gift-icon">
                  <span class="gift-emoji">{{ message.gift.icon }}</span>
                </div>
                <div class="gift-info">
                  <p class="gift-sender">{{ selectedCharacter?.label || '角色' }}</p>
                  <p class="gift-item-name">{{ message.gift.itemName }}</p>
                  <p class="gift-message">"{{ message.gift.message }}"</p>
                </div>
                <span class="gift-badge" :class="{ success: message.gift.addedToBackpack }">
                  {{ message.gift.addedToBackpack ? '已存入背包' : '背包无此物品' }}
                </span>
              </div>
            </div>
            <!-- 来访卡片渲染 -->
            <div
              v-else-if="message.type === 'visit' && message.visit"
              class="dorm-chat-visit-card"
            >
              <div class="visit-card-header">
                <span class="visit-type-icon">{{ visitTypeIcon(message.visit.visitType) }}</span>
                <span class="visit-type-label">{{ visitTypeLabel(message.visit.visitType) }}</span>
                <span class="visit-time">{{ formatVisitTime(message.visit.triggeredAt) }}</span>
              </div>
              <div class="visit-card-body">
                <p class="visit-mood">{{ message.visit.mood }}</p>
                <p class="visit-content">{{ message.visit.content }}</p>
              </div>
              <!-- 红包子卡片 -->
              <RedPacket
                v-if="message.visit.visitType === 'redPacket' && message.visit.redPacket"
                :packet="message.visit.redPacket"
                @opened="handleRedPacketOpened"
              />
              <!-- 礼物子卡片 -->
              <div v-else-if="message.visit.visitType === 'gift' && message.visit.giftItem" class="visit-gift-sub">
                <span class="visit-gift-icon">{{ message.visit.giftItem.icon }}</span>
                <span class="visit-gift-name">{{ message.visit.giftItem.name }}</span>
              </div>
            </div>
            <!-- 普通文本消息渲染 -->
            <span v-else class="dorm-chat-text">{{ message.text }}</span>
          </article>
        </div>

        <div class="dorm-chat-input-row">
          <!-- 任务邀请 "+" 按钮 -->
          <div class="dorm-chat-task-invite-wrap">
            <button
              type="button"
              class="dorm-chat-task-invite-btn"
              :disabled="isDormChatSending"
              @click.stop="handleTaskInviteToggle"
              title="执行任务"
            >+</button>
          </div>

          <input
            :value="dormChatDraft"
            type="text"
            class="dorm-chat-input"
            :disabled="isDormChatSending"
            placeholder="输入你想说的话..."
            maxlength="280"
            @input="handleChatDraftInput"
            @keydown.enter.prevent="handleSendChat"
          />
          <button
            type="button"
            class="dorm-chat-red-packet-btn"
            :disabled="isDormChatSending"
            @click="handleRedPacketSend"
            title="发送红包"
          >
            🧧
          </button>
          <button
            type="button"
            class="dorm-chat-send-btn"
            :disabled="!canSendDormChat"
            @click="handleSendChat"
          >
            {{ isDormChatSending ? '回复中...' : '发送' }}
          </button>
        </div>
        <p v-if="dormChatError" class="dorm-chat-error">{{ dormChatError }}</p>
      </section>
    </article>

    <!-- 弹出菜单（Teleport 到 body，避免被父元素裁剪） -->
    <Teleport to="body">
      <div v-show="isDormMenuOpen" class="dorm-popup-menu-backdrop" @click="handleToggleMenu">
        <div class="dorm-popup-menu-overlay" aria-label="寝室操作菜单" @click.stop>
          <p style="color: #f00; padding: 10px;">调试：{{ DORM_OVERLAY_PANEL_OPTIONS.length }} 个选项</p>
          <button
            v-for="panel in DORM_OVERLAY_PANEL_OPTIONS"
            :key="panel.id"
            type="button"
            class="dorm-menu-item"
            @click="handleSelectOverlayPanel(panel.id)"
          >
            {{ panel.label }}
          </button>
        </div>
      </div>
    </Teleport>
  </section>

  <!-- 拍立得相机界面 -->
  <PolaroidCameraScreen
    v-if="isPolaroidScreenOpen"
    :character-name="selectedCharacter?.label || '角色'"
    @back="handlePolaroidBack"
    @complete="handlePolaroidComplete"
  />

  <!-- 物品赠送确认弹窗 -->
  <GiftItemConfirmModal
    :is-open="gift.showGiftItemConfirm?.value"
    :gift-item="gift.pendingGiftItem?.value"
    :character-name="selectedCharacter?.label || '角色'"
    :is-processing="gift.isGiftItemProcessing?.value"
    @close="gift.closeGiftItemConfirm"
    @confirm="gift.confirmGiftItem"
  />

  <!-- 日记生成中模态框 -->
  <DiaryGeneratingModal
    :is-open="diary.showDiaryGeneratingModal?.value"
    :character-name="selectedCharacter?.label || '角色'"
    :message="diary.diaryGeneratingMessage?.value"
    @close="diary.showDiaryGeneratingModal.value = false"
  />

  <!-- 红包金额输入对话框 -->
  <Teleport to="body">
    <div v-if="redPacket.showRedPacketAmountDialog?.value" class="red-packet-amount-overlay" @click.self="redPacket.cancelSendRedPacket">
      <div class="red-packet-amount-dialog">
        <header class="red-packet-amount-head">
          <h3 class="red-packet-amount-title">🧧 发送红包</h3>
          <button type="button" class="red-packet-amount-close" @click="redPacket.cancelSendRedPacket">×</button>
        </header>
        <div class="red-packet-amount-body">
          <div class="red-packet-amount-current">
            <span class="current-coins-icon">💰</span>
            <span class="current-coins-label">当前金币：</span>
            <span class="current-coins-value">{{ activeBookEconomyCoins }}</span>
          </div>
          <label class="red-packet-amount-field">
            <span class="field-label">红包金额（金币）</span>
            <input
              :value="redPacket.redPacketAmountInput?.value"
              type="number"
              class="field-input"
              placeholder="请输入金额"
              min="1"
              :max="activeBookEconomyCoins"
              step="1"
              @input="redPacket.redPacketAmountInput.value = $event.target.value"
              @keydown.enter="redPacket.confirmSendRedPacket"
            />
          </label>
          <label class="red-packet-amount-field">
            <span class="field-label">祝福语（可选）</span>
            <input
              :value="redPacket.redPacketBlessingInput?.value"
              type="text"
              class="field-input"
              placeholder="输入祝福语"
              maxlength="50"
              @input="redPacket.redPacketBlessingInput.value = $event.target.value"
            />
          </label>
          <p class="red-packet-amount-hint">
            发送红包将扣除相应金币，领取者将获得等额金币奖励。
          </p>
        </div>
        <footer class="red-packet-amount-footer">
          <button type="button" class="red-packet-amount-btn cancel" @click="redPacket.cancelSendRedPacket">取消</button>
          <button
            type="button"
            class="red-packet-amount-btn confirm"
            :disabled="!redPacket.redPacketAmountInput?.value || Number(redPacket.redPacketAmountInput?.value) <= 0 || Number(redPacket.redPacketAmountInput?.value) > activeBookEconomyCoins"
            @click="redPacket.confirmSendRedPacket"
          >
            确认发送
          </button>
        </footer>
      </div>
    </div>
  </Teleport>

  <!-- 任务邀请弹窗 -->
  <Teleport to="body">
    <div v-if="task.showTaskInviteDropdown?.value" class="task-invite-modal-overlay" @click.self="task.closeTaskInviteDropdown">
      <div class="task-invite-modal" @click.stop>
        <header class="task-invite-modal-head">
          <h3 class="task-invite-modal-title">执行任务</h3>
          <button type="button" class="task-invite-modal-close" @click="task.closeTaskInviteDropdown">×</button>
        </header>
        <div class="task-invite-modal-body">
          <div v-if="task.getAcceptedTasksForInvite?.value?.length === 0" class="task-invite-empty">
            暂无可执行的任务
          </div>
          <template v-for="t in task.getAcceptedTasksForInvite?.value" :key="t?.id || Math.random()">
            <button
              v-if="t"
              type="button"
              class="task-invite-modal-item"
              @click.stop="task.handleSendTaskInvite(t)"
            >
              <span class="task-invite-type">{{ task.TASK_TYPE_LABELS_TASK?.[t.type] || t.type }}</span>
              <span class="task-invite-name">{{ t.name }}</span>
            </button>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.character-room-stage {
  position: relative;
  width: 100%;
  height: 100%;
}

.character-room-overlay-card {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.character-room-portrait {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.character-room-overlay-mask {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(to bottom, rgba(0,0,0,0.3), rgba(0,0,0,0.7));
  pointer-events: none;
}

/* 覆盖面板样式 */
.dorm-overlay-panel {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: transparent;
  margin: 8px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  z-index: 10;
}

.dorm-overlay-panel-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid #e0e0e0;
}

.dorm-overlay-panel-title {
  margin: 0;
  font-size: 18px;
  font-weight: 500;
  color: #333;
}

.dorm-overlay-panel-close {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #666;
  padding: 4px 8px;
}

.dorm-overlay-panel-close:hover {
  color: #333;
}

.dorm-overlay-panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

/* ===== 聊天覆盖层 - iOS16 风格 ===== */
.dorm-chat-overlay {
  position: absolute;
  z-index: 6;
  left: 2px;
  right: 2px;
  bottom: 2px;
  height: auto;
  min-height: 150px;
  max-height: none;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  background: linear-gradient(180deg, rgba(30, 30, 35, 0.35) 0%, rgba(18, 18, 22, 0.45) 100%);
  backdrop-filter: blur(30px) saturate(1.8);
  -webkit-backdrop-filter: blur(30px) saturate(1.8);
  padding: 0;
  display: flex;
  flex-direction: column;
  box-shadow:
    0 2px 16px rgba(0, 0, 0, 0.25),
    0 8px 32px rgba(0, 0, 0, 0.2),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
  transition: height 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  overflow: hidden;
}

.platform-android.android-portrait .dorm-chat-overlay {
  background: linear-gradient(180deg, rgba(30, 30, 35, 0.94) 0%, rgba(18, 18, 22, 0.96) 100%) !important;
  backdrop-filter: blur(40px) saturate(1.8) !important;
  -webkit-backdrop-filter: blur(40px) saturate(1.8) !important;
  border-color: rgba(255, 255, 255, 0.08) !important;
}

/* 头部 */
.dorm-chat-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-left: 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.04) 0%, rgba(255, 255, 255, 0.01) 100%);
  flex-shrink: 0;
}

.drag-handle-icon {
  border: none;
  background: transparent;
}

.dorm-chat-title {
  flex: 1;
  margin: 0;
  font-size: 0.8rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
  line-height: 1;
  letter-spacing: 0.02em;
}

/* 菜单 */
.dorm-chat-menu-wrap {
  position: relative;
}

.dorm-chat-menu-btn {
  appearance: none;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.5);
  padding: 4px 8px;
  font-size: 1.1rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
  line-height: 1;
  letter-spacing: 2px;
}


.dorm-popup-menu {
  position: absolute;
  bottom: 100%;
  right: 0;
  z-index: 10;
  min-width: 100px;
  max-width: 140px;
  border: 1px solid color-mix(in srgb, var(--foreground, #ffffff) 25%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--background, #0a0a0a) 70%, transparent);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  padding: 4px 0;
  margin-bottom: 4px;
  box-shadow: 0 -4px 16px color-mix(in srgb, #000 20%, transparent);
  display: flex;
  flex-direction: column;
}

.dorm-popup-menu-btn {
  appearance: none;
  border: none;
  border-radius: 0;
  background: transparent;
  color: var(--foreground, #ffffff);
  padding: 8px 16px;
  font-size: 0.75rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease;
  text-align: left;
  white-space: nowrap;
}

.dorm-popup-menu-btn:hover {
  background: color-mix(in srgb, var(--foreground, #ffffff) 10%, transparent);
}

.dorm-popup-menu-btn.active {
  background: color-mix(in srgb, var(--accent-cyan, #00d4ff) 20%, transparent);
  color: var(--accent-cyan, #00d4ff);
}

/* 聊天历史区 */
.dorm-chat-history {
  flex: 1;
  overflow-y: auto;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
}

.dorm-chat-history::-webkit-scrollbar {
  width: 4px;
}

.dorm-chat-history::-webkit-scrollbar-track {
  background: transparent;
}

.dorm-chat-history::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
}

.dorm-chat-history::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.2);
}

.dorm-chat-empty {
  text-align: center;
  color: rgba(255, 255, 255, 0.25);
  margin: 20px 0;
  font-size: 0.82rem;
}

/* 消息气泡 */
.dorm-chat-message {
  max-width: 75%;
  padding: 10px 14px;
  border-radius: 16px;
  font-size: 0.82rem;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.dorm-chat-message.user {
  align-self: flex-end;
  margin-left: auto;
  background: linear-gradient(135deg, rgba(90, 200, 250, 0.25), rgba(48, 176, 230, 0.18));
  border-bottom-right-radius: 4px;
  color: rgba(255, 255, 255, 0.92);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
}

.dorm-chat-message.assistant {
  align-self: flex-start;
  margin-right: auto;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.04));
  border-bottom-left-radius: 4px;
  color: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
}

/* 消息包含红包/任务卡片时，外层透明 */
.dorm-chat-message:has(.red-packet-chat),
.dorm-chat-message:has(.dorm-chat-task-card) {
  background: transparent;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  box-shadow: none;
  padding: 0;
  max-width: 100%;
  border-radius: 0;
}

.dorm-chat-text {
  display: inline;
  padding: 0;
  margin: 0;
  max-width: 100%;
  word-break: break-word;
  font-size: 0.82rem;
  line-height: 1.5;
  white-space: pre-wrap;
}

/* 输入行 */
.dorm-chat-input-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.02);
  flex-shrink: 0;
}

.dorm-chat-input {
  flex: 1;
  padding: 9px 14px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 20px;
  font-size: 0.82rem;
  color: rgba(255, 255, 255, 0.9);
  background: rgba(255, 255, 255, 0.05);
  outline: none;
  transition: all 0.2s ease;
}

.dorm-chat-input::placeholder {
  color: rgba(255, 255, 255, 0.25);
}

.dorm-chat-input:focus {
  border-color: rgba(90, 200, 250, 0.4);
  background: rgba(255, 255, 255, 0.07);
  box-shadow: 0 0 0 3px rgba(90, 200, 250, 0.1);
}

.dorm-chat-input:disabled {
  background: rgba(255, 255, 255, 0.03);
  color: rgba(255, 255, 255, 0.3);
}

.dorm-chat-send-btn {
  padding: 9px 18px;
  background: linear-gradient(135deg, #5ac8fa, #3a9fe0);
  color: white;
  border: none;
  border-radius: 20px;
  cursor: pointer;
  font-size: 0.82rem;
  font-weight: 600;
  transition: all 0.2s ease;
  white-space: nowrap;
  box-shadow: 0 2px 8px rgba(90, 200, 250, 0.25);
}

.dorm-chat-send-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #6dd3ff, #4aaaf0);
  box-shadow: 0 3px 12px rgba(90, 200, 250, 0.35);
  transform: translateY(-1px);
}

.dorm-chat-send-btn:active:not(:disabled) {
  transform: translateY(0);
  box-shadow: 0 1px 4px rgba(90, 200, 250, 0.2);
}

.dorm-chat-send-btn:disabled {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.06));
  color: rgba(255, 255, 255, 0.3);
  cursor: not-allowed;
  box-shadow: none;
}

.dorm-chat-error {
  padding: 4px 14px 10px;
  color: #ff6b6b;
  font-size: 0.75rem;
  flex-shrink: 0;
}

/* 输入行附加按钮 */
.dorm-chat-task-invite-wrap {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.dorm-chat-task-invite-btn {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.04));
  color: rgba(255, 255, 255, 0.7);
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  line-height: 1;
}

.dorm-chat-task-invite-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.06));
  border-color: rgba(255, 255, 255, 0.2);
  color: #5ac8fa;
}

.dorm-chat-task-invite-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.dorm-chat-red-packet-btn {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: linear-gradient(135deg, rgba(255, 80, 80, 0.15), rgba(255, 50, 50, 0.08));
  font-size: 0.95rem;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  flex-shrink: 0;
}

.dorm-chat-red-packet-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, rgba(255, 80, 80, 0.25), rgba(255, 50, 50, 0.15));
  border-color: rgba(255, 80, 80, 0.3);
  transform: scale(1.05);
}

.dorm-chat-red-packet-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.task-invite-modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px 12px;
}

/* 任务邀请卡片 */
.dorm-chat-task-card {
  display: flex;
  align-items: stretch;
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  max-width: 85%;
  align-self: flex-start;
  background: linear-gradient(135deg,
    rgba(52, 199, 89, 0.15) 0%,
    rgba(48, 176, 72, 0.08) 100%
  );
  border: 1px solid rgba(52, 199, 89, 0.18);
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
}

.dorm-chat-task-card:hover {
  transform: translateY(-1px);
  background: linear-gradient(135deg,
    rgba(52, 199, 89, 0.22) 0%,
    rgba(48, 176, 72, 0.12) 100%
  );
  border-color: rgba(52, 199, 89, 0.28);
  box-shadow:
    0 4px 12px rgba(0, 0, 0, 0.18),
    inset 0 1px 0 rgba(255, 255, 255, 0.07);
}

.dorm-chat-task-card:active {
  transform: translateY(0) scale(0.98);
}

/* 左侧绿色图标区 */
.task-card-accent {
  width: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: linear-gradient(180deg, rgba(52, 199, 89, 0.25), rgba(52, 199, 89, 0.12));
  border-right: 1px solid rgba(52, 199, 89, 0.15);
}

.task-card-accent-icon {
  font-size: 1rem;
  line-height: 1;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.2));
}

/* 内容区 */
.task-card-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
}

.task-card-label {
  font-size: 0.62rem;
  font-weight: 600;
  color: rgba(52, 199, 89, 0.7);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.task-card-name {
  font-size: 0.8rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.task-card-target {
  font-size: 0.65rem;
  color: rgba(255, 255, 255, 0.35);
}

/* 右侧箭头 */
.task-card-arrow {
  display: flex;
  align-items: center;
  padding: 0 10px;
  flex-shrink: 0;
}

.task-card-arrow-icon {
  font-size: 1.2rem;
  font-weight: 300;
  color: rgba(255, 255, 255, 0.25);
  line-height: 1;
  transition: color 0.2s ease;
}
.task-invite-modal-close {
  appearance: none;
  border: none;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.5);
  font-size: 1.3rem;
  line-height: 1;
  cursor: pointer;
  padding: 0;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: all 0.15s;
}

.platform-android.android-portrait .task-invite-modal-close {
    width: 36px !important;
    height: 36px !important;
    min-width: 36px !important;
    min-height: 36px !important;
    max-width: 36px !important;
    max-height: 36px !important;
    flex: 0 0 36px !important;
    font-size: 1.2rem !important;
    flex-shrink: 0 !important;
    box-sizing: border-box !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    border-radius: 50% !important;
    padding: 0 !important;
  }

.dorm-chat-task-card:hover .task-card-arrow-icon {
  color: rgba(52, 199, 89, 0.5);
}

/* ===== 礼物卡片 ===== */
.dorm-chat-gift-card {
  position: relative;
  display: flex;
  align-items: stretch;
  border-radius: 14px;
  overflow: hidden;
  max-width: 85%;
  align-self: flex-start;
  background: linear-gradient(135deg,
    rgba(160, 100, 220, 0.22) 0%,
    rgba(130, 80, 180, 0.16) 40%,
    rgba(110, 70, 160, 0.1) 100%
  );
  border: 1px solid rgba(160, 100, 220, 0.2);
  box-shadow:
    0 2px 8px rgba(160, 100, 220, 0.1),
    0 4px 16px rgba(0, 0, 0, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.gift-accent {
  width: 3px;
  flex-shrink: 0;
  background: linear-gradient(180deg, #a855f7, #7c3aed, #c084fc);
  box-shadow: 0 0 8px rgba(168, 85, 247, 0.3);
}

.gift-body {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px 12px 12px;
  flex: 1;
  min-width: 0;
}

.gift-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: linear-gradient(135deg, rgba(168, 85, 247, 0.2), rgba(124, 58, 237, 0.15));
  border-radius: 12px;
  border: 1px solid rgba(168, 85, 247, 0.15);
}

.gift-emoji {
  font-size: 22px;
  line-height: 1;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.2));
}

.gift-info {
  flex: 1;
  min-width: 0;
}

.gift-sender {
  font-size: 0.82rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
  margin: 0 0 3px 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.gift-item-name {
  font-size: 0.75rem;
  font-weight: 500;
  color: rgba(168, 85, 247, 0.85);
  margin: 0 0 3px 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.gift-message {
  font-size: 0.7rem;
  color: rgba(255, 255, 255, 0.45);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.gift-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 0.65rem;
  font-weight: 600;
  flex-shrink: 0;
  letter-spacing: 0.02em;
  color: rgba(255, 255, 255, 0.35);
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.gift-badge.success {
  color: rgba(52, 199, 89, 0.85);
  background: rgba(52, 199, 89, 0.1);
  border: 1px solid rgba(52, 199, 89, 0.15);
}

/* 阶段提示动画 */
.stage-toast-enter-active,
.stage-toast-leave-active {
  transition: opacity 0.3s ease;
}

.stage-toast-enter-from,
.stage-toast-leave-to {
  opacity: 0;
}

.stage-upgrade-toast {
  padding: 12px;
  background: #e8f5e9;
  border-radius: 8px;
  margin-bottom: 8px;
}

.stage-upgrade-title {
  font-size: 12px;
  color: #2e7d32;
  margin: 0 0 4px;
}

.stage-upgrade-main {
  font-size: 14px;
  color: #1b5e20;
  margin: 0 0 4px;
}

.stage-upgrade-sub {
  font-size: 12px;
  color: #4caf50;
  margin: 0;
}
</style>

<!-- Teleport 到 body 的弹窗菜单（非 scoped） -->
<style>
.dorm-popup-menu-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  z-index: 9999;
}

.dorm-popup-menu-overlay {
  position: absolute;
  top: 56px;
  right: 14px;
  background: rgba(50, 50, 56, 0.55);
  backdrop-filter: blur(30px) saturate(1.8);
  -webkit-backdrop-filter: blur(30px) saturate(1.8);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 14px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1);
  padding: 8px;
  min-width: 160px;
  overflow: hidden;
  animation: dorm-menu-slide-in 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.dorm-menu-item {
  display: block;
  width: 100%;
  padding: 12px 16px;
  background: transparent;
  border: none;
  text-align: left;
  border-radius: 10px;
  font-size: 0.85rem;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.9);
  cursor: pointer;
  transition: all 0.15s ease;
}

.dorm-menu-item:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.dorm-menu-item.active {
  background: rgba(90, 200, 250, 0.18);
  color: #5ac8fa;
  font-weight: 600;
}

@keyframes dorm-menu-slide-in {
  from { opacity: 0; transform: translateY(-8px) scale(0.95); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

/* 约定面板样式 */
.appointment-panel-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 32px 16px;
}
.platform-android.android-portrait .appointment-panel-body {
  background: linear-gradient(180deg, rgba(30, 30, 35, 0.94) 0%, rgba(18, 18, 22, 0.96) 100%) !important;
  backdrop-filter: blur(40px) saturate(1.8) !important;
  -webkit-backdrop-filter: blur(40px) saturate(1.8) !important;
  border-color: rgba(255, 255, 255, 0.08) !important;
}
.appointment-panel-icon {
  font-size: 3rem;
  line-height: 1;
}

.appointment-panel-title {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--foreground, #ffffff);
}

.appointment-panel-desc {
  margin: 0;
  font-size: 0.85rem;
  color: color-mix(in srgb, var(--foreground, #ffffff) 50%, transparent);
  text-align: center;
  line-height: 1.5;
}

.appointment-panel-open-btn {
  padding: 10px 24px;
  background: linear-gradient(
    135deg,
    rgba(0, 212, 255, 0.25) 0%,
    rgba(0, 150, 255, 0.15) 100%
  );
  border: 1px solid rgba(0, 212, 255, 0.3);
  border-radius: 10px;
  color: var(--accent-cyan, #00d4ff);
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.appointment-panel-open-btn:hover {
  background: linear-gradient(
    135deg,
    rgba(0, 212, 255, 0.35) 0%,
    rgba(0, 150, 255, 0.2) 100%
  );
  border-color: rgba(0, 212, 255, 0.5);
}

.appointment-panel-open-btn:active {
  transform: scale(0.97);
}

/* ===== 来访卡片 ===== */
.dorm-chat-visit-card {
  position: relative;
  display: flex;
  flex-direction: column;
  border-radius: 14px;
  overflow: hidden;
  max-width: 90%;
  align-self: flex-start;
  background: linear-gradient(135deg,
    rgba(255, 255, 255, 0.06) 0%,
    rgba(255, 255, 255, 0.02) 100%
  );
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.dorm-chat-message:has(.dorm-chat-visit-card) {
  background: transparent;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  box-shadow: none;
  padding: 0;
  max-width: 100%;
  border-radius: 0;
}

.visit-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px 6px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.visit-type-icon {
  font-size: 1.2rem;
  line-height: 1;
}

.visit-type-label {
  font-size: 0.72rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.6);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.visit-time {
  margin-left: auto;
  font-size: 0.65rem;
  color: rgba(255, 255, 255, 0.3);
}

.visit-card-body {
  padding: 8px 14px;
}

.visit-mood {
  font-size: 0.68rem;
  color: rgba(0, 212, 255, 0.6);
  margin: 0 0 6px;
}

.visit-content {
  font-size: 0.82rem;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.85);
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
}

.visit-gift-sub {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  margin: 4px 8px 8px;
  background: linear-gradient(135deg,
    rgba(160, 100, 220, 0.15) 0%,
    rgba(130, 80, 180, 0.08) 100%
  );
  border: 1px solid rgba(160, 100, 220, 0.15);
  border-radius: 10px;
}

.visit-gift-icon {
  font-size: 1.4rem;
  line-height: 1;
}

.visit-gift-name {
  font-size: 0.78rem;
  font-weight: 500;
  color: rgba(168, 85, 247, 0.8);
}
</style>
