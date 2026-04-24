<template>
  <div class="star-map">
    <svg
      ref="svgRef"
      :viewBox="`0 0 ${canvasWidth} ${canvasHeight}`"
      preserveAspectRatio="xMidYMid meet"
      class="star-map-svg"
      @mousedown="handleCanvasMouseDown"
      @mousemove="handleCanvasMouseMove"
      @mouseup="handleCanvasMouseUp"
      @mouseleave="handleCanvasMouseLeave"
      @wheel.prevent="handleWheel"
      @touchstart.prevent="handleTouchStart"
      @touchmove.prevent="handleTouchMove"
      @touchend="handleTouchEnd"
    >
      <!-- 星空背景 -->
      <g class="starfield">
        <circle v-for="star in starField" :key="star.key" :cx="star.x" :cy="star.y" :r="star.r" :fill="star.fill" :opacity="star.twinkle" />
      </g>

      <!-- 相机变换层 -->
      <g :transform="cameraTransform">
        <!-- 连线（弧形） -->
        <path
          v-for="edge in visibleEdges"
          v-show="!isEdgeHidden(edge)"
          :key="edge.key"
          :d="edgePath(edge)"
          :stroke="edge.color"
          :stroke-width="edge.width"
          :stroke-dasharray="edge.dasharray"
          :stroke-opacity="edgeVisualOpacity(edge)"
          class="network-edge"
          @mouseenter="showTooltip(edge, $event)"
          @mouseleave="hideTooltip"
        />

        <!-- 节点 -->
        <g
          v-for="node in nodes"
          :key="node.id"
          :data-node-id="node.id"
          :class="['network-node', { 'node-dimmed': isNodeDimmed(node), 'node-focused': isNodeFocused(node), 'node-player': node.isPlayer }]"
          :style="{ cursor: 'pointer', transition: 'opacity 0.3s ease' }"
          @click="handleNodeClick(node.id, $event)"
          @dblclick="handleNodeDblClick(node.id)"
          @mousedown.stop="handleNodeDragStart(node.id, $event)"
        >
          <!-- 等级Emoji -->
          <text
            v-if="!node.isPlayer && nodeLevelMap[node.id]"
            :x="nodePositions[node.id]?.x || 0"
            :y="(nodePositions[node.id]?.y || 0) - nodeRadiusFor(node) - 8"
            text-anchor="middle"
            font-size="14"
            :fill="nodeLevelMap[node.id]?.color || '#fff'"
          >
            {{ nodeLevelMap[node.id]?.icon || '' }}
          </text>
          <!-- 脉冲外圈（选中时） -->
          <circle
            v-if="isNodeFocused(node)"
            class="node-pulse-ring"
            :cx="nodePositions[node.id]?.x || 0"
            :cy="nodePositions[node.id]?.y || 0"
            :r="nodeRadiusFor(node) + 8"
            :fill="node.isPlayer ? 'rgba(255, 215, 0, 0.08)' : 'rgba(100, 180, 255, 0.08)'"
            :stroke="node.isPlayer ? '#ffd700' : '#64b4ff'"
            stroke-width="1.5"
            stroke-opacity="0.6"
          />
          <!-- 主圈 -->
          <circle
            :cx="nodePositions[node.id]?.x || 0"
            :cy="nodePositions[node.id]?.y || 0"
            :r="nodeRadiusFor(node)"
            :fill="node.isPlayer ? 'rgba(255, 215, 0, 0.15)' : 'rgba(255, 255, 255, 0.08)'"
            :stroke="node.isPlayer ? '#ffd700' : (nodeLevelMap[node.id]?.color || 'rgba(255, 255, 255, 0.3)')"
            :stroke-width="node.isPlayer ? 2.5 : 1.5"
          />
          <!-- 头像 -->
          <clipPath :id="'avatarClip_' + node.id">
            <circle
              :cx="nodePositions[node.id]?.x || 0"
              :cy="nodePositions[node.id]?.y || 0"
              :r="nodeRadiusFor(node) - 3"
            />
          </clipPath>
          <image
            v-if="node.avatar"
            :x="(nodePositions[node.id]?.x || 0) - (nodeRadiusFor(node) - 3)"
            :y="(nodePositions[node.id]?.y || 0) - (nodeRadiusFor(node) - 3)"
            :width="(nodeRadiusFor(node) - 3) * 2"
            :height="(nodeRadiusFor(node) - 3) * 2"
            :href="node.avatar"
            :clip-path="'url(#avatarClip_' + node.id + ')'"
            preserveAspectRatio="xMidYMid slice"
          />
          <!-- 名字 -->
          <text
            :x="nodePositions[node.id]?.x || 0"
            :y="(nodePositions[node.id]?.y || 0) + nodeRadiusFor(node) + 14"
            text-anchor="middle"
            :fill="node.isPlayer ? '#ffd700' : 'rgba(255, 255, 255, 0.85)'"
            font-size="11"
            font-weight="500"
          >
            {{ node.name }}
          </text>
        </g>
      </g>
    </svg>

    <!-- 空状态 -->
    <div v-if="nodes.length === 0" class="empty-state">
      <div class="empty-icon">&#x1F517;</div>
      <div class="empty-text">暂无角色数据</div>
    </div>

    <!-- 操作提示 -->
    <div class="map-hint" v-if="nodes.length > 0">
      点击选中 · 双击查看关系详情 · 拖动移动 · 捏合缩放
    </div>

    <RelationshipTooltip
      :visible="tooltipVisible"
      :source-name="tooltipData.sourceName"
      :target-name="tooltipData.targetName"
      :score="tooltipData.score"
      :description="tooltipData.description"
      :x="tooltipX"
      :y="tooltipY"
    />
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useForceLayout } from '../composables/useForceLayout.js'
import { scoreToColor, scoreToWidth, scoreToOpacity, favorToColor, favorToLevel, trustToWidth, stanceToDasharray } from '../composables/useRelationship.js'
import { getCharacterRelationship } from '../../../../src/relationship/relationshipStore.js'
import RelationshipTooltip from './RelationshipTooltip.vue'

