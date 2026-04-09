/**
 * 关系网络可视化动画器
 * 使用力导向图算法展示角色间关系网络
 */

import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue'
import {
  RELATIONSHIP_LEVELS,
  getRelationshipLevel,
  getRelationshipTypeInfo,
  RELATIONSHIP_TYPES,
} from './relationshipLevels.js'

/**
 * 力导向图配置
 */
export const FORCE_GRAPH_CONFIG = {
  // 节点配置
  nodeRadius: 30,
  nodeMinRadius: 20,
  nodeMaxRadius: 50,
  
  // 边配置
  edgeWidthBase: 2,
  edgeWidthMax: 8,
  edgeOpacity: 0.6,
  
  // 力配置
  linkDistance: 150,
  linkStrength: 0.5,
  chargeStrength: -300,
  centerStrength: 0.1,
  
  // 动画配置
  animationDuration: 300,
  animationEasing: 'ease-out',
  
  // 颜色配置
  positiveColor: '#4CAF50',
  negativeColor: '#F44336',
  neutralColor: '#9E9E9E',
}

/**
 * 创建节点数据
 * @param {Object} character - 角色信息
 * @param {Object} relationship - 关系状态
 * @returns {Object} 节点数据
 */
export const createGraphNode = (character, relationship) => {
  const level = getRelationshipLevel(relationship?.favor || 0)
  const typeInfo = getRelationshipTypeInfo(relationship?.type || 'neutral')
  
  // 根据好感度计算节点大小
  const favorAbs = Math.abs(relationship?.favor || 0)
  const radiusScale = (favorAbs / 100) * (FORCE_GRAPH_CONFIG.nodeMaxRadius - FORCE_GRAPH_CONFIG.nodeMinRadius)
  const radius = FORCE_GRAPH_CONFIG.nodeMinRadius + radiusScale
  
  return {
    id: character.id || character.name,
    name: character.name,
    nickname: character.nickname || '',
    avatar: character.avatar || character.portrait || null,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    fixed: false,
    radius,
    level,
    favor: relationship?.favor || 0,
    trust: relationship?.trust || 0,
    stance: relationship?.stance || 0,
    type: typeInfo,
    color: level.color,
    icon: level.icon,
  }
}

/**
 * 创建边数据
 * @param {Object} source - 源节点
 * @param {Object} target - 目标节点
 * @param {Object} relationship - 关系状态
 * @returns {Object} 边数据
 */
export const createGraphEdge = (source, target, relationship) => {
  const favor = relationship?.favor || 0
  const trust = relationship?.trust || 0
  
  // 计算边的宽度（基于好感度绝对值）
  const widthScale = Math.abs(favor) / 100
  const width = FORCE_GRAPH_CONFIG.edgeWidthBase + 
    widthScale * (FORCE_GRAPH_CONFIG.edgeWidthMax - FORCE_GRAPH_CONFIG.edgeWidthBase)
  
  // 确定边的颜色
  let color = FORCE_GRAPH_CONFIG.neutralColor
  if (favor > 10) {
    color = FORCE_GRAPH_CONFIG.positiveColor
  } else if (favor < -10) {
    color = FORCE_GRAPH_CONFIG.negativeColor
  }
  
  // 计算边的强度（用于力导向算法）
  const strength = FORCE_GRAPH_CONFIG.linkStrength * (1 - Math.abs(favor) / 200)
  
  return {
    id: `${source.id}-${target.id}`,
    source: source.id,
    target: target.id,
    favor,
    trust,
    width,
    color,
    strength,
    opacity: FORCE_GRAPH_CONFIG.edgeOpacity,
    type: relationship?.type || 'neutral',
  }
}

/**
 * 力导向图模拟器类
 */
export class ForceGraphSimulator {
  constructor(config = {}) {
    this.config = { ...FORCE_GRAPH_CONFIG, ...config }
    this.nodes = []
    this.edges = []
    this.isRunning = false
    this.animationFrameId = null
    this.width = 0
    this.height = 0
    this.center = { x: 0, y: 0 }
    
    // 力参数
    this.alpha = 1.0
    this.alphaMin = 0.001
    this.alphaDecay = 0.0228
    this.alphaTarget = 0
  }
  
