/**
 * useSmsMessaging — 短信消息渲染工具函数
 *
 * 将纯计算的渲染函数抽离，减少 PhoneSmsApp.vue 的 script 体积。
 * 语音播放、发送等深度依赖组件 refs 的逻辑保留在 PhoneSmsApp 中。
 */
export function useSmsMessaging() {
  /**
   * 解析文本中的表情包标记 [sticker:desc] 为渲染片段
   */
  function renderStickerText(text, stickers) {
    if (!text) return ''
    const stickerRegex = /\[sticker:([^\]]+)\]/g
    const parts = []
    let lastIndex = 0
    let match
    while ((match = stickerRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ type: 'text', text: text.slice(lastIndex, match.index) })
      }
      const desc = match[1]
      const url = stickers?.[desc]
      if (url) {
        parts.push({ type: 'sticker', desc, url })
      } else {
        parts.push({ type: 'text', text: match[0] })
      }
      lastIndex = match.index + match[0].length
    }
    if (lastIndex < text.length) {
      parts.push({ type: 'text', text: text.slice(lastIndex) })
    }
    return parts
  }

  /**
   * 解析文本中的 @ 提及标记
   */
  function renderMentionText(text) {
    if (!text) return ''
    const parts = []
    const regex = /(@[^\s@]+)/g
    const segments = text.split(regex)
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]
      if (regex.test(seg)) {
        parts.push({ type: 'mention', text: seg })
      } else if (seg) {
        parts.push({ type: 'text', text: seg })
      }
      regex.lastIndex = 0
    }
    return parts
  }

  /**
   * 获取联系人的可用表情包列表
   */
  function getAvailableStickers(contact) {
    const stickers = contact?.smsStickers || {}
    return Object.entries(stickers)
  }

  /**
   * 估算语音时长（秒）
   */
  function getVoiceDuration(msg) {
    const textLen = msg.voiceText?.length || 0
    return Math.max(1, Math.ceil(textLen / 4))
  }

  return {
    renderStickerText,
    renderMentionText,
    getAvailableStickers,
    getVoiceDuration,
  }
}
