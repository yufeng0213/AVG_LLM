// 默认心情触发规则配置

// 条件操作符
export const CONDITION_OPERATORS = {
  LT: 'lt',     // 小于
  LTE: 'lte',   // 小于等于
  GT: 'gt',     // 大于
  GTE: 'gte',   // 大于等于
  EQ: 'eq',     // 等于
  NEQ: 'neq',   // 不等于
}

// 触发类型
export const TRIGGER_TYPES = {
  NEED: 'need',           // 需求值条件
  STAT: 'stat',           // 统计值条件
  TIME: 'time',           // 时间条件
  ITEM: 'item',           // 物品使用
  FURNITURE: 'furniture', // 家具交互
  SOCIAL: 'social',       // 社交事件
  ENVIRONMENT: 'env',     // 环境条件
}

// 默认心情触发规则
export const DEFAULT_MOOD_RULES = [
  // ========== 需求类规则 ==========
  {
    id: 'rule-hunger-critical',
    name: '极度饥饿',
    triggerType: TRIGGER_TYPES.NEED,
    condition: {
      needType: 'hunger',
      operator: CONDITION_OPERATORS.LT,
      value: 20,
    },
    moodEffect: {
      label: '极度饥饿',
      description: '急需食物补充能量',
      modifier: -20,
      duration: 300,
      icon: '🥭',
      category: 'negative',
    },
    enabled: true,
    priority: 100,
  },
  {
    id: 'rule-hunger-very',
    name: '非常饥饿',
    triggerType: TRIGGER_TYPES.NEED,
    condition: {
      needType: 'hunger',
      operator: CONDITION_OPERATORS.LTE,
      value: 40,
    },
    moodEffect: {
      label: '非常饥饿',
      description: '肚子饿得咕咕叫',
      modifier: -12,
      duration: 300,
      icon: '🍽️',
      category: 'negative',
    },
    enabled: true,
    priority: 90,
  },
  {
    id: 'rule-hunger-slight',
    name: '有点饿',
    triggerType: TRIGGER_TYPES.NEED,
    condition: {
      needType: 'hunger',
      operator: CONDITION_OPERATORS.LTE,
      value: 60,
    },
    moodEffect: {
      label: '有点饿',
      description: '想吃点东西',
      modifier: -5,
      duration: 200,
      icon: '🍪',
      category: 'negative',
    },
    enabled: true,
    priority: 80,
  },
  {
    id: 'rule-hunger-full',
    name: '饱足',
    triggerType: TRIGGER_TYPES.NEED,
    condition: {
      needType: 'hunger',
      operator: CONDITION_OPERATORS.GTE,
      value: 80,
    },
    moodEffect: {
      label: '饱足',
      description: '吃得很满足',
      modifier: +5,
      duration: 200,
      icon: '😋',
      category: 'positive',
    },
    enabled: true,
    priority: 70,
  },

  // ========== 休息类规则 ==========
  {
    id: 'rule-rest-critical',
    name: '极度疲劳',
    triggerType: TRIGGER_TYPES.NEED,
    condition: {
      needType: 'rest',
      operator: CONDITION_OPERATORS.LT,
      value: 20,
    },
    moodEffect: {
      label: '极度疲劳',
      description: '需要立刻休息',
      modifier: -18,
      duration: 300,
      icon: '😩',
      category: 'negative',
    },
    enabled: true,
    priority: 100,
  },
  {
    id: 'rule-rest-tired',
    name: '很累',
    triggerType: TRIGGER_TYPES.NEED,
    condition: {
      needType: 'rest',
      operator: CONDITION_OPERATORS.LTE,
      value: 40,
    },
    moodEffect: {
      label: '很累',
      description: '身体有点疲惫',
      modifier: -10,
      duration: 250,
      icon: '😴',
      category: 'negative',
    },
    enabled: true,
    priority: 90,
  },
  {
    id: 'rule-rest-energetic',
    name: '精力充沛',
    triggerType: TRIGGER_TYPES.NEED,
    condition: {
      needType: 'rest',
      operator: CONDITION_OPERATORS.GTE,
      value: 80,
    },
    moodEffect: {
      label: '精力充沛',
      description: '精神焕发',
      modifier: +8,
      duration: 400,
      icon: '⚡',
      category: 'positive',
    },
    enabled: true,
    priority: 70,
  },

  // ========== 舒适类规则 ==========
  {
    id: 'rule-comfort-uncomfortable',
    name: '非常不适',
    triggerType: TRIGGER_TYPES.NEED,
    condition: {
      needType: 'comfort',
      operator: CONDITION_OPERATORS.LT,
      value: 30,
    },
    moodEffect: {
      label: '非常不适',
      description: '环境让人难受',
      modifier: -12,
      duration: 300,
      icon: '🥶',
      category: 'negative',
    },
    enabled: true,
    priority: 85,
  },
  {
    id: 'rule-comfort-slight',
    name: '有点不适',
    triggerType: TRIGGER_TYPES.NEED,
    condition: {
      needType: 'comfort',
      operator: CONDITION_OPERATORS.LTE,
      value: 50,
    },
    moodEffect: {
      label: '有点不适',
      description: '不太舒服',
      modifier: -5,
      duration: 200,
      icon: '😐',
      category: 'negative',
    },
    enabled: true,
    priority: 75,
  },
  {
    id: 'rule-comfort-comfortable',
    name: '舒适',
    triggerType: TRIGGER_TYPES.NEED,
    condition: {
      needType: 'comfort',
      operator: CONDITION_OPERATORS.GTE,
      value: 70,
    },
    moodEffect: {
      label: '舒适',
      description: '感觉很舒服',
      modifier: +6,
      duration: 300,
      icon: '🛋️',
      category: 'positive',
    },
    enabled: true,
    priority: 65,
  },

  // ========== 娱乐类规则 ==========
  {
    id: 'rule-joy-bored',
    name: '非常无聊',
    triggerType: TRIGGER_TYPES.NEED,
    condition: {
      needType: 'joy',
      operator: CONDITION_OPERATORS.LT,
      value: 20,
    },
    moodEffect: {
      label: '非常无聊',
      description: '需要娱乐活动',
      modifier: -10,
      duration: 250,
      icon: '🥱',
      category: 'negative',
    },
    enabled: true,
    priority: 80,
  },
  {
    id: 'rule-joy-happy',
    name: '快乐',
    triggerType: TRIGGER_TYPES.NEED,
    condition: {
      needType: 'joy',
      operator: CONDITION_OPERATORS.GTE,
      value: 70,
    },
    moodEffect: {
      label: '快乐',
      description: '心情愉悦',
      modifier: +5,
      duration: 300,
      icon: '😊',
      category: 'positive',
    },
    enabled: true,
    priority: 70,
  },

  // ========== 社交类规则 ==========
  {
    id: 'rule-social-lonely',
    name: '极度孤独',
    triggerType: TRIGGER_TYPES.NEED,
    condition: {
      needType: 'social',
      operator: CONDITION_OPERATORS.LT,
      value: 20,
    },
    moodEffect: {
      label: '极度孤独',
      description: '渴望交流',
      modifier: -15,
      duration: 350,
      icon: '💔',
      category: 'negative',
    },
    enabled: true,
    priority: 85,
  },
  {
    id: 'rule-social-slight',
    name: '有点孤独',
    triggerType: TRIGGER_TYPES.NEED,
    condition: {
      needType: 'social',
      operator: CONDITION_OPERATORS.LTE,
      value: 40,
    },
    moodEffect: {
      label: '有点孤独',
      description: '想和人聊天',
      modifier: -8,
      duration: 200,
      icon: '🥺',
      category: 'negative',
    },
    enabled: true,
    priority: 75,
  },
  {
    id: 'rule-social-satisfied',
    name: '社交满足',
    triggerType: TRIGGER_TYPES.NEED,
    condition: {
      needType: 'social',
      operator: CONDITION_OPERATORS.GTE,
      value: 70,
    },
    moodEffect: {
      label: '社交满足',
      description: '人际关系良好',
      modifier: +6,
      duration: 300,
      icon: '👥',
      category: 'positive',
    },
    enabled: true,
    priority: 65,
  },

  // ========== 工作类规则 ==========
  {
    id: 'rule-work-frustrated',
    name: '工作沮丧',
    triggerType: TRIGGER_TYPES.NEED,
    condition: {
      needType: 'work_satisfaction',
      operator: CONDITION_OPERATORS.LT,
      value: 20,
    },
    moodEffect: {
      label: '工作沮丧',
      description: '工作让人心烦',
      modifier: -8,
      duration: 200,
      icon: '😤',
      category: 'negative',
    },
    enabled: true,
    priority: 70,
  },
  {
    id: 'rule-work-satisfied',
    name: '工作满足',
    triggerType: TRIGGER_TYPES.NEED,
    condition: {
      needType: 'work_satisfaction',
      operator: CONDITION_OPERATORS.GTE,
      value: 70,
    },
    moodEffect: {
      label: '工作满足',
      description: '工作让人有成就感',
      modifier: +5,
      duration: 300,
      icon: '💼',
      category: 'positive',
    },
    enabled: true,
    priority: 60,
  },

  // ========== 时间类规则 ==========
  {
    id: 'rule-time-night',
    name: '夜深人静',
    triggerType: TRIGGER_TYPES.TIME,
    condition: {
      timePhase: 'night',
    },
    moodEffect: {
      label: '夜深人静',
      description: '安静的夜晚',
      modifier: -3,
      duration: -1,  // 持续到时间变化
      icon: '🌙',
      category: 'neutral',
    },
    enabled: true,
    priority: 30,
  },
  {
    id: 'rule-time-morning',
    name: '清晨',
    triggerType: TRIGGER_TYPES.TIME,
    condition: {
      timePhase: 'morning',
    },
    moodEffect: {
      label: '清晨',
      description: '新的一天开始了',
      modifier: +2,
      duration: -1,
      icon: '🌅',
      category: 'positive',
    },
    enabled: true,
    priority: 30,
  },

  // ========== 环境类规则 ==========
  {
    id: 'rule-env-dark',
    name: '光线不足',
    triggerType: TRIGGER_TYPES.ENVIRONMENT,
    condition: {
      envType: 'lightLevel',
      operator: CONDITION_OPERATORS.LT,
      value: 0.5,
    },
    moodEffect: {
      label: '光线不足',
      description: '房间太暗了',
      modifier: -3,
      duration: 200,
      icon: '🌑',
      category: 'negative',
    },
    enabled: true,
    priority: 40,
  },
]

// 家具心情效果模板
export const FURNITURE_MOOD_EFFECT_TEMPLATES = {
  // 睡眠类家具
  sleep: {
    good: {
      label: '睡得很好',
      description: '舒适的床铺让人休息充分',
      modifier: +10,
      duration: 400,
      icon: '🛏️',
    },
    bad: {
      label: '睡得很差',
      description: '床铺不舒服',
      modifier: -8,
      duration: 300,
      icon: '💤',
    },
  },
  // 餐饮类家具
  food: {
    good: {
      label: '美味的食物',
      description: '吃得很满足',
      modifier: +6,
      duration: 200,
      icon: '🍽️',
    },
    bad: {
      label: '糟糕的食物',
      description: '味道不太好',
      modifier: -4,
      duration: 150,
      icon: '🤢',
    },
  },
  // 工作类家具
  work: {
    complete: {
      label: '完成工作',
      description: '完成了任务很有成就感',
      modifier: +6,
      duration: 300,
      icon: '✅',
    },
    fail: {
      label: '工作失败',
      description: '任务失败让人沮丧',
      modifier: -8,
      duration: 400,
      icon: '❌',
    },
  },
  // 社交类家具
  social: {
    chat: {
      label: '愉快的聊天',
      description: '和朋友聊天很开心',
      modifier: +5,
      duration: 200,
      icon: '💬',
    },
  },
  // 娱乐类家具
  joy: {
    play: {
      label: '玩得很开心',
      description: '娱乐活动让人放松',
      modifier: +8,
      duration: 250,
      icon: '🎮',
    },
  },
  // 装饰类家具（持续效果）
  decor: {
    beautiful: {
      label: '美观的装饰',
      description: '漂亮的装饰让人心情愉悦',
      modifier: +3,
      duration: -1,  // 永久持续
      icon: '🎨',
      effectType: 'onPlace',  // 放置时生效
    },
  },
}

// 社交事件心情模板
export const SOCIAL_MOOD_EFFECTS = {
  praise: {
    label: '被表扬了',
    description: '受到他人的赞赏',
    modifier: +8,
    duration: 300,
    icon: '🌟',
  },
  insult: {
    label: '被冒犯了',
    description: '被他人言语伤害',
    modifier: -10,
    duration: 500,
    icon: '💢',
  },
  chat: {
    label: '愉快的谈话',
    description: '和朋友聊得很开心',
    modifier: +5,
    duration: 200,
    icon: '😊',
  },
  newFriend: {
    label: '结识新朋友',
    description: '认识了新的人',
    modifier: +4,
    duration: 600,
    icon: '👋',
  },
}