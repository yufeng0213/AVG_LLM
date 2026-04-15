/**
 * useGameSkin.js - 小游戏皮肤选择 composable
 * 每个游戏有若干皮肤，购买后切换外观
 */

import { ref, computed } from 'vue'

const STORAGE_KEY = 'avg_llm_game_skins_v1'

// ====== 皮肤定义 ======

const GAME_SKINS = {
  slotMachine: [
    {
      id: 'slot_classic',
      name: '🌸 樱花风',
      price: 0,
      theme: {
        bodyBg: 'linear-gradient(180deg, #2a1a3a 0%, #1a0a2a 100%)',
        borderColor: 'rgba(255, 215, 0, 0.3)',
        lightColor: '#ffd700',
        cellBg: 'linear-gradient(180deg, rgba(40, 20, 60, 0.8), rgba(20, 10, 40, 0.9))',
        cellMiddleBg: 'linear-gradient(180deg, rgba(50, 25, 70, 0.9), rgba(30, 15, 50, 0.95))',
        buttonBg: 'linear-gradient(135deg, #ffd700, #ff8c00)',
        glowColor: 'rgba(255, 215, 0, 0.15)',
      },
    },
    {
      id: 'slot_cyber',
      name: '🔮 赛博朋克',
      price: 800,
      theme: {
        bodyBg: 'linear-gradient(180deg, #0a0a2e 0%, #1a0a3e 50%, #0f0a2e 100%)',
        borderColor: 'rgba(255, 0, 128, 0.4)',
        lightColor: '#ff0080',
        cellBg: 'linear-gradient(180deg, rgba(10, 20, 40, 0.9), rgba(5, 10, 30, 0.95))',
        cellMiddleBg: 'linear-gradient(180deg, rgba(15, 30, 60, 0.95), rgba(10, 15, 45, 0.95))',
        buttonBg: 'linear-gradient(135deg, #ff0080, #00ffff)',
        glowColor: 'rgba(255, 0, 128, 0.15)',
      },
    },
    {
      id: 'slot_waifu',
      name: '🎴 和风妖怪',
      price: 1200,
      theme: {
        bodyBg: 'linear-gradient(180deg, #2a0a0a 0%, #1a0a1a 100%)',
        borderColor: 'rgba(255, 50, 50, 0.4)',
        lightColor: '#ff4444',
        cellBg: 'linear-gradient(180deg, rgba(60, 10, 10, 0.8), rgba(30, 5, 20, 0.9))',
        cellMiddleBg: 'linear-gradient(180deg, rgba(80, 15, 15, 0.9), rgba(40, 10, 30, 0.95))',
        buttonBg: 'linear-gradient(135deg, #ff4444, #ffaa00)',
        glowColor: 'rgba(255, 50, 50, 0.15)',
      },
    },
  ],
  gacha: [
    {
      id: 'gacha_classic',
      name: '🎪 经典风',
      price: 0,
      theme: {
        screenBg: 'linear-gradient(180deg, #0f0a1e 0%, #1a0a2e 40%, #0f1a2e 100%)',
        machineBaseBg: 'linear-gradient(180deg, #3a1a4a, #2a0a3a)',
        domeBorder: 'rgba(255, 215, 0, 0.2)',
        domeGlow: 'rgba(255, 215, 0, 0.1)',
        headerBorder: 'rgba(255, 215, 0, 0.1)',
        headerText: '#ffd700',
        capsuleTop: 'linear-gradient(180deg, #e74c3c, #c0392b)',
        capsuleBottom: 'linear-gradient(180deg, #f39c12, #e67e22)',
        knobColor: 'radial-gradient(circle, #ffd700, #ff8c00)',
        decoLight: 'rgba(255, 215, 0, 0.3)',
        decoLightBlink: '#ffd700',
        singleBtnBg: 'linear-gradient(135deg, rgba(59, 130, 246, 0.3), rgba(59, 130, 246, 0.1))',
        singleBtnBorder: 'rgba(59, 130, 246, 0.3)',
        singleBtnText: '#60a5fa',
        multiBtnBg: 'linear-gradient(135deg, rgba(255, 215, 0, 0.3), rgba(255, 140, 0, 0.1))',
        multiBtnBorder: 'rgba(255, 215, 0, 0.3)',
        multiBtnText: '#ffd700',
      },
    },
    {
      id: 'gacha_castle',
      name: '🏰 魔法城堡',
      price: 800,
      theme: {
        screenBg: 'linear-gradient(180deg, #0a0a2e 0%, #1a1a4e 40%, #0a1a3e 100%)',
        machineBaseBg: 'linear-gradient(180deg, #2a3a6a, #1a2a5a)',
        domeBorder: 'rgba(100, 150, 255, 0.3)',
        domeGlow: 'rgba(100, 150, 255, 0.15)',
        headerBorder: 'rgba(100, 150, 255, 0.15)',
        headerText: '#6496ff',
        capsuleTop: 'linear-gradient(180deg, #4a6aff, #2a4adf)',
        capsuleBottom: 'linear-gradient(180deg, #6a8aff, #4a6aef)',
        knobColor: 'radial-gradient(circle, #8ab4ff, #4a6aff)',
        decoLight: 'rgba(100, 150, 255, 0.3)',
        decoLightBlink: '#6496ff',
        singleBtnBg: 'linear-gradient(135deg, rgba(100, 150, 255, 0.3), rgba(100, 150, 255, 0.1))',
        singleBtnBorder: 'rgba(100, 150, 255, 0.3)',
        singleBtnText: '#8ab4ff',
        multiBtnBg: 'linear-gradient(135deg, rgba(150, 100, 255, 0.3), rgba(100, 150, 255, 0.1))',
        multiBtnBorder: 'rgba(150, 100, 255, 0.3)',
        multiBtnText: '#9664ff',
      },
    },
    {
      id: 'gacha_mushroom',
      name: '🍄 蘑菇小屋',
      price: 1200,
      theme: {
        screenBg: 'linear-gradient(180deg, #1a2e0a 0%, #2e1a0a 40%, #1a1a0a 100%)',
        machineBaseBg: 'linear-gradient(180deg, #6a4a2a, #5a3a1a)',
        domeBorder: 'rgba(255, 100, 100, 0.3)',
        domeGlow: 'rgba(255, 100, 100, 0.1)',
        headerBorder: 'rgba(139, 90, 43, 0.3)',
        headerText: '#c88a4a',
        capsuleTop: 'linear-gradient(180deg, #e74c3c, #c0392b)',
        capsuleBottom: 'linear-gradient(180deg, #f5f5dc, #e8e8d0)',
        knobColor: 'radial-gradient(circle, #8B5A2B, #6B3A1B)',
        decoLight: 'rgba(255, 200, 100, 0.3)',
        decoLightBlink: '#ffc864',
        singleBtnBg: 'linear-gradient(135deg, rgba(139, 90, 43, 0.3), rgba(139, 90, 43, 0.1))',
        singleBtnBorder: 'rgba(139, 90, 43, 0.3)',
        singleBtnText: '#c88a4a',
        multiBtnBg: 'linear-gradient(135deg, rgba(255, 100, 100, 0.3), rgba(255, 100, 100, 0.1))',
        multiBtnBorder: 'rgba(255, 100, 100, 0.3)',
        multiBtnText: '#ff6464',
      },
    },
  ],
  pachinko: [
    {
      id: 'pachinko_classic',
      name: '🌙 经典风',
      price: 0,
      theme: {
        screenBg: 'linear-gradient(180deg, #0a0a2e 0%, #0f1a3e 50%, #0a0a1e 100%)',
        canvasBg: '#0a0a1e',
        canvasBorder: 'rgba(255, 215, 0, 0.15)',
        pinColor: '#4a4a6a',
        pinStroke: 'rgba(255, 255, 255, 0.1)',
        pinGlowColor: '#ffffff',
        ballGrad1: '#ffffff',
        ballGrad2: '#64c8ff',
        ballGrad3: '#3b82f6',
        ballShadow: '#64c8ff',
        slotColors: ['#3b82f6', '#64748b', '#22c55e', '#a855f7', '#ffd700', '#a855f7', '#22c55e', '#64748b', '#3b82f6'],
        launcherFill: 'rgba(255, 215, 0, 0.12)',
        launcherStroke: 'rgba(255, 215, 0, 0.3)',
        headerText: '#ffd700',
        headerBorder: 'rgba(255, 215, 0, 0.1)',
        headerCoinBg: 'rgba(255, 215, 0, 0.1)',
        headerCoinBorder: 'rgba(255, 215, 0, 0.2)',
        toggleBg: 'rgba(255, 215, 0, 0.06)',
        toggleBorder: 'rgba(255, 215, 0, 0.15)',
        toggleLabel: 'rgba(255, 255, 255, 0.6)',
        fabText: '#ffd700',
        fabBorder: 'rgba(255, 215, 0, 0.3)',
        fabBg: 'rgba(0, 0, 0, 0.6)',
      },
    },
    {
      id: 'pachinko_space',
      name: '🌌 星空宇宙',
      price: 800,
      theme: {
        screenBg: 'linear-gradient(180deg, #000011 0%, #0a0a2a 50%, #000022 100%)',
        canvasBg: '#000011',
        canvasBorder: 'rgba(150, 100, 255, 0.2)',
        pinColor: '#c0c0d0',
        pinStroke: 'rgba(255, 255, 255, 0.2)',
        pinGlowColor: '#a855f7',
        ballGrad1: '#ffffff',
        ballGrad2: '#c084fc',
        ballGrad3: '#7c3aed',
        ballShadow: '#a855f7',
        slotColors: ['#7c3aed', '#64748b', '#a855f7', '#60a5fa', '#c084fc', '#60a5fa', '#a855f7', '#64748b', '#7c3aed'],
        launcherFill: 'rgba(150, 100, 255, 0.12)',
        launcherStroke: 'rgba(150, 100, 255, 0.3)',
        headerText: '#c084fc',
        headerBorder: 'rgba(150, 100, 255, 0.15)',
        headerCoinBg: 'rgba(150, 100, 255, 0.1)',
        headerCoinBorder: 'rgba(150, 100, 255, 0.2)',
        toggleBg: 'rgba(150, 100, 255, 0.06)',
        toggleBorder: 'rgba(150, 100, 255, 0.15)',
        toggleLabel: 'rgba(255, 255, 255, 0.6)',
        fabText: '#c084fc',
        fabBorder: 'rgba(150, 100, 255, 0.3)',
        fabBg: 'rgba(0, 0, 20, 0.6)',
      },
    },
    {
      id: 'pachinko_circus',
      name: '🎪 马戏团',
      price: 1200,
      theme: {
        screenBg: 'linear-gradient(180deg, #2e0a0a 0%, #3e1a0a 50%, #1e0a1a 100%)',
        canvasBg: '#1a0a0a',
        canvasBorder: 'rgba(255, 50, 50, 0.2)',
        pinColor: '#e74c3c',
        pinStroke: 'rgba(255, 255, 255, 0.15)',
        pinGlowColor: '#e74c3c',
        ballGrad1: '#ffffff',
        ballGrad2: '#fbbf24',
        ballGrad3: '#f97316',
        ballShadow: '#fbbf24',
        slotColors: ['#ef4444', '#3b82f6', '#22c55e', '#fbbf24', '#ff0080', '#fbbf24', '#22c55e', '#3b82f6', '#ef4444'],
        launcherFill: 'rgba(255, 50, 50, 0.12)',
        launcherStroke: 'rgba(255, 50, 50, 0.3)',
        headerText: '#ff6464',
        headerBorder: 'rgba(255, 50, 50, 0.1)',
        headerCoinBg: 'rgba(255, 200, 50, 0.1)',
        headerCoinBorder: 'rgba(255, 200, 50, 0.2)',
        toggleBg: 'rgba(255, 50, 50, 0.06)',
        toggleBorder: 'rgba(255, 50, 50, 0.15)',
        toggleLabel: 'rgba(255, 255, 255, 0.6)',
        fabText: '#ff6464',
        fabBorder: 'rgba(255, 50, 50, 0.3)',
        fabBg: 'rgba(20, 0, 0, 0.6)',
      },
    },
  ],
  dogRace: [
    {
      id: 'dograce_classic',
      name: '🌿 草地风',
      price: 0,
      theme: {
        screenBg: 'linear-gradient(180deg, #1a2e0a 0%, #0a1e0a 50%, #0a1a1e 100%)',
        trackBg: '#2d5a1e',
        laneAlt: 'rgba(55, 110, 40, 0.3)',
        laneBase: 'rgba(45, 90, 30, 0.3)',
        finishLine: '#ffffff',
        startLine: '#ffffff',
        flagColor: '#ff4444',
        headerText: '#8bc34a',
        headerBorder: 'rgba(139, 195, 74, 0.15)',
        headerCoinBg: 'rgba(139, 195, 74, 0.1)',
        headerCoinBorder: 'rgba(139, 195, 74, 0.2)',
        betBtnBg: 'rgba(255, 255, 255, 0.05)',
        betBtnBorder: 'rgba(255, 255, 255, 0.15)',
        startBtnBg: 'linear-gradient(135deg, rgba(139, 195, 74, 0.4), rgba(139, 195, 74, 0.15))',
        startBtnBorder: 'rgba(139, 195, 74, 0.4)',
        startBtnText: '#8bc34a',
      },
    },
    {
      id: 'dograce_desert',
      name: '🏜️ 沙漠',
      price: 800,
      theme: {
        screenBg: 'linear-gradient(180deg, #2e1a0a 0%, #1e1a0a 50%, #1a1a0a 100%)',
        trackBg: '#8B7355',
        laneAlt: 'rgba(160, 130, 90, 0.3)',
        laneBase: 'rgba(139, 115, 85, 0.3)',
        finishLine: '#f5f5dc',
        startLine: '#f5f5dc',
        flagColor: '#ff8c00',
        headerText: '#c88a4a',
        headerBorder: 'rgba(200, 138, 74, 0.15)',
        headerCoinBg: 'rgba(200, 138, 74, 0.1)',
        headerCoinBorder: 'rgba(200, 138, 74, 0.2)',
        betBtnBg: 'rgba(255, 255, 255, 0.05)',
        betBtnBorder: 'rgba(255, 255, 255, 0.15)',
        startBtnBg: 'linear-gradient(135deg, rgba(200, 138, 74, 0.4), rgba(200, 138, 74, 0.15))',
        startBtnBorder: 'rgba(200, 138, 74, 0.4)',
        startBtnText: '#c88a4a',
      },
    },
    {
      id: 'dograce_snow',
      name: '❄️ 雪地',
      price: 1200,
      theme: {
        screenBg: 'linear-gradient(180deg, #0a1a2e 0%, #0a2a3e 50%, #0a1a2e 100%)',
        trackBg: '#e0e8f0',
        laneAlt: 'rgba(200, 210, 220, 0.4)',
        laneBase: 'rgba(224, 232, 240, 0.4)',
        finishLine: '#4a6a8a',
        startLine: '#4a6a8a',
        flagColor: '#60a5fa',
        headerText: '#60a5fa',
        headerBorder: 'rgba(96, 165, 250, 0.15)',
        headerCoinBg: 'rgba(96, 165, 250, 0.1)',
        headerCoinBorder: 'rgba(96, 165, 250, 0.2)',
        betBtnBg: 'rgba(255, 255, 255, 0.05)',
        betBtnBorder: 'rgba(255, 255, 255, 0.15)',
        startBtnBg: 'linear-gradient(135deg, rgba(96, 165, 250, 0.4), rgba(96, 165, 250, 0.15))',
        startBtnBorder: 'rgba(96, 165, 250, 0.4)',
        startBtnText: '#60a5fa',
      },
    },
  ],
  kitchen: [
    {
      id: 'kitchen_classic',
      name: '🍳 经典风',
      price: 0,
      theme: {
        screenBg: 'linear-gradient(180deg, #2e1a0a 0%, #1e1a0a 40%, #0a1a1e 100%)',
        headerBg: 'rgba(0, 0, 0, 0.4)',
        headerBorder: 'rgba(255, 140, 0, 0.2)',
        headerText: '#ff8c00',
        headerCoinBg: 'rgba(255, 215, 0, 0.1)',
        headerCoinBorder: 'rgba(255, 215, 0, 0.2)',
        statsBg: 'rgba(0, 0, 0, 0.3)',
        statsText: 'rgba(255, 255, 255, 0.6)',
        tabBg: 'rgba(255, 255, 255, 0.04)',
        tabBorder: 'rgba(255, 255, 255, 0.1)',
        tabActiveBg: 'rgba(255, 140, 0, 0.15)',
        tabActiveBorder: 'rgba(255, 140, 0, 0.4)',
        tabText: 'rgba(255, 255, 255, 0.6)',
        tabActiveText: '#ff8c00',
        cardBg: 'rgba(255, 255, 255, 0.04)',
        cardBorder: 'rgba(255, 255, 255, 0.1)',
        cardSelectedBorder: '#ffd700',
        cardSelectedBg: 'rgba(255, 215, 0, 0.1)',
        detailBg: 'rgba(255, 255, 255, 0.05)',
        detailBorder: 'rgba(255, 255, 255, 0.1)',
        cookBtnBg: 'linear-gradient(135deg, rgba(255, 140, 0, 0.4), rgba(255, 140, 0, 0.15))',
        cookBtnBorder: 'rgba(255, 140, 0, 0.4)',
        cookBtnText: '#ff8c00',
        marketBtnBg: 'linear-gradient(135deg, rgba(59, 130, 246, 0.3), rgba(59, 130, 246, 0.1))',
        marketBtnBorder: 'rgba(59, 130, 246, 0.3)',
        marketBtnText: '#60a5fa',
        marketInnerBg: 'linear-gradient(180deg, #2e1a0a, #1a0e04)',
        marketBorder: 'rgba(255, 140, 0, 0.3)',
      },
    },
    {
      id: 'kitchen_japanese',
      name: '🏠 日式食堂',
      price: 800,
      theme: {
        screenBg: 'linear-gradient(180deg, #2a1a0a 0%, #1a1a0a 40%, #0a1a1e 100%)',
        headerBg: 'rgba(0, 0, 0, 0.4)',
        headerBorder: 'rgba(139, 90, 43, 0.3)',
        headerText: '#c88a4a',
        headerCoinBg: 'rgba(200, 138, 74, 0.1)',
        headerCoinBorder: 'rgba(200, 138, 74, 0.2)',
        statsBg: 'rgba(0, 0, 0, 0.3)',
        statsText: 'rgba(255, 255, 255, 0.6)',
        tabBg: 'rgba(255, 255, 255, 0.04)',
        tabBorder: 'rgba(139, 90, 43, 0.2)',
        tabActiveBg: 'rgba(200, 138, 74, 0.15)',
        tabActiveBorder: 'rgba(200, 138, 74, 0.4)',
        tabText: 'rgba(255, 255, 255, 0.6)',
        tabActiveText: '#c88a4a',
        cardBg: 'rgba(255, 255, 255, 0.04)',
        cardBorder: 'rgba(139, 90, 43, 0.2)',
        cardSelectedBorder: '#c88a4a',
        cardSelectedBg: 'rgba(200, 138, 74, 0.1)',
        detailBg: 'rgba(255, 255, 255, 0.05)',
        detailBorder: 'rgba(139, 90, 43, 0.2)',
        cookBtnBg: 'linear-gradient(135deg, rgba(200, 138, 74, 0.4), rgba(200, 138, 74, 0.15))',
        cookBtnBorder: 'rgba(200, 138, 74, 0.4)',
        cookBtnText: '#c88a4a',
        marketBtnBg: 'linear-gradient(135deg, rgba(139, 90, 43, 0.3), rgba(139, 90, 43, 0.1))',
        marketBtnBorder: 'rgba(139, 90, 43, 0.3)',
        marketBtnText: '#c88a4a',
        marketInnerBg: 'linear-gradient(180deg, #2a1a0a, #1a1a0a)',
        marketBorder: 'rgba(139, 90, 43, 0.3)',
      },
    },
    {
      id: 'kitchen_seaside',
      name: '🏖️ 海边餐厅',
      price: 1200,
      theme: {
        screenBg: 'linear-gradient(180deg, #0a1a2e 0%, #0a2a3e 40%, #0a3a4e 100%)',
        headerBg: 'rgba(0, 0, 0, 0.4)',
        headerBorder: 'rgba(96, 165, 250, 0.2)',
        headerText: '#60a5fa',
        headerCoinBg: 'rgba(96, 165, 250, 0.1)',
        headerCoinBorder: 'rgba(96, 165, 250, 0.2)',
        statsBg: 'rgba(0, 0, 0, 0.3)',
        statsText: 'rgba(255, 255, 255, 0.6)',
        tabBg: 'rgba(255, 255, 255, 0.04)',
        tabBorder: 'rgba(96, 165, 250, 0.15)',
        tabActiveBg: 'rgba(96, 165, 250, 0.15)',
        tabActiveBorder: 'rgba(96, 165, 250, 0.4)',
        tabText: 'rgba(255, 255, 255, 0.6)',
        tabActiveText: '#60a5fa',
        cardBg: 'rgba(255, 255, 255, 0.04)',
        cardBorder: 'rgba(96, 165, 250, 0.15)',
        cardSelectedBorder: '#60a5fa',
        cardSelectedBg: 'rgba(96, 165, 250, 0.1)',
        detailBg: 'rgba(255, 255, 255, 0.05)',
        detailBorder: 'rgba(96, 165, 250, 0.15)',
        cookBtnBg: 'linear-gradient(135deg, rgba(96, 165, 250, 0.4), rgba(96, 165, 250, 0.15))',
        cookBtnBorder: 'rgba(96, 165, 250, 0.4)',
        cookBtnText: '#60a5fa',
        marketBtnBg: 'linear-gradient(135deg, rgba(34, 197, 94, 0.3), rgba(34, 197, 94, 0.1))',
        marketBtnBorder: 'rgba(34, 197, 94, 0.3)',
        marketBtnText: '#4ade80',
        marketInnerBg: 'linear-gradient(180deg, #0a1a2e, #0a2a3e)',
        marketBorder: 'rgba(96, 165, 250, 0.3)',
      },
    },
  ],
}

