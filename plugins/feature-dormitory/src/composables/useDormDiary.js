/**
 * 寝室日记 Composable
 * 管理日记生成、存储、查看的所有逻辑
 *
 * @param {object} deps - 依赖项
 * @param {import('vue').Ref} deps.selectedCharacter - 当前选中的角色 ref
 * @param {import('vue').Ref} deps.selectedDormState - 寝室状态 ref
 * @param {import('vue').Ref} deps.dormRuntimeMap - 寝室运行时映射 ref
 * @param {import('vue').Ref} deps.selectedDormRuntimeKey - 当前寝室运行时 key ref
 * @param {import('vue').Ref} deps.actionFeedback - 操作反馈 ref
 * @param {import('vue').Ref} deps.activeDormOverlayPanelId - 当前展开的面板 ID ref
 * @param {import('vue').Ref} deps.isDormOverlayPanelExpanded - 面板是否展开 ref
 * @param {Function} deps.updateSelectedDormState - 更新寝室状态的函数
 * @param {import('vue').ComputedRef} deps.getActiveWorldBookId - 当前世界书 ID computed
 */

import { computed, ref } from 'vue'
import { generateCharacterDiary } from '../../../../src/llm'

// 日记状态
const showDiaryModal = ref(false)
const selectedDiary = ref(null)
const isGeneratingDiary = ref(false)
const lastGeneratedDiaryDate = ref(null)
const showDiaryGeneratingModal = ref(false)
const diaryGeneratingMessage = ref('')

export function useDormDiary(deps) {
  // 计算属性
  const diaryList = computed(() => {
    const key = String(deps.selectedDormRuntimeKey.value || '').trim()
    if (!key) return []
    const raw = deps.dormRuntimeMap.value[key]
    if (!raw || !raw.diaries) return []
    return Array.isArray(raw.diaries) ? raw.diaries : []
  })

  // 工具函数
  function getTodayDateString() {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  function formatDateForDiary(dateStr) {
    if (!dateStr) return ''
    try {
      const date = new Date(dateStr)
      if (isNaN(date.getTime())) return dateStr
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      return `${year}年${month}月${day}日`
    } catch {
      return dateStr
    }
  }

  function formatDiaryDetailDate(dateStr) {
    if (!dateStr) return '未知日期'
    try {
      return new Date(dateStr).toLocaleDateString('zh-CN')
    } catch {
      return dateStr
    }
  }

  function hasDiaryForDate(dateStr) {
    const key = String(deps.selectedDormRuntimeKey.value || '').trim()
    if (!key) return false
    const raw = deps.dormRuntimeMap.value[key]
    if (!raw || !raw.diaries || !Array.isArray(raw.diaries)) return false
    return raw.diaries.some(d => d.date && d.date.startsWith(dateStr))
  }

  function saveDiaryToDorm(diaryData) {
    const key = String(deps.selectedDormRuntimeKey.value || '').trim()
    if (!key) return

    const raw = deps.dormRuntimeMap.value[key]
    if (!raw) return

    const diaries = Array.isArray(raw.diaries) ? [...raw.diaries] : []

    const existingIndex = diaries.findIndex(d => d.date && d.date === diaryData.date)
    if (existingIndex >= 0) {
      diaries[existingIndex] = { ...diaries[existingIndex], ...diaryData }
    } else {
      diaries.push(diaryData)
    }

    diaries.sort((a, b) => {
      const dateA = a.date || ''
      const dateB = b.date || ''
      return dateB.localeCompare(dateA)
    })

    deps.updateSelectedDormState((state) => ({
      ...state,
      diaries,
    }))
  }

  // 面板操作
  function openDiaryDetail(diary) {
    if (!diary) return
    selectedDiary.value = diary
    deps.activeDormOverlayPanelId.value = 'diary-detail'
    deps.isDormOverlayPanelExpanded.value = true
  }

  function closeDiaryDetail() {
    deps.activeDormOverlayPanelId.value = 'diary'
    selectedDiary.value = null
  }

  function closeDiaryModal() {
    showDiaryModal.value = false
    selectedDiary.value = null
  }

  // 日记生成
  async function generateCharacterDiaryEntry(params = {}) {
    if (isGeneratingDiary.value) return null

    const character = params.character || deps.selectedCharacter.value
    if (!character) {
      console.warn('[日记生成] 没有可用角色')
      return null
    }

    const charName = String(character.name || character.label || '角色').trim()
    const charPersonality = String(character.personality || character.traits || character.description || '').trim()

    const worldBookId = deps.getActiveWorldBookId.value
    const worldBook = worldBookId ? null : null

    const key = String(deps.selectedDormRuntimeKey.value || '').trim()
    const raw = deps.dormRuntimeMap.value[key]
    const recentEvents = (raw && Array.isArray(raw.journal))
      ? raw.journal.slice(-10).map(j => ({ text: j.text || j.journalText || '' }))
      : []

    const currentDate = params.currentDate || getTodayDateString()

    isGeneratingDiary.value = true
    showDiaryGeneratingModal.value = true
    diaryGeneratingMessage.value = `正在为${charName}生成今天的日记，请稍候...`

    try {
      const result = await generateCharacterDiary({
        character: {
          name: charName,
          personality: charPersonality,
        },
        worldBook,
        recentEvents,
        currentDate,
        options: {
          temperature: 0.85,
        },
      })

      if (!result.success || !result.diary) {
        console.warn('[日记生成] 日记生成失败:', result.error)
        deps.actionFeedback.value = `日记生成失败：${result.error || '未知错误'}`
        return null
      }

      const diaryData = {
        id: `diary_${Date.now()}`,
        date: currentDate,
        title: result.diary.title || '无题',
        content: result.diary.content || '',
        mood: result.diary.mood || '平静',
        wordCount: result.diary.wordCount || result.diary.content?.length || 0,
      }

      saveDiaryToDorm(diaryData)
      lastGeneratedDiaryDate.value = currentDate
      deps.actionFeedback.value = `${charName}的日记已生成：「${diaryData.title}」`

      showDiaryGeneratingModal.value = false

      return diaryData
    } catch (error) {
      console.error('[日记生成] 发生错误:', error)
      deps.actionFeedback.value = `日记生成出错：${error.message || '未知错误'}`

      showDiaryGeneratingModal.value = false

      return null
    } finally {
      isGeneratingDiary.value = false
    }
  }

  async function checkAndGenerateDailyDiary() {
    if (!deps.selectedCharacter.value) {
      console.warn('[日记生成] 没有可用角色，跳过生成')
      return
    }

    const today = getTodayDateString()

    if (lastGeneratedDiaryDate.value === today) return

    if (hasDiaryForDate(today)) {
      lastGeneratedDiaryDate.value = today
      return
    }

    await generateCharacterDiaryEntry({ currentDate: today })
  }

  async function generateRandomDiaryDuringChat() {
    if (Math.random() > 0.2) return

    const today = getTodayDateString()

    if (hasDiaryForDate(today)) return
    if (isGeneratingDiary.value) return

    await generateCharacterDiaryEntry({ currentDate: today })
  }

  return {
    // 状态（供模板绑定）
    showDiaryModal,
    selectedDiary,
    isGeneratingDiary,
    lastGeneratedDiaryDate,
    showDiaryGeneratingModal,
    diaryGeneratingMessage,
    // 计算属性
    diaryList,
    // 工具函数
    formatDateForDiary,
    formatDiaryDetailDate,
    getTodayDateString,
    // 面板操作
    openDiaryDetail,
    closeDiaryDetail,
    closeDiaryModal,
    // 日记生成
    hasDiaryForDate,
    saveDiaryToDorm,
    generateCharacterDiaryEntry,
    checkAndGenerateDailyDiary,
    generateRandomDiaryDuringChat,
  }
}
