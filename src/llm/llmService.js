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
  generateStoryTicket,
} from './llmService.core'

export {
  generatePhoneSmsReply,
  generatePhoneContactSignature,
  generatePhoneMomentsReply,
  generateGroupChatReply,
  generateDormChatReply,
  generatePhoneCallReply,
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
  generateRedditPosts,
  generateRedditCommentReplies,
} from './llmService.phone'

export {
  generateCharacterSchedule,
} from './llmService.schedule'

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

export {
  generateQuizQuestions,
  generateAssessmentQuestions,
  parseUrlContent,
  generateTeachingContent,
  generateTeachingReply,
  gradeAnswer,
  calculateRating,
} from './llmService.quiz'

export {
  generatePronunciationLesson,
  generatePronunciationTTS,
  parsePronunciationOutput,
} from './llmService.pronunciation'

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
  generateGroupChatReply,
  generateDormChatReply,
  generatePhoneCallReply,
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
  generateRedditPosts,
  generateRedditCommentReplies,
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
import {
  generateQuizQuestions,
  generateAssessmentQuestions,
  parseUrlContent,
  generateTeachingContent,
  generateTeachingReply,
  gradeAnswer,
  calculateRating,
} from './llmService.quiz'

import {
  generatePronunciationLesson,
  generatePronunciationTTS,
  parsePronunciationOutput,
} from './llmService.pronunciation'

export default {
  generateStory,
  generateFaceToFaceJointDialogues,
  generateCgPrompt,
  generateMiniTheater,
  generateCharacterSpeech,
  generateCardContent,
  generatePhoneSmsReply,
  generateGroupChatReply,
  generateDormChatReply,
  generatePhoneCallReply,
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
  generateRedditPosts,
  generateRedditCommentReplies,
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
  generateQuizQuestions,
  generateAssessmentQuestions,
  parseUrlContent,
  generateTeachingContent,
  generateTeachingReply,
  gradeAnswer,
  calculateRating,
  generatePronunciationLesson,
  generatePronunciationTTS,
  parsePronunciationOutput,
}
