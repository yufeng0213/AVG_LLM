/**
 * LLM 模块统一导出
 */

export {
  generateStory,
  generateFaceToFaceJointDialogues,
  generateCgPrompt,
  generateMiniTheater,
  generateCharacterSpeech,
  generateCardContent,
  generatePhoneSmsReply,
  generateDormChatReply,
  generatePhoneMomentsReplies,
  generatePhoneMomentsBatchReplies,
  generatePhoneForumPosts,
  generatePhoneNewsFeed,
  generatePhoneMapData,
  generatePhoneShopItems,
  generateDormShopItems,
  generateTaskBoardTasks,
  generateDormItemGiftReply,
  generateCharacterVisit,
  generateCharacterDiary,
  generateBackpackUseResult,
  generateHandheldBrickLevel,
  generateHandheldPetProfile,
  generateHandheldPetReply,
  generateHandheldDungeonScene,
  generateHandheldDungeonMap,
  generateHandheldDungeonBanter,
  generateHandheldCampfireCompanions,
  generateWorldBookOpeningDialogue,
  generateBedroomFurnitureItems,
  generateMerchantItems,
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