// ====== composable ======

export function useGameSkin(gameKey) {
  const state = loadState()
  const gameSkins = ref(state[gameKey] || { owned: [getDefaultSkinId(gameKey)], active: getDefaultSkinId(gameKey) })

  const skins = GAME_SKINS[gameKey] || []
  const activeSkin = computed(() => {
    return skins.find(s => s.id === gameSkins.value.active) || skins[0]
  })
  const ownedSkinList = computed(() => {
    return skins.filter(s => gameSkins.value.owned.includes(s.id))
  })

  function selectSkin(skinId) {
    if (!gameSkins.value.owned.includes(skinId)) return
    gameSkins.value.active = skinId
    saveState(gameKey, gameSkins.value)
  }

  function buySkin(skinId, coins) {
    const skin = skins.find(s => s.id === skinId)
    if (!skin || skin.price <= 0) return { success: false }
    if (gameSkins.value.owned.includes(skinId)) return { success: false, alreadyOwned: true }
    if (coins < skin.price) return { success: false, notEnoughCoins: true }

    gameSkins.value.owned.push(skinId)
    gameSkins.value.active = skinId
    saveState(gameKey, gameSkins.value)
    return { success: true, cost: skin.price }
  }

  return {
    skins,
    activeSkin,
    ownedSkinList,
    selectSkin,
    buySkin,
    gameSkins,
  }
}

function getDefaultSkinId(gameKey) {
  const skins = GAME_SKINS[gameKey]
  return skins ? skins[0].id : ''
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveState(gameKey, gameState) {
  try {
    const all = loadState()
    all[gameKey] = gameState
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch (e) {
    console.warn('Game skin save failed:', e)
  }
}

// 导出皮肤定义供外部使用
export { GAME_SKINS }
