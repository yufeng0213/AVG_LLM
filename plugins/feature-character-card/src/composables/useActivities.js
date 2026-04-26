import { ref, computed } from 'vue'
import { kvStorage } from '../../../../src/storage/index.js'
import { registerMissions, getProgress, getAllProgress, claimMission } from '../../../../src/features/activityTaskTracker.js'

const SIGNUP_PREFIX = 'avg_llm_activity_signup_'
const MISSION_CLAIM_PREFIX = 'avg_llm_activity_mission_claim_'
const ACTIVITY_STATE_PREFIX = 'avg_llm_activity_state_'

function signupKey(activityId) {
  return SIGNUP_PREFIX + activityId
}

function missionClaimKey(activityId, missionId) {
  return MISSION_CLAIM_PREFIX + activityId + '_' + missionId
}

function stateKey(activityId) {
  return ACTIVITY_STATE_PREFIX + activityId
}

export function useActivities() {
  const loading = ref(false)
  const error = ref(null)

  /**
   * 加载活动签到进度
   * 返回 { day: lastSignupTimestamp }
   */
  async function loadSignupProgress(activityId) {
    const data = await kvStorage.get(signupKey(activityId))
    return data || {}
  }

  /**
   * 每日签到
   * 返回 { success, day, reward, error }
   */
  async function doDailySignup(activityId, signupConfig) {
    const progress = await loadSignupProgress(activityId)
    const now = Date.now()
    const oneDay = 24 * 60 * 60 * 1000

    // 找今天可以签到的最大天数
    let dayToClaim = null
    for (const entry of signupConfig) {
      const day = entry.day
      const lastClaim = progress[day] || 0
      if (now - lastClaim >= oneDay && !progress[day + '_claimed']) {
        if (!dayToClaim || day > dayToClaim) {
          dayToClaim = day
        }
      }
    }

    if (!dayToClaim) {
      return { success: false, error: '今天没有可领取的签到' }
    }

    const entry = signupConfig.find(s => s.day === dayToClaim)
    progress[dayToClaim] = now
    await kvStorage.set(signupKey(activityId), progress)

    return {
      success: true,
      day: dayToClaim,
      reward: entry.reward,
    }
  }

  /**
   * 检查是否可以签到
   */
  async function canSignupToday(activityId, signupConfig) {
    const progress = await loadSignupProgress(activityId)
    const now = Date.now()
    const oneDay = 24 * 60 * 60 * 1000

    for (const entry of signupConfig) {
      const day = entry.day
      const lastClaim = progress[day] || 0
      if (now - lastClaim >= oneDay && !progress[day + '_claimed']) {
        return true
      }
    }
    return false
  }

  /**
   * 获取已签到天数
   */
  async function getSignedUpDays(activityId) {
    const progress = await loadSignupProgress(activityId)
    return Object.keys(progress).filter(k => !k.endsWith('_claimed'))
  }

  /**
   * 注册活动任务到追踪器
   */
  function registerActivityMissions(activityId, missions) {
    registerMissions(activityId, missions)
  }

  /**
   * 领取任务奖励
   */
  async function claimMissionReward(activityId, missionId, reward) {
    const prog = getProgress(activityId, missionId)
    if (!prog.completed || prog.claimed) {
      return { success: false, error: '任务未完成或已领取' }
    }

    // 标记已领取
    claimMission(activityId, missionId)
    await kvStorage.set(missionClaimKey(activityId, missionId), { claimedAt: Date.now() })

    // 发放奖励
    const { economy } = window.__avgLLM?.economy || {}
    const { updateEconomy } = window.__avgLLM?.economy || {}

    if (updateEconomy && reward) {
      updateEconomy(prev => {
        const next = { ...prev }
        if (reward.crystals) next.crystals = (prev.crystals || 0) + reward.crystals
        if (reward.coins) next.coins = (prev.coins || 0) + reward.coins
        return next
      })
    }

    return { success: true, reward }
  }

  /**
   * 查询任务是否已领取
   */
  async function isMissionClaimed(activityId, missionId) {
    const prog = getProgress(activityId, missionId)
    return prog.claimed || false
  }

  /**
   * 加载活动完整状态
   */
  async function loadActivityState(activityId, missions = [], signupConfig = []) {
    loading.value = true
    error.value = null
    try {
      // 注册任务
      if (missions.length > 0) {
        registerActivityMissions(activityId, missions)
      }

      const missionsWithProgress = missions.map(m => ({
        ...m,
        ...getProgress(activityId, m.id),
      }))

      const signedDays = await getSignedUpDays(activityId)
      const todayCanSignup = await canSignupToday(activityId, signupConfig)

      return {
        missions: missionsWithProgress,
        signedDays,
        todayCanSignup,
      }
    } catch (e) {
      error.value = e.message
      return null
    } finally {
      loading.value = false
    }
  }

  return {
    loading,
    error,
    loadSignupProgress,
    doDailySignup,
    canSignupToday,
    getSignedUpDays,
    registerActivityMissions,
    claimMissionReward,
    isMissionClaimed,
    loadActivityState,
  }
}
