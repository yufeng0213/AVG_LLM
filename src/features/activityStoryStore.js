/**
 * 活动故事存档管理
 * 处理活动专属剧情的存档隔离
 */

import { kvStorage } from '../storage/index.js'
import { getActiveWorldBookId, loadWorldBooks } from '../worldbook/worldBookStore.js'

// 存储键
const ACTIVITY_STORY_SAVES_KEY = 'activity_story_saves'

/**
 * 获取活动故事存档
 * @param {string} activityId - 活动 ID
 * @returns {Promise<Object|null>} 存档数据
 */
export const getActivityStorySave = async (activityId) => {
  try {
    const saves = await kvStorage.get(ACTIVITY_STORY_SAVES_KEY) || {}
    return saves[activityId] || null
  } catch {
    return null
  }
}

/**
 * 保存活动故事存档
 * @param {string} activityId - 活动 ID
 * @param {Object} saveData - 存档数据
 */
export const saveActivityStory = async (activityId, saveData) => {
  try {
    const saves = await kvStorage.get(ACTIVITY_STORY_SAVES_KEY) || {}
    saves[activityId] = {
      ...saveData,
      timestamp: Date.now()
    }
    await kvStorage.set(ACTIVITY_STORY_SAVES_KEY, saves)
  } catch (e) {
    console.error('[activityStoryStore] 保存失败:', e)
  }
}

/**
 * 删除活动故事存档
 * @param {string} activityId - 活动 ID
 */
export const deleteActivityStorySave = async (activityId) => {
  try {
    const saves = await kvStorage.get(ACTIVITY_STORY_SAVES_KEY) || {}
    delete saves[activityId]
    await kvStorage.set(ACTIVITY_STORY_SAVES_KEY, saves)
  } catch (e) {
    console.error('[activityStoryStore] 删除失败:', e)
  }
}

/**
 * 创建新的活动故事存档
 * @param {string} activityId - 活动 ID
 * @param {Object} storyConfig - 活动故事配置
 * @returns {Promise<Object>} 初始存档数据
 */
export const createNewActivityStorySave = async (activityId, storyConfig) => {
  const worldBookId = await getActiveWorldBookId()

  return {
    activityId,
    worldBookId,
    dialogueScript: [],
    currentLineIndex: 0,
    sceneCharacters: storyConfig.sceneCharacters || [],
    storyConfig,
    relationships: {},  // 活动独立的关系数据
    timestamp: Date.now()
  }
}

/**
 * 更新活动故事对话
 * @param {string} activityId - 活动 ID
 * @param {Array} dialogueScript - 对话脚本
 * @param {number} currentLineIndex - 当前行索引
 */
export const updateActivityStoryDialogue = async (activityId, dialogueScript, currentLineIndex) => {
  const save = await getActivityStorySave(activityId)
  if (!save) return

  save.dialogueScript = dialogueScript
  save.currentLineIndex = currentLineIndex
  save.timestamp = Date.now()

  await saveActivityStory(activityId, save)
}

/**
 * 获取活动故事上下文用于 Prompt
 * @param {Object} storyConfig - 活动故事配置
 * @returns {Object} Prompt 上下文
 */
export const buildActivityStoryPromptContext = (storyConfig) => {
  console.log('========================================')
  console.log('[activityStoryStore] buildActivityStoryPromptContext:')
  console.log('========================================')
  console.log('输入 storyConfig:', storyConfig)
  console.log('openingPrompt:', storyConfig?.openingPrompt)
  console.log('========================================')

  if (!storyConfig) return null

  const context = {
    title: storyConfig.title,
    openingPrompt: storyConfig.openingPrompt,
    mood: storyConfig.mood,
    sceneCharacters: storyConfig.sceneCharacters
  }

  console.log('[activityStoryStore] 输出 context:', context)

  return context
}