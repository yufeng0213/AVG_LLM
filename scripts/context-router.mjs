#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()

const AREAS = [
  {
    id: 'app-shell',
    label: '应用壳层与启动',
    keywords: ['app', 'shell', 'main', '启动', '入口', '根组件', '导航'],
    must: ['src/main.js', 'src/App.vue', 'src/style.css'],
    styleMust: ['src/style.css', 'src/App.css'],
    optional: ['src/screens/StartScreen.vue', 'src/screens/GameScreen.vue'],
  },
  {
    id: 'llm-story',
    label: 'LLM 与剧情生成',
    keywords: ['llm', 'prompt', '剧情', '对话', '生成', '旁白', 'api', 'chat'],
    must: [
      'src/llm/llmService.js',
      'src/llm/index.js',
      'src/llm/promptGenerator.js',
      'src/llm/storyParser.js',
    ],
    optional: ['src/screens/GameScreen.vue', 'src/narrator/narratorStore.js'],
  },
  {
    id: 'worldbook',
    label: '世界书',
    keywords: ['世界书', 'worldbook', '角色库', '设定', '词条'],
    must: [
      'src/worldbook/worldBookStore.js',
      'src/screens/WorldBookScreen.vue',
      'src/screens/WorldBookEditorScreen.vue',
    ],
    optional: ['src/worldbook/emotionPresets.js', 'src/screens/GameScreen.vue'],
  },
  {
    id: 'phone',
    label: '手机系统',
    keywords: ['phone', '手机', '短信', '朋友圈', '论坛', '地图', '商店'],
    must: ['src/components/Phone.vue'],
    optional: ['src/llm/llmService.js', 'src/screens/GameScreen.vue'],
  },
  {
    id: 'handheld-console',
    label: '掌机系统',
    keywords: ['handheld', '掌机', 'console', '小游戏', '插件容器'],
    must: ['src/components/HandheldConsole.vue', 'src/plugins/pluginManager.js'],
    optional: ['src/screens/GameScreen.vue', 'src/screens/PluginManagerScreen.vue'],
  },
  {
    id: 'plugin-system',
    label: '插件系统',
    keywords: ['plugin', '插件', 'marketplace', '插件管理'],
    must: [
      'src/plugins/pluginManager.js',
      'src/plugins/PluginComponent.vue',
      'src/screens/PluginManagerScreen.vue',
    ],
    optional: ['src/components/HandheldConsole.vue', 'src/screens/GameScreen.vue'],
  },
  {
    id: 'dungeon-plugin',
    label: 'RPG 地下城插件',
    keywords: ['dungeon', '地下城', 'xx大冒险', 'campfire', '篝火', 'gacha', '抽卡'],
    must: [
      'src/plugins/handheld-xx-dungeon-adventure/index.vue',
      'src/plugins/handheld-xx-dungeon-adventure/logic/dungeonMapEngine.js',
      'src/plugins/handheld-xx-dungeon-adventure/logic/roleEngine.js',
      'src/plugins/handheld-xx-dungeon-adventure/MAINTENANCE.md',
    ],
    optional: ['src/llm/llmService.js', 'src/components/HandheldConsole.vue'],
  },
  {
    id: 'save-storage',
    label: '存档与本地存储',
    keywords: ['save', 'storage', '存档', '读档', '缓存', 'preferences'],
    must: ['src/save/saveManager.js', 'src/storage/index.js', 'src/screens/SaveLoadScreen.vue'],
    optional: ['src/screens/GameScreen.vue', 'src/worldbook/worldBookStore.js'],
  },
  {
    id: 'settings-theme',
    label: '设置与主题',
    keywords: ['settings', 'theme', '设置', '主题', '显示', '音频', 'api设置'],
    must: [
      'src/screens/SettingsScreen.vue',
      'src/settings/ApiSettingsPanel.vue',
      'src/settings/DisplaySettingsPanel.vue',
      'src/settings/ThemeSettingsPanel.vue',
      'src/theme/themeManager.js',
      'src/theme/themeProfiles.css',
    ],
    optional: ['src/settings/AudioSettingsPanel.vue', 'src/style.css'],
  },
  {
    id: 'media-portrait-cg',
    label: '立绘与 CG',
    keywords: ['portrait', 'cg', '立绘', '图片', 'comfyui'],
    must: ['src/components/PortraitManager.vue', 'src/components/CGGeneratorModal.vue', 'src/comfyui/comfyuiService.js'],
    optional: ['src/screens/GameScreen.vue'],
  },
  {
    id: 'music-player',
    label: '音乐播放器',
    keywords: ['music', 'bgm', '播放器', '音乐', '皮肤'],
    must: ['src/components/MusicPlayer.vue', 'src/components/musicPlayerSkinManager.js'],
    optional: ['src/themes/music-player/default.json', 'src/themes/music-player/neon-cyber.json'],
  },
  {
    id: 'platform-build',
    label: '平台构建（Electron/Android）',
    keywords: ['android', 'electron', 'capacitor', 'apk', 'build', '打包'],
    must: ['package.json', 'vite.config.js', 'electron/main.js'],
    styleMust: ['src/style.css', 'src/App.css', 'src/screens/GameScreen.css', 'src/components/Phone.css', 'src/components/HandheldConsole.css'],
    optional: ['android/capacitor.config.ts'],
  },
]

