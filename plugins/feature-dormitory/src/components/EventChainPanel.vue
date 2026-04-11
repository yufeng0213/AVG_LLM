<script setup>
/**
 * EventChainPanel.vue - 事件链预览面板组件
 * 负责展示事件链预览和详情信息
 */

const props = defineProps({
  eventChainPreviewList: {
    type: Array,
    default: () => [],
  },
  selectedEventChainDetail: {
    type: Object,
    default: null,
  },
  selectedEventChainPreviewId: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['select-chain'])

const handleSelectChain = (chainId) => {
  emit('select-chain', chainId)
}

const handleKeyDown = (event, chainId) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    handleSelectChain(chainId)
  }
}
</script>

<template>
  <section class="event-chain-preview-panel">
    <div class="event-chain-preview-head">
      <p class="event-chain-preview-title">事件链预览</p>
      <p class="event-chain-preview-meta">
        当前关系阶段：{{ selectedEventChainDetail?.requiredStageLabel || '未知' }}
      </p>
    </div>

    <ul class="event-chain-preview-list">
      <li
        v-for="chain in eventChainPreviewList"
        :key="chain.id"
        class="event-chain-preview-item"
        :class="{
          unlocked: chain.unlocked,
          locked: !chain.unlocked,
          selected: chain.id === selectedEventChainPreviewId,
        }"
        role="button"
        tabindex="0"
        @click="handleSelectChain(chain.id)"
        @keydown="handleKeyDown($event, chain.id)"
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

    <section
      v-if="selectedEventChainDetail"
      class="event-chain-detail-panel"
      :class="{ unlocked: selectedEventChainDetail.unlocked, locked: !selectedEventChainDetail.unlocked }"
    >
      <div class="event-chain-detail-head">
        <p class="event-chain-detail-title">{{ selectedEventChainDetail.title }}</p>
        <span
          class="event-chain-detail-status"
          :class="{ unlocked: selectedEventChainDetail.unlocked, locked: !selectedEventChainDetail.unlocked }"
        >
          {{ selectedEventChainDetail.unlocked ? '可触发' : `需 ${selectedEventChainDetail.requiredStageLabel}` }}
        </span>
      </div>

      <p class="event-chain-detail-summary">{{ selectedEventChainDetail.summary }}</p>
      <p class="event-chain-detail-meta">
        总阶段数 {{ selectedEventChainDetail.stepCount }} · 起始阶段：{{ selectedEventChainDetail.firstStepTitle }}
      </p>
      <p class="event-chain-detail-meta">
        {{
          selectedEventChainDetail.unlocked
            ? '当前关系阶段已满足触发条件，触发事件时有概率进入该事件链。'
            : `解锁条件：关系阶段达到「${selectedEventChainDetail.requiredStageLabel}」。`
        }}
      </p>
      <p v-if="selectedEventChainDetail.firstStepDescription" class="event-chain-detail-meta">
        起始剧情：{{ selectedEventChainDetail.firstStepDescription }}
      </p>

      <div class="event-chain-detail-endings">
        <p class="event-chain-detail-endings-title">可能结局</p>
        <div v-if="selectedEventChainDetail.endingTags.length > 0" class="event-chain-detail-tag-list">
          <span v-for="tag in selectedEventChainDetail.endingTags" :key="tag" class="event-chain-detail-tag">
            {{ tag }}
          </span>
        </div>
        <p v-else class="event-chain-detail-endings-empty">推进过程中会根据选项生成不同结局。</p>
      </div>
    </section>
  </section>
</template>
