<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import {
  WORLD_BOOK_ENTRY_DEFS,
  createNewCharacter,
  createNewScene,
  getActiveWorldBookId,
  loadWorldBooks,
  persistWorldBooks,
  setActiveWorldBookId,
} from '../worldbook/worldBookStore'
import PortraitManager from '../components/PortraitManager.vue'
import {
  loadBackgroundFolder,
  backgroundList,
  backgroundFolderPath
} from '../background/backgroundStore'

const props = defineProps({
  bookId: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['back'])

const editorTabs = [
  { id: 'lore', label: '世界背景' },
  { id: 'user', label: 'user设定' },
  { id: 'char', label: 'char设定' },
  { id: 'scenes', label: '场景管理' },  // 新增：场景管理标签页
]

const statusMessage = ref('请选择条目并填写设定。')
const worldBooks = ref([])
const activeBookId = ref('default_world_book')
const activeEntryKey = ref(WORLD_BOOK_ENTRY_DEFS[0].key)
const activeEditorTab = ref('lore')
const activeCharacterId = ref('')
const activeSceneId = ref('')  // 新增：当前选中的场景ID
const isSaving = ref(false)
const isLoadingBackgrounds = ref(false)  // 新增：背景加载状态

const activeBook = computed(() =>
  worldBooks.value.find((book) => book.id === activeBookId.value) || null,
)
const activeEntryDef = computed(
  () => WORLD_BOOK_ENTRY_DEFS.find((entry) => entry.key === activeEntryKey.value) || WORLD_BOOK_ENTRY_DEFS[0],
)
const characters = computed(() => activeBook.value?.characters || [])
const scenes = computed(() => activeBook.value?.scenes || [])  // 新增：场景列表
const activeCharacterIndex = computed(() =>
  characters.value.findIndex((char) => char.id === activeCharacterId.value),
)
const activeCharacter = computed(() => {
  if (activeCharacterIndex.value >= 0) {
    return characters.value[activeCharacterIndex.value]
  }
  return characters.value[0] || null
})

// 新增：场景相关计算属性
const activeSceneIndex = computed(() =>
  scenes.value.findIndex((scene) => scene.id === activeSceneId.value),
)
const activeScene = computed(() => {
  if (activeSceneIndex.value >= 0) {
    return scenes.value[activeSceneIndex.value]
  }
  return scenes.value[0] || null
})

const getCharacterDisplayName = (char, index = 0) => {
  const name = String(char?.name || '').trim()
  if (name) return name

  const nickname = String(char?.nickname || '').trim()
  if (nickname) return nickname

  return `角色 ${index + 1}`
}

const activeCharacterDisplayName = computed(() => {
  if (!activeCharacter.value) return '未选择角色'
  const index = activeCharacterIndex.value >= 0 ? activeCharacterIndex.value : 0
  return getCharacterDisplayName(activeCharacter.value, index)
})

const markBookUpdated = () => {
  if (!activeBook.value) return
  activeBook.value.updatedAt = new Date().toISOString()
}

const ensureCharacterSelection = () => {
  if (characters.value.length === 0) {
    activeCharacterId.value = ''
    return
  }

  const exists = characters.value.some((char) => char.id === activeCharacterId.value)
  if (!exists) {
    activeCharacterId.value = characters.value[0].id
  }
}

const loadEditorData = () => {
  worldBooks.value = loadWorldBooks()

  const desiredBookId = props.bookId || getActiveWorldBookId()
  const exists = worldBooks.value.some((book) => book.id === desiredBookId)
  const nextId = exists ? desiredBookId : worldBooks.value[0]?.id || 'default_world_book'

  activeBookId.value = nextId
  setActiveWorldBookId(nextId)
  ensureCharacterSelection()
}

const updateActiveBookField = (field, value) => {
  if (!activeBook.value) return
  activeBook.value[field] = value
  markBookUpdated()
}

const updateActiveEntry = (value) => {
  if (!activeBook.value) return
  activeBook.value.entries[activeEntryKey.value] = value
  markBookUpdated()
}

const updateUserField = (field, value) => {
  if (!activeBook.value?.userProfile) return
  activeBook.value.userProfile[field] = value
  markBookUpdated()
}

const addCharacter = () => {
  if (!activeBook.value) return

  const nextCharacter = createNewCharacter(activeBook.value.characters)
  activeBook.value.characters = [...activeBook.value.characters, nextCharacter]
  activeCharacterId.value = nextCharacter.id
  activeEditorTab.value = 'char'
  markBookUpdated()
  statusMessage.value = `已新增角色：${nextCharacter.name}`
}

const updateActiveCharacterField = (field, value) => {
  if (!activeCharacter.value) return
  activeCharacter.value[field] = value
  activeCharacter.value.updatedAt = new Date().toISOString()
  markBookUpdated()
}

// ========== 场景管理功能 ==========

// 确保场景选择有效
const ensureSceneSelection = () => {
  if (scenes.value.length === 0) {
    activeSceneId.value = ''
    return
  }

  const exists = scenes.value.some((scene) => scene.id === activeSceneId.value)
  if (!exists) {
    activeSceneId.value = scenes.value[0].id
  }
}

// 添加新场景
const addScene = () => {
  if (!activeBook.value) return

  const nextScene = createNewScene(scenes.value.length + 1)
  activeBook.value.scenes = [...scenes.value, nextScene]
  activeSceneId.value = nextScene.id
  activeEditorTab.value = 'scenes'
  markBookUpdated()
  statusMessage.value = `已新增场景：${nextScene.name}`
}

// 删除场景
const deleteScene = (sceneId) => {
  if (!activeBook.value) return
  
  const index = scenes.value.findIndex((s) => s.id === sceneId)
  if (index < 0) return
  
  activeBook.value.scenes = scenes.value.filter((s) => s.id !== sceneId)
  ensureSceneSelection()
  markBookUpdated()
  statusMessage.value = `已删除场景`
}

// 更新场景字段
const updateActiveSceneField = (field, value) => {
  if (!activeScene.value) return
  activeScene.value[field] = value
  markBookUpdated()
}

// 获取场景显示名称
const getSceneDisplayName = (scene, index = 0) => {
  const name = String(scene?.name || '').trim()
  if (name) return name
  return `场景 ${index + 1}`
}

// 加载背景文件夹
const handleLoadBackgroundFolder = async () => {
  isLoadingBackgrounds.value = true
  try {
    const result = await loadBackgroundFolder()
    if (result.success) {
      statusMessage.value = `已加载 ${backgroundList.value.length} 个背景图片`
    } else if (!result.canceled) {
      statusMessage.value = `加载背景失败：${result.error || '未知错误'}`
    }
  } finally {
    isLoadingBackgrounds.value = false
  }
}

// 选择背景文件夹
const handleSelectBackgroundFolder = async () => {
  if (!window.avgLLM?.background?.selectFolder) {
    statusMessage.value = '请在 Electron 环境中运行'
    return
  }
  
  isLoadingBackgrounds.value = true
  try {
    const result = await window.avgLLM.background.selectFolder()
    if (result.success && result.path) {
      await loadBackgroundFolder(result.path)
      statusMessage.value = `已选择背景文件夹：${result.path}`
    }
  } finally {
    isLoadingBackgrounds.value = false
  }
}

// 场景显示名称计算属性
const activeSceneDisplayName = computed(() => {
  if (!activeScene.value) return '未选择场景'
  const index = activeSceneIndex.value >= 0 ? activeSceneIndex.value : 0
  return getSceneDisplayName(activeScene.value, index)
})

const saveWorldBooks = async () => {
  if (!activeBook.value) {
    statusMessage.value = '未找到可编辑的世界书。'
    return
  }

  isSaving.value = true
  try {
    persistWorldBooks(worldBooks.value)
    setActiveWorldBookId(activeBook.value.id)
    statusMessage.value = `已保存：${activeBook.value.title}`
  } finally {
    isSaving.value = false
  }
}

watch(
  () => props.bookId,
  () => {
    loadEditorData()
  },
)

watch(
  () => activeBook.value?.id,
  () => {
    ensureCharacterSelection()
  },
)

onMounted(loadEditorData)
</script>

<template>
  <main class="worldbook-editor-screen" role="main">
    <p class="worldbook-editor-bg-word" aria-hidden="true">BOOK</p>

    <header class="worldbook-editor-header">
      <button type="button" class="back-button" @click="emit('back')">返回书架</button>
      <div class="worldbook-editor-title-group">
        <p class="worldbook-editor-tag">World Book Editor</p>
        <h1 class="worldbook-editor-title">
          <span>{{ activeBook?.title || '世界书' }}</span>
          <span class="worldbook-editor-title-gradient">设定编辑</span>
        </h1>
      </div>
    </header>

    <section class="worldbook-editor-tabs" aria-label="设定分类">
      <button
        v-for="tab in editorTabs"
        :key="tab.id"
        type="button"
        class="worldbook-editor-tab"
        :class="{ active: activeEditorTab === tab.id }"
        @click="activeEditorTab = tab.id"
      >
        {{ tab.label }}
      </button>
    </section>

    <section v-if="activeEditorTab === 'lore'" class="worldbook-editor-layout">
      <aside class="worldbook-entry-nav" aria-label="背景条目">
        <button
          v-for="entry in WORLD_BOOK_ENTRY_DEFS"
          :key="entry.key"
          type="button"
          class="worldbook-entry-item"
          :class="{ active: activeEntryKey === entry.key }"
          @click="activeEntryKey = entry.key"
        >
          {{ entry.label }}
        </button>
      </aside>

      <section class="worldbook-editor settings-panel-content">
        <h2 class="panel-title">世界背景</h2>
        <p class="panel-description">当前编辑：{{ activeBook?.title || '未找到世界书' }}</p>

        <div class="settings-grid two-column">
          <label class="setting-field">
            <span class="setting-label">世界书名称</span>
            <input
              :value="activeBook?.title || ''"
              class="setting-input"
              type="text"
              @input="updateActiveBookField('title', $event.target.value)"
            />
          </label>

          <label class="setting-field">
            <span class="setting-label">世界书摘要</span>
            <input
              :value="activeBook?.summary || ''"
              class="setting-input"
              type="text"
              placeholder="这本世界书主要负责什么背景模块"
              @input="updateActiveBookField('summary', $event.target.value)"
            />
          </label>
        </div>

        <label class="setting-field">
          <span class="setting-label">{{ activeEntryDef.label }}</span>
          <span class="entry-hint">{{ activeEntryDef.hint }}</span>
          <textarea
            :value="activeBook?.entries?.[activeEntryKey] || ''"
            class="setting-textarea"
            rows="14"
            placeholder="在这里填写这个条目的详细背景设定"
            spellcheck="false"
            @input="updateActiveEntry($event.target.value)"
          ></textarea>
        </label>
      </section>
    </section>

    <section v-else-if="activeEditorTab === 'user'" class="worldbook-editor-single">
      <section class="worldbook-editor settings-panel-content">
        <h2 class="panel-title">user设定</h2>
        <p class="panel-description">用于设定当前用户/主视角人物的基本信息。</p>

        <div class="settings-grid two-column">
          <label class="setting-field">
            <span class="setting-label">名字</span>
            <input
              :value="activeBook?.userProfile?.name || ''"
              class="setting-input"
              type="text"
              placeholder="例如：林川"
              @input="updateUserField('name', $event.target.value)"
            />
          </label>

          <label class="setting-field">
            <span class="setting-label">昵称</span>
            <input
              :value="activeBook?.userProfile?.nickname || ''"
              class="setting-input"
              type="text"
              placeholder="例如：小川"
              @input="updateUserField('nickname', $event.target.value)"
            />
          </label>
        </div>

        <label class="setting-field">
          <span class="setting-label">身份</span>
          <input
            :value="activeBook?.userProfile?.identity || ''"
            class="setting-input"
            type="text"
            placeholder="例如：学院调查员 / 前特勤队员"
            @input="updateUserField('identity', $event.target.value)"
          />
        </label>

        <label class="setting-field">
          <span class="setting-label">外表</span>
          <textarea
            :value="activeBook?.userProfile?.appearance || ''"
            class="setting-textarea"
            rows="7"
            placeholder="记录体型、发色、穿着、标志性特征等"
            spellcheck="false"
            @input="updateUserField('appearance', $event.target.value)"
          ></textarea>
        </label>

        <label class="setting-field">
          <span class="setting-label">背景补充</span>
          <textarea
            :value="activeBook?.userProfile?.background || ''"
            class="setting-textarea"
            rows="7"
            placeholder="经历、性格、动机、禁忌等补充信息"
            spellcheck="false"
            @input="updateUserField('background', $event.target.value)"
          ></textarea>
        </label>

        <label class="setting-field">
          <span class="setting-label">立绘配置</span>
          <PortraitManager
            :portraits="activeBook?.userProfile?.portraits || []"
            @update="updateUserField('portraits', $event)"
          />
        </label>
      </section>
    </section>

    <section v-else-if="activeEditorTab === 'char'" class="worldbook-editor-layout">
      <aside class="worldbook-entry-nav worldbook-char-nav" aria-label="角色列表">
        <button type="button" class="action-button action-outline worldbook-add-char-btn" @click="addCharacter">
          ＋ 新增角色
        </button>

        <button
          v-for="(char, index) in characters"
          :key="char.id"
          type="button"
          class="worldbook-entry-item worldbook-char-item"
          :class="{ active: activeCharacterId === char.id }"
          @click="activeCharacterId = char.id"
        >
          <span class="char-name">{{ getCharacterDisplayName(char, index) }}</span>
          <span class="char-note">{{ char.nickname || '未设置昵称' }}</span>
        </button>
      </aside>

      <section class="worldbook-editor settings-panel-content">
        <h2 class="panel-title">char设定</h2>
        <p class="panel-description">当前角色：{{ activeCharacterDisplayName }}</p>

        <template v-if="activeCharacter">
          <div class="settings-grid two-column">
            <label class="setting-field">
              <span class="setting-label">名字</span>
              <input
                :value="activeCharacter.name"
                class="setting-input"
                type="text"
                @input="updateActiveCharacterField('name', $event.target.value)"
              />
            </label>

            <label class="setting-field">
              <span class="setting-label">昵称</span>
              <input
                :value="activeCharacter.nickname"
                class="setting-input"
                type="text"
                @input="updateActiveCharacterField('nickname', $event.target.value)"
              />
            </label>
          </div>

          <label class="setting-field">
            <span class="setting-label">身份</span>
            <input
              :value="activeCharacter.identity"
              class="setting-input"
              type="text"
              placeholder="例如：反抗军联络官 / 学院导师"
              @input="updateActiveCharacterField('identity', $event.target.value)"
            />
          </label>

          <label class="setting-field">
            <span class="setting-label">外表</span>
            <textarea
              :value="activeCharacter.appearance"
              class="setting-textarea"
              rows="7"
              placeholder="体型、发色、衣着、配件、动作习惯等"
              spellcheck="false"
              @input="updateActiveCharacterField('appearance', $event.target.value)"
            ></textarea>
          </label>

          <label class="setting-field">
            <span class="setting-label">背景</span>
            <textarea
              :value="activeCharacter.background"
              class="setting-textarea"
              rows="7"
              placeholder="经历、立场、目标、关系网"
              spellcheck="false"
              @input="updateActiveCharacterField('background', $event.target.value)"
            ></textarea>
          </label>

          <label class="setting-field">
            <span class="setting-label">备注</span>
            <textarea
              :value="activeCharacter.notes"
              class="setting-textarea"
              rows="6"
              placeholder="口癖、禁忌、剧情伏笔、台词风格"
              spellcheck="false"
              @input="updateActiveCharacterField('notes', $event.target.value)"
            ></textarea>
          </label>

          <label class="setting-field">
            <span class="setting-label">立绘配置</span>
            <PortraitManager
              :portraits="activeCharacter?.portraits || []"
              @update="updateActiveCharacterField('portraits', $event)"
            />
          </label>
        </template>
      </section>
    </section>

    <!-- 场景管理标签页 -->
    <section v-if="activeEditorTab === 'scenes'" class="worldbook-editor-layout">
      <aside class="worldbook-entry-nav" aria-label="场景列表">
        <button
          v-for="(scene, index) in scenes"
          :key="scene.id"
          type="button"
          class="worldbook-entry-item worldbook-char-item"
          :class="{ active: activeSceneId === scene.id }"
          @click="activeSceneId = scene.id"
        >
          <span class="char-name">{{ getSceneDisplayName(scene, index) }}</span>
          <span class="char-note">{{ scene.description?.substring(0, 10) || '无描述' }}</span>
        </button>
        
        <button
          type="button"
          class="worldbook-entry-item add-item"
          @click="addScene"
        >
          + 新增场景
        </button>
      </aside>

      <section class="worldbook-editor settings-panel-content">
        <h2 class="panel-title">场景管理</h2>
        <p class="panel-description">
          当前场景：{{ activeSceneDisplayName }}
          <span v-if="backgroundList.length > 0"> | 已加载 {{ backgroundList.length }} 个背景</span>
        </p>

        <!-- 背景文件夹操作 -->
        <div class="scene-folder-actions">
          <button
            type="button"
            class="action-button"
            :disabled="isLoadingBackgrounds"
            @click="handleSelectBackgroundFolder"
          >
            📁 选择背景文件夹
          </button>
          <button
            type="button"
            class="action-button"
            :disabled="isLoadingBackgrounds"
            @click="handleLoadBackgroundFolder"
          >
            🔄 刷新背景列表
          </button>
          <span v-if="backgroundFolderPath" class="folder-path">
            {{ backgroundFolderPath }}
          </span>
        </div>

        <template v-if="activeScene">
          <div class="settings-grid two-column">
            <label class="setting-field">
              <span class="setting-label">场景ID</span>
              <input
                :value="activeScene.id"
                class="setting-input"
                type="text"
                disabled
                placeholder="自动生成"
              />
            </label>

            <label class="setting-field">
              <span class="setting-label">场景名称</span>
              <input
                :value="activeScene.name"
                class="setting-input"
                type="text"
                placeholder="例如：旧图书馆、雨夜街道"
                @input="updateActiveSceneField('name', $event.target.value)"
              />
            </label>
          </div>

          <label class="setting-field">
            <span class="setting-label">背景图片</span>
            <select
              :value="activeScene.background"
              class="setting-select"
              @change="updateActiveSceneField('background', $event.target.value)"
            >
              <option value="">-- 选择背景图片 --</option>
              <option
                v-for="bg in backgroundList"
                :key="bg.id"
                :value="bg.id"
              >
                {{ bg.label }}
              </option>
            </select>
            <p class="setting-hint">
              从已加载的背景列表中选择，或手动输入背景ID
            </p>
          </label>

          <label class="setting-field">
            <span class="setting-label">场景描述</span>
            <textarea
              :value="activeScene.description"
              class="setting-textarea"
              rows="4"
              placeholder="场景的详细描述，用于 LLM 生成剧情时参考"
              spellcheck="false"
              @input="updateActiveSceneField('description', $event.target.value)"
            ></textarea>
          </label>

          <!-- 背景预览 -->
          <div v-if="activeScene.background" class="scene-preview">
            <p class="preview-label">背景预览</p>
            <div class="preview-box">
              <p class="preview-placeholder">
                已选择: {{ activeScene.background }}
              </p>
            </div>
          </div>

          <!-- 删除场景按钮 -->
          <div class="scene-delete-action">
            <button
              type="button"
              class="action-button action-danger"
              @click="deleteScene(activeScene.id)"
            >
              🗑️ 删除此场景
            </button>
          </div>
        </template>

        <div v-else class="empty-state">
          <p>暂无场景配置</p>
          <button type="button" class="action-button" @click="addScene">
            + 添加第一个场景
          </button>
        </div>
      </section>
    </section>

    <div class="setting-actions worldbook-editor-actions">
      <button type="button" class="action-button action-strong" :disabled="isSaving" @click="saveWorldBooks">
        {{ isSaving ? '保存中...' : '保存世界书' }}
      </button>
    </div>

    <p class="status-message">{{ statusMessage }}</p>
  </main>
</template>

<style scoped>
.worldbook-editor-screen {
  position: relative;
  width: 100%;
  height: calc(100vh - clamp(40px, 8vw, 110px));
  max-height: calc(100vh - clamp(40px, 8vw, 110px));
  border: 8px solid var(--accent-cyan);
  border-radius: 34px 20px 30px 18px;
  background: var(--surface-panel);
  backdrop-filter: blur(var(--backdrop-blur));
  box-shadow: var(--shadow-screen);
  padding: clamp(18px, 3vw, 32px);
  display: grid;
  grid-template-rows: auto auto 1fr auto auto;
  gap: clamp(12px, 2vw, 20px);
  overflow: hidden;
}

.worldbook-editor-screen::before,
.worldbook-editor-screen::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.worldbook-editor-screen::before {
  opacity: 0.14;
  background-image:
    radial-gradient(circle, var(--accent-cyan) 1px, transparent 1px),
    repeating-linear-gradient(
      -40deg,
      transparent 0 12px,
      color-mix(in srgb, var(--accent-orange) 35%, transparent) 12px 22px
    );
  background-size:
    24px 24px,
    100% 100%;
}

.worldbook-editor-screen::after {
  opacity: 0.1;
  background-image: conic-gradient(
    from 90deg at 1px 1px,
    transparent 90deg,
    color-mix(in srgb, var(--accent-magenta) 28%, transparent) 0
  );
  background-size: 44px 44px;
}

.worldbook-editor-bg-word {
  position: absolute;
  margin: 0;
  right: -2%;
  top: -5%;
  font-family: var(--font-heading);
  font-size: clamp(6rem, 20vw, 14rem);
  line-height: 0.8;
  letter-spacing: -0.07em;
  color: color-mix(in srgb, var(--accent-yellow) 32%, transparent);
  opacity: 0.22;
  pointer-events: none;
  user-select: none;
}

.worldbook-editor-header {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  flex-wrap: wrap;
}

.worldbook-editor-title-group {
  display: grid;
  gap: 8px;
}

.worldbook-editor-tag {
  margin: 0;
  width: fit-content;
  padding: 8px 14px;
  border: 4px solid var(--accent-orange);
  border-radius: 9999px;
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  text-shadow: var(--text-shadow-single);
  background: color-mix(in srgb, var(--accent-magenta) 25%, transparent);
}

.worldbook-editor-title {
  margin: 0;
  display: grid;
  font-family: var(--font-heading);
  font-size: clamp(2.1rem, 5.7vw, 4.2rem);
  line-height: 0.92;
  letter-spacing: -0.03em;
  text-shadow: var(--text-shadow-triple);
}

.worldbook-editor-title-gradient {
  width: fit-content;
  font-family: var(--font-display);
  font-size: clamp(1.9rem, 4.8vw, 3rem);
  letter-spacing: 0.08em;
  background: linear-gradient(
    90deg,
    var(--accent-magenta),
    var(--accent-cyan),
    var(--accent-yellow),
    var(--accent-magenta)
  );
  background-size: 250% 250%;
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: avg-gradient-shift 4s linear infinite;
}

.worldbook-editor-tabs {
  position: relative;
  z-index: 2;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.worldbook-editor-tab {
  appearance: none;
  border: 4px dashed var(--accent-magenta);
  border-radius: var(--radius-button);
  padding: 10px 16px;
  font: 800 0.82rem/1 var(--font-body);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--foreground);
  background: color-mix(in srgb, var(--accent-purple) 35%, transparent);
  box-shadow: var(--shadow-field);
  cursor: pointer;
  transition: transform 220ms ease, box-shadow 220ms ease, border-style 220ms ease;
}

.worldbook-editor-tab:hover {
  transform: translateY(-2px);
}

.worldbook-editor-tab.active {
  border-style: solid;
  border-color: var(--accent-yellow);
  background: var(--gradient-primary);
  box-shadow: var(--shadow-button);
}

.worldbook-editor-layout {
  position: relative;
  z-index: 2;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(220px, 250px) minmax(0, 1fr);
  gap: clamp(12px, 2vw, 20px);
  overflow: hidden;
}

.worldbook-editor-single {
  position: relative;
  z-index: 2;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.worldbook-editor-single > .worldbook-editor {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.worldbook-entry-nav {
  border: 4px solid var(--border-panel);
  border-radius: 20px;
  background: var(--surface-field);
  padding: 12px;
  display: grid;
  gap: 10px;
  align-content: start;
  overflow: auto;
  box-shadow: var(--shadow-panel);
}

.worldbook-entry-item {
  appearance: none;
  text-align: left;
  border: 4px dashed var(--accent-cyan);
  border-radius: 18px;
  background: color-mix(in srgb, var(--accent-purple) 30%, transparent);
  color: var(--foreground);
  padding: 10px 12px;
  font: 700 0.84rem/1.2 var(--font-body);
  letter-spacing: 0.08em;
  cursor: pointer;
  transition: transform 220ms ease, box-shadow 220ms ease, border-style 220ms ease;
  box-shadow: var(--shadow-field);
}

.worldbook-entry-item:hover {
  transform: translateX(3px);
}

.worldbook-entry-item.active {
  border-style: solid;
  border-color: var(--accent-yellow);
  background: var(--gradient-secondary);
  box-shadow: var(--shadow-button);
}

.worldbook-char-nav {
  align-content: start;
}

.worldbook-add-char-btn {
  width: 100%;
}

.worldbook-char-item {
  display: grid;
  gap: 4px;
}

.char-name {
  font-weight: 800;
}

.char-note {
  font-size: 0.74rem;
  opacity: 0.88;
}

.worldbook-editor {
  border: 4px dotted var(--border-panel);
  border-radius: 20px;
  background: var(--surface-panel);
  box-shadow: var(--shadow-card);
  padding: clamp(14px, 2vw, 22px);
  min-height: 0;
  overflow-y: auto;
}

.entry-hint {
  font-size: 0.82rem;
  color: color-mix(in srgb, var(--foreground) 86%, var(--accent-cyan));
}

.worldbook-editor-actions {
  position: relative;
  z-index: 2;
}

@media (max-width: 980px) {
  .worldbook-editor-screen {
    border-width: 6px;
    min-height: calc(100vh - 30px);
  }

  .worldbook-editor-layout {
    grid-template-columns: 1fr;
  }

  .worldbook-entry-nav {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .worldbook-char-nav {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .worldbook-add-char-btn {
    grid-column: 1 / -1;
  }
}

@media (max-width: 680px) {
  .worldbook-entry-nav,
  .worldbook-char-nav {
    grid-template-columns: 1fr;
  }

  .worldbook-editor-bg-word {
    font-size: clamp(4.5rem, 24vw, 8rem);
    right: -7%;
  }
}

/* 场景管理样式 */
.scene-folder-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  margin-bottom: 20px;
  padding: 16px;
  background: color-mix(in srgb, var(--accent-cyan) 10%, transparent);
  border-radius: 12px;
  border: 2px solid var(--accent-cyan);
}

.scene-folder-actions .folder-path {
  font-size: 0.85rem;
  color: var(--text-muted);
  word-break: break-all;
}

.setting-select {
  width: 100%;
  padding: 12px 16px;
  font-size: 1rem;
  font-family: var(--font-body);
  color: var(--text-primary);
  background: var(--surface-panel);
  border: 4px solid var(--accent-cyan);
  border-radius: 12px;
  cursor: pointer;
  transition: border-color 0.2s ease;
}

.setting-select:focus {
  outline: none;
  border-color: var(--accent-yellow);
}

.setting-hint {
  margin-top: 8px;
  font-size: 0.85rem;
  color: var(--text-muted);
}

.scene-preview {
  margin-top: 20px;
}

.scene-preview .preview-label {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.scene-preview .preview-box {
  width: 100%;
  height: 200px;
  border: 4px solid var(--accent-cyan);
  border-radius: 12px;
  background: color-mix(in srgb, var(--accent-cyan) 15%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
}

.scene-preview .preview-placeholder {
  color: var(--text-muted);
  font-size: 0.9rem;
}

.scene-delete-action {
  margin-top: 24px;
  padding-top: 20px;
  border-top: 2px solid var(--border-subtle);
}

.action-danger {
  background: color-mix(in srgb, var(--accent-magenta) 20%, transparent);
  border-color: var(--accent-magenta);
  color: var(--accent-magenta);
}

.action-danger:hover {
  background: var(--accent-magenta);
  color: var(--bg-base);
}

.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: var(--text-muted);
}

.empty-state p {
  margin-bottom: 16px;
  font-size: 1.1rem;
}

.add-item {
  border-style: dashed !important;
  opacity: 0.7;
}

.add-item:hover {
  opacity: 1;
}
</style>
