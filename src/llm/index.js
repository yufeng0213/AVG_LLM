/**
 * LLM 模块统一导出
 */

export {
  generateStory,
  generateCgPrompt,
  generateMiniTheater,
  generateCharacterSpeech,
  generateCardContent,
  generatePhoneSmsReply,
  generatePhoneMomentsReplies,
  generatePhoneMomentsBatchReplies,
  generatePhoneForumPosts,
  generatePhoneNewsFeed,
  generatePhoneMapData,
  generatePhoneShopItems,
  generateBackpackUseResult,
  generateHandheldBrickLevel,
  generateHandheldPetProfile,
  generateHandheldPetReply,
  generateHandheldDungeonScene,
  generateHandheldDungeonMap,
  generateHandheldDungeonBanter,
  generateHandheldCampfireCompanions,
  generateWorldBookOpeningDialogue,
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
