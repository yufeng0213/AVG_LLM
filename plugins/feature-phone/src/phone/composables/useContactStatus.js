/**
 * useContactStatus.js - 角色在线状态 & 个性签名
 * 在线状态从日程系统实时推导，签名由 LLM 根据角色性格生成并缓存
 */
import { ref } from 'vue'
import { kvStorage } from '../../../../../src/storage/index.js'
import { generatePhoneContactSignature } from '../../../../../src/llm/llmService.js'

const STORAGE_KEY_PREFIX = 'avg_llm_contact_sig_'

// 模块级缓存
let _signatureCache = {}
let _signatureCacheLoaded = false

async function loadSignatureCache() {
  if (_signatureCacheLoaded) return
  try {
    const allKeys = await kvStorage.keys() || []
    const sigKeys = allKeys.filter(k => typeof k === 'string' && k.startsWith(STORAGE_KEY_PREFIX))
    for (const key of sigKeys) {
      const val = await kvStorage.get(key)
      if (val) {
        const charId = key.replace(STORAGE_KEY_PREFIX, '')
        _signatureCache[charId] = val
      }
    }
  } catch (e) {
    // 兼容旧版 kvStorage 无 keys 方法
  }
  _signatureCacheLoaded = true
}

// 状态映射：日程活动类型 → 在线状态
const STATUS_MAP = {
  sleep: { label: '睡觉中', emoji: '😴', color: '#636e72', dotClass: 'dot-sleep' },
  work: { label: '工作中', emoji: '💼', color: '#e17055', dotClass: 'dot-busy' },
  study: { label: '学习中', emoji: '📖', color: '#e17055', dotClass: 'dot-busy' },
  class: { label: '上课中', emoji: '📚', color: '#e17055', dotClass: 'dot-busy' },
  training: { label: '训练中', emoji: '🏃', color: '#e17055', dotClass: 'dot-busy' },
  mission: { label: '执行任务', emoji: '🎯', color: '#e17055', dotClass: 'dot-busy' },
  meal: { label: '用餐中', emoji: '🍽️', color: '#fdcb6e', dotClass: 'dot-away' },
  social: { label: '外出社交', emoji: '👥', color: '#fdcb6e', dotClass: 'dot-away' },
  appointment: { label: '约会中', emoji: '❤️', color: '#fdcb6e', dotClass: 'dot-away' },
  hygiene: { label: '忙碌中', emoji: '🚿', color: '#636e72', dotClass: 'dot-busy' },
  leisure: { label: '在线', emoji: '😊', color: '#00b894', dotClass: 'dot-online' },
  hobby: { label: '在线', emoji: '🎨', color: '#00b894', dotClass: 'dot-online' },
  dorm_visit: { label: '在线', emoji: '🏠', color: '#00b894', dotClass: 'dot-online' },
}

const DEFAULT_STATUS = { label: '在线', emoji: '😊', color: '#00b894', dotClass: 'dot-online' }

function getStatusFromSchedule(activityType) {
  return STATUS_MAP[activityType] || DEFAULT_STATUS
}

export function useContactStatus() {
  const signatures = ref({ ..._signatureCache })

  // 获取角色在线状态
  function getOnlineStatus(activityType, canContact) {
    if (!canContact && activityType !== 'sleep') {
      const s = getStatusFromSchedule(activityType)
      return { label: '忙碌', emoji: '⛔', color: '#636e72', dotClass: 'dot-busy' }
    }
    return getStatusFromSchedule(activityType)
  }

  // 获取角色签名（优先缓存，无则返回空）
  function getSignature(charId) {
    return signatures.value[charId] || ''
  }

  // 生成并保存角色签名
  async function generateSignature(char) {
    if (!char?.id || !char?.name) return null
    try {
      const result = await generatePhoneContactSignature({
        contact: {
          id: char.id,
          name: char.name,
          identity: char.identity || '',
          personalityProfile: char.personalityProfile || '',
        },
        options: { temperature: 0.9, maxTokens: 80 },
      })

      if (result.success && result.signature) {
        signatures.value[char.id] = result.signature
        _signatureCache[char.id] = result.signature
        await kvStorage.set(STORAGE_KEY_PREFIX + char.id, result.signature)
        return result.signature
      }
    } catch (e) {
      console.warn('[ContactStatus] 签名生成失败:', e)
    }
    return null
  }

  // 批量生成所有联系人的签名
  async function generateAllSignatures(allChars) {
    const results = []
    for (const char of allChars) {
      if (!getSignature(char.id)) {
        const sig = await generateSignature(char)
        results.push(sig)
      }
    }
    return results
  }

  // 刷新指定角色的签名
  async function refreshSignature(char) {
    delete signatures.value[char.id]
    delete _signatureCache[char.id]
    await kvStorage.remove(STORAGE_KEY_PREFIX + char.id)
    return generateSignature(char)
  }

  return {
    signatures,
    getOnlineStatus,
    getSignature,
    generateSignature,
    generateAllSignatures,
    refreshSignature,
    loadSignatureCache,
  }
}
