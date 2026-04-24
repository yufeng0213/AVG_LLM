<template>
  <div class="list-view">
    <div v-if="groups.length === 0" class="empty-state">
      <div class="empty-icon">&#x1F517;</div>
      <div class="empty-text">暂无角色数据</div>
    </div>

    <div v-for="group in groups" :key="group.level" class="list-group">
      <!-- Group header -->
      <button class="group-header" @click="toggleGroup(group.level)">
        <span class="group-icon">{{ group.icon }}</span>
        <span class="group-name" :style="{ color: group.color }">{{ group.name }}</span>
        <span class="group-count">{{ group.characters.length }}</span>
        <span class="group-arrow" :class="{ expanded: expandedGroups.has(group.level) }">&#x25BC;</span>
      </button>

      <!-- Group characters -->
      <Transition name="group-expand">
        <div v-if="expandedGroups.has(group.level)" class="group-body">
          <div
            v-for="char in group.characters"
            :key="char.id"
            class="character-row"
            @click="$emit('open-detail', char.id)"
          >
            <div class="char-avatar" :style="{ borderColor: char.color }">
              <img v-if="char.avatar" :src="char.avatar" alt="" />
              <span v-else class="avatar-fallback">{{ char.name?.[0] || '?' }}</span>
            </div>
            <div class="char-info">
              <div class="char-name">{{ char.name }}</div>
              <div class="char-stats">
                <span class="stat favor" :style="{ color: char.color }">
                  好感 {{ char.favor }}
                </span>
                <span class="stat trust" :style="{ color: trustColor(char.trust) }">
                  信任 {{ char.trust }}
                </span>
                <span class="stat stance" :style="{ color: stanceColor(char.stance) }">
                  立场 {{ char.stance > 0 ? '+' : '' }}{{ char.stance }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { favorToLevel, favorToColor } from '../composables/useRelationship.js'
import { getCharacterRelationship } from '../../../../src/relationship/relationshipStore.js'
import { RELATIONSHIP_LEVELS } from '../../../../src/relationship/relationshipLevels.js'

const props = defineProps({
  worldBook: Object,
})

defineEmits(['open-detail'])

const expandedGroups = ref(new Set([8, 7, 6, 5, 4, 3, 2, 1, 0]))

function toggleGroup(level) {
  if (expandedGroups.value.has(level)) {
    expandedGroups.value.delete(level)
  } else {
    expandedGroups.value.add(level)
  }
}

function trustColor(trust) {
  const t = (trust + 100) / 200
  return `hsl(${200 * t}, 70%, 60%)`
}

function stanceColor(stance) {
  if (stance > 20) return '#34c759'
  if (stance < -20) return '#ff3b30'
  return '#808080'
}

const groups = computed(() => {
  const chars = props.worldBook?.characters || []
  const charData = chars.map(c => {
    const rel = getCharacterRelationship(c.id, c)
    const favor = rel.favor ?? 0
    const levelInfo = favorToLevel(favor)
    return {
      id: c.id,
      name: c.name,
      avatar: c.smsAvatar || c.portraits?.[0] || '',
      favor,
      trust: rel.trust ?? 0,
      stance: rel.stance ?? 0,
      level: levelInfo.level,
      color: favorToColor(favor),
    }
  })

  // Sort by favor descending within each group
  charData.sort((a, b) => b.favor - a.favor)

  // Group by level
  const groupMap = new Map()
  for (const char of charData) {
    if (!groupMap.has(char.level)) {
      const levelDef = RELATIONSHIP_LEVELS.find(l => l.level === char.level)
      groupMap.set(char.level, {
        level: char.level,
        name: levelDef?.name || '未知',
        icon: levelDef?.icon || '❓',
        color: char.color,
        characters: [],
      })
    }
    groupMap.get(char.level).characters.push(char)
  }

  // Sort groups by level descending (highest relationship first)
  return Array.from(groupMap.values()).sort((a, b) => b.level - a.level)
})
</script>

<style scoped>
.list-view {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 8px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  color: rgba(255, 255, 255, 0.5);
}

.empty-icon {
  font-size: 40px;
  margin-bottom: 8px;
}

.empty-text {
  font-size: 13px;
}

.list-group {
  margin-bottom: 4px;
}

.group-header {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border: none;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.06);
  cursor: pointer;
  transition: background 0.2s;
}

.group-header:hover {
  background: rgba(255, 255, 255, 0.1);
}

.group-icon {
  font-size: 1.1rem;
}

.group-name {
  flex: 1;
  font-size: 0.9rem;
  font-weight: 700;
}

.group-count {
  font-size: 0.78rem;
  color: rgba(255, 255, 255, 0.4);
  min-width: 20px;
  text-align: right;
}

.group-arrow {
  font-size: 0.7rem;
  color: rgba(255, 255, 255, 0.4);
  transition: transform 0.2s;
  min-width: 16px;
  text-align: center;
}

.group-arrow.expanded {
  transform: rotate(0deg);
}

.group-arrow:not(.expanded) {
  transform: rotate(-90deg);
}

.group-body {
  padding: 4px 0 4px 8px;
}

.character-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
}

.character-row:hover {
  background: rgba(255, 255, 255, 0.06);
}

.char-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 2px solid;
  overflow: hidden;
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.06);
  display: flex;
  align-items: center;
  justify-content: center;
}

.char-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-fallback {
  font-size: 0.9rem;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.7);
}

.char-info {
  flex: 1;
  min-width: 0;
}

.char-name {
  font-size: 0.88rem;
  font-weight: 600;
  color: #fff;
  margin-bottom: 2px;
}

.char-stats {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.stat {
  font-size: 0.74rem;
  font-weight: 600;
}

.stat.favor { }
.stat.trust { }
.stat.stance { }

.group-expand-enter-active,
.group-expand-leave-active {
  transition: all 0.2s ease;
}

.group-expand-enter-from,
.group-expand-leave-to {
  opacity: 0;
  max-height: 0;
}

.group-expand-enter-to,
.group-expand-leave-from {
  opacity: 1;
  max-height: 500px;
}
</style>
