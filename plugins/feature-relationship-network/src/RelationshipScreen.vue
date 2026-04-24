<template>
  <div class="relationship-app">
    <!-- Header -->
    <div class="relationship-header">
      <button class="phone-app-back-btn" @click="goBack"></button>
      <div class="phone-app-title">
        <span v-if="viewState === 'selector'">关系网</span>
        <span v-else>关系网 - {{ selectedBook?.title }}</span>
      </div>
      <button v-if="viewState === 'network'" class="view-toggle-btn" @click="viewState = 'list'" title="切换列表视图">
        &#x1F4CB;
      </button>
      <button v-if="viewState === 'list'" class="view-toggle-btn" @click="viewState = 'network'" title="切换星图视图">
        &#x1F31F;
      </button>
      <button v-if="viewState === 'network' || viewState === 'list'" class="analyse-btn" @click="runAnalysis" :disabled="isAnalysing">
        {{ isAnalysing ? '分析中...' : '分析' }}
      </button>
    </div>

    <!-- Worldbook Selector -->
    <RelationshipWorldbookSelector
      v-if="viewState === 'selector'"
      @select="selectBook"
    />

    <!-- Network View -->
    <template v-if="viewState === 'network' && selectedBook">
      <RelationshipNetworkView
        :world-book="selectedBook"
        @open-detail="openDetail"
      />

      <!-- Detail Panel Overlay -->
      <RelationshipDetailPanel
        :character="detailCharacter"
        :visible="detailCharacterId !== null"
        @close="detailCharacterId = null"
      />
    </template>

    <!-- List View -->
    <template v-if="viewState === 'list' && selectedBook">
      <RelationshipListView
        :world-book="selectedBook"
        @open-detail="openDetail"
      />
    </template>

    <!-- Error toast -->
    <div v-if="errorMsg" class="error-toast">{{ errorMsg }}</div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { loadWorldBooks, persistWorldBooks } from '../../../src/worldbook/worldBookStore.js'
import { generateRelationshipAnalysis } from '../../../src/llm/index.js'
import { getDialogueArchive } from '../../../src/composables/useDialogueArchive.js'
import RelationshipWorldbookSelector from './components/RelationshipWorldbookSelector.vue'
import RelationshipNetworkView from './components/RelationshipNetworkView.vue'
import RelationshipDetailPanel from './components/RelationshipDetailPanel.vue'
import RelationshipListView from './components/RelationshipListView.vue'

defineProps({
  icon: String,
  name: String,
})

const emit = defineEmits(['back'])

const viewState = ref('selector')
const selectedBookId = ref(null)
const selectedBook = ref(null)
const isAnalysing = ref(false)
const errorMsg = ref('')
const detailCharacterId = ref(null)

const books = ref([])

const detailCharacter = computed(() => {
  if (!detailCharacterId.value || !selectedBook.value) return null
  return selectedBook.value.characters?.find(c => c.id === detailCharacterId.value) || null
})

function openDetail(characterId) {
  detailCharacterId.value = characterId
}

function goBack() {
  if (viewState.value === 'network' || viewState.value === 'list') {
    viewState.value = 'selector'
    selectedBookId.value = null
    selectedBook.value = null
    detailCharacterId.value = null
  } else {
    emit('back')
  }
}

async function selectBook(bookId) {
  selectedBookId.value = bookId
  books.value = await loadWorldBooks()
  const book = books.value.find(b => b.id === bookId) || null
  selectedBook.value = book
  viewState.value = 'network'
}

async function runAnalysis() {
  if (isAnalysing.value || !selectedBook.value) return

  isAnalysing.value = true
  errorMsg.value = ''

  try {
    const allBooks = await loadWorldBooks()
    const worldBook = allBooks.find(b => b.id === selectedBookId.value)
    if (!worldBook) {
      errorMsg.value = '未找到世界书'
      return
    }

    const archive = await getDialogueArchive()
    const recentDialogue = archive.slice(-140)

    const result = await generateRelationshipAnalysis({
      worldBook,
      recentDialogue,
      existingRelationships: worldBook.relationships || {},
    })

    if (result.success) {
      worldBook.relationships = result.relationships
      worldBook.updatedAt = new Date().toISOString()
      await persistWorldBooks(allBooks)
      books.value = allBooks
      selectedBook.value = { ...worldBook }
    } else {
      errorMsg.value = result.error || '分析失败'
    }
  } catch (e) {
    errorMsg.value = '分析出错: ' + (e.message || '未知错误')
  } finally {
    isAnalysing.value = false
    setTimeout(() => { errorMsg.value = '' }, 3000)
  }
}
</script>

<style scoped>
.relationship-app {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #1a1a2e;
  color: #fff;
}
.relationship-header {
  display: flex;
  align-items: center;
  padding: 12px 8px;
  padding-top: max(12px, var(--safe-area-inset-top, 12px));
  background: rgba(0, 0, 0, 0.3);
  flex-shrink: 0;
}
.phone-app-title {
  flex: 1;
  font-size: 15px;
  font-weight: 600;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.analyse-btn {
  padding: 4px 12px;
  border-radius: 16px;
  border: none;
  background: linear-gradient(135deg, #5856d6, #af52de);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
}
.analyse-btn:disabled {
  opacity: 0.5;
}
.view-toggle-btn {
  padding: 4px 8px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
  margin-right: 6px;
}
.view-toggle-btn:hover {
  background: rgba(255, 255, 255, 0.16);
}
.error-toast {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(255, 59, 48, 0.9);
  color: #fff;
  padding: 8px 16px;
  border-radius: 20px;
  font-size: 12px;
  z-index: 100;
}




  .platform-android.android-portrait .analyse-btn,
  .platform-android.android-portrait .view-toggle-btn {
    width: auto !important;
    height: auto !important;
    min-width: 0 !important;
    min-height: 0 !important;
    max-width: none !important;
    max-height: none !important;
    flex: none !important;
    font-size: 1.1rem !important;
    padding: 6px 10px !important;
    box-sizing: border-box !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    border-radius: 8px !important;
    white-space: nowrap !important;
  }
</style>
