/**
 * feature-character-state 插件入口
 * 本模块为内部基础设施插件，不注册路由，仅暴露服务 API
 */
import * as characterStateStore from './services/characterStateStore.js'
import { useCharacterState } from './composable/useCharacterState.js'
import {
  CHARACTER_STATE_STORAGE_KEY,
  RELATIONSHIP_STAGES,
  MOOD_LABELS,
  createDefaultCharacterState,
  normalizeCharacterState,
  resolveStageFromAffection,
} from './types.js'

const Entry = {
  id: 'feature-character-state',

  mount() {
    return {
      type: 'internal',
      api: {
        ...characterStateStore,
        useCharacterState,
        constants: {
          CHARACTER_STATE_STORAGE_KEY,
          RELATIONSHIP_STAGES,
          MOOD_LABELS,
        },
        utils: {
          createDefaultCharacterState,
          normalizeCharacterState,
          resolveStageFromAffection,
        },
      },
    }
  },
}

export default Entry