const SKIP_PATTERNS = [
  'node_modules/',
  'dist/',
  'android/app/build/',
  'android/app/src/main/assets/public/',
  '.vite/',
]

const HELP = `
Usage:
  npm run ctx -- --task "你的需求" [--mode logic|style|mixed]
  npm run ctx -- --area worldbook,plugin-system [--mode logic]
  npm run ctx -- --list
  npm run ctx -- --task "手机短信布局" --mode style --json

Options:
  --task   任务描述文本（自动匹配模块）
  --area   指定模块 id，多个用逗号分隔
  --mode   logic | style | mixed，默认 logic
  --list   仅列出可用模块
  --json   JSON 输出
`.trim()

function parseArgs(argv) {
  const out = {
    task: '',
    area: '',
    mode: 'logic',
    list: false,
    json: false,
    help: false,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (token === '--task') {
      out.task = String(argv[i + 1] || '')
      i += 1
      continue
    }
    if (token === '--area') {
      out.area = String(argv[i + 1] || '')
      i += 1
      continue
    }
    if (token === '--mode') {
      out.mode = String(argv[i + 1] || 'logic').toLowerCase()
      i += 1
      continue
    }
    if (token === '--list') {
      out.list = true
      continue
    }
    if (token === '--json') {
      out.json = true
      continue
    }
    if (token === '--help' || token === '-h') {
      out.help = true
      continue
    }
  }
  return out
}

function uniq(items) {
  return [...new Set(items)]
}

function exists(relPath) {
  return fs.existsSync(path.join(ROOT, relPath))
}

function normalizePath(relPath) {
  return relPath.replaceAll('\\', '/')
}

function toCssTwin(relPath) {
  if (!relPath.endsWith('.vue')) return ''
  const cssPath = relPath.slice(0, -4) + '.css'
  return exists(cssPath) ? cssPath : ''
}

function isLogicFile(relPath) {
  if (relPath.endsWith('.css')) return false
  return true
}

function pickAreas(taskText, areaText) {
  const explicitIds = String(areaText || '')
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean)

  if (explicitIds.length > 0) {
    return AREAS.filter((area) => explicitIds.includes(area.id))
  }

  const text = String(taskText || '').toLowerCase()
  if (!text) return []

  return AREAS.filter((area) => area.keywords.some((kw) => text.includes(kw.toLowerCase())))
}

