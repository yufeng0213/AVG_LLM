<script setup>
const emit = defineEmits(['open-settings', 'open-worldbook', 'open-new-game', 'open-save-load', 'menu-click'])

const menuItems = [
  {
    id: 'continue',
    label: '继续游戏',
    description: '从最近一次存档继续推进剧情',
    icon: '▶',
    variant: 'tone-magenta border-solid tilt-left',
  },
  {
    id: 'load-save',
    label: '载入存档',
    description: '选择存档或历史备份继续游戏',
    icon: '💾',
    variant: 'tone-cyan border-solid tilt-right',
  },
  {
    id: 'new-game',
    label: '新游戏',
    description: '开启新的主线并重置选择分支',
    icon: '★',
    variant: 'tone-cyan border-dashed tilt-left',
  },
  {
    id: 'settings',
    label: '设置',
    description: '调整音量、显示与 API 配置',
    icon: '⚙',
    variant: 'tone-orange border-double tilt-right',
  },
  {
    id: 'worldbook',
    label: '世界书',
    description: '维护世界观与剧情背景条目',
    icon: '📘',
    variant: 'tone-magenta border-dashed tilt-left',
  },
]

const floatingShapes = [
  {
    id: 'spark-a',
    symbol: '✨',
    top: '6%',
    left: '4%',
    size: '2.4rem',
    color: 'var(--accent-cyan)',
    motion: 'motion-float',
    duration: '6s',
    delay: '0s',
  },
  {
    id: 'spark-b',
    symbol: '⚡',
    top: '17%',
    left: '86%',
    size: '2.6rem',
    color: 'var(--accent-yellow)',
    motion: 'motion-wiggle',
    duration: '1.4s',
    delay: '0.2s',
  },
  {
    id: 'spark-c',
    symbol: '✦',
    top: '72%',
    left: '8%',
    size: '2rem',
    color: 'var(--accent-magenta)',
    motion: 'motion-float-reverse',
    duration: '5s',
    delay: '0.5s',
  },
  {
    id: 'spark-d',
    symbol: '❖',
    top: '80%',
    left: '87%',
    size: '1.8rem',
    color: 'var(--accent-purple)',
    motion: 'motion-bounce',
    duration: '2.2s',
    delay: '0.1s',
  },
  {
    id: 'spark-e',
    symbol: '⬢',
    top: '38%',
    left: '92%',
    size: '1.6rem',
    color: 'var(--accent-orange)',
    motion: 'motion-float',
    duration: '7s',
    delay: '0.4s',
  },
]

const handleMenuClick = (itemId) => {
  emit('menu-click', itemId)
  if (itemId === 'settings') {
    emit('open-settings')
    return
  }

  if (itemId === 'new-game') {
    emit('open-new-game')
    return
  }

  if (itemId === 'worldbook') {
    emit('open-worldbook')
    return
  }

  if (itemId === 'load-save') {
    emit('open-save-load')
    return
  }

  if (itemId === 'continue') {
    // 继续游戏：直接打开存档界面
    emit('open-save-load')
  }
}
</script>

<template>
  <main class="launch-screen" role="main">
    <p class="massive-word" aria-hidden="true">AVG</p>

    <div class="floating-layer" aria-hidden="true">
      <span
        v-for="shape in floatingShapes"
        :key="shape.id"
        class="floating-shape"
        :class="shape.motion"
        :style="{
          '--shape-top': shape.top,
          '--shape-left': shape.left,
          '--shape-size': shape.size,
          '--shape-color': shape.color,
          '--shape-duration': shape.duration,
          '--shape-delay': shape.delay,
        }"
      >
        {{ shape.symbol }}
      </span>
    </div>

    <header class="hero-block">
      <p class="hero-tag">Interactive Drama Engine</p>
      <h1 class="hero-title">
        <span class="hero-title-main">AVG_LLM</span>
        <span class="hero-title-gradient">START MENU</span>
      </h1>
      <p class="hero-subtitle">
        多彩图层与霓虹噪点已经就位，选择你的下一段叙事分支。
      </p>
    </header>

    <section class="menu-panel" aria-label="启动菜单">
      <div class="menu-heading-row">
        <p class="menu-heading">主菜单</p>
        <p class="menu-heading-emoji" aria-hidden="true">⚡✨</p>
      </div>

      <div class="menu-grid">
        <button
          v-for="item in menuItems"
          :key="item.id"
          type="button"
          class="menu-button"
          :class="item.variant"
          @click="handleMenuClick(item.id)"
        >
          <span class="menu-button-icon" aria-hidden="true">{{ item.icon }}</span>
          <span class="menu-button-text">{{ item.label }}</span>
          <span class="menu-button-desc">{{ item.description }}</span>
        </button>
      </div>

      <div class="menu-meta">
        <p class="meta-chip chip-yellow">章节 00</p>
        <p class="meta-chip chip-cyan">系统待机</p>
        <p class="meta-chip chip-orange">v0.1 Prelude</p>
      </div>
    </section>
  </main>
