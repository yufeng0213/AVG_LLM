<script setup>
/**
 * PhoneNotesApp.vue - 备忘录应用
 * 支持创建/编辑/删除笔记，添加自由标签，按标签筛选，搜索。
 */
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { kvStorage } from '../../../../src/storage/index.js'

const emit = defineEmits(['back'])

const STORAGE_KEY = 'phone_notes'

const notes = ref([])
const editingNote = ref(null)
const searchQuery = ref('')
const activeTagFilter = ref(null)

// 新建笔记
const titleDraft = ref('')
const contentDraft = ref('')
const tagDraft = ref('')
const showTagInput = ref(false)

// 标签色板
const TAG_COLORS = [
  { bg: 'rgba(0,122,255,0.25)', text: '#64b5f6', border: 'rgba(0,122,255,0.4)' },
  { bg: 'rgba(255,59,48,0.25)', text: '#ef9a9a', border: 'rgba(255,59,48,0.4)' },
  { bg: 'rgba(52,199,89,0.25)', text: '#a5d6a7', border: 'rgba(52,199,89,0.4)' },
  { bg: 'rgba(255,204,0,0.25)', text: '#fff59d', border: 'rgba(255,204,0,0.4)' },
  { bg: 'rgba(175,82,222,0.25)', text: '#ce93d8', border: 'rgba(175,82,222,0.4)' },
  { bg: 'rgba(255,149,0,0.25)', text: '#ffcc80', border: 'rgba(255,149,0,0.4)' },
  { bg: 'rgba(90,200,250,0.25)', text: '#b3e5fc', border: 'rgba(90,200,250,0.4)' },
  { bg: 'rgba(255,45,85,0.25)', text: '#f8bbd0', border: 'rgba(255,45,85,0.4)' },
]

// 标签颜色缓存: tagName -> colorIndex
const tagColorMap = ref({})

onMounted(async () => {
  const saved = await kvStorage.get(STORAGE_KEY)
  notes.value = saved || []
  rebuildTagColorMap()
})

// 所有标签（去重）
const allTags = computed(() => {
  const tagSet = new Set()
  for (const note of notes.value) {
    for (const tag of note.tags || []) {
      tagSet.add(tag)
    }
  }
  return [...tagSet]
})

// 筛选后的笔记
const filteredNotes = computed(() => {
  let result = [...notes.value]

  // 标签筛选
  if (activeTagFilter.value) {
    result = result.filter(n => (n.tags || []).includes(activeTagFilter.value))
  }

  // 搜索
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.trim().toLowerCase()
    result = result.filter(n =>
      (n.title || '').toLowerCase().includes(q) ||
      (n.content || '').toLowerCase().includes(q) ||
      (n.tags || []).some(t => t.toLowerCase().includes(q))
    )
  }

  // 置顶优先
  result.sort((a, b) => {
    if (a.pinned && !b.pinned) return -1
    if (!a.pinned && b.pinned) return 1
    return new Date(b.updatedAt) - new Date(a.updatedAt)
  })

  return result
})

function rebuildTagColorMap() {
  const map = {}
  let idx = 0
  const tagSet = new Set()
  for (const note of notes.value) {
    for (const tag of note.tags || []) {
      tagSet.add(tag)
    }
  }
  for (const tag of tagSet) {
    if (!map[tag]) {
      map[tag] = idx % TAG_COLORS.length
      idx++
    }
  }
  tagColorMap.value = map
}

function getTagColor(tag) {
  const idx = tagColorMap.value[tag] ?? 0
  return TAG_COLORS[idx % TAG_COLORS.length]
}

function tagFilterStyle(tag) {
  const c = getTagColor(tag)
  const isActive = activeTagFilter.value === tag
  return {
    background: isActive ? c.bg : `${c.bg}33`,
    borderColor: isActive ? c.border : c.border + '66',
    color: c.text,
  }
}