function buildReadSet(matchedAreas, mode) {
  const mustRaw = matchedAreas.flatMap((area) => area.must || [])
  const optionalRaw = matchedAreas.flatMap((area) => area.optional || [])
  const styleMustRaw = matchedAreas.flatMap((area) => area.styleMust || [])
  const styleOptionalRaw = matchedAreas.flatMap((area) => area.styleOptional || [])

  let must = uniq(mustRaw).filter(exists)
  let optional = uniq(optionalRaw).filter(exists)

  if (mode === 'logic') {
    must = must.filter(isLogicFile)
    optional = optional.filter(isLogicFile)
  } else if (mode === 'style') {
    const styleMust = [...styleMustRaw]
    const styleOptional = [...styleOptionalRaw]
    for (const file of must) {
      if (file.endsWith('.css')) {
        styleMust.push(file)
      } else {
        const twin = toCssTwin(file)
        if (twin) styleMust.push(twin)
      }
    }
    for (const file of optional) {
      if (file.endsWith('.css')) {
        styleOptional.push(file)
      } else {
        const twin = toCssTwin(file)
        if (twin) styleOptional.push(twin)
      }
    }
    must = uniq(styleMust).filter(exists)
    optional = uniq(styleOptional).filter(exists)
    if (must.length === 0) {
      must = ['src/style.css', 'src/App.css'].filter(exists)
    }
  }

  return { must, optional }
}

function printList(jsonMode = false) {
  const payload = AREAS.map((a) => ({ id: a.id, label: a.label }))
  if (jsonMode) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
    return
  }

  process.stdout.write('Available areas:\n')
  for (const item of payload) {
    process.stdout.write(`- ${item.id}: ${item.label}\n`)
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2))

  if (args.help) {
    process.stdout.write(`${HELP}\n`)
    return
  }

  if (args.list) {
    printList(args.json)
    return
  }

  const mode = ['logic', 'style', 'mixed'].includes(args.mode) ? args.mode : 'logic'
  const matchedAreas = pickAreas(args.task, args.area)
  const fallbackAreas = matchedAreas.length > 0
    ? matchedAreas
    : AREAS.filter((area) => ['app-shell', 'plugin-system', 'save-storage'].includes(area.id))

  const { must, optional } = buildReadSet(fallbackAreas, mode)
  const payload = {
    mode,
    task: args.task || '',
    matchedAreas: fallbackAreas.map((a) => ({ id: a.id, label: a.label })),
    mustRead: must.map(normalizePath),
    optionalRead: optional.map(normalizePath),
    skipByDefault: SKIP_PATTERNS,
    hints: [
      mode === 'logic'
        ? '逻辑任务默认不读 CSS。'
        : mode === 'style'
          ? '样式任务优先只读 CSS 与少量模板片段。'
          : '混合任务建议先逻辑后样式，分两次改动。',
      '先读 mustRead，再按需补充 optionalRead。',
    ],
  }

  if (args.json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
    return
  }

  process.stdout.write(`Mode: ${payload.mode}\n`)
  if (payload.task) {
    process.stdout.write(`Task: ${payload.task}\n`)
  }
  process.stdout.write('Areas:\n')
  for (const area of payload.matchedAreas) {
    process.stdout.write(`- ${area.id}: ${area.label}\n`)
  }
  process.stdout.write('\nMust Read:\n')
  for (const file of payload.mustRead) {
    process.stdout.write(`- ${file}\n`)
  }
  process.stdout.write('\nOptional Read:\n')
  for (const file of payload.optionalRead) {
    process.stdout.write(`- ${file}\n`)
  }
  process.stdout.write('\nSkip By Default:\n')
  for (const pattern of payload.skipByDefault) {
    process.stdout.write(`- ${pattern}\n`)
  }
  process.stdout.write('\nHints:\n')
  for (const hint of payload.hints) {
    process.stdout.write(`- ${hint}\n`)
  }
}

main()
