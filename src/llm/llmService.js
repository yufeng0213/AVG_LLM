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
  generatePhoneMomentsReplies,
  generatePhoneMomentsBatchReplies,
  generatePhoneForumPosts,
  generatePhoneNewsFeed,
  generatePhoneMapData,
  generatePhoneShopItems,
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
  generatePhoneMomentsReplies,
  generatePhoneMomentsBatchReplies,
  generatePhoneForumPosts,
  generatePhoneNewsFeed,
  generatePhoneMapData,
  generatePhoneShopItems,
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
  generateHandheldBrickLevel,
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