function formatDate(isoStr) {
  if (!isoStr) return ''
  const d = new Date(isoStr)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function openNote(note) {
  editingNote.value = note
  titleDraft.value = note.title || ''
  contentDraft.value = note.content || ''
  tagDraft.value = ''
  showTagInput.value = false
}

function createNote() {
  const note = {
    id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title: '',
    content: '',
    tags: [],
    pinned: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  notes.value.unshift(note)
  saveNotes()
  openNote(note)
}

function saveNote() {
  if (!editingNote.value) return
  editingNote.value.title = titleDraft.value.trim()
  editingNote.value.content = contentDraft.value.trim()
  editingNote.value.updatedAt = new Date().toISOString()
  saveNotes()
}

async function saveNotes() {
  await kvStorage.set(STORAGE_KEY, notes.value)
}

function deleteNote() {
  if (!editingNote.value) return
  if (!confirm('确定删除这条笔记？')) return
  notes.value = notes.value.filter(n => n.id !== editingNote.value.id)
  saveNotes()
  rebuildTagColorMap()
  editingNote.value = null
}

function addTag() {
  const tag = tagDraft.value.trim()
  if (!tag || !editingNote.value) return
  if ((editingNote.value.tags || []).includes(tag)) {
    tagDraft.value = ''
    showTagInput.value = false
    return
  }
  if (!editingNote.value.tags) editingNote.value.tags = []
  editingNote.value.tags.push(tag)
  if (!tagColorMap.value[tag]) {
    tagColorMap.value[tag] = Object.keys(tagColorMap.value).length % TAG_COLORS.length
  }
  tagDraft.value = ''
  showTagInput.value = false
  saveNote()
}

function removeTag(tag) {
  if (!editingNote.value) return
  editingNote.value.tags = (editingNote.value.tags || []).filter(t => t !== tag)
  saveNote()
}

const charCount = computed(() => contentDraft.value.length)

watch(contentDraft, () => {
  if (editingNote.value) {
    editingNote.value.content = contentDraft.value
    editingNote.value.updatedAt = new Date().toISOString()
    saveNotes()
  }
})
watch(titleDraft, () => {
  if (editingNote.value) {
    editingNote.value.title = titleDraft.value.trim()
    editingNote.value.updatedAt = new Date().toISOString()
    saveNotes()
  }
})
</script>

<template>
  <div class="notes-app">
    <!-- 笔记列表 -->
    <template v-if="!editingNote">
      <div class="phone-app-header">
        <button type="button" class="phone-app-back-btn" @click="emit('back')">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          返回
        </button>
        <h2 class="phone-app-title">备忘录</h2>
        <button type="button" class="phone-app-back-btn notes-new-btn" @click="createNote">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
      </div>

      <!-- 搜索框 -->
      <div class="notes-search-bar">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input
          v-model="searchQuery"
          class="notes-search-input"
          placeholder="搜索笔记或标签..."
        />
      </div>

      <!-- 标签筛选 -->
      <div v-if="allTags.length > 0" class="notes-tag-filter">
        <button
          type="button"
          class="notes-tag-chip"
          :class="{ active: !activeTagFilter }"
          @click="activeTagFilter = null"
        >
          全部
        </button>
        <button
          v-for="tag in allTags"
          :key="tag"
          type="button"
          class="notes-tag-chip"
          :class="{ active: activeTagFilter === tag }"
          :style="tagFilterStyle(tag)"
          @click="activeTagFilter = activeTagFilter === tag ? null : tag"
        >
          {{ tag }}
        </button>
      </div>

      <!-- 笔记列表 -->
      <div class="notes-list">
        <div v-if="filteredNotes.length === 0" class="phone-loading" style="padding-top:60px">
          {{ searchQuery || activeTagFilter ? '没有找到匹配的笔记' : '点击 + 新建笔记' }}
        </div>
        <div
          v-for="note in filteredNotes"
          :key="note.id"
          class="notes-list-item"
          @click="openNote(note)"
        >
          <div class="notes-item-header">
            <span class="notes-item-title">{{ note.title || '无标题笔记' }}</span>
            <span class="notes-item-date">{{ formatDate(note.updatedAt) }}</span>
          </div>
          <div class="notes-item-preview">{{ note.content.slice(0, 80) || '(空笔记)' }}</div>
          <div v-if="note.tags && note.tags.length > 0" class="notes-item-tags">
            <span
              v-for="tag in note.tags"
              :key="tag"
              class="notes-item-tag"
              :style="getTagColor(tag)"
            >
              {{ tag }}
            </span>
          </div>
        </div>
      </div>
    </template>

    <!-- 笔记编辑 -->
    <template v-else>
      <div class="phone-app-header">
        <button type="button" class="phone-app-back-btn" @click="saveNote(); editingNote = null">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          返回
        </button>
        <h2 class="phone-app-title">{{ editingNote.pinned ? '&#x1F4CC; 编辑' : '编辑笔记' }}</h2>
        <div style="display:flex;gap:4px;align-items:center">
          <button
            type="button"
            class="notes-pin-btn"
            :class="{ pinned: editingNote.pinned }"
            @click="editingNote.pinned = !editingNote.pinned; saveNote()"
          >
            &#x1F4CC;
          </button>
          <button type="button" class="phone-app-back-btn notes-delete-btn" @click="deleteNote">
            &#x1F5D1;
          </button>
        </div>
      </div>

      <div class="notes-editor">
        <!-- 标题 -->
        <input
          v-model="titleDraft"
          class="notes-title-input"
          placeholder="标题（可选）"
          maxlength="100"
        />

        <!-- 标签行 -->
        <div class="notes-tags-row">
          <span
            v-for="tag in (editingNote.tags || [])"
            :key="tag"
            class="notes-editor-tag"
            :style="getTagColor(tag)"
          >
            {{ tag }}
            <span class="notes-editor-tag-remove" @click="removeTag(tag)">×</span>
          </span>
          <template v-if="showTagInput">
            <input
              v-model="tagDraft"
              class="notes-tag-input"
              placeholder="标签名"
              maxlength="20"
              @keydown.enter="addTag"
              @blur="addTag"
            />
          </template>
          <button
            v-else
            type="button"
            class="notes-add-tag-btn"
            @click="showTagInput = true; tagDraft = ''"
          >
            + 标签
          </button>
        </div>

        <!-- 内容区 -->
        <textarea
          v-model="contentDraft"
          class="notes-content-input"
          placeholder="开始记录..."
          maxlength="5000"
        />

        <!-- 底部字数 -->
        <div class="notes-editor-footer">
          <span class="notes-char-count">字数: {{ charCount }}</span>
        </div>
      </div>
    </template>
  </div>
</template>
