import { ref, onMounted } from 'vue'

function unwrap(val) {
  return val && typeof val.value !== 'undefined' ? val.value : val
}

export function useForceLayout(options = {}) {
  const { nodes: rawNodes, edges: rawEdges, width = 400, height = 500, nodeRadius = 24 } = options
  const positions = ref({})
  const dragging = ref(null)

  function getNodes() { return unwrap(rawNodes) || [] }
  function getEdges() { return unwrap(rawEdges) || [] }

  function initializePositions() {
    const pos = {}
    const nodes = getNodes()
    const cx = width / 2
    const cy = height / 2
    const radius = Math.min(width, height) * 0.3
    nodes.forEach((node, i) => {
      const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2
      pos[node.id] = {
        x: cx + radius * Math.cos(angle) + (Math.random() - 0.5) * 20,
        y: cy + radius * Math.sin(angle) + (Math.random() - 0.5) * 20,
        vx: 0,
        vy: 0,
      }
    })
    positions.value = pos
  }

  function tick() {
    const pos = positions.value
    const nodes = getNodes()
    const edges = getEdges()
    const nodeIds = nodes.map(n => n.id)
    const repulsion = 8000
    const attraction = 0.005
    const gravity = 0.01
    const damping = 0.85
    const minDist = nodeRadius * 2.5
    const cx = width / 2
    const cy = height / 2

    for (let i = 0; i < nodeIds.length; i++) {
      for (let j = i + 1; j < nodeIds.length; j++) {
        const a = pos[nodeIds[i]]
        const b = pos[nodeIds[j]]
        let dx = a.x - b.x
        let dy = a.y - b.y
        let dist = Math.sqrt(dx * dx + dy * dy) || 1
        if (dist < minDist) dist = minDist
        const force = repulsion / (dist * dist)
        const fx = (dx / dist) * force
        const fy = (dy / dist) * force
        a.vx += fx
        a.vy += fy
        b.vx -= fx
        b.vy -= fy
      }
    }

    for (const edge of edges) {
      const a = pos[edge.source]
      const b = pos[edge.target]
      if (!a || !b) continue
      const dx = b.x - a.x
      const dy = b.y - a.y
      const dist = Math.sqrt(dx * dx + dy * dy) || 1
      const force = dist * attraction
      const fx = (dx / dist) * force
      const fy = (dy / dist) * force
      a.vx += fx
      a.vy += fy
      b.vx -= fx
      b.vy -= fy
    }

    for (const id of nodeIds) {
      const p = pos[id]
      p.vx += (cx - p.x) * gravity
      p.vy += (cy - p.y) * gravity
    }

    for (const id of nodeIds) {
      const p = pos[id]
      if (dragging.value === id) continue
      p.vx *= damping
      p.vy *= damping
      p.x += p.vx
      p.y += p.vy
      const pad = nodeRadius + 10
      p.x = Math.max(pad, Math.min(width - pad, p.x))
      p.y = Math.max(pad, Math.min(height - pad, p.y))
    }
  }

  function run(iterations = 200) {
    for (let i = 0; i < iterations; i++) tick()
  }

  function onDragStart(id) {
    dragging.value = id
  }

  function onDragMove(clientX, clientY, svgRect) {
    if (dragging.value == null) return
    const pos = positions.value[dragging.value]
    if (!pos) return
    pos.x = clientX - svgRect.left
    pos.y = clientY - svgRect.top
  }

  function onDragEnd() {
    if (dragging.value != null) {
      const savedId = dragging.value
      dragging.value = null
      for (let i = 0; i < 50; i++) tick()
    }
  }

  onMounted(() => {
    initializePositions()
    run(200)
  })

  return { positions, dragging, onDragStart, onDragMove, onDragEnd, run }
}