</template>

<style scoped>
.launch-screen {
  position: relative;
  isolation: isolate;
  width: 100%;
  min-height: calc(100vh - clamp(40px, 8vw, 110px));
  padding: clamp(22px, 4vw, 48px);
  border: 8px solid var(--accent-cyan);
  border-radius: 34px 22px 38px 18px;
  background: color-mix(in srgb, var(--muted) 82%, transparent);
  backdrop-filter: blur(8px);
  overflow: hidden;
  display: grid;
  grid-template-rows: auto auto 1fr;
  gap: clamp(20px, 3vw, 34px);
  transform: rotate(-0.4deg);
  box-shadow:
    0 0 30px color-mix(in srgb, var(--accent-magenta) 58%, transparent),
    12px 12px 0 var(--accent-yellow), 24px 24px 0 var(--accent-magenta),
    36px 36px 0 var(--accent-cyan);
}

.launch-screen::before,
.launch-screen::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.launch-screen::before {
  z-index: 1;
  opacity: 0.2;
  background-image: repeating-linear-gradient(
    -40deg,
    transparent 0 16px,
    color-mix(in srgb, var(--accent-cyan) 40%, transparent) 16px 24px
  );
}

.launch-screen::after {
  z-index: 2;
  opacity: 0.14;
  background-image: conic-gradient(
    from 90deg at 1px 1px,
    transparent 90deg,
    color-mix(in srgb, var(--accent-orange) 38%, transparent) 0
  );
  background-size: 42px 42px;
  mix-blend-mode: screen;
}

.massive-word {
  margin: 0;
  position: absolute;
  z-index: 3;
  top: -3%;
  right: -4%;
  font-family: var(--font-heading);
  font-size: clamp(7rem, 23vw, 18rem);
  font-weight: 900;
  letter-spacing: -0.08em;
  line-height: 0.8;
  color: color-mix(in srgb, var(--accent-magenta) 38%, transparent);
  opacity: 0.2;
  user-select: none;
  pointer-events: none;
}

.floating-layer {
  position: absolute;
  inset: 0;
  z-index: 8;
  pointer-events: none;
}

.floating-shape {
  position: absolute;
  top: var(--shape-top);
  left: var(--shape-left);
  font-size: var(--shape-size);
  color: var(--shape-color);
  line-height: 1;
  filter: drop-shadow(0 0 8px color-mix(in srgb, var(--shape-color) 62%, transparent));
  text-shadow: var(--text-shadow-single);
  will-change: transform;
}

.hero-block {
  position: relative;
  z-index: 10;
  max-width: 820px;
  display: grid;
  gap: 14px;
}

.hero-tag {
  margin: 0;
  width: fit-content;
  padding: 9px 18px;
  border: 4px dashed var(--accent-yellow);
  border-radius: 9999px;
  background: color-mix(in srgb, var(--accent-purple) 34%, transparent);
  color: var(--foreground);
  font-size: clamp(0.78rem, 1.4vw, 1rem);
  font-weight: 700;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  text-shadow: var(--text-shadow-double);
  box-shadow:
    0 0 18px color-mix(in srgb, var(--accent-yellow) 52%, transparent),
    8px 8px 0 var(--accent-cyan);
}

.hero-title {
  margin: 0;
  display: grid;
  gap: 4px;
  line-height: 0.9;
  text-transform: uppercase;
}

.hero-title-main {
  font-family: var(--font-heading);
  font-size: clamp(2.9rem, 9vw, 7rem);
  font-weight: 900;
  letter-spacing: -0.04em;
  text-shadow: var(--text-shadow-triple);
}

