<script setup>
/**
 * 好感度主面板组件
 * 显示所有角色的好感度状态和历史记录
 */
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { 
  getCharacterRelationship,
  getRelationshipHistory,
  useRelationshipState,
} from '../relationship/index.js'
import RelationshipIndicator from './RelationshipIndicator.vue'

const props = defineProps({
  // 角色列表（来自世界书）
  characters: {
    type: Array,
    default: () => [],
  },
  // 是否显示
  visible: {
    type: Boolean,
    default: false,
  },
  // 排序方式
  sortBy: {
    type: String,
    default: 'favor', // 'favor' | 'name' | 'trust'
  },
  // 是否显示详细数值
  showDetails: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['close', 'character-click'])

// 响应式状态
const { runtime, history } = useRelationshipState()

// 本地状态
const selectedCharacterId = ref(null)
const sortOption = ref(props.sortBy)
const filterLevel = ref('all') // 筛选等级
const showHistory = ref(false)

// 计算排序后的角色列表
const sortedCharacters = computed(() => {
  if (!props.characters || props.characters.length === 0) return []
  
  let list = [...props.characters]
  
  // 筛选
  if (filterLevel.value !== 'all') {
    list = list.filter(char => {
      const rel = getCharacterRelationship(char.id, char)
      // 根据好感度等级筛选
      if (filterLevel.value === 'positive') return rel.favor > 0
      if (filterLevel.value === 'negative') return rel.favor < 0
      if (filterLevel.value === 'neutral') return rel.favor === 0
      if (filterLevel.value === 'high') return rel.favor >= 60
      if (filterLevel.value === 'low') return rel.favor <= -30
      return true
    })
  }
  
  // 排序
  list.sort((a, b) => {
    const relA = getCharacterRelationship(a.id, a)
    const relB = getCharacterRelationship(b.id, b)
    
    if (sortOption.value === 'favor') {
      return relB.favor - relA.favor // 高好感度优先
    }
    if (sortOption.value === 'trust') {
      return relB.trust - relA.trust
    }
    if (sortOption.value === 'name') {
      return a.name.localeCompare(b.name)
    }
    return 0
  })
  
  return list
})

// 计算最近的历史记录
const recentHistory = computed(() => {
  return getRelationshipHistory(null, 10)
})

// 计算选中角色的详情
const selectedCharacter = computed(() => {
  if (!selectedCharacterId.value) return null
  return props.characters.find(c => c.id === selectedCharacterId.value)
})

const selectedRelationship = computed(() => {
  if (!selectedCharacterId.value) return null
  const char = selectedCharacter.value
  return getCharacterRelationship(selectedCharacterId.value, char)
})

const selectedCharacterHistory = computed(() => {
  if (!selectedCharacterId.value) return []
  return getRelationshipHistory(selectedCharacterId.value, 5)
})

// 统计信息
const stats = computed(() => {
  const total = props.characters.length
  let positive = 0
  let negative = 0
  let neutral = 0
  
  for (const char of props.characters) {
    const rel = getCharacterRelationship(char.id, char)
    if (rel.favor > 0) positive++
    else if (rel.favor < 0) negative++
    else neutral++
  }
  
  return { total, positive, negative, neutral }
})

// 方法
const handleCharacterClick = (data) => {
  selectedCharacterId.value = data.characterId
  emit('character-click', data)
}

const handleClose = () => {
  emit('close')
}

const toggleSort = () => {
  const options = ['favor', 'name', 'trust']
  const currentIndex = options.indexOf(sortOption.value)
  sortOption.value = options[(currentIndex + 1) % options.length]
}

const toggleHistory = () => {
  showHistory.value = !showHistory.value
}

const clearSelection = () => {
  selectedCharacterId.value = null
}

// 格式化时间
const formatTime = (timestamp) => {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

// 格式化变化值
const formatDelta = (delta) => {
  if (delta > 0) return `+${delta}`
  return String(delta)
}

// 获取变化值的颜色类
const getDeltaClass = (delta) => {
  if (delta > 0) return 'positive'
  if (delta < 0) return 'negative'
  return 'neutral'
}

// 键盘事件处理
const handleKeydown = (e) => {
  if (e.key === 'Escape') {
    if (selectedCharacterId.value) {
      clearSelection()
    } else {
      handleClose()
    }
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div v-if="visible" class="relationship-panel-overlay" @click.self="handleClose">
    <div class="relationship-panel">
      <!-- 头部 -->
      <div class="panel-header">
        <h3 class="panel-title">角色关系</h3>
        <div class="header-actions">
          <button class="action-btn" @click="toggleSort" title="切换排序">
            <span class="sort-icon">↕️</span>
            <span class="sort-label">{{ sortOption === 'favor' ? '好感' : sortOption === 'name' ? '名称' : '信任' }}</span>
          </button>
          <button class="action-btn" @click="toggleHistory" :class="{ active: showHistory }">
            <span class="history-icon">📜</span>
          </button>
          <button class="close-btn" @click="handleClose">✕</button>
        </div>
      </div>
      
      <!-- 统计摘要 -->
      <div class="stats-summary">
        <div class="stat-item">
          <span class="stat-label">总计</span>
          <span class="stat-value">{{ stats.total }}</span>
        </div>
        <div class="stat-item positive">
          <span class="stat-label">友好</span>
          <span class="stat-value">{{ stats.positive }}</span>
        </div>
        <div class="stat-item neutral">
          <span class="stat-label">中立</span>
          <span class="stat-value">{{ stats.neutral }}</span>
        </div>
        <div class="stat-item negative">
          <span class="stat-label">敌对</span>
          <span class="stat-value">{{ stats.negative }}</span>
        </div>
      </div>
      
      <!-- 筛选器 -->
      <div class="filter-bar">
        <select v-model="filterLevel" class="filter-select">
          <option value="all">全部</option>
          <option value="positive">好感 > 0</option>
          <option value="negative">好感 < 0</option>
          <option value="neutral">中立</option>
          <option value="high">亲密 (≥60)</option>
          <option value="low">敌对 (≤-30)</option>
        </select>
      </div>
      
      <!-- 主内容区域 -->
      <div class="panel-content">
        <!-- 角色列表 -->
        <div v-if="!showHistory" class="character-list">
          <div v-if="sortedCharacters.length === 0" class="empty-state">
            <span class="empty-icon">👥</span>
            <span class="empty-text">暂无角色数据</span>
          </div>
          
          <RelationshipIndicator
            v-for="character in sortedCharacters"
            :key="character.id"
            :character="character"
            :relationship="getCharacterRelationship(character.id, character)"
            :show-values="showDetails"
            :class="{ selected: selectedCharacterId === character.id }"
            @click="handleCharacterClick"
          />
        </div>
        
        <!-- 历史记录 -->
        <div v-if="showHistory" class="history-section">
          <h4 class="section-title">最近变化</h4>
          <div v-if="recentHistory.length === 0" class="empty-state">
            <span class="empty-text">暂无变化记录</span>
          </div>
          <div v-else class="history-list">
            <div 
              v-for="entry in recentHistory" 
              :key="entry.timestamp"
              class="history-item"
              @click="selectedCharacterId = entry.characterId"
            >
              <div class="history-time">{{ formatTime(entry.timestamp) }}</div>
              <div class="history-character">
                {{ characters.find(c => c.id === entry.characterId)?.name || '未知' }}
              </div>
              <div class="history-changes">
                <span 
                  v-if="entry.deltas.favor !== 0"
                  class="delta favor"
                  :class="getDeltaClass(entry.deltas.favor)"
                >
                  好感{{ formatDelta(entry.deltas.favor) }}
                </span>
                <span 
                  v-if="entry.deltas.trust !== 0"
                  class="delta trust"
                  :class="getDeltaClass(entry.deltas.trust)"
                >
                  信任{{ formatDelta(entry.deltas.trust) }}
                </span>
              </div>
              <div class="history-reason">{{ entry.reason }}</div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- 选中角色详情 -->
      <div v-if="selectedCharacter && !showHistory" class="detail-panel">
        <div class="detail-header">
          <h4>{{ selectedCharacter.name }}</h4>
          <button class="close-detail-btn" @click="clearSelection">✕</button>
        </div>
        <div class="detail-content">
          <div class="detail-relationship">
            <div class="detail-metric">
              <span class="metric-label">好感度</span>
              <span class="metric-value">{{ selectedRelationship?.favor || 0 }}</span>
            </div>
            <div class="detail-metric">
              <span class="metric-label">信任度</span>
              <span class="metric-value">{{ selectedRelationship?.trust || 0 }}</span>
            </div>
            <div class="detail-metric">
              <span class="metric-label">立场</span>
              <span class="metric-value">{{ selectedRelationship?.stance || 0 }}</span>
            </div>
          </div>
          
          <div v-if="selectedCharacterHistory.length > 0" class="detail-history">
            <h5>与该角色的互动记录</h5>
            <div 
              v-for="entry in selectedCharacterHistory" 
              :key="entry.timestamp"
              class="mini-history-item"
            >
              <span class="mini-time">{{ formatTime(entry.timestamp) }}</span>
              <span 
                class="mini-delta"
                :class="getDeltaClass(entry.deltas.favor)"
              >
                {{ formatDelta(entry.deltas.favor) }}
              </span>
              <span class="mini-reason">{{ entry.reason }}</span>
            </div>
          </div>
          
          <div v-if="selectedCharacter.notes" class="detail-notes">
            <h5>备注</h5>
            <p>{{ selectedCharacter.notes }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.relationship-panel-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.relationship-panel {
  width: 90%;
  max-width: 600px;
  max-height: 80vh;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  border-radius: 16px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  animation: slideUp 0.3s ease;
}

@keyframes slideUp {
  from { transform: translateY(20px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

/* 头部 */
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  background: rgba(255, 255, 255, 0.05);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.panel-title {
  font-size: 18px;
  font-weight: 600;
  color: #fff;
  margin: 0;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.1);
  border: none;
  color: rgba(255, 255, 255, 0.8);
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.action-btn.active {
  background: rgba(255, 107, 107, 0.3);
}

.sort-label {
  font-size: 12px;
}

.close-btn {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.1);
  border: none;
  color: rgba(255, 255, 255, 0.8);
  cursor: pointer;
  font-size: 16px;
  transition: all 0.2s;
}

.close-btn:hover {
  background: rgba(255, 77, 77, 0.3);
}

/* 统计摘要 */
.stats-summary {
  display: flex;
  gap: 16px;
  padding: 12px 20px;
  background: rgba(255, 255, 255, 0.03);
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.stat-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
}

.stat-value {
  font-size: 14px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
}

.stat-item.positive .stat-value { color: #ff6b6b; }
.stat-item.negative .stat-value { color: #8b0000; }
.stat-item.neutral .stat-value { color: #808080; }

/* 筛选器 */
.filter-bar {
  padding: 8px 20px;
}

.filter-select {
  width: 100%;
  padding: 8px 12px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #fff;
  font-size: 14px;
  cursor: pointer;
}

.filter-select option {
  background: #1a1a2e;
  color: #fff;
}

/* 主内容 */
.panel-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px 20px;
}

.character-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.character-list .relationship-indicator.selected {
  background: rgba(255, 107, 107, 0.2);
  border-color: rgba(255, 107, 107, 0.5);
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  color: rgba(255, 255, 255, 0.5);
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 12px;
}

.empty-text {
  font-size: 14px;
}

/* 历史记录 */
.history-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-title {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.8);
  margin: 0;
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.history-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  cursor: pointer;
  transition: all 0.2s;
}

.history-item:hover {
  background: rgba(255, 255, 255, 0.1);
}

.history-time {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  width: 50px;
}

.history-character {
  font-size: 14px;
  color: #fff;
  width: 80px;
}

.history-changes {
  display: flex;
  gap: 8px;
}

.delta {
  font-size: 12px;
  padding: 2px 6px;
  border-radius: 4px;
}

.delta.favor { background: rgba(255, 107, 107, 0.2); }
.delta.trust { background: rgba(74, 144, 226, 0.2); }

.delta.positive { color: #ff6b6b; }
.delta.negative { color: #8b0000; }
.delta.neutral { color: #808080; }

.history-reason {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 详情面板 */
.detail-panel {
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.05);
  padding: 16px 20px;
  max-height: 200px;
  overflow-y: auto;
}

.detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.detail-header h4 {
  font-size: 16px;
  color: #fff;
  margin: 0;
}

.close-detail-btn {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.1);
  border: none;
  color: rgba(255, 255, 255, 0.8);
  cursor: pointer;
  font-size: 12px;
}

.detail-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.detail-relationship {
  display: flex;
  gap: 16px;
}

.detail-metric {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.metric-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
}

.metric-value {
  font-size: 18px;
  font-weight: 600;
  color: #fff;
}

.detail-history h5,
.detail-notes h5 {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
  margin: 0 0 8px 0;
}

.mini-history-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
}

.mini-time {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
}

.mini-delta {
  font-size: 11px;
  font-weight: 600;
}

.mini-delta.positive { color: #ff6b6b; }
.mini-delta.negative { color: #8b0000; }

.mini-reason {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.6);
}

.detail-notes p {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.8);
  margin: 0;
  line-height: 1.5;
}
</style>