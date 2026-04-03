/**
 * 预设表情类型定义
 * 用于立绘配置中的表情标签选择
 */

export const EMOTION_PRESETS = [
  { id: 'default', label: '默认', description: '常规状态，无特殊表情' },
  { id: 'happy', label: '开心', description: '高兴、喜悦、微笑' },
  { id: 'angry', label: '生气', description: '愤怒、不满、恼火' },
  { id: 'sad', label: '悲伤', description: '难过、伤心、忧郁' },
  { id: 'surprised', label: '惊讶', description: '吃惊、意外、震惊' },
  { id: 'fear', label: '恐惧', description: '害怕、紧张、不安' },
  { id: 'disgust', label: '厌恶', description: '反感、嫌弃、不屑' },
  { id: 'neutral', label: '平静', description: '冷静、淡然、无表情' },
  { id: 'shy', label: '害羞', description: '腼腆、不好意思、脸红' },
  { id: 'thinking', label: '思考', description: '沉思、疑惑、考虑中' },
  { id: 'sleepy', label: '困倦', description: '疲惫、想睡、打哈欠' },
  { id: 'excited', label: '兴奋', description: '激动、期待、热血沸腾' },
  { id: 'worried', label: '担心', description: '忧虑、焦虑、不安' },
  { id: 'confident', label: '自信', description: '胸有成竹、从容、坚定' },
  { id: 'custom', label: '自定义', description: '用户自定义表情标签' },
]

/**
 * 根据表情ID获取预设信息
 * @param {string} emotionId - 表情标识符
 * @returns {Object|null} 预设表情对象
 */
export const getEmotionPreset = (emotionId) => {
  return EMOTION_PRESETS.find((preset) => preset.id === emotionId) || null
}

/**
 * 根据表情ID获取显示标签
 * @param {string} emotionId - 表情标识符
 * @returns {string} 显示标签
 */
export const getEmotionLabel = (emotionId) => {
  const preset = getEmotionPreset(emotionId)
  return preset?.label || '默认'
}

/**
 * 检查是否为有效的表情ID
 * @param {string} emotionId - 表情标识符
 * @returns {boolean}
 */
export const isValidEmotion = (emotionId) => {
  return EMOTION_PRESETS.some((preset) => preset.id === emotionId)
}