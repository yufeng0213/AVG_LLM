<script setup>
/**
 * QuizCharacterPicker.vue - 角色选择器（可复用组件）
 * 从世界书角色列表中选择一位讲师。
 */
import { computed, onMounted, ref } from 'vue'
import { getGroupedContacts } from '../../composables/usePhoneData.js'

const emit = defineEmits(['select', 'select-default'])

const groups = ref([])
const searchQuery = ref('')
const selectedCharacter = ref(null)

onMounted(async () => {
  groups.value = await getGroupedContacts()
})

const filteredGroups = computed(() => {
  if (!searchQuery.value.trim()) return groups.value
  const q = searchQuery.value.trim().toLowerCase()
  return groups.value
    .map(group => ({
      ...group,
      characters: group.characters.filter(c =>
        c.name.toLowerCase().includes(q) ||
        (c.nickname || '').toLowerCase().includes(q) ||
        (c.identity || '').toLowerCase().includes(q),
      ),
    }))
    .filter(g => g.characters.length > 0)
})

function selectCharacter(char) {
  selectedCharacter.value = char
  emit('select', char)
}

function selectDefault() {
  selectedCharacter.value = null
  emit('select-default')
}
</script>

<template>
  <div class="character-picker">
    <!-- 搜索 -->
    <div class="search-bar">
      <input
        v-model="searchQuery"
        type="text"
        class="search-input"
        placeholder="🔍 搜索角色..."
      />
    </div>

    <!-- 角色列表 -->
    <div class="character-groups">
      <div v-for="group in filteredGroups" :key="group.worldBookId" class="character-group">
        <h3 class="group-title">{{ group.worldBookTitle }}</h3>
        <div class="character-grid">
          <button
            v-for="char in group.characters"
            :key="char.id"
            class="character-card"
            :class="{ selected: selectedCharacter?.id === char.id }"
            @click="selectCharacter(char)"
          >
            <div class="character-avatar">
              <template v-if="char.portraits?.length > 0">
                <img :src="char.portraits[0]?.dataUrl || ''" :alt="char.name" />
              </template>
              <template v-else>
                {{ char.name?.charAt(0) || '?' }}
              </template>
            </div>
            <span class="character-name">{{ char.name }}</span>
            <span v-if="char.identity" class="character-identity">{{ char.identity }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- 不使用角色 -->
    <button class="default-option" @click="selectDefault">
      <span class="default-icon">🤖</span>
      <span>不使用角色（默认讲解）</span>
    </button>
  </div>
</template>

<style scoped>
.character-picker {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.search-bar {
  position: sticky;
  top: 0;
  z-index: 1;
}

.search-input {
  width: 100%;
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 12px;
  color: #fff;
  font-size: 0.9rem;
  outline: none;
  box-sizing: border-box;
}

.search-input:focus {
  border-color: #667eea;
}

.search-input::placeholder {
  color: #555;
}

.character-groups {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.character-group {
  margin-bottom: 4px;
}

.group-title {
  font-size: 0.85rem;
  color: #667eea;
  margin: 0 0 8px;
  font-weight: 600;
}

.character-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.character-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 12px 8px;
  background: rgba(255, 255, 255, 0.04);
  border: 2px solid transparent;
  border-radius: 12px;
  color: #fff;
  cursor: pointer;
  transition: all 0.2s;
}

.character-card:hover {
  background: rgba(255, 255, 255, 0.08);
}

.character-card.selected {
  border-color: #667eea;
  background: rgba(102, 126, 234, 0.15);
}

.character-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea, #764ba2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.2rem;
  font-weight: 700;
  overflow: hidden;
}

.character-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.character-name {
  font-size: 0.8rem;
  font-weight: 600;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.character-identity {
  font-size: 0.65rem;
  color: #888;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.default-option {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: rgba(255, 255, 255, 0.04);
  border: 2px solid transparent;
  border-radius: 12px;
  color: #ccc;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s;
}

.default-option:hover {
  background: rgba(255, 255, 255, 0.08);
}
</style>