  /**
   * 设置画布尺寸
   * @param {number} width - 宽度
   * @param {number} height - 高度
   */
  setSize(width, height) {
    this.width = width
    this.height = height
    this.center = { x: width / 2, y: height / 2 }
  }
  
  /**
   * 初始化节点和边
   * @param {Array} nodes - 节点列表
   * @param {Array} edges - 边列表
   */
  init(nodes, edges) {
    this.nodes = nodes.map(node => ({
      ...node,
      x: this.center.x + (Math.random() - 0.5) * 100,
      y: this.center.y + (Math.random() - 0.5) * 100,
      vx: 0,
      vy: 0,
    }))
    
    this.edges = edges.map(edge => ({
      ...edge,
      sourceNode: this.nodes.find(n => n.id === edge.source),
      targetNode: this.nodes.find(n => n.id === edge.target),
    }))
    
    this.alpha = 1.0
  }
  
  /**
   * 应用中心引力
   */
  applyCenterForce() {
    const strength = this.config.centerStrength * this.alpha
    
    for (const node of this.nodes) {
      if (node.fixed) continue
      
      node.vx += (this.center.x - node.x) * strength
      node.vy += (this.center.y - node.y) * strength
    }
  }
  
  /**
   * 应用节点间斥力
   */
  applyChargeForce() {
    const strength = this.config.chargeStrength * this.alpha
    
    for (let i = 0; i < this.nodes.length; i++) {
      const nodeA = this.nodes[i]
      if (nodeA.fixed) continue
      
      for (let j = i + 1; j < this.nodes.length; j++) {
        const nodeB = this.nodes[j]
        if (nodeB.fixed) continue
        
        const dx = nodeA.x - nodeB.x
        const dy = nodeA.y - nodeB.y
        const distance = Math.sqrt(dx * dx + dy * dy) || 1
        
        // 防止节点重叠
        const minDistance = nodeA.radius + nodeB.radius + 10
        const effectiveDistance = Math.max(distance, minDistance)
        
        const force = strength / (effectiveDistance * effectiveDistance)
        const fx = (dx / distance) * force
        const fy = (dy / distance) * force
        
        nodeA.vx += fx
        nodeA.vy += fy
        nodeB.vx -= fx
        nodeB.vy -= fy
      }
    }
  }
  
  /**
   * 应用边的引力
   */
  applyLinkForce() {
    const targetDistance = this.config.linkDistance
    
    for (const edge of this.edges) {
      const source = edge.sourceNode
      const target = edge.targetNode
      
      if (!source || !target) continue
      
      const dx = target.x - source.x
      const dy = target.y - source.y
      const distance = Math.sqrt(dx * dx + dy * dy) || 1
      
      const difference = distance - targetDistance
      const force = (difference * edge.strength * this.alpha) / distance
      
      const fx = dx * force
      const fy = dy * force
      
      if (!source.fixed) {
        source.vx += fx
        source.vy += fy
      }
      
      if (!target.fixed) {
        target.vx -= fx
        target.vy -= fy
      }
    }
  }
  
  /**
   * 更新节点位置
   */
  updatePositions() {
    const friction = 0.6
    
    for (const node of this.nodes) {
      if (node.fixed) continue
      
      // 应用速度
      node.x += node.vx
      node.y += node.vy
      
      // 应用摩擦力
      node.vx *= friction
      node.vy *= friction
      
      // 边界约束
      const margin = node.radius + 10
      node.x = Math.max(margin, Math.min(this.width - margin, node.x))
      node.y = Math.max(margin, Math.min(this.height - margin, node.y))
    }
  }
  
  /**
   * 执行一步模拟
   */
  tick() {
    this.applyCenterForce()
    this.applyChargeForce()
    this.applyLinkForce()
    this.updatePositions()
    
    // 降低alpha
    this.alpha += (this.alphaTarget - this.alpha) * this.alphaDecay
    
    return this.alpha > this.alphaMin
  }
  
  /**
   * 开始模拟
   * @param {Function} onUpdate - 更新回调
   */
  start(onUpdate) {
    this.isRunning = true
    this.alpha = 1.0
    
    const simulate = () => {
      if (!this.isRunning) return
      
      const shouldContinue = this.tick()
      
      if (onUpdate) {
        onUpdate(this.nodes, this.edges)
      }
      
      if (shouldContinue) {
        this.animationFrameId = requestAnimationFrame(simulate)
      } else {
        this.isRunning = false
      }
    }
    
    simulate()
  }
  
  /**
   * 停止模拟
   */
  stop() {
    this.isRunning = false
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = null
    }
  }
  
  /**
   * 固定节点
   * @param {string} nodeId - 节点ID
   * @param {boolean} fixed - 是否固定
   */
  fixNode(nodeId, fixed = true) {
    const node = this.nodes.find(n => n.id === nodeId)
    if (node) {
      node.fixed = fixed
      if (fixed) {
        node.vx = 0
        node.vy = 0
      }
    }
  }
  
  /**
   * 移动节点到指定位置
   * @param {string} nodeId - 节点ID
   * @param {number} x - X坐标
   * @param {number} y - Y坐标
   */
  moveNode(nodeId, x, y) {
    const node = this.nodes.find(n => n.id === nodeId)
    if (node) {
      node.x = x
      node.y = y
      node.vx = 0
      node.vy = 0
    }
  }
  
  /**
   * 获取节点位置
   * @returns {Object} 节点位置映射
   */
  getNodePositions() {
    const positions = {}
    for (const node of this.nodes) {
      positions[node.id] = { x: node.x, y: node.y }
    }
    return positions
  }
}

/**
 * Vue组合式API：使用力导向图
 * @param {Object} options - 配置选项
 * @returns {Object} 力导向图相关状态和方法
 */
export const useForceGraph = (options = {}) => {
  const simulator = ref(null)
  const nodes = ref([])
  const edges = ref([])
  const isSimulating = ref(false)
  const selectedNode = ref(null)
  const hoveredNode = ref(null)
  const hoveredEdge = ref(null)
  
  // 初始化模拟器
  const initSimulator = (width, height) => {
    simulator.value = new ForceGraphSimulator(options.config)
    simulator.value.setSize(width, height)
  }
  
  // 设置数据
  const setData = (characters, relationships) => {
    // 创建节点
    const graphNodes = characters.map(char => {
      const rel = relationships[char.id] || { favor: 0, trust: 0, stance: 0 }
      return createGraphNode(char, rel)
    })
    
    // 创建边（角色间关系）
    const graphEdges = []
    for (let i = 0; i < characters.length; i++) {
      for (let j = i + 1; j < characters.length; j++) {
        const charA = characters[i]
        const charB = characters[j]
        
        // 检查是否有角色间关系定义
        const relAtoB = charA.relationships?.find(r => r.target === charB.id || r.target === charB.name)
        const relBtoA = charB.relationships?.find(r => r.target === charA.id || r.target === charA.name)
        
        if (relAtoB || relBtoA) {
          const rel = relAtoB || relBtoA
          graphEdges.push(createGraphEdge(
            graphNodes.find(n => n.id === charA.id),
            graphNodes.find(n => n.id === charB.id),
            rel
          ))
        }
      }
    }
    
    nodes.value = graphNodes
    edges.value = graphEdges
    
    if (simulator.value) {
      simulator.value.init(graphNodes, graphEdges)
    }
  }
  
  // 开始模拟
  const startSimulation = () => {
    if (!simulator.value) return
    
    isSimulating.value = true
    simulator.value.start((updatedNodes, updatedEdges) => {
      nodes.value = [...updatedNodes]
      edges.value = updatedEdges.map(e => ({
        ...e,
        sourceNode: nodes.value.find(n => n.id === e.source),
        targetNode: nodes.value.find(n => n.id === e.target),
      }))
    })
  }
  
  // 停止模拟
  const stopSimulation = () => {
    if (simulator.value) {
      simulator.value.stop()
    }
    isSimulating.value = false
  }
  
  // 选择节点
  const selectNode = (nodeId) => {
    selectedNode.value = nodes.value.find(n => n.id === nodeId) || null
  }
  
  // 清除选择
  const clearSelection = () => {
    selectedNode.value = null
  }
  
  // 设置悬停节点
  const setHoveredNode = (nodeId) => {
    hoveredNode.value = nodeId ? nodes.value.find(n => n.id === nodeId) : null
  }
  
  // 设置悬停边
  const setHoveredEdge = (edgeId) => {
    hoveredEdge.value = edgeId ? edges.value.find(e => e.id === edgeId) : null
  }
  
  // 固定节点
  const fixNode = (nodeId, fixed = true) => {
    if (simulator.value) {
      simulator.value.fixNode(nodeId, fixed)
    }
  }
  
  // 拖拽节点
  const dragNode = (nodeId, x, y) => {
    if (simulator.value) {
      simulator.value.moveNode(nodeId, x, y)
    }
  }
  
  // 重置布局
  const resetLayout = () => {
    if (simulator.value) {
      simulator.value.stop()
      simulator.value.alpha = 1.0
      nodes.value.forEach(node => {
        node.x = simulator.value.center.x + (Math.random() - 0.5) * 100
        node.y = simulator.value.center.y + (Math.random() - 0.5) * 100
        node.vx = 0
        node.vy = 0
        node.fixed = false
      })
      startSimulation()
    }
  }
  
  return {
    simulator,
    nodes,
    edges,
    isSimulating,
    selectedNode,
    hoveredNode,
    hoveredEdge,
    initSimulator,
    setData,
    startSimulation,
    stopSimulation,
    selectNode,
    clearSelection,
    setHoveredNode,
    setHoveredEdge,
    fixNode,
    dragNode,
    resetLayout,
  }
}

