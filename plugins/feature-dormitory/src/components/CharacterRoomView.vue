<script setup>
/**
 * 角色房间视图组件
 * 包含角色房间显示、覆盖面板、聊天界面等所有房间相关功能
 */

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
  
  // 面板相关
  isDormOverlayPanelExpanded: {
    type: Boolean,
    default: false
  },
  activeDormOverlayPanelLabel: {
    type: String,
    default: ''
  },
  activeDormOverlayPanelId: {
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
  
  // 事件链相关
  selectedDormEventChainPreviewList: {
    type: Array,
    default: () => []
  },
  selectedDormEventChainDetail: {
    type: Object,
    default: null
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
  activeDormSubSceneDecor: {
    type: Array,
    default: () => []
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
  backpackPurchaseFeedback: {
    type: String,
    default: ''
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
  
  // 菜单相关
  isDormMenuOpen: {
    type: Boolean,
    default: false
  },
  DORM_OVERLAY_PANEL_OPTIONS: {
    type: Array,
    default: () => []
  },
  
  // 漂流瓶草稿
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
  }
})

const emit = defineEmits([
  'close-overlay-panel',
  'select-dorm-overlay-panel',
  'toggle-dorm-menu',
  'select-dorm-sub-scene',
  'upgrade-scene-facility',
  'select-dorm-sub-scene-activity',
  'run-dorm-sub-scene-activity',
  'advance-dorm-day',
  'select-dorm-event-chain',
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
  'update-dorm-chat-draft',
  'update-drift-bottle-draft',
  'update-dorm-quick-action-type',
  'format-journal-time',
  'format-daily-wish-type-label',
  'format-diary-date',
  'render-template',
  'get-dorm-archetype-label',
  'format-dorm-event-option-preview'
])

function handleCloseOverlayPanel() {
  emit('close-overlay-panel')
}

function handleSelectOverlayPanel(panelId) {
  emit('select-dorm-overlay-panel', panelId)
}

function handleToggleMenu() {
  emit('toggle-dorm-menu')
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

function handleSelectChain(chainId) {
  emit('select-dorm-event-chain', chainId)
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

function handleChatDraftInput(event) {
  emit('update-dorm-chat-draft', event.target.value)
}

function handleDriftDraftInput(event) {
  emit('update-drift-bottle-draft', event.target.value)
}

function handleDormQuickActionTypeChange(event) {
  emit('update-dorm-quick-action-type', event.target.value)
}

function isDriftFollowUpPending(entryId) {
  const entry = props.selectedDormDriftInbox.find(e => e.id === entryId)
  return entry?.replyState === 'pending'
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
          <p class="dorm-overlay-panel-title">{{ activeDormOverlayPanelLabel }}</p>
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
                  <span v-for="decor in activeDormSubSceneDecor" :key="decor" class="sub-scene-decor-chip">
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
          <section v-if="activeDormOverlayPanelId === 'schedule'" class="daily-cycle-panel">
            <div class="daily-cycle-head">
              <p class="daily-cycle-title">日程循环</p>
              <p class="daily-cycle-meta">
                第 {{ selectedDormState.dayIndex }} 天 · 当前时段：{{ currentDormTimeSlotLabel }} · 剩余行动 {{ remainingDormActionSlots }}
              </p>
            </div>

            <div class="daily-cycle-toolbar">
              <p class="daily-cycle-progress">今日心愿 {{ completedTodayWishCount }} / {{ totalTodayWishCount }}</p>
              <button type="button" class="daily-next-day-btn" @click="handleAdvanceDay">
                {{ isDormDayActionClosed ? '进入下一天' : '提前结束今日' }}
              </button>
            </div>

            <ul class="daily-wish-list">
              <li v-for="wish in selectedDormState.todayWishes" :key="wish.id" class="daily-wish-item" :class="{ completed: wish.completed }">
                <span class="daily-wish-main">
                  {{ wish.label }}
                  <span class="daily-wish-type">[{{ wish.type }}]</span>
                </span>
                <span class="daily-wish-progress">
                  {{ wish.progress }} / {{ wish.target }} · 奖励 好感+{{ wish.rewardAffection }} 体力+{{ wish.rewardEnergy }}
                </span>
              </li>
            </ul>
          </section>

          <!-- 事件链面板 -->
          <section v-if="activeDormOverlayPanelId === 'chain'" class="event-chain-preview-panel">
            <div class="event-chain-preview-head">
              <p class="event-chain-preview-title">事件链预览</p>
              <p class="event-chain-preview-meta">当前关系阶段：{{ selectedDormRelationshipStageLabel }}</p>
            </div>
            <ul class="event-chain-preview-list">
              <li
                v-for="chain in selectedDormEventChainPreviewList"
                :key="chain.id"
                class="event-chain-preview-item"
                :class="{
                  unlocked: chain.unlocked,
                  locked: !chain.unlocked,
                  selected: chain.id === selectedDormEventChainDetail?.id,
                }"
                role="button"
                tabindex="0"
                @click="handleSelectChain(chain.id)"
                @keydown.enter.prevent="handleSelectChain(chain.id)"
                @keydown.space.prevent="handleSelectChain(chain.id)"
              >
                <div class="event-chain-preview-text">
                  <p class="event-chain-preview-main">{{ chain.title }} · {{ chain.stepCount }} 阶段</p>
                  <p class="event-chain-preview-sub">
                    {{ chain.unlocked ? '已解锁，可在触发事件时进入该事件链。' : `未解锁，需关系阶段达到「${chain.requiredStageLabel}」。` }}
                  </p>
                </div>
                <span class="event-chain-preview-badge" :class="{ unlocked: chain.unlocked, locked: !chain.unlocked }">
                  {{ chain.unlocked ? '已解锁' : `需 ${chain.requiredStageLabel}` }}
                </span>
              </li>
            </ul>

            <section v-if="selectedDormEventChainDetail" class="event-chain-detail-panel" :class="{ unlocked: selectedDormEventChainDetail.unlocked, locked: !selectedDormEventChainDetail.unlocked }">
              <div class="event-chain-detail-head">
                <p class="event-chain-detail-title">{{ selectedDormEventChainDetail.title }}</p>
                <span class="event-chain-detail-status" :class="{ unlocked: selectedDormEventChainDetail.unlocked, locked: !selectedDormEventChainDetail.unlocked }">
                  {{ selectedDormEventChainDetail.unlocked ? '可触发' : `需 ${selectedDormEventChainDetail.requiredStageLabel}` }}
                </span>
              </div>

              <p class="event-chain-detail-summary">{{ selectedDormEventChainDetail.summary }}</p>
              <p class="event-chain-detail-meta">
                总阶段数 {{ selectedDormEventChainDetail.stepCount }} · 起始阶段：{{ selectedDormEventChainDetail.firstStepTitle }}
              </p>
              <p class="event-chain-detail-meta">
                {{
                  selectedDormEventChainDetail.unlocked
                    ? '当前关系阶段已满足触发条件，触发事件时有概率进入该事件链。'
                    : `解锁条件：关系阶段达到「${selectedDormEventChainDetail.requiredStageLabel}」。`
                }}
              </p>
              <p v-if="selectedDormEventChainDetail.firstStepDescription" class="event-chain-detail-meta">
                起始剧情：{{ selectedDormEventChainDetail.firstStepDescription }}
              </p>

              <div class="event-chain-detail-endings">
                <p class="event-chain-detail-endings-title">可能结局</p>
                <div v-if="selectedDormEventChainDetail.endingTags.length > 0" class="event-chain-detail-tag-list">
                  <span v-for="tag in selectedDormEventChainDetail.endingTags" :key="tag" class="event-chain-detail-tag">{{ tag }}</span>
                </div>
                <p v-else class="event-chain-detail-endings-empty">推进过程中会根据选项生成不同结局。</p>
              </div>
            </section>
          </section>

          <!-- 状态面板 -->
          <div v-if="activeDormOverlayPanelId === 'status'" class="dorm-stat-grid">
            <div class="dorm-stat-card">
              <p class="dorm-stat-label">好感度</p>
              <p class="dorm-stat-value">{{ selectedDormState.affection }}</p>
              <div class="dorm-stat-bar"><span class="dorm-stat-bar-fill is-affection" :style="selectedDormAffectionStyle"></span></div>
            </div>
            <div class="dorm-stat-card">
              <p class="dorm-stat-label">体力</p>
              <p class="dorm-stat-value">{{ selectedDormState.energy }}</p>
              <div class="dorm-stat-bar"><span class="dorm-stat-bar-fill is-energy" :style="selectedDormEnergyStyle"></span></div>
            </div>
            <div class="dorm-stat-card mini">
              <p class="dorm-stat-label">心情 / 关系阶段</p>
              <p class="dorm-stat-value compact">{{ selectedDormState.mood }} · {{ selectedDormRelationshipStageLabel }}</p>
              <p class="dorm-stat-tip">{{ selectedDormRelationshipProgressHint }}</p>
            </div>
            <div class="dorm-stat-card mini">
              <p class="dorm-stat-label">事件链解锁</p>
              <p class="dorm-stat-value compact">{{ selectedDormUnlockedEventChainCount }} / 总事件链数</p>
              <p class="dorm-stat-tip">{{ selectedDormUnlockedEventChainHint }}</p>
            </div>
            <div class="dorm-stat-card mini">
              <p class="dorm-stat-label">访问 / 聊天 / 送礼 / 事件 / 场景 / 升级</p>
              <p class="dorm-stat-value compact">{{ selectedDormState.visitCount }} / {{ selectedDormState.chatCount }} / {{ selectedDormState.giftCount }} / {{ selectedDormState.eventCount }} / {{ selectedDormState.sceneCount }} / {{ selectedDormState.facilityUpgradeCount }}</p>
            </div>
          </div>

          <!-- 背包面板 -->
          <section v-if="activeDormOverlayPanelId === 'backpack'" class="dorm-backpack-panel">
            <div class="dorm-backpack-head">
              <p class="dorm-backpack-title">🎒 我的背包</p>
              <p class="dorm-backpack-meta">共 {{ activeBookInventory.length }} 件物品</p>
            </div>

            <div class="dorm-backpack-list">
              <p v-if="activeBookInventory.length === 0" class="dorm-backpack-empty">
                背包空空如也，去商店逛逛吧！
              </p>
              <div v-else class="dorm-backpack-grid">
                <article
                  v-for="item in activeBookInventory"
                  :key="item.id"
                  class="dorm-backpack-item"
                  :class="{ 'is-giftable': !isGiftItemProcessing }"
                  @click="handleGiftItem(item)"
                  :title="'点击送给' + (selectedCharacter?.label || '角色')"
                >
                  <div class="dorm-backpack-item-icon">{{ item.icon }}</div>
                  <div class="dorm-backpack-item-info">
                    <p class="dorm-backpack-item-name">{{ item.name }}</p>
                    <p class="dorm-backpack-item-desc">{{ item.description }}</p>
                    <p class="dorm-backpack-item-meta">
                      <span class="dorm-backpack-item-category">{{ item.categoryLabel }}</span>
                      <span v-if="item.quantity > 1" class="dorm-backpack-item-quantity">x{{ item.quantity }}</span>
                    </p>
                  </div>
                </article>
              </div>
            </div>

            <p v-if="isGiftItemProcessing" class="dorm-backpack-feedback processing">生成回复中...</p>
            <p v-if="backpackPurchaseFeedback" class="dorm-backpack-feedback">{{ backpackPurchaseFeedback }}</p>
          </section>

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
              <p v-if="stageUpgradeToast.unlockedChainTitles.length > 0" class="stage-upgrade-sub">
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
            <p v-else class="dorm-event-source">通用寝室事件</p>
            <p v-if="activeDormEvent.mode === 'chain'" class="dorm-event-chain-meta">
              {{ activeDormEventChainProgressText }} · 当前阶段：{{ activeDormEvent.chainStepTitle || `阶段 ${activeDormEvent.chainStepIndex + 1}` }}
            </p>
            <p v-if="activeDormEvent.mode === 'chain' && activeDormEvent.chainPathLabels.length > 0" class="dorm-event-chain-path">
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
          <section v-if="activeDormOverlayPanelId === 'diary'" class="dorm-diary">
            <h3 class="dorm-diary-title">日记</h3>
            <ul v-if="diaryList.length > 0" class="dorm-diary-list">
              <li v-for="diary in diaryList" :key="diary.id" class="dorm-diary-item" @click="handleOpenDiary(diary)">
                <time class="diary-date">{{ diary.date }}</time>
                <span class="diary-title-text">{{ diary.title || '无题' }}</span>
              </li>
            </ul>
            <p v-else class="dorm-diary-empty">暂无日记记录</p>
          </section>
        </div>
      </section>

      <!-- 聊天覆盖层 -->
      <section class="dorm-chat-overlay" :style="{ height: dormChatOverlayHeight + 'px', maxHeight: dormChatOverlayHeight + 'px' }" aria-label="寝室聊天内容">
        <div class="dorm-chat-head">
          <div class="dorm-chat-drag-handle" @mousedown="handleStartDragResize" @touchstart="handleStartDragResizeTouch">
            <span class="drag-handle-icon">≡</span>
          </div>
          <p class="dorm-chat-title">和 {{ selectedCharacter?.label || '角色' }} 聊天</p>
          <div class="dorm-chat-menu-wrap">
            <button
              type="button"
              class="dorm-chat-menu-btn"
              :class="{ active: isDormMenuOpen }"
              :aria-expanded="isDormMenuOpen ? 'true' : 'false'"
              aria-label="展开寝室操作菜单"
              @click.stop="handleToggleMenu"
            >
              ···
            </button>
            <section v-if="isDormMenuOpen" class="dorm-popup-menu" aria-label="寝室操作菜单">
              <button
                v-for="panel in DORM_OVERLAY_PANEL_OPTIONS"
                :key="panel.id"
                type="button"
                class="dorm-popup-menu-btn"
                :class="{ active: panel.id === activeDormOverlayPanelId }"
                @click="handleSelectOverlayPanel(panel.id)"
              >
                {{ panel.label }}
              </button>
            </section>
          </div>
        </div>
        <div class="dorm-chat-history">
          <p v-if="selectedDormChatHistory.length === 0" class="dorm-chat-empty">输入一句话，开始聊天。</p>
          <article
            v-for="message in selectedDormChatHistory"
            :key="message.id"
            class="dorm-chat-message"
            :class="{ user: message.role === 'user', assistant: message.role === 'assistant' }"
          >
            <p class="dorm-chat-text">{{ message.text }}</p>
          </article>
        </div>

        <div class="dorm-chat-input-row">
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
  </section>
</template>

<style scoped>
/* 基础样式继承自原 DormitoryScreen.css */
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
  background: rgba(255, 255, 255, 0.95);
  border-radius: 12px;
  margin: 16px;
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

/* 聊天覆盖层样式 */
.dorm-chat-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 12px 12px 0 0;
  display: flex;
  flex-direction: column;
  z-index: 5;
}

.dorm-chat-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid #e0e0e0;
}

.dorm-chat-drag-handle {
  cursor: ns-resize;
  padding: 4px;
  color: #666;
}

.drag-handle-icon {
  font-size: 16px;
}

.dorm-chat-title {
  flex: 1;
  margin: 0;
  font-size: 14px;
  color: #333;
}

.dorm-chat-menu-wrap {
  position: relative;
}

.dorm-chat-menu-btn {
  background: none;
  border: none;
  font-size: 18px;
  cursor: pointer;
  color: #666;
  padding: 4px 8px;
}

.dorm-chat-menu-btn.active {
  color: #333;
}

.dorm-popup-menu {
  position: absolute;
  top: 100%;
  right: 0;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  padding: 8px;
  z-index: 20;
  min-width: 150px;
}

.dorm-popup-menu-btn {
  display: block;
  width: 100%;
  padding: 8px 12px;
  background: none;
  border: none;
  text-align: left;
  cursor: pointer;
  border-radius: 4px;
  font-size: 14px;
  color: #333;
}

.dorm-popup-menu-btn:hover {
  background: #f0f0f0;
}

.dorm-popup-menu-btn.active {
  background: #e3f2fd;
  color: #1976d2;
}

.dorm-chat-history {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  max-height: 200px;
}

.dorm-chat-empty {
  text-align: center;
  color: #999;
  margin: 24px 0;
}

.dorm-chat-message {
  margin-bottom: 8px;
}

.dorm-chat-message.user {
  text-align: right;
}

.dorm-chat-message.assistant {
  text-align: left;
}

.dorm-chat-text {
  display: inline-block;
  padding: 8px 12px;
  border-radius: 16px;
  max-width: 80%;
  word-break: break-word;
}

.dorm-chat-message.user .dorm-chat-text {
  background: #2196f3;
  color: white;
}

.dorm-chat-message.assistant .dorm-chat-text {
  background: #f0f0f0;
  color: #333;
}

.dorm-chat-input-row {
  display: flex;
  gap: 8px;
  padding: 8px 12px;
  border-top: 1px solid #e0e0e0;
}

.dorm-chat-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #e0e0e0;
  border-radius: 20px;
  font-size: 14px;
  outline: none;
}

.dorm-chat-input:focus {
  border-color: #2196f3;
}

.dorm-chat-input:disabled {
  background: #f0f0f0;
}

.dorm-chat-send-btn {
  padding: 8px 16px;
  background: #2196f3;
  color: white;
  border: none;
  border-radius: 20px;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.2s;
}

.dorm-chat-send-btn:hover:not(:disabled) {
  background: #1976d2;
}

.dorm-chat-send-btn:disabled {
  background: #e0e0e0;
  color: #999;
  cursor: not-allowed;
}

.dorm-chat-error {
  padding: 4px 12px 8px;
  color: #f44336;
  font-size: 12px;
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