.hero-title-gradient {
  width: fit-content;
  font-family: var(--font-display);
  font-size: clamp(2.1rem, 7vw, 4.6rem);
  letter-spacing: 0.06em;
  background: linear-gradient(
    90deg,
    var(--accent-magenta),
    var(--accent-cyan),
    var(--accent-yellow),
    var(--accent-orange),
    var(--accent-magenta)
  );
  background-size: 260% 260%;
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: avg-gradient-shift 4s linear infinite;
}

.hero-subtitle {
  margin: 0;
  max-width: 680px;
  font-size: clamp(1rem, 2.2vw, 1.3rem);
  font-weight: 500;
  color: color-mix(in srgb, var(--foreground) 92%, var(--accent-cyan));
}

.menu-panel {
  position: relative;
  z-index: 12;
  padding: clamp(16px, 3vw, 28px);
  border: 4px dotted var(--accent-magenta);
  border-radius: var(--radius-card);
  background: color-mix(in srgb, var(--muted) 86%, transparent);
  box-shadow:
    0 0 28px color-mix(in srgb, var(--accent-cyan) 40%, transparent),
    8px 8px 0 var(--accent-yellow), 16px 16px 0 var(--accent-magenta);
}

.menu-panel::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  opacity: 0.14;
  background-image: radial-gradient(circle, var(--accent-cyan) 1px, transparent 1px);
  background-size: 22px 22px;
}

.menu-heading-row {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 14px;
}

.menu-heading {
  margin: 0;
  font-family: var(--font-display);
  font-size: clamp(1.5rem, 3.2vw, 2.2rem);
  letter-spacing: 0.12em;
  color: var(--accent-yellow);
  text-shadow: var(--text-shadow-double);
  transform: rotate(-1.1deg);
}

.menu-heading-emoji {
  margin: 0;
  font-size: clamp(1.4rem, 3vw, 2.2rem);
  animation: avg-bounce-subtle 1.8s ease-in-out infinite;
}

.menu-grid {
  position: relative;
  z-index: 2;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: clamp(14px, 2.4vw, 22px);
}

.menu-button {
  --button-tilt: 0deg;
  appearance: none;
  border: 4px solid var(--accent-yellow);
  border-radius: var(--radius-button);
  min-height: 132px;
  padding: 14px 16px;
  display: grid;
  align-content: center;
  justify-items: start;
  gap: 6px;
  color: var(--foreground);
  text-align: left;
  cursor: pointer;
  transform: rotate(var(--button-tilt));
  transition:
    transform 280ms cubic-bezier(0.68, -0.55, 0.265, 1.55),
    box-shadow 300ms ease;
  box-shadow:
    0 0 22px color-mix(in srgb, var(--accent-magenta) 44%, transparent),
    8px 8px 0 var(--accent-cyan), 16px 16px 0 var(--accent-yellow);
  will-change: transform;
}

.menu-button:hover {
  transform: translateY(-5px) scale(1.05) rotate(calc(var(--button-tilt) + 1.2deg));
  box-shadow:
    0 0 34px color-mix(in srgb, var(--accent-magenta) 64%, transparent),
    12px 12px 0 var(--accent-cyan), 22px 22px 0 var(--accent-yellow),
    30px 30px 0 var(--accent-magenta);
}

.menu-button:active {
  transform: translateY(1px) scale(0.96) rotate(var(--button-tilt));
  box-shadow:
    0 0 18px color-mix(in srgb, var(--accent-magenta) 42%, transparent),
    5px 5px 0 var(--accent-cyan), 10px 10px 0 var(--accent-yellow);
}

.menu-button:focus-visible {
  outline: 3px dashed var(--accent-cyan);
  outline-offset: 4px;
  box-shadow:
    0 0 0 4px color-mix(in srgb, var(--accent-magenta) 55%, transparent),
    0 0 0 8px color-mix(in srgb, var(--accent-yellow) 50%, transparent),
    8px 8px 0 var(--accent-cyan), 16px 16px 0 var(--accent-yellow);
}

.menu-button-icon {
  font-size: clamp(1.8rem, 4vw, 2.8rem);
  line-height: 1;
  text-shadow: var(--text-shadow-double);
}

.menu-button-text {
  font-family: var(--font-heading);
  font-size: clamp(1.05rem, 1.9vw, 1.45rem);
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  text-shadow: var(--text-shadow-single);
}

.menu-button-desc {
  font-size: clamp(0.78rem, 1.2vw, 0.9rem);
  font-weight: 500;
  color: color-mix(in srgb, var(--foreground) 88%, var(--accent-cyan));
}

.tone-magenta {
  background: linear-gradient(
    120deg,
    color-mix(in srgb, var(--accent-magenta) 70%, var(--background)),
    color-mix(in srgb, var(--accent-purple) 68%, var(--background)),
    color-mix(in srgb, var(--accent-cyan) 58%, var(--background))
  );
  border-color: var(--accent-yellow);
}

.tone-cyan {
  background: linear-gradient(
    120deg,
    color-mix(in srgb, var(--accent-cyan) 72%, var(--background)),
    color-mix(in srgb, var(--accent-purple) 62%, var(--background)),
    color-mix(in srgb, var(--accent-magenta) 58%, var(--background))
  );
  border-color: var(--accent-orange);
}

.tone-orange {
  background: linear-gradient(
    120deg,
    color-mix(in srgb, var(--accent-orange) 75%, var(--background)),
    color-mix(in srgb, var(--accent-yellow) 70%, var(--background)),
    color-mix(in srgb, var(--accent-magenta) 60%, var(--background))
  );
  border-color: var(--accent-cyan);
}

.border-solid {
  border-style: solid;
}

.border-dashed {
  border-style: dashed;
}

.border-double {
  border-style: double;
}

.tilt-left {
  --button-tilt: -1.4deg;
}

.tilt-right {
  --button-tilt: 1.2deg;
}

.menu-meta {
  position: relative;
  z-index: 2;
  margin-top: clamp(16px, 2vw, 20px);
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.meta-chip {
  margin: 0;
  padding: 8px 16px;
  border: 4px solid;
  border-radius: 9999px;
  font-size: 0.88rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  background: color-mix(in srgb, var(--muted) 60%, transparent);
  box-shadow:
    0 0 14px color-mix(in srgb, var(--accent-purple) 45%, transparent),
    5px 5px 0 var(--accent-purple);
}

.chip-yellow {
  border-color: var(--accent-yellow);
  color: var(--accent-yellow);
  transform: rotate(-2deg);
}

.chip-cyan {
  border-color: var(--accent-cyan);
  color: var(--accent-cyan);
  border-style: dashed;
  transform: rotate(1deg);
}

.chip-orange {
  border-color: var(--accent-orange);
  color: var(--accent-orange);
  border-style: dotted;
  transform: rotate(-1deg);
}

.motion-float {
  animation: avg-float var(--shape-duration) ease-in-out infinite;
  animation-delay: var(--shape-delay);
}

.motion-float-reverse {
  animation: avg-float-reverse var(--shape-duration) ease-in-out infinite;
  animation-delay: var(--shape-delay);
}

.motion-wiggle {
  animation: avg-wiggle var(--shape-duration) ease-in-out infinite;
  animation-delay: var(--shape-delay);
}

.motion-bounce {
  animation: avg-bounce-subtle var(--shape-duration) ease-in-out infinite;
  animation-delay: var(--shape-delay);
}

@media (max-width: 980px) {
  .launch-screen {
    min-height: calc(100vh - 32px);
    border-width: 6px;
    box-shadow:
      0 0 24px color-mix(in srgb, var(--accent-magenta) 56%, transparent),
      9px 9px 0 var(--accent-yellow), 18px 18px 0 var(--accent-magenta);
    transform: rotate(-0.2deg);
  }

  .menu-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .menu-button {
    min-height: 120px;
  }

  .massive-word {
    top: -1%;
    right: -9%;
    font-size: clamp(6rem, 26vw, 10rem);
  }
}

@media (max-width: 640px) {
  .launch-screen {
    padding: 18px;
    border-radius: 26px 20px 30px 14px;
  }

  .hero-tag {
    letter-spacing: 0.16em;
  }

  .menu-panel {
    padding: 14px;
  }

  .floating-shape:last-child {
    display: none;
  }

  .menu-grid {
    grid-template-columns: repeat(1, minmax(0, 1fr));
  }

  .menu-button {
    padding: 18px;
  }
}
</style>
