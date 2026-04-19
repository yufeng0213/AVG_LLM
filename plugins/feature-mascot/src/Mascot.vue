<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { isAndroid } from '../../../src/utils/platform.js'
import { useMascotStorage } from './composables/useMascotStorage.js'
import { useMascotSpeech } from './composables/useMascotSpeech.js'
import { useMascotDrag } from './composables/useMascotDrag.js'
import SpeechBubble from './SpeechBubble.vue'
import MascotInteractionMenu from './MascotInteractionMenu.vue'
import MascotImporter from './MascotImporter.vue'

const { mascotState, importGif, loadGifDataUrl, resetPosition, toggleVisibility, persist: persistStorage, showImporterTrigger, openImporter } = useMascotStorage()
const { currentMessage, forceSpeech, addMessage, start: startSpeech, stop: stopSpeech } = useMascotSpeech()
const { isDragging, isMenuOpen, onPointerDown, closeMenu, setCallbacks, cleanup } = useMascotDrag()

const mascotRef = ref(null)
const gifDataUrl = ref('')
const showImporter = ref(false)
const isPetAnimating = ref(false)
const isAndroidPlatform = isAndroid()

// Load GIF data URL when gifData changes
watch(() => mascotState.value.gifData?.id, async () => {
  gifDataUrl.value = await loadGifDataUrl() || ''
}, { immediate: true })

// Watch external importer trigger
watch(showImporterTrigger, (val) => {
  if (val) {
    showImporter.value = true
    showImporterTrigger.value = false
  }
})

// Register drag callbacks
setCallbacks({
  onLongPress: () => {
    isMenuOpen.value = true
  },
  onPositionChanged: (pos) => {
    mascotState.value.x = pos.x
    mascotState.value.y = pos.y
    persistStorage()
  },
})

// Menu actions
function handlePet() {
  isPetAnimating.value = true
  forceSpeech('\u563B\u563B\uff0C\u597D\u8212\u670D~')
  setTimeout(() => { isPetAnimating.value = false }, 1000)
  closeMenu()
}

function handleForceSpeech() {
  forceSpeech()
  closeMenu()
}

function handleCustomText(text) {
  addMessage(text)
  forceSpeech(text)
  closeMenu()
}

function handleChangeGif() {
  showImporter.value = true
  closeMenu()
}

function handleResetPosition() {
  resetPosition()
  closeMenu()
}

function handleToggleVisibility() {
  toggleVisibility()
  closeMenu()
}

async function handleImport(file) {
  await importGif(file)
  gifDataUrl.value = await loadGifDataUrl() || ''
}

onMounted(() => {
  startSpeech()
})

onBeforeUnmount(() => {
  stopSpeech()
  cleanup()
})
</script>

<template>
  <Teleport to="body">
    <div
      v-show="mascotState.visible"
      ref="mascotRef"
      class="mascot"
      :class="{
        'is-dragging': isDragging,
        'is-pet-animating': isPetAnimating,
        'platform-android': isAndroidPlatform,
      }"
      :style="{ transform: `translate3d(${mascotState.x}px, ${mascotState.y}px, 0)` }"
      @pointerdown="onPointerDown($event, mascotRef, { x: mascotState.x, y: mascotState.y })"
      @contextmenu.prevent
    >
      <SpeechBubble :message="currentMessage" />
      <img v-if="gifDataUrl" :src="gifDataUrl" class="mascot-gif" alt="mascot" draggable="false" />
      <div v-else class="mascot-placeholder" @click="showImporter = true">
        <span>?</span>
        <p>点击导入 GIF</p>
      </div>
    </div>

    <MascotInteractionMenu
      :is-visible="isMenuOpen"
      @close="closeMenu"
      @pet="handlePet"
      @force-speech="handleForceSpeech"
      @custom-text="handleCustomText"
      @change-gif="handleChangeGif"
      @reset-position="handleResetPosition"
      @toggle-visibility="handleToggleVisibility"
    />

    <MascotImporter v-if="showImporter" @import="handleImport" @close="showImporter = false" />
  </Teleport>
</template>

<style scoped>
.mascot {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 10001;
  touch-action: none;
  will-change: transform;
  cursor: grab;
  user-select: none;
  -webkit-user-select: none;
}

.mascot.is-dragging {
  cursor: grabbing;
  filter: brightness(1.05);
}

.mascot.is-pet-animating {
  animation: pet-bounce 0.3s ease 3;
}

.mascot-gif {
  display: block;
  width: 80px;
  height: 80px;
  object-fit: contain;
  pointer-events: none;
  -webkit-user-drag: none;
  user-select: none;
  -webkit-user-select: none;
}

.mascot-placeholder {
  width: 80px;
  height: 80px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(4px);
  border: 2px dashed rgba(255, 255, 255, 0.3);
  border-radius: 12px;
  color: rgba(255, 255, 255, 0.7);
  font-size: 24px;
  cursor: pointer;
}

.mascot-placeholder p {
  font-size: 11px;
  margin: 4px 0 0;
}

@keyframes pet-bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}
</style>