/**
 * 计算边的路径数据（用于SVG绘制）
 * @param {Object} edge - 边数据
 * @returns {string} SVG路径字符串
 */
export const calculateEdgePath = (edge) => {
  const source = edge.sourceNode
  const target = edge.targetNode
  
  if (!source || !target) return ''
  
  // 直线连接
  return `M ${source.x} ${source.y} L ${target.x} ${target.y}`
}

/**
 * 计算边的箭头位置
 * @param {Object} edge - 边数据
 * @param {number} arrowSize - 箭头大小
 * @returns {Object} 箭头位置和角度
 */
export const calculateArrowPosition = (edge, arrowSize = 10) => {
  const source = edge.sourceNode
  const target = edge.targetNode
  
  if (!source || !target) return null
  
  const dx = target.x - source.x
  const dy = target.y - source.y
  const angle = Math.atan2(dy, dx)
  
  // 箭头位于目标节点边缘
  const arrowX = target.x - Math.cos(angle) * target.radius
  const arrowY = target.y - Math.sin(angle) * target.radius
  
  return {
    x: arrowX,
    y: arrowY,
    angle: angle * (180 / Math.PI),
  }
}

/**
 * 获取节点标签位置
 * @param {Object} node - 节点数据
 * @returns {Object} 标签位置
 */
export const getLabelPosition = (node) => {
  return {
    x: node.x,
    y: node.y + node.radius + 15,
  }
}

/**
 * 检测节点是否在指定位置
 * @param {Object} node - 节点数据
 * @param {number} x - X坐标
 * @param {number} y - Y坐标
 * @returns {boolean} 是否在节点范围内
 */
export const isPointInNode = (node, x, y) => {
  const dx = x - node.x
  const dy = y - node.y
  return Math.sqrt(dx * dx + dy * dy) <= node.radius
}

/**
 * 检测边是否在指定位置附近
 * @param {Object} edge - 边数据
 * @param {number} x - X坐标
 * @param {number} y - Y坐标
 * @param {number} threshold - 检测阈值
 * @returns {boolean} 是否在边附近
 */
export const isPointNearEdge = (edge, x, y, threshold = 10) => {
  const source = edge.sourceNode
  const target = edge.targetNode
  
  if (!source || !target) return false
  
  // 计算点到线段的距离
  const dx = target.x - source.x
  const dy = target.y - source.y
  const length = Math.sqrt(dx * dx + dy * dy)
  
  if (length === 0) return false
  
  const t = Math.max(0, Math.min(1, 
    ((x - source.x) * dx + (y - source.y) * dy) / (length * length)
  ))
  
  const nearestX = source.x + t * dx
  const nearestY = source.y + t * dy
  
  const distance = Math.sqrt((x - nearestX) ** 2 + (y - nearestY) ** 2)
  
  return distance <= threshold
}

// 导出所有
export default {
  FORCE_GRAPH_CONFIG,
  createGraphNode,
  createGraphEdge,
  ForceGraphSimulator,
  useForceGraph,
  calculateEdgePath,
  calculateArrowPosition,
  getLabelPosition,
  isPointInNode,
  isPointNearEdge,
}