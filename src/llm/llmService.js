/**
 * LLM 服务模块聚合入口
 * 保留原导入路径：./llmService
 */

export {
  getActiveApiConfig,
  generateStory,
  generateFaceToFaceJointDialogues,
  generateCgPrompt,
  generateMiniTheater,
  generateCharacterSpeech,
  generateCardContent,
} from './llmService.core'

export {
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
} from './llmService.phone'

export {
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
} from './llmService.handheld'

import {
  getActiveApiConfig,
  generateStory,
  generateFaceToFaceJointDialogues,
  generateCgPrompt,
  generateMiniTheater,
  generateCharacterSpeech,
  generateCardContent,
} from './llmService.core'
import {
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
} from './llmService.phone'
import {
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
} from './llmService.handheld'

export default {
  generateStory,
  generateFaceToFaceJointDialogues,
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
  generateDormShopItems,
  generateTaskBoardTasks,
  generateDormItemGiftReply,
  generateCharacterVisit,
  generateCharacterDiary,
  generateHandheldPetProfile,
  generateHandheldPetReply,
  generateHandheldDungeonMap,
  generateHandheldDungeonScene,
  generateHandheldDungeonBanter,
  generateHandheldCampfireCompanions,
  generateWorldBookOpeningDialogue,
  generateBedroomFurnitureItems,
  generateMerchantItems,
  generateBackpackUseResult,
  getActiveApiConfig,
}