const props = defineProps({
  worldBook: Object,
  focusedCharacterId: String,
})

const emit = defineEmits(['selectCharacter', 'open-detail'])

// 画布尺寸
const canvasWidth = 900
const canvasHeight = 1200
const baseNodeRadius = 24
const svgRef = ref(null)

// 星空背景
const starField = computed(() => {
  const stars = []
  for (let i = 0; i < 120; i++) {
    const r = Math.random() * 1.2 + 0.3
    stars.push({
      key: i,
      x: Math.random() * canvasWidth,
      y: Math.random() * canvasHeight,
      r,
      fill: `rgba(255,255,255,${Math.random() * 0.5 + 0.15})`,
      twinkle: Math.random() * 0.3 + 0.7,
    })
  }
  return stars
})

// 节点 & 边
function buildNodes() {
  const chars = props.worldBook?.characters || []
  const nodes = chars.map(c => ({
    id: c.id,
    name: c.name,
    avatar: c.smsAvatar || (c.portraits?.[0]) || '',
    isPlayer: false,
  }))
  if (props.worldBook?.userProfile?.name) {
    nodes.push({
      id: '__player__',
      name: props.worldBook.userProfile.name,
      avatar: '',
      isPlayer: true,
    })
  }
  return nodes
}

function buildEdges() {
  const chars = props.worldBook?.characters || []
  const playerId = '__player__'
  const edges = []

  for (const char of chars) {
    const rel = getCharacterRelationship(char.id, char)
    const favor = rel.favor ?? 0

    edges.push({
      key: `${playerId}|||${char.id}`,
      source: playerId,
      target: char.id,
      score: favor,
      favor,
      trust: rel.trust ?? 0,
      stance: rel.stance ?? 0,
      color: favorToColor(favor),
      width: trustToWidth(rel.trust ?? 0),
      dasharray: stanceToDasharray(rel.stance ?? 0),
      levelInfo: favorToLevel(favor),
    })
  }

  return edges
}

const nodes = computed(buildNodes)
const edges = computed(buildEdges)
// 只显示好感度达到初识(>=10)的关系
const visibleEdges = computed(() => edges.value.filter(e => e.favor >= 10))

function getNodeName(id) {
  if (id === '__player__') return props.worldBook?.userProfile?.name || '玩家'
  return props.worldBook?.characters?.find(c => c.id === id)?.name || id
}

// Force layout
const { positions, onDragStart: dragStart, onDragMove, onDragEnd } = useForceLayout({
  nodes: nodes,
  edges: edges,
  width: canvasWidth,
  height: canvasHeight,
  nodeRadius: baseNodeRadius,
})

// Watch for data changes and re-run layout
watch([nodes, edges], () => {
  positions.value = {}
  const pos = {}
  const cx = canvasWidth / 2
  const cy = canvasHeight / 2
  const radius = Math.min(canvasWidth, canvasHeight) * 0.4
  nodes.value.forEach((node, i) => {
    const angle = (2 * Math.PI * i) / nodes.value.length - Math.PI / 2
    pos[node.id] = {
      x: cx + radius * Math.cos(angle) + (Math.random() - 0.5) * 120,
      y: cy + radius * Math.sin(angle) + (Math.random() - 0.5) * 120,
      vx: 0,
      vy: 0,
    }
  })
  positions.value = pos
  const nodeIds = nodes.value.map(n => n.id)
  const repulsion = 25000
  const attraction = 0.002
  const gravity = 0.002
  const damping = 0.85
  for (let i = 0; i < 500; i++) {
    for (let ii = 0; ii < nodeIds.length; ii++) {
      for (let jj = ii + 1; jj < nodeIds.length; jj++) {
        const a = pos[nodeIds[ii]]
        const b = pos[nodeIds[jj]]
        let dx = a.x - b.x
        let dy = a.y - b.y
        let dist = Math.sqrt(dx * dx + dy * dy) || 1
        const minDist = baseNodeRadius * 5
        if (dist < minDist) dist = minDist
        const force = repulsion / (dist * dist)
        a.vx += (dx / dist) * force
        a.vy += (dy / dist) * force
        b.vx -= (dx / dist) * force
        b.vy -= (dy / dist) * force
      }
    }
    for (const edge of edges.value) {
      const a = pos[edge.source]
      const b = pos[edge.target]
      if (!a || !b) continue
      const edx = b.x - a.x
      const edy = b.y - a.y
      const edist = Math.sqrt(edx * edx + edy * edy) || 1
      // Favor-based rest length: higher favor = closer
      const restLength = 300 - ((edge.favor + 100) / 200) * 120
      const force = (edist - restLength) * attraction
      a.vx += (edx / edist) * force
      a.vy += (edy / edist) * force
      b.vx -= (edx / edist) * force
      b.vy -= (edy / edist) * force
    }
    for (const id of nodeIds) {
      const p = pos[id]
      p.vx += (cx - p.x) * gravity
      p.vy += (cy - p.y) * gravity
      p.vx *= damping
      p.vy *= damping
      p.x += p.vx
      p.y += p.vy
      const pad = baseNodeRadius + 40
      p.x = Math.max(pad, Math.min(canvasWidth - pad, p.x))
      p.y = Math.max(pad, Math.min(canvasHeight - pad, p.y))
    }
  }
}, { immediate: true })

const nodePositions = computed(() => positions.value)

// 节点大小基于好感等级
const nodeLevelMap = computed(() => {
  const map = {}
  for (const char of props.worldBook?.characters || []) {
    const rel = getCharacterRelationship(char.id, char)
    map[char.id] = favorToLevel(rel.favor ?? 0)
  }
  return map
})

function nodeRadiusFor(node) {
  if (node.isPlayer) return baseNodeRadius + 6
  const level = nodeLevelMap.value[node.id]
  if (!level) return baseNodeRadius
  return baseNodeRadius + level.level * 1.5
}

// 弧形连线
function edgePath(edge) {
  const pos = nodePositions.value
  const x1 = pos[edge.source]?.x || 0
  const y1 = pos[edge.source]?.y || 0
  const x2 = pos[edge.target]?.x || 0
  const y2 = pos[edge.target]?.y || 0
  const mx = (x1 + x2) / 2
  const my = (y1 + y2) / 2
  // Perpendicular offset for curve
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.sqrt(dx * dx + dy * dy) || 1
  const offset = Math.min(30, len * 0.1)
  const cx = mx + (-dy / len) * offset
  const cy = my + (dx / len) * offset
  return `M${x1},${y1} Q${cx.toFixed(1)},${cy.toFixed(1)} ${x2},${y2}`
}

// 相机系统
const panX = ref(0)
const panY = ref(0)
const zoom = ref(1)

const cameraTransform = computed(() => `translate(${panX.value},${panY.value}) scale(${zoom.value})`)

let isPanning = false
let panStart = { x: 0, y: 0 }

function handleCanvasMouseDown(e) {
  if (e.target === svgRef.value || e.target.tagName === 'circle' && e.target.classList.contains('starfield')) {
    isPanning = true
    panStart = { x: e.clientX - panX.value, y: e.clientY - panY.value }
  }
}

function handleCanvasMouseMove(e) {
  if (isPanning) {
    panX.value = e.clientX - panStart.x
    panY.value = e.clientY - panStart.y
  }
}

function handleCanvasMouseUp() {
  isPanning = false
}

function handleCanvasMouseLeave() {
  isPanning = false
}

function handleWheel(e) {
  const delta = e.deltaY > 0 ? 0.9 : 1.1
  const newZoom = Math.max(0.3, Math.min(2.5, zoom.value * delta))
  // Zoom towards mouse position
  const rect = svgRef.value?.getBoundingClientRect()
  if (rect) {
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const scale = newZoom / zoom.value
    panX.value = mx - scale * (mx - panX.value)
    panY.value = my - scale * (my - panY.value)
  }
  zoom.value = newZoom
}

// 触摸事件（单指拖动 + 双指捏合缩放 + 节点点击/双击）
let touchState = null
let nodeTapTimer = null
let lastNodeTapTime = 0
let lastNodeTapId = null

function getTouchDistance(t1, t2) {
  return Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY)
}

function findNodeGroup(el) {
  // Walk up DOM to find a .network-node group
  while (el && el !== svgRef.value) {
    if (el.classList && el.classList.contains('network-node')) {
      return el.dataset?.nodeId || null
    }
    el = el.parentNode
  }
  return null
}

function handleTouchStart(e) {
  if (e.touches.length === 1) {
    const nodeId = findNodeGroup(e.target)
    if (nodeId) {
      // 单指触摸在节点上 — 跟踪点击/双击，也允许拖动
      touchState = {
        type: 'nodeTap',
        nodeId,
        startX: e.touches[0].clientX,
        startY: e.touches[0].clientY,
        moved: false,
      }
    } else {
      // 单指拖动背景
      touchState = {
        type: 'pan',
        startX: e.touches[0].clientX - panX.value,
        startY: e.touches[0].clientY - panY.value,
      }
    }
  } else if (e.touches.length === 2) {
    // 双指捏合
    touchState = {
      type: 'pinch',
      startDistance: getTouchDistance(e.touches[0], e.touches[1]),
      startZoom: zoom.value,
      startPanX: panX.value,
      startPanY: panY.value,
      midX: (e.touches[0].clientX + e.touches[1].clientX) / 2,
      midY: (e.touches[0].clientY + e.touches[1].clientY) / 2,
    }
  }
}

function handleTouchMove(e) {
  if (!touchState) return

  if (touchState.type === 'nodeTap' && e.touches.length === 1) {
    const dx = e.touches[0].clientX - touchState.startX
    const dy = e.touches[0].clientY - touchState.startY
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
      // 移动超过阈值，转为拖动，取消点击
      touchState.type = 'pan'
      touchState.startX = e.touches[0].clientX - panX.value
      touchState.startY = e.touches[0].clientY - panY.value
    }
  } else if (touchState.type === 'pan' && e.touches.length === 1) {
    panX.value = e.touches[0].clientX - touchState.startX
    panY.value = e.touches[0].clientY - touchState.startY
  } else if (touchState.type === 'pinch' && e.touches.length === 2) {
    const dist = getTouchDistance(e.touches[0], e.touches[1])
    const ratio = dist / touchState.startDistance
    const newZoom = Math.max(0.3, Math.min(2.5, touchState.startZoom * ratio))

    // 以两指中心点为缩放原点
    const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2
    const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2
    const scale = newZoom / touchState.startZoom
    panX.value = midX - scale * (midX - touchState.startPanX)
    panY.value = midY - scale * (midY - touchState.startPanY)
    zoom.value = newZoom
  }
}

function handleTouchEnd(e) {
  // 处理节点点击（仅在nodeTap状态，即未拖动时）
  if (touchState?.type === 'nodeTap' && touchState.nodeId) {
    const now = Date.now()
    const nodeId = touchState.nodeId

    // 双击检测
    if (lastNodeTapId === nodeId && (now - lastNodeTapTime) < 350) {
      handleNodeDblClick(nodeId)
      lastNodeTapTime = 0
      lastNodeTapId = null
    } else {
      // 单击
      handleNodeClick(nodeId)
      lastNodeTapTime = now
      lastNodeTapId = nodeId
    }
  }

  if (e.touches.length === 0) {
    touchState = null
  } else if (e.touches.length === 1 && touchState?.type === 'pinch') {
    // 从双指变成单指，切换为拖动模式
    touchState = {
      type: 'pan',
      startX: e.touches[0].clientX - panX.value,
      startY: e.touches[0].clientY - panY.value,
    }
  }
}

// 高亮选中逻辑
const focusedNodeId = ref(null)

const connectedNodeIds = computed(() => {
  if (!focusedNodeId.value) return new Set(nodes.value.map(n => n.id))
  const ids = new Set([focusedNodeId.value])
  visibleEdges.value.forEach(e => {
    if (e.source === focusedNodeId.value) ids.add(e.target)
    if (e.target === focusedNodeId.value) ids.add(e.source)
  })
  return ids
})

const connectedEdgeKeys = computed(() => {
  if (!focusedNodeId.value) return new Set(visibleEdges.value.map(e => e.key))
  const keys = new Set()
  visibleEdges.value.forEach(e => {
    if (e.source === focusedNodeId.value || e.target === focusedNodeId.value) {
      keys.add(e.key)
    }
  })
  return keys
})

function isNodeDimmed(node) {
  if (!focusedNodeId.value) return false
  return !connectedNodeIds.value.has(node.id)
}

function isNodeFocused(node) {
  return focusedNodeId.value === node.id
}

function isEdgeHidden(edge) {
  if (!focusedNodeId.value) return false
  return !connectedEdgeKeys.value.has(edge.key)
}

function edgeVisualOpacity(edge) {
  if (isEdgeHidden(edge)) return 0
  return 0.85
}

function handleNodeClick(nodeId, e) {
  if (focusedNodeId.value === nodeId) {
    focusedNodeId.value = null
  } else {
    focusedNodeId.value = nodeId
  }
}

function handleNodeDblClick(nodeId) {
  if (nodeId === '__player__') return
  emit('open-detail', nodeId)
}

// 拖拽
let dragMoved = false
let dragStartPos = { x: 0, y: 0 }

function handleNodeDragStart(nodeId, e) {
  dragMoved = false
  dragStartPos = { x: e.clientX, y: e.clientY }
  dragStart(nodeId)

  const onMove = (ev) => {
    const dx = ev.clientX - dragStartPos.x
    const dy = ev.clientY - dragStartPos.y
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragMoved = true
    onDragMove(ev.clientX, ev.clientY, svgRef.value?.getBoundingClientRect())
  }

  const onUp = () => {
    onDragEnd()
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
    if (!dragMoved && focusedNodeId.value !== nodeId) {
      // It's a click, handled by @click
    }
  }

  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

// Tooltip
const tooltipVisible = ref(false)
const tooltipData = ref({ sourceName: '', targetName: '', score: 0, description: '' })
const tooltipX = ref(0)
const tooltipY = ref(0)

function showTooltip(edge, event) {
  tooltipData.value = {
    sourceName: getNodeName(edge.source),
    targetName: getNodeName(edge.target),
    score: edge.favor,
    description: `${edge.levelInfo?.icon || ''} ${edge.levelInfo?.name || ''}`,
    trust: edge.trust,
    stance: edge.stance,
  }
  tooltipX.value = event.clientX
  tooltipY.value = event.clientY - 10
  tooltipVisible.value = true
}

function hideTooltip() {
  tooltipVisible.value = false
}
</script>

<style scoped>
.star-map {
  width: 100%;
  height: 100%;
  position: relative;
  background: #0d0d1a;
  overflow: hidden;
}

.star-map-svg {
  width: 100%;
  height: 100%;
  display: block;
  touch-action: none;
}

.starfield circle {
  pointer-events: none;
}

.network-node {
  transition: opacity 0.3s ease;
}

.network-node.node-dimmed {
  opacity: 0.12;
}

.network-node.node-focused circle:first-child {
  stroke-width: 3;
}

.network-node:active circle {
  stroke-width: 3;
}

.network-edge {
  transition: stroke-opacity 0.3s ease;
  pointer-events: stroke;
}

.network-edge.edge-dimmed {
  stroke-opacity: 0.05 !important;
}

@keyframes pulse-ring {
  0% { r: 32; stroke-opacity: 0.6; }
  50% { r: 38; stroke-opacity: 0.2; }
  100% { r: 32; stroke-opacity: 0.6; }
}

.node-pulse-ring {
  animation: pulse-ring 2s ease-in-out infinite;
}

.empty-state {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  color: rgba(255, 255, 255, 0.5);
}

.empty-icon {
  font-size: 40px;
  margin-bottom: 8px;
}

.empty-text {
  font-size: 13px;
}

.map-hint {
  position: absolute;
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  color: rgba(255, 255, 255, 0.5);
  font-size: 10px;
  padding: 4px 12px;
  border-radius: 12px;
  white-space: nowrap;
  pointer-events: none;
}
</style>
