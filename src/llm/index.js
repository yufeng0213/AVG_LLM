/**
 * LLM 模块统一导出
 */

export {
  generateStory,
  generatePhoneSmsReply,
  generatePhoneMomentsReplies,
  generatePhoneMomentsBatchReplies,
  getActiveApiConfig,
} from './llmService'
export { buildStoryPrompt, buildQuickPrompt } from './promptGenerator'
export {
  parseStoryContent,
  validateDialogue,
  toGameScript,
  extractHighlightCharacters,
  getEmotionDisplayLabel,
  createDialogueSummary,
  hasChoices,
  extractChoices,
} from './storyParser'
