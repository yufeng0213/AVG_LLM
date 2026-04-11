
<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  getActiveWorldBookId,
  loadWorldBooks,
  setActiveWorldBookId,
} from '../../../src/worldbook/worldBookStore.js'
import { generatePhoneSmsReply } from '../../../src/llm'
import { isAndroid } from '../../../src/utils/platform.js'
import PolaroidCameraScreen from './PolaroidCameraScreen.vue'

const emit = defineEmits(['back'])

const VIEW_BOOK_CARD = 'book-card'
const VIEW_CHARACTER_GRID = 'character-grid'
const VIEW_CHARACTER_ROOM = 'character-room'

const DEFAULT_PORTRAIT_PATH = './data/lihui/default.png'
const DORM_RUNTIME_STORAGE_KEY = 'avg_llm_dormitory_runtime_v1'
const DORM_DRIFT_BOTTLE_POOL_STORAGE_KEY = 'avg_llm_dormitory_drift_bottle_pool_v1'
const DORM_AFFECTION_MIN = 0
const DORM_AFFECTION_MAX = 100
const DORM_ENERGY_MIN = 0
const DORM_ENERGY_MAX = 100
const DORM_JOURNAL_LIMIT = 18
const DORM_CHAT_HISTORY_LIMIT = 24
const CARD_SWIPE_TRIGGER_PX = 52
const DORM_SCENE_FACILITY_MIN_LEVEL = 1
const DORM_SCENE_FACILITY_MAX_LEVEL = 5
const DORM_SCENE_FACILITY_BONUS_STEP = 0.12
const DORM_SCENE_FACILITY_UPGRADE_ENERGY_COST = 12
const DORM_TIME_SLOT_LABELS = ['早晨', '午后', '夜晚']
const DORM_TIME_SLOT_IDS = ['morning', 'afternoon', 'night']
const DORM_TIME_SLOT_COUNT = DORM_TIME_SLOT_LABELS.length
const DORM_DAILY_WISH_COUNT = 2
const DORM_WARDROBE_MAX_COINS = 9999
const DORM_WARDROBE_START_COINS = 180
const DORM_WARDROBE_DAILY_COINS = 35
const DORM_DRIFT_BOTTLE_POOL_LIMIT = 200
const DORM_DRIFT_BOTTLE_INBOX_LIMIT = 24
const DORM_DRIFT_BOTTLE_SEEN_LIMIT = 360
const DORM_DRIFT_BOTTLE_TEXT_LIMIT = 140
const DORM_DRIFT_BOTTLE_REPLY_TEXT_LIMIT = 180
const DORM_DRIFT_BOTTLE_FEEDBACK_TEXT_LIMIT = 30
const DORM_DRIFT_BOTTLE_FOLLOW_UP_LIMIT = 3
const DORM_DRIFT_BOTTLE_DAILY_THROW_LIMIT = 1
const DORM_DRIFT_BOTTLE_DAILY_PICK_LIMIT = 3
const DORM_RELATIONSHIP_STAGE_LIBRARY = [
  { id: 'stranger', label: '陌生', minAffection: 0 },
  { id: 'familiar', label: '熟悉', minAffection: 30 },
  { id: 'intimate', label: '亲密', minAffection: 60 },
  { id: 'bond', label: '羁绊', minAffection: 82 },
]
const DORM_RELATIONSHIP_STAGE_ID_SET = new Set(DORM_RELATIONSHIP_STAGE_LIBRARY.map((stage) => stage.id))
const DORM_RELATIONSHIP_STAGE_INDEX_MAP = DORM_RELATIONSHIP_STAGE_LIBRARY.reduce((accumulator, stage, index) => {
  accumulator[stage.id] = index
  return accumulator
}, {})

const DORM_EVENT_LIBRARY = [
  {
    id: 'night-rain',
    title: '夜雨停电',
    description: '寝室突然停电，窗外下着雨。',
    options: [
      { id: 'talk', label: '点蜡烛聊天', affectionDelta: 8, energyDelta: -5, mood: '温暖', message: '你和{char}在烛光下聊到深夜。' },
      { id: 'fix', label: '去修电路', affectionDelta: 4, energyDelta: -10, mood: '敬佩', message: '{char}对你的动手能力刮目相看。' },
    ],
  },
  {
    id: 'weekend-plan',
    title: '周末安排',
    description: '{char}问你周末要不要一起行动。',
    options: [
      { id: 'movie', label: '一起看电影', affectionDelta: 7, energyDelta: -4, mood: '开心', message: '你们挑了一部老片，笑到停不下来。' },
      { id: 'study', label: '一起学习', affectionDelta: 5, energyDelta: -6, mood: '专注', message: '你们并排坐着，安静地做完了计划。' },
    ],
  },
  {
    id: 'late-snack',
    title: '深夜加餐',
    description: '桌上只剩最后一份夜宵。',
    options: [
      { id: 'give', label: '让给对方', affectionDelta: 9, energyDelta: -3, mood: '心动', message: '{char}明显有些不好意思，却很开心。' },
      { id: 'share', label: '一人一半', affectionDelta: 6, energyDelta: -2, mood: '放松', message: '你们一边分食一边吐槽今天发生的事。' },
    ],
  },
]

const DORM_ARCHETYPE_LABELS = {
  introvert: '内倾',
  extrovert: '外向',
  analytical: '理性',
  emotional: '感性',
  orderly: '秩序',
  spontaneous: '随性',
  creative: '创意',
  active: '行动',
  social: '社交',
  quiet: '静心',
  balanced: '均衡',
}

const DORM_TAG_ARCHETYPE_RULES = [
  { archetype: 'introvert', keywords: ['内向', 'i人', '沉稳', '安静', '孤僻', 'introvert'] },
  { archetype: 'extrovert', keywords: ['外向', 'e人', '热情', '开朗', '健谈', 'extrovert'] },
  { archetype: 'analytical', keywords: ['理性', '逻辑', '冷静', '分析', '策略', 'scientific', 'logic'] },
  { archetype: 'emotional', keywords: ['温柔', '共情', '敏感', '感性', '体贴', 'empathetic'] },
  { archetype: 'orderly', keywords: ['严谨', '守序', '计划', '自律', '条理', 'organized'] },
  { archetype: 'spontaneous', keywords: ['随性', '自由', '冒险', '冲动', '即兴', 'spontaneous'] },
  { archetype: 'creative', keywords: ['想象', '创作', '灵感', '脑洞', '艺术', 'creative'] },
  { archetype: 'active', keywords: ['好动', '运动', '行动派', '执行力', 'active'] },
  { archetype: 'social', keywords: ['社交', '合群', '交际', '朋友多', 'social'] },
  { archetype: 'quiet', keywords: ['安静', '独处', '沉思', '冥想', 'quiet'] },
]

const DORM_BASE_SUB_SCENE = {
  id: 'shared-living-zone',
  name: '共享生活区',
  subtitle: '通用',
  ambience: '{char}把常用物品都摆在触手可及的位置，整个寝室看起来很有生活感。',
  decor: ['软垫沙发', '小夜灯', '共享置物架'],
  archetypes: ['balanced'],
  activityPool: [
    {
      id: 'shared-snack',
      label: '一起加餐',
      affectionDelta: 3,
      energyDelta: 7,
      mood: '满足',
      journalText: '你和{char}在共享生活区吃了点夜宵。',
      feedbackText: '你们都恢复了一些状态。',
    },
    {
      id: 'shared-cleanup',
      label: '整理收纳',
      affectionDelta: 2,
      energyDelta: -3,
      mood: '清爽',
      journalText: '你和{char}把生活区收拾得井井有条。',
      feedbackText: '寝室环境变得更舒适了。',
    },
  ],
}

const DORM_SUB_SCENE_LIBRARY = [
  {
    id: 'strategy-desk',
    name: '策略书桌',
    subtitle: '推演',
    ambience: '{char}的桌面铺满计划便签，连杯垫都按用途分好了。',
    decor: ['战术板', '计划便签', '计时器'],
    archetypes: ['analytical', 'orderly', 'introvert'],
    activityPool: [
      {
        id: 'plan-session',
        label: '共同排计划',
        affectionDelta: 4,
        energyDelta: -5,
        mood: '专注',
        journalText: '你和{char}在策略书桌前完成了下一周计划。',
        feedbackText: '配合变得更默契了。',
      },
      {
        id: 'data-review',
        label: '复盘记录',
        affectionDelta: 3,
        energyDelta: -4,
        mood: '冷静',
        journalText: '你和{char}复盘了最近的行动记录。',
        feedbackText: '很多细节被重新理顺。',
      },
    ],
  },
  {
    id: 'sun-balcony',
    name: '阳台温室',
    subtitle: '疗愈',
    ambience: '阳台上养着几盆耐心照料的植物，{char}总会在这里放慢节奏。',
    decor: ['绿植架', '折叠躺椅', '香薰灯'],
    archetypes: ['quiet', 'emotional', 'introvert'],
    activityPool: [
      {
        id: 'water-plants',
        label: '一起浇花',
        affectionDelta: 5,
        energyDelta: 8,
        mood: '治愈',
        journalText: '你和{char}在阳台温室给植物浇了水。',
        feedbackText: '空气都变得柔和了。',
      },
      {
        id: 'tea-break',
        label: '安静喝茶',
        affectionDelta: 4,
        energyDelta: 10,
        mood: '平和',
        journalText: '你和{char}在阳台边喝茶边发呆。',
        feedbackText: '你们都放松下来。',
      },
    ],
  },
  {
    id: 'music-corner',
    name: '留声角',
    subtitle: '创作',
    ambience: '{char}把耳机和乐谱摆得很随性，灵感常常在这里冒出来。',
    decor: ['复古唱机', '便携键盘', '灵感手账'],
    archetypes: ['creative', 'emotional', 'spontaneous'],
    activityPool: [
      {
        id: 'jam',
        label: '即兴合奏',
        affectionDelta: 6,
        energyDelta: -6,
        mood: '兴奋',
        journalText: '你和{char}在留声角来了一段即兴合奏。',
        feedbackText: '现场气氛非常上头。',
      },
      {
        id: 'lyrics',
        label: '写一段歌词',
        affectionDelta: 5,
        energyDelta: -4,
        mood: '投入',
        journalText: '你和{char}一起写下了一段歌词。',
        feedbackText: '灵感状态很好。',
      },
    ],
  },
  {
    id: 'training-zone',
    name: '体能区',
    subtitle: '行动',
    ambience: '靠墙的训练器材被擦得发亮，{char}随时都能开练。',
    decor: ['拉伸垫', '壶铃', '计步屏'],
    archetypes: ['active', 'extrovert', 'social'],
    activityPool: [
      {
        id: 'quick-train',
        label: '十分钟训练',
        affectionDelta: 4,
        energyDelta: -8,
        mood: '燃',
        journalText: '你和{char}在体能区完成了一组训练。',
        feedbackText: '状态被点燃了。',
      },
      {
        id: 'stretch',
        label: '拉伸放松',
        affectionDelta: 3,
        energyDelta: 9,
        mood: '舒展',
        journalText: '你和{char}做了完整的拉伸。',
        feedbackText: '身体轻松了很多。',
      },
    ],
  },
  {
    id: 'tea-salon',
    name: '会客茶座',
    subtitle: '社交',
    ambience: '{char}把茶具和杯垫准备得很齐全，这里总有聊不完的话题。',
    decor: ['圆桌', '双人茶具', '留言便签墙'],
    archetypes: ['social', 'emotional', 'extrovert'],
    activityPool: [
      {
        id: 'long-chat',
        label: '深聊近况',
        affectionDelta: 6,
        energyDelta: -5,
        mood: '亲近',
        journalText: '你和{char}在会客茶座聊了很久。',
        feedbackText: '关系明显更近一步。',
      },
      {
        id: 'share-story',
        label: '交换故事',
        affectionDelta: 5,
        energyDelta: -3,
        mood: '温暖',
        journalText: '你和{char}交换了各自的旧故事。',
        feedbackText: '你们更懂彼此了。',
      },
    ],
  },
  {
    id: 'craft-workbench',
    name: '手作工坊',
    subtitle: '手工',
    ambience: '工具墙挂得整整齐齐，{char}会在这里把想法做成实体。',
    decor: ['工具墙', '零件盒', '防割桌垫'],
    archetypes: ['creative', 'analytical', 'orderly'],
    activityPool: [
      {
        id: 'build-gift',
        label: '制作小礼物',
        affectionDelta: 7,
        energyDelta: -7,
        mood: '成就',
        journalText: '你和{char}在手作工坊完成了一份小礼物。',
        feedbackText: '这份心意很有分量。',
      },
      {
        id: 'repair-item',
        label: '修理物件',
        affectionDelta: 4,
        energyDelta: -5,
        mood: '踏实',
        journalText: '你和{char}修好了一个坏掉的小物件。',
        feedbackText: '动手之后特别有成就感。',
      },
    ],
  },
]

const DORM_SUB_SCENE_EVENT_LIBRARY = {
  'shared-living-zone': [
    {
      id: 'shared-midnight-guest',
      title: '午夜访客',
      description: '共享生活区忽然传来敲门声，{char}看向你示意要不要开门。',
      options: [
        { id: 'open', label: '一起开门看看', affectionDelta: 5, energyDelta: -4, mood: '紧张', message: '你和{char}一起确认了来人身份。' },
        { id: 'ignore', label: '先不开门', affectionDelta: 3, energyDelta: 5, mood: '安心', message: '你和{char}决定先观察，避免冒险。' },
      ],
    },
  ],
  'strategy-desk': [
    {
      id: 'strategy-overlap',
      title: '计划重叠',
      description: '{char}发现两份任务时间冲突，你们需要在策略书桌上快速重排优先级。',
      options: [
        { id: 'strict', label: '按优先级硬切', affectionDelta: 6, energyDelta: -7, mood: '果断', message: '你们快速完成了重排，效率很高。' },
        { id: 'smooth', label: '温和协调过渡', affectionDelta: 5, energyDelta: -4, mood: '稳妥', message: '你和{char}保留了主要安排，节奏更平稳。' },
      ],
    },
  ],
  'sun-balcony': [
    {
      id: 'balcony-rainbow',
      title: '雨后微光',
      description: '阳台温室刚下过雨，{char}指着叶片上的水珠让你靠近看看。',
      options: [
        { id: 'photo', label: '拍照留念', affectionDelta: 5, energyDelta: 7, mood: '惬意', message: '你和{char}拍下了雨后最亮的那一刻。' },
        { id: 'repot', label: '趁机换盆', affectionDelta: 4, energyDelta: -3, mood: '专注', message: '你们一起给植物换了更合适的花盆。' },
      ],
    },
  ],
  'music-corner': [
    {
      id: 'music-melody',
      title: '旋律卡壳',
      description: '留声角的旋律进行到副歌突然卡住，{char}把选择权交给你。',
      options: [
        { id: 'high-note', label: '改成高音推进', affectionDelta: 7, energyDelta: -6, mood: '激昂', message: '你和{char}把副歌推向了更高的情绪。' },
        { id: 'soft-note', label: '改成轻声段落', affectionDelta: 5, energyDelta: -3, mood: '沉浸', message: '你们把旋律改得更耐听，也更贴近心情。' },
      ],
    },
  ],
  'training-zone': [
    {
      id: 'training-challenge',
      title: '加练挑战',
      description: '体能区计时器突然亮起挑战模式，{char}问你要不要冲一把。',
      options: [
        { id: 'push', label: '全力冲刺', affectionDelta: 6, energyDelta: -10, mood: '热血', message: '你和{char}咬牙完成了高强度挑战。' },
        { id: 'steady', label: '控制节奏', affectionDelta: 4, energyDelta: -4, mood: '稳定', message: '你们保持了稳定输出，节奏非常均匀。' },
      ],
    },
  ],
  'tea-salon': [
    {
      id: 'tea-salon-topic',
      title: '话题岔路',
      description: '会客茶座里，{char}突然问起一个有些敏感的话题。',
      options: [
        { id: 'honest', label: '直接坦白', affectionDelta: 8, energyDelta: -5, mood: '信任', message: '你和{char}坦诚交换了彼此的真实想法。' },
        { id: 'gentle', label: '慢慢试探', affectionDelta: 5, energyDelta: -2, mood: '温和', message: '你选择了更轻缓的节奏，让对话更舒适。' },
      ],
    },
  ],
  'craft-workbench': [
    {
      id: 'workbench-part',
      title: '关键零件',
      description: '手作工坊里少了一个关键零件，{char}看向你等待决定。',
      options: [
        { id: 'improvise', label: '现场改造替代', affectionDelta: 7, energyDelta: -8, mood: '兴奋', message: '你和{char}靠临场发挥把方案做成了。' },
        { id: 'pause', label: '暂停并优化图纸', affectionDelta: 4, energyDelta: -2, mood: '踏实', message: '你们先优化了图纸，后续执行更稳。' },
      ],
    },
  ],
}

const DORM_EVENT_CHAIN_LIBRARY = [
  {
    id: 'storm-blackout-chain',
    title: '暴雨停电',
    minRelationshipStage: 'familiar',
    archetypes: ['analytical', 'orderly', 'emotional'],
    preferredTimeSlots: ['night'],
    sceneIds: ['shared-living-zone', 'strategy-desk'],
    steps: [
      {
        id: 'stabilize',
        title: '先稳定局面',
        description: '窗外雷声很近，{char}把手电递给你，等你决定先做什么。',
        options: [
          {
            id: 'calm',
            label: '先安抚对方',
            affectionDelta: 5,
            energyDelta: -2,
            mood: '安心',
            message: '你先让{char}冷静下来，再开始处理问题。',
            nextStepId: 'trace',
          },
          {
            id: 'check-panel',
            label: '直接检查电闸',
            affectionDelta: 3,
            energyDelta: -6,
            mood: '专注',
            message: '你先去检查了电闸位置，迅速锁定异常区域。',
            nextStepId: 'trace',
          },
        ],
      },
      {
        id: 'trace',
        title: '定位问题',
        description: '走廊尽头传来漏电声，你和{char}需要决定后续方案。',
        options: [
          {
            id: 'team-fix',
            label: '两人配合抢修',
            affectionDelta: 6,
            energyDelta: -8,
            mood: '默契',
            message: '你和{char}配合拆装，很快恢复了照明。',
            nextStepId: 'ending-teamwork',
          },
          {
            id: 'call-help',
            label: '联系值班协助',
            affectionDelta: 4,
            energyDelta: -3,
            mood: '稳妥',
            message: '你们选择先确保安全，再联系值班人员。',
            nextStepId: 'ending-safe',
          },
        ],
      },
      {
        id: 'ending-teamwork',
        title: '结局：并肩修复',
        description: '灯光重新亮起，{char}看向你的眼神明显更信任。',
        options: [
          {
            id: 'celebrate',
            label: '击掌庆祝',
            affectionDelta: 7,
            energyDelta: 3,
            mood: '兴奋',
            message: '你和{char}在昏黄灯光下击掌庆祝。',
            endsChain: true,
            endingText: '这次并肩处理危机，让关系升温得很快。',
            endingAffectionBonus: 4,
            endingEnergyBonus: 2,
            endingTag: '并肩修复',
          },
          {
            id: 'quiet-smile',
            label: '安静收尾',
            affectionDelta: 5,
            energyDelta: 6,
            mood: '平和',
            message: '你和{char}默契地把工具归位，气氛很安心。',
            endsChain: true,
            endingText: '你们在沉默中建立了稳定的信任感。',
            endingAffectionBonus: 2,
            endingEnergyBonus: 5,
            endingTag: '沉默信任',
          },
        ],
      },
      {
        id: 'ending-safe',
        title: '结局：稳妥守夜',
        description: '维修人员到来前，你和{char}先把寝室整理成临时安全区。',
        options: [
          {
            id: 'tea-watch',
            label: '泡热茶守夜',
            affectionDelta: 6,
            energyDelta: 5,
            mood: '温暖',
            message: '你和{char}一边喝热茶一边等消息。',
            endsChain: true,
            endingText: '这场守夜让你们的默契变得更日常。',
            endingAffectionBonus: 3,
            endingEnergyBonus: 4,
            endingTag: '温暖守夜',
          },
          {
            id: 'plan-next',
            label: '顺便制定应急预案',
            affectionDelta: 4,
            energyDelta: 2,
            mood: '踏实',
            message: '你和{char}把下次断电预案写了出来。',
            endsChain: true,
            endingText: '这次经历让你们在未来更有准备。',
            endingAffectionBonus: 3,
            endingEnergyBonus: 2,
            endingTag: '未雨绸缪',
          },
        ],
      },
    ],
  },
  {
    id: 'weekend-invite-chain',
    title: '周末邀约',
    minRelationshipStage: 'intimate',
    archetypes: ['social', 'extrovert', 'spontaneous', 'creative'],
    preferredTimeSlots: ['afternoon', 'night'],
    sceneIds: ['tea-salon', 'music-corner'],
    steps: [
      {
        id: 'proposal',
        title: '计划启动',
        description: '{char}突然提议周末一起出门，但路线和预算都还没定。',
        options: [
          {
            id: 'citywalk',
            label: '先定 Citywalk',
            affectionDelta: 5,
            energyDelta: -4,
            mood: '期待',
            message: '你提议先轻量逛逛，{char}马上开始查路线。',
            nextStepId: 'budget',
          },
          {
            id: 'stay-indoor',
            label: '改成室内主题日',
            affectionDelta: 4,
            energyDelta: 3,
            mood: '放松',
            message: '你建议在寝室做主题日，{char}也觉得有趣。',
            nextStepId: 'budget',
          },
        ],
      },
      {
        id: 'budget',
        title: '分歧出现',
        description: '预算分配出现分歧，{char}问你是走品质路线还是省钱路线。',
        options: [
          {
            id: 'quality',
            label: '重点体验品质项目',
            affectionDelta: 6,
            energyDelta: -6,
            mood: '投入',
            message: '你们筛掉了冗余项目，留下最想做的部分。',
            nextStepId: 'ending-quality',
          },
          {
            id: 'save',
            label: '主打高性价比',
            affectionDelta: 5,
            energyDelta: -2,
            mood: '轻快',
            message: '你们把预算拆细后，发现还能多做两件事。',
            nextStepId: 'ending-save',
          },
        ],
      },
      {
        id: 'ending-quality',
        title: '结局：高质量周末',
        description: '周末执行顺利，你和{char}都觉得这次安排很值。',
        options: [
          {
            id: 'post-share',
            label: '整理回顾相册',
            affectionDelta: 6,
            energyDelta: 4,
            mood: '满足',
            message: '你和{char}把照片和票根做成了小相册。',
            endsChain: true,
            endingText: '高质量的共同行动让你们更愿意继续组队。',
            endingAffectionBonus: 5,
            endingEnergyBonus: 2,
            endingTag: '精品周末',
          },
        ],
      },
      {
        id: 'ending-save',
        title: '结局：省钱高能',
        description: '虽然花费不高，但节奏紧凑，周末依旧很精彩。',
        options: [
          {
            id: 'next-week-plan',
            label: '直接预约下周计划',
            affectionDelta: 5,
            energyDelta: 5,
            mood: '开心',
            message: '你们边笑边敲定了下周的新行程。',
            endsChain: true,
            endingText: '这次路线证明了你们的组合很适合长期行动。',
            endingAffectionBonus: 4,
            endingEnergyBonus: 4,
            endingTag: '省钱高能',
          },
        ],
      },
    ],
  },
  {
    id: 'greenhouse-memory-chain',
    title: '温室旧物',
    minRelationshipStage: 'bond',
    archetypes: ['introvert', 'quiet', 'emotional', 'creative'],
    preferredTimeSlots: ['morning', 'afternoon'],
    sceneIds: ['sun-balcony', 'craft-workbench'],
    steps: [
      {
        id: 'discover',
        title: '发现旧盒',
        description: '你在角落找到一只旧盒子，{char}犹豫要不要打开。',
        options: [
          {
            id: 'open-together',
            label: '一起打开',
            affectionDelta: 6,
            energyDelta: -3,
            mood: '好奇',
            message: '你和{char}一起翻出了几件旧物件。',
            nextStepId: 'sort',
          },
          {
            id: 'ask-first',
            label: '先征求对方意愿',
            affectionDelta: 7,
            energyDelta: 1,
            mood: '体贴',
            message: '你先尊重了{char}的节奏，对方明显更放松。',
            nextStepId: 'sort',
          },
        ],
      },
      {
        id: 'sort',
        title: '如何处理',
        description: '盒子里有旧照片和半成品手作，{char}希望你给个建议。',
        options: [
          {
            id: 'restore',
            label: '修复旧物',
            affectionDelta: 6,
            energyDelta: -5,
            mood: '专注',
            message: '你和{char}一起把旧物修复到了可展示状态。',
            nextStepId: 'ending-restore',
          },
          {
            id: 'archive',
            label: '做成回忆档案',
            affectionDelta: 5,
            energyDelta: -1,
            mood: '柔和',
            message: '你们把回忆整理成了可随时翻看的档案。',
            nextStepId: 'ending-archive',
          },
        ],
      },
      {
        id: 'ending-restore',
        title: '结局：修复陈列',
        description: '旧物被重新点亮，寝室角落有了新的故事感。',
        options: [
          {
            id: 'name-piece',
            label: '给作品命名',
            affectionDelta: 6,
            energyDelta: 2,
            mood: '成就',
            message: '你和{char}一起给这件作品取了名字。',
            endsChain: true,
            endingText: '这次创作让你们都更愿意分享内心的部分。',
            endingAffectionBonus: 4,
            endingEnergyBonus: 3,
            endingTag: '回忆修复',
          },
        ],
      },
      {
        id: 'ending-archive',
        title: '结局：温柔归档',
        description: '档案册整理完成，{char}把它放到了最容易看到的位置。',
        options: [
          {
            id: 'read-again',
            label: '一起再看一遍',
            affectionDelta: 5,
            energyDelta: 6,
            mood: '治愈',
            message: '你和{char}静静翻完了整本档案。',
            endsChain: true,
            endingText: '这次归档让你们之间多了稳定的安全感。',
            endingAffectionBonus: 3,
            endingEnergyBonus: 5,
            endingTag: '温柔归档',
          },
        ],
      },
    ],
  },
]

const DORM_DAILY_WISH_TYPE_LABELS = {
  chat: '聊天',
  gift: '送礼',
  rest: '休息',
  event: '事件',
  scene: '场景',
  upgrade: '升级',
}

// 商店商品分类
const DORM_SHOP_CATEGORIES = [
  { id: 'all', label: '全部', icon: '🏪' },
  { id: 'misc', label: '杂物', icon: '📦' },
  { id: 'gift', label: '礼品', icon: '🎁' },
  { id: 'clothes', label: '衣服', icon: '👔' },
  { id: 'plant', label: '花草', icon: '🌿' },
  { id: 'food', label: '食物', icon: '🍔' },
  { id: 'decoration', label: '装饰', icon: '✨' },
]

// 商店商品模板库
const DORM_SHOP_ITEM_TEMPLATES = {
  misc: [
    { name: '复古台灯', description: '温暖的黄光台灯，适合夜晚阅读', basePrice: 25, icon: '💡' },
    { name: '手工笔记本', description: '精美的手工装订笔记本', basePrice: 15, icon: '📓' },
    { name: '迷你音箱', description: '小巧便携的蓝牙音箱', basePrice: 45, icon: '🔊' },
    { name: '香薰蜡烛', description: '薰衣草香味的助眠蜡烛', basePrice: 20, icon: '🕯️' },
    { name: '桌面收纳盒', description: '木质桌面收纳整理盒', basePrice: 30, icon: '📦' },
  ],
  gift: [
    { name: '精美花束', description: '新鲜玫瑰搭配的花束', basePrice: 50, icon: '💐' },
    { name: '手工巧克力', description: '进口手工巧克力礼盒', basePrice: 35, icon: '🍫' },
    { name: '音乐盒', description: '复古旋转音乐盒', basePrice: 60, icon: '🎵' },
    { name: '星空投影灯', description: '可以投影星空的浪漫小灯', basePrice: 55, icon: '🌟' },
    { name: '定制相框', description: '可以放照片的精美相框', basePrice: 40, icon: '🖼️' },
  ],
  clothes: [
    { name: '柔软围巾', description: '羊绒材质的保暖围巾', basePrice: 45, icon: '🧣' },
    { name: '可爱帽子', description: '毛线编织的保暖帽子', basePrice: 30, icon: '🧢' },
    { name: '丝质睡衣', description: '舒适的丝质睡衣套装', basePrice: 70, icon: '👘' },
    { name: '帆布包', description: '文艺风格的帆布手提包', basePrice: 35, icon: '👜' },
    { name: '珍珠项链', description: '简约优雅的珍珠项链', basePrice: 80, icon: '📿' },
  ],
  plant: [
    { name: '多肉盆栽', description: '可爱的多肉植物小盆栽', basePrice: 20, icon: '🌵' },
    { name: '薄荷盆栽', description: '清香的薄荷小盆栽', basePrice: 15, icon: '🌿' },
    { name: '向日葵', description: '阳光灿烂的向日葵', basePrice: 25, icon: '🌻' },
    { name: '小玫瑰', description: '迷你玫瑰盆栽', basePrice: 35, icon: '🌹' },
    { name: '幸运草', description: '四叶草小盆栽', basePrice: 18, icon: '🍀' },
  ],
  food: [
    { name: '草莓蛋糕', description: '新鲜草莓奶油蛋糕', basePrice: 30, icon: '🍰' },
    { name: '奶茶套餐', description: '珍珠奶茶配小点心', basePrice: 25, icon: '🧋' },
    { name: '水果礼盒', description: '精选时令水果礼盒', basePrice: 45, icon: '🍎' },
    { name: '手工饼干', description: '黄油手工饼干礼盒', basePrice: 20, icon: '🍪' },
    { name: '冰淇淋', description: '进口香草冰淇淋', basePrice: 15, icon: '🍦' },
  ],
  decoration: [
    { name: '星星灯串', description: 'LED暖光星星灯串', basePrice: 25, icon: '⭐' },
    { name: '照片墙贴', description: 'ins风格照片墙贴纸', basePrice: 15, icon: '📸' },
    { name: '小风铃', description: '日式玻璃风铃挂饰', basePrice: 30, icon: '🎐' },
    { name: '干花束', description: '永生干花装饰束', basePrice: 35, icon: '💮' },
    { name: '小夜灯', description: '可爱造型硅胶小夜灯', basePrice: 40, icon: '🌙' },
  ],
}

// 生成随机商店商品
const generateShopItems = (category = 'all', count = 6) => {
  const items = []
  const categories = category === 'all'
    ? Object.keys(DORM_SHOP_ITEM_TEMPLATES)
    : [category]
  
  for (const cat of categories) {
    const templates = DORM_SHOP_ITEM_TEMPLATES[cat] || []
    const shuffled = [...templates].sort(() => Math.random() - 0.5)
    const selected = shuffled.slice(0, Math.min(count, shuffled.length))
    
    for (const template of selected) {
      const priceVariance = Math.floor(Math.random() * 10) - 5
      const price = Math.max(10, template.basePrice + priceVariance)
      items.push({
        id: `shop_${cat}_${template.name}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: template.name,
        description: template.description,
        price,
        icon: template.icon,
        category: cat,
        categoryLabel: DORM_SHOP_CATEGORIES.find(c => c.id === cat)?.label || cat,
      })
    }
  }
  
  return items.sort(() => Math.random() - 0.5)
}

const DORM_OUTFIT_LIBRARY = [
  {
    id: 'campus-casual',
    name: '校园便服',
    style: '日常',
    description: '轻便的基础穿搭，适合在寝室和校园间活动。',
    price: 0,
  },
  {
    id: 'night-sweater',
    name: '夜谈毛衣',
    style: '温柔',
    description: '适合夜晚聊天时穿，给人安稳放松的感觉。',
    price: 60,
  },
  {
    id: 'sports-training',
    name: '训练运动装',
    style: '活力',
    description: '行动方便，适合训练和高活力互动。',
    price: 85,
  },
  {
    id: 'book-cafe',
    name: '书咖风外套',
    style: '知性',
    description: '偏学院风的外套，整体气质更沉稳。',
    price: 95,
  },
  {
    id: 'street-light',
    name: '街头轻潮',
    style: '潮流',
    description: '带一点街头感的轻潮搭配，辨识度很高。',
    price: 110,
  },
  {
    id: 'formal-black',
    name: '深色正装',
    style: '正式',
    description: '干练利落，适合重要场合或剧情节点。',
    price: 130,
  },
  {
    id: 'festival-suit',
    name: '节庆礼服',
    style: '华丽',
    description: '带有仪式感的礼服，细节装饰更丰富。',
    price: 160,
  },
]

const DORM_QUICK_ACTION_OPTIONS = [
  { id: 'chat', label: '聊天' },
  { id: 'gift', label: '送礼' },
  { id: 'rest', label: '休息' },
  { id: 'event', label: '触发事件' },
  { id: 'outing', label: '邀请出去玩' },
]

const DORM_QUICK_ACTION_LABEL_MAP = DORM_QUICK_ACTION_OPTIONS.reduce((accumulator, option) => {
  accumulator[option.id] = option.label
  return accumulator
}, {})

const DORM_OVERLAY_PANEL_OPTIONS = [
  { id: 'interaction', label: '互动' },
  { id: 'drift', label: '漂流瓶' },
  { id: 'wardrobe', label: '衣橱' },
  { id: 'shop', label: '商店' },
  { id: 'scene', label: '场景' },
  { id: 'schedule', label: '日程' },
  { id: 'chain', label: '事件链' },
  { id: 'status', label: '状态' },
  { id: 'journal', label: '记录' },
]

const DORM_OVERLAY_PANEL_LABEL_MAP = DORM_OVERLAY_PANEL_OPTIONS.reduce((accumulator, panel) => {
  accumulator[panel.id] = panel.label
  return accumulator
}, {})

const currentView = ref(VIEW_BOOK_CARD)
const worldBooks = ref([])
const activeCardIndex = ref(0)
const cardTransitionName = ref('card-slide-next')
const activeCharacterIndex = ref(0)
const characterTransitionName = ref('card-slide-next')
const selectedCharacterId = ref('')
const portraitUrlMap = ref({})
const defaultPortraitUrl = ref(DEFAULT_PORTRAIT_PATH)
const isLoadingBooks = ref(false)
const isLoadingCharacters = ref(false)
const dormRuntimeMap = ref({})
const actionFeedback = ref('')
const activeDormEvent = ref(null)
const selectedSubSceneId = ref('')
const stageUpgradeToast = ref(null)
const selectedEventChainPreviewId = ref('')
const selectedSubSceneActivityId = ref('')
const dormQuickActionType = ref('chat')
const activeDormOverlayPanelId = ref('interaction')
const isDormOverlayPanelExpanded = ref(false)
const isDormMenuOpen = ref(false)
const isDormNavMenuOpen = ref(false)
const dormChatDraft = ref('')
const isDormChatSending = ref(false)
const dormChatError = ref('')
const dormChatHistoryRef = ref(null)
const driftBottlePool = ref([])
const driftBottleDraft = ref('')
const isDormDriftPicking = ref(false)
const driftFollowupPendingEntryId = ref('')
const isWardrobeOutfitCommentGenerating = ref(false)
const wardrobeOutfitComment = ref('')
const wardrobeOutfitCommentError = ref('')

const portraitImageCache = ref(new Map())
let characterPreloadToken = 0
let cardTouchStartX = 0
let cardTouchStartY = 0
let cardTouchTracking = false
let stageUpgradeToastTimer = null
let dormChatRequestToken = 0
let dormDriftPickRequestToken = 0
let dormDriftFollowupRequestToken = 0

const clampInt = (value, min, max, fallback = min) => {
  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, parsed))
}

const randomInt = (min, max) => {
  const nextMin = Math.min(min, max)
  const nextMax = Math.max(min, max)
  return Math.floor(Math.random() * (nextMax - nextMin + 1)) + nextMin
}

const renderTemplate = (template, characterLabel) => {
  const safeTemplate = String(template || '').trim()
  const safeLabel = String(characterLabel || '角色').trim() || '角色'
  return safeTemplate.replaceAll('{char}', safeLabel)
}

const getDormArchetypeLabel = (archetype) => {
  const key = String(archetype || '').trim()
  if (!key) return '均衡'
  return DORM_ARCHETYPE_LABELS[key] || key
}

const getDormRelationshipStageIndex = (stageId) => {
  const key = String(stageId || '').trim()
  if (!key) return 0
  return clampInt(
    DORM_RELATIONSHIP_STAGE_INDEX_MAP[key],
    0,
    DORM_RELATIONSHIP_STAGE_LIBRARY.length - 1,
    0,
  )
}

const getDormRelationshipStageLabel = (stageId) => {
  const key = String(stageId || '').trim()
  const matched = DORM_RELATIONSHIP_STAGE_LIBRARY.find((stage) => stage.id === key)
  return matched?.label || DORM_RELATIONSHIP_STAGE_LIBRARY[0].label
}

const resolveDormRelationshipStageByAffection = (affectionValue) => {
  const affection = clampInt(affectionValue, DORM_AFFECTION_MIN, DORM_AFFECTION_MAX, DORM_AFFECTION_MIN)
  let current = DORM_RELATIONSHIP_STAGE_LIBRARY[0]
  DORM_RELATIONSHIP_STAGE_LIBRARY.forEach((stage) => {
    if (affection >= stage.minAffection) current = stage
  })
  return current.id
}

const normalizeDormRelationshipStage = (stageId, affectionValue = DORM_AFFECTION_MIN) => {
  const key = String(stageId || '').trim()
  if (!DORM_RELATIONSHIP_STAGE_ID_SET.has(key)) {
    return resolveDormRelationshipStageByAffection(affectionValue)
  }
  return key
}

const getDormEventChainMinRelationshipStage = (chain) => {
  return normalizeDormRelationshipStage(chain?.minRelationshipStage, DORM_AFFECTION_MIN)
}

const isDormEventChainUnlockedByStage = (chain, relationshipStageId) => {
  const requiredStage = getDormEventChainMinRelationshipStage(chain)
  const currentStage = normalizeDormRelationshipStage(relationshipStageId, DORM_AFFECTION_MIN)
  return getDormRelationshipStageIndex(currentStage) >= getDormRelationshipStageIndex(requiredStage)
}

const getUnlockedDormEventChainsByStage = (relationshipStageId) => {
  return DORM_EVENT_CHAIN_LIBRARY.filter((chain) => isDormEventChainUnlockedByStage(chain, relationshipStageId))
}

const getDormEventChainStepList = (chain) => {
  return Array.isArray(chain?.steps) ? chain.steps : []
}

const buildDormEventChainSummaryText = (chain, characterLabel = '角色') => {
  const explicitSummary = String(chain?.summary || '').trim()
  if (explicitSummary) return renderTemplate(explicitSummary, characterLabel)

  const firstStep = getDormEventChainStepList(chain)[0]
  const fallback = String(firstStep?.description || '').trim()
  if (fallback) return renderTemplate(fallback, characterLabel)
  return '该事件链会根据你的选项推进到不同分支。'
}

const collectDormEventChainEndingTags = (chain, characterLabel = '角色') => {
  const endingTags = []
  const seen = new Set()

  getDormEventChainStepList(chain).forEach((step) => {
    const options = Array.isArray(step?.options) ? step.options : []
    options.forEach((option) => {
      if (!option?.endsChain) return
      const rawTag = String(option?.endingTag || option?.endingText || option?.label || '').trim()
      if (!rawTag) return
      const renderedTag = renderTemplate(rawTag, characterLabel)
      if (!renderedTag || seen.has(renderedTag)) return
      seen.add(renderedTag)
      endingTags.push(renderedTag)
    })
  })

  return endingTags.slice(0, 6)
}

const clearStageUpgradeToast = () => {
  if (stageUpgradeToastTimer) {
    clearTimeout(stageUpgradeToastTimer)
    stageUpgradeToastTimer = null
  }
  stageUpgradeToast.value = null
}

const showStageUpgradeToast = ({
  previousStage = '',
  nextStage = '',
  unlockedChainTitles = [],
} = {}) => {
  const fromStage = normalizeDormRelationshipStage(previousStage, DORM_AFFECTION_MIN)
  const toStage = normalizeDormRelationshipStage(nextStage, DORM_AFFECTION_MIN)
  if (fromStage === toStage) return

  clearStageUpgradeToast()
  stageUpgradeToast.value = {
    id: `stage_toast_${Date.now()}`,
    fromLabel: getDormRelationshipStageLabel(fromStage),
    toLabel: getDormRelationshipStageLabel(toStage),
    unlockedChainTitles: (Array.isArray(unlockedChainTitles) ? unlockedChainTitles : [])
      .map((item) => String(item || '').trim())
      .filter(Boolean)
      .slice(0, 5),
  }
  stageUpgradeToastTimer = setTimeout(() => {
    stageUpgradeToast.value = null
    stageUpgradeToastTimer = null
  }, 4200)
}

const normalizeCounterMap = (rawMap, limit = 24) => {
  if (!rawMap || typeof rawMap !== 'object' || Array.isArray(rawMap)) return {}
  const next = {}
  Object.keys(rawMap)
    .slice(0, Math.max(1, limit))
    .forEach((key) => {
      const safeKey = String(key || '').trim()
      if (!safeKey) return
      next[safeKey] = clampInt(rawMap[key], 0, 9999, 0)
    })
  return next
}

const normalizeFacilityLevelMap = (rawMap, limit = 24) => {
  if (!rawMap || typeof rawMap !== 'object' || Array.isArray(rawMap)) return {}
  const next = {}
  Object.keys(rawMap)
    .slice(0, Math.max(1, limit))
    .forEach((key) => {
      const safeKey = String(key || '').trim()
      if (!safeKey) return
      next[safeKey] = clampInt(
        rawMap[key],
        DORM_SCENE_FACILITY_MIN_LEVEL,
        DORM_SCENE_FACILITY_MAX_LEVEL,
        DORM_SCENE_FACILITY_MIN_LEVEL,
      )
    })
  return next
}

const getSceneEventPool = (sceneId) => {
  const key = String(sceneId || '').trim()
  if (!key) return []
  const pool = DORM_SUB_SCENE_EVENT_LIBRARY[key]
  return Array.isArray(pool) ? pool : []
}

const getSceneFacilityLevelFromState = (state, sceneId) => {
  const safeSceneId = String(sceneId || '').trim()
  if (!safeSceneId) return DORM_SCENE_FACILITY_MIN_LEVEL
  return clampInt(
    state?.sceneFacilityLevels?.[safeSceneId],
    DORM_SCENE_FACILITY_MIN_LEVEL,
    DORM_SCENE_FACILITY_MAX_LEVEL,
    DORM_SCENE_FACILITY_MIN_LEVEL,
  )
}

const getFacilityBonusPercentByLevel = (level) => {
  const safeLevel = clampInt(
    level,
    DORM_SCENE_FACILITY_MIN_LEVEL,
    DORM_SCENE_FACILITY_MAX_LEVEL,
    DORM_SCENE_FACILITY_MIN_LEVEL,
  )
  return Math.round((safeLevel - DORM_SCENE_FACILITY_MIN_LEVEL) * DORM_SCENE_FACILITY_BONUS_STEP * 100)
}

const applyFacilityBonusDelta = (delta, level) => {
  const numeric = Number(delta) || 0
  if (numeric <= 0) return numeric
  const safeLevel = clampInt(
    level,
    DORM_SCENE_FACILITY_MIN_LEVEL,
    DORM_SCENE_FACILITY_MAX_LEVEL,
    DORM_SCENE_FACILITY_MIN_LEVEL,
  )
  const ratio = 1 + (safeLevel - DORM_SCENE_FACILITY_MIN_LEVEL) * DORM_SCENE_FACILITY_BONUS_STEP
  return Math.max(1, Math.round(numeric * ratio))
}

const normalizeStringArray = (rawList, limit = 8) => {
  if (!Array.isArray(rawList)) return []
  return rawList
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, Math.max(1, limit))
}

const getDormTimeSlotIdByIndex = (slotIndex) => {
  const safeIndex = clampInt(slotIndex, 0, DORM_TIME_SLOT_COUNT - 1, 0)
  return DORM_TIME_SLOT_IDS[safeIndex] || DORM_TIME_SLOT_IDS[0]
}

const pickWeightedItem = (items, getWeight) => {
  const source = Array.isArray(items) ? items : []
  if (source.length <= 0) return null

  const weighted = source
    .map((item, index) => {
      const weight = Number(getWeight?.(item, index)) || 0
      return { item, weight: Math.max(0, weight) }
    })
    .filter((entry) => entry.weight > 0)

  if (weighted.length <= 0) return source[randomInt(0, source.length - 1)] || null

  const totalWeight = weighted.reduce((sum, entry) => sum + entry.weight, 0)
  if (!Number.isFinite(totalWeight) || totalWeight <= 0) return weighted[0].item || null

  let cursor = Math.random() * totalWeight
  for (const entry of weighted) {
    cursor -= entry.weight
    if (cursor <= 0) return entry.item
  }
  return weighted[weighted.length - 1]?.item || null
}

const normalizeDormEventOption = (rawOption, index = 0) => {
  const source = rawOption && typeof rawOption === 'object' ? rawOption : {}
  const affectionDelta = Number(source.affectionDelta) || 0
  const energyDelta = Number(source.energyDelta) || 0
  const previewAffection = Number(source.previewAffectionDelta)
  const previewEnergy = Number(source.previewEnergyDelta)
  return {
    id: String(source.id || `event_option_${index + 1}`).trim() || `event_option_${index + 1}`,
    label: String(source.label || `选项 ${index + 1}`).trim() || `选项 ${index + 1}`,
    affectionDelta,
    energyDelta,
    previewAffectionDelta: Number.isFinite(previewAffection) ? previewAffection : affectionDelta,
    previewEnergyDelta: Number.isFinite(previewEnergy) ? previewEnergy : energyDelta,
    mood: String(source.mood || '').trim(),
    message: String(source.message || '').trim(),
    nextStepId: String(source.nextStepId || '').trim(),
    endsChain: Boolean(source.endsChain),
    endingText: String(source.endingText || '').trim(),
    endingTag: String(source.endingTag || '').trim(),
    endingAffectionBonus: clampInt(source.endingAffectionBonus, -100, 100, 0),
    endingEnergyBonus: clampInt(source.endingEnergyBonus, -100, 100, 0),
  }
}

const normalizeActiveDormEventState = (rawEvent) => {
  if (!rawEvent || typeof rawEvent !== 'object') return null
  const source = rawEvent
  const options = Array.isArray(source.options)
    ? source.options.map((option, index) => normalizeDormEventOption(option, index))
    : []
  if (options.length <= 0) return null

  const mode = String(source.mode || '').trim() === 'chain'
    ? 'chain'
    : 'single'
  return {
    id: String(source.id || source.chainId || 'dorm_event').trim() || 'dorm_event',
    mode,
    title: String(source.title || '寝室事件').trim() || '寝室事件',
    description: String(source.description || '').trim(),
    source: String(source.source || '').trim() === 'scene' ? 'scene' : 'global',
    sourceSceneId: String(source.sourceSceneId || '').trim(),
    sourceSceneName: String(source.sourceSceneName || '').trim(),
    facilityLevel: clampInt(
      source.facilityLevel,
      DORM_SCENE_FACILITY_MIN_LEVEL,
      DORM_SCENE_FACILITY_MAX_LEVEL,
      DORM_SCENE_FACILITY_MIN_LEVEL,
    ),
    facilityBonusPercent: clampInt(source.facilityBonusPercent, 0, 400, 0),
    chainId: mode === 'chain' ? String(source.chainId || '').trim() : '',
    chainStepId: mode === 'chain' ? String(source.chainStepId || '').trim() : '',
    chainStepTitle: mode === 'chain' ? String(source.chainStepTitle || '').trim() : '',
    chainStepIndex: mode === 'chain' ? clampInt(source.chainStepIndex, 0, 20, 0) : 0,
    chainStepTotal: mode === 'chain' ? clampInt(source.chainStepTotal, 1, 20, 1) : 1,
    chainPathLabels: mode === 'chain' ? normalizeStringArray(source.chainPathLabels, 8) : [],
    options,
  }
}

const buildDormEventOptionsWithPreview = (
  rawOptions,
  { facilityLevel = DORM_SCENE_FACILITY_MIN_LEVEL, enableFacilityBoost = false, charLabel = '角色' } = {},
) => {
  const source = Array.isArray(rawOptions) ? rawOptions : []
  return source.map((rawOption, index) => {
    const baseAffection = Number(rawOption?.affectionDelta) || 0
    const baseEnergy = Number(rawOption?.energyDelta) || 0
    const boosted = buildFacilityBoostedAction(
      { affectionDelta: baseAffection, energyDelta: baseEnergy },
      facilityLevel,
      enableFacilityBoost,
    )
    return normalizeDormEventOption(
      {
        ...rawOption,
        label: renderTemplate(rawOption?.label, charLabel),
        message: renderTemplate(rawOption?.message, charLabel),
        affectionDelta: baseAffection,
        energyDelta: baseEnergy,
        previewAffectionDelta: boosted.affectionDelta,
        previewEnergyDelta: boosted.energyDelta,
      },
      index,
    )
  })
}

const buildSingleDormEventState = (
  eventTemplate,
  {
    charLabel = '角色',
    source = 'global',
    sourceSceneId = '',
    sourceSceneName = '',
    facilityLevel = DORM_SCENE_FACILITY_MIN_LEVEL,
    facilityBonusPercent = 0,
  } = {},
) => {
  if (!eventTemplate) return null
  const state = {
    id: String(eventTemplate.id || 'dorm_event').trim() || 'dorm_event',
    mode: 'single',
    title: String(eventTemplate.title || '寝室事件').trim() || '寝室事件',
    description: renderTemplate(eventTemplate.description, charLabel),
    source: source === 'scene' ? 'scene' : 'global',
    sourceSceneId: String(sourceSceneId || '').trim(),
    sourceSceneName: String(sourceSceneName || '').trim(),
    facilityLevel,
    facilityBonusPercent,
    options: buildDormEventOptionsWithPreview(eventTemplate.options, {
      facilityLevel,
      enableFacilityBoost: source === 'scene',
      charLabel,
    }),
  }
  return normalizeActiveDormEventState(state)
}

const buildChainDormEventState = (
  chainTemplate,
  stepIndex = 0,
  {
    charLabel = '角色',
    source = 'global',
    sourceSceneId = '',
    sourceSceneName = '',
    facilityLevel = DORM_SCENE_FACILITY_MIN_LEVEL,
    facilityBonusPercent = 0,
    chainPathLabels = [],
  } = {},
) => {
  const steps = Array.isArray(chainTemplate?.steps) ? chainTemplate.steps : []
  if (steps.length <= 0) return null
  const safeIndex = clampInt(stepIndex, 0, steps.length - 1, 0)
  const step = steps[safeIndex]
  if (!step) return null

  const state = {
    id: `${String(chainTemplate?.id || 'event_chain').trim() || 'event_chain'}:${String(step?.id || safeIndex + 1)}`,
    mode: 'chain',
    title: String(chainTemplate?.title || '事件链').trim() || '事件链',
    description: renderTemplate(step?.description, charLabel),
    source: source === 'scene' ? 'scene' : 'global',
    sourceSceneId: String(sourceSceneId || '').trim(),
    sourceSceneName: String(sourceSceneName || '').trim(),
    facilityLevel,
    facilityBonusPercent,
    chainId: String(chainTemplate?.id || '').trim(),
    chainStepId: String(step?.id || `step_${safeIndex + 1}`).trim() || `step_${safeIndex + 1}`,
    chainStepTitle: String(step?.title || `阶段 ${safeIndex + 1}`).trim() || `阶段 ${safeIndex + 1}`,
    chainStepIndex: safeIndex,
    chainStepTotal: steps.length,
    chainPathLabels: normalizeStringArray(chainPathLabels, 8),
    options: buildDormEventOptionsWithPreview(step?.options, {
      facilityLevel,
      enableFacilityBoost: source === 'scene',
      charLabel,
    }),
  }
  return normalizeActiveDormEventState(state)
}

const findDormEventChainTemplateById = (chainId) => {
  const safeId = String(chainId || '').trim()
  if (!safeId) return null
  return DORM_EVENT_CHAIN_LIBRARY.find((chain) => String(chain?.id || '').trim() === safeId) || null
}

const resolveDormEventChainNextStepIndex = (chainTemplate, currentStepIndex, option) => {
  const steps = Array.isArray(chainTemplate?.steps) ? chainTemplate.steps : []
  if (steps.length <= 0 || option?.endsChain) return -1

  const requestedStepId = String(option?.nextStepId || '').trim()
  if (requestedStepId) {
    const matchedIndex = steps.findIndex((step) => String(step?.id || '').trim() === requestedStepId)
    if (matchedIndex >= 0) return matchedIndex
  }

  const fallbackIndex = clampInt(currentStepIndex, 0, steps.length - 1, 0) + 1
  return fallbackIndex < steps.length ? fallbackIndex : -1
}

const pickDormEventChainTemplate = ({
  archetypes = [],
  timeSlotId = '',
  sceneId = '',
  relationshipStage = 'stranger',
} = {}) => {
  const archetypeSet = new Set(
    (Array.isArray(archetypes) ? archetypes : [])
      .map((item) => String(item || '').trim())
      .filter(Boolean),
  )
  const safeSlotId = String(timeSlotId || '').trim()
  const safeSceneId = String(sceneId || '').trim()
  const safeStage = normalizeDormRelationshipStage(relationshipStage, DORM_AFFECTION_MIN)
  const unlockedChains = getUnlockedDormEventChainsByStage(safeStage)

  return pickWeightedItem(unlockedChains, (chain) => {
    let weight = 1
    const chainArchetypes = Array.isArray(chain?.archetypes) ? chain.archetypes : []
    const matchedArchetypeCount = chainArchetypes.filter((item) => archetypeSet.has(String(item || '').trim())).length
    if (matchedArchetypeCount > 0) weight += matchedArchetypeCount * 1.2

    const preferredSlots = Array.isArray(chain?.preferredTimeSlots) ? chain.preferredTimeSlots : []
    if (safeSlotId && preferredSlots.includes(safeSlotId)) weight += 1.4

    const relatedScenes = Array.isArray(chain?.sceneIds) ? chain.sceneIds : []
    if (safeSceneId && relatedScenes.includes(safeSceneId)) {
      weight += 1.8
    } else if (safeSceneId && relatedScenes.length > 0) {
      weight -= 0.35
    }
    return Math.max(0.1, weight)
  })
}

const formatSignedDormDelta = (value) => {
  const numeric = Number(value) || 0
  return numeric >= 0 ? `+${numeric}` : String(numeric)
}

const formatDormEventOptionPreview = (option, eventState = activeDormEvent.value) => {
  const baseText = `好感 ${formatSignedDormDelta(option?.previewAffectionDelta)} · 体力 ${formatSignedDormDelta(option?.previewEnergyDelta)}`
  if (eventState?.mode !== 'chain' || !option?.endsChain) return baseText

  const endingAffection = clampInt(option?.endingAffectionBonus, -100, 100, 0)
  const endingEnergy = clampInt(option?.endingEnergyBonus, -100, 100, 0)
  const endingParts = []
  if (endingAffection !== 0) endingParts.push(`终章好感${formatSignedDormDelta(endingAffection)}`)
  if (endingEnergy !== 0) endingParts.push(`终章体力${formatSignedDormDelta(endingEnergy)}`)
  return endingParts.length > 0 ? `${baseText} · ${endingParts.join(' / ')}` : baseText
}

const toLowerText = (value) => String(value || '').trim().toLowerCase()

const hashString = (value) => {
  const source = String(value || '')
  let hash = 0
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash << 5) - hash + source.charCodeAt(index)
    hash |= 0
  }
  return Math.abs(hash)
}

const createSeededRandom = (seedValue) => {
  let seed = hashString(seedValue) || 1
  return () => {
    seed ^= seed << 13
    seed ^= seed >>> 17
    seed ^= seed << 5
    const normalized = (seed >>> 0) / 4294967296
    return Number.isFinite(normalized) ? normalized : Math.random()
  }
}

const randomBySeed = (rng, min, max) => {
  const safeMin = Math.min(min, max)
  const safeMax = Math.max(min, max)
  const ratio = typeof rng === 'function' ? rng() : Math.random()
  return Math.floor(ratio * (safeMax - safeMin + 1)) + safeMin
}

const formatDailyWishTypeLabel = (wishType) => {
  const key = String(wishType || '').trim()
  return DORM_DAILY_WISH_TYPE_LABELS[key] || key || '心愿'
}

const pickDailyWishTypes = (archetypes, rng) => {
  const set = new Set(Array.isArray(archetypes) ? archetypes : [])
  const weighted = ['chat', 'gift', 'rest', 'event', 'scene', 'upgrade']

  if (set.has('introvert') || set.has('quiet')) weighted.push('rest', 'scene')
  if (set.has('extrovert') || set.has('social')) weighted.push('chat', 'event')
  if (set.has('creative')) weighted.push('scene', 'event')
  if (set.has('analytical') || set.has('orderly')) weighted.push('upgrade', 'event')
  if (set.has('active')) weighted.push('scene', 'chat')

  const selected = []
  let guard = 0
  while (selected.length < DORM_DAILY_WISH_COUNT && guard < 120) {
    guard += 1
    const picked = weighted[randomBySeed(rng, 0, weighted.length - 1)]
    if (!selected.includes(picked)) selected.push(picked)
  }

  for (const fallback of ['chat', 'rest', 'scene', 'event', 'gift', 'upgrade']) {
    if (selected.length >= DORM_DAILY_WISH_COUNT) break
    if (!selected.includes(fallback)) selected.push(fallback)
  }
  return selected.slice(0, DORM_DAILY_WISH_COUNT)
}

const createDailyWishEntry = (wishType, dayIndex, order, rng, characterLabel = '角色') => {
  const type = String(wishType || '').trim() || 'chat'
  const target = type === 'chat'
    ? randomBySeed(rng, 1, 2)
    : 1

  const definitions = {
    chat: {
      label: `与{char}聊天 ${target} 次`,
      rewardAffection: randomBySeed(rng, 6, 10),
      rewardEnergy: randomBySeed(rng, 1, 4),
    },
    gift: {
      label: `给{char}送礼 ${target} 次`,
      rewardAffection: randomBySeed(rng, 9, 14),
      rewardEnergy: randomBySeed(rng, 0, 3),
    },
    rest: {
      label: `与{char}休息 ${target} 次`,
      rewardAffection: randomBySeed(rng, 2, 5),
      rewardEnergy: randomBySeed(rng, 10, 16),
    },
    event: {
      label: `完成事件选项 ${target} 次`,
      rewardAffection: randomBySeed(rng, 7, 12),
      rewardEnergy: randomBySeed(rng, 3, 7),
    },
    scene: {
      label: `完成二级场景互动 ${target} 次`,
      rewardAffection: randomBySeed(rng, 5, 10),
      rewardEnergy: randomBySeed(rng, 5, 10),
    },
    upgrade: {
      label: `升级任意场景设施 ${target} 次`,
      rewardAffection: randomBySeed(rng, 5, 9),
      rewardEnergy: randomBySeed(rng, 4, 8),
    },
  }

  const matched = definitions[type] || definitions.chat
  return {
    id: `wish_day_${dayIndex}_${type}_${order + 1}`,
    type,
    label: renderTemplate(matched.label, characterLabel),
    target,
    progress: 0,
    rewardAffection: matched.rewardAffection,
    rewardEnergy: matched.rewardEnergy,
    completed: false,
  }
}

const createDailyWishesForCharacter = (character, label = '', dayIndex = 1) => {
  const archetypes = deriveCharacterDormArchetypes(character)
  const seed = `${String(character?.id || '')}:${String(label || '')}:day_${dayIndex}`
  const rng = createSeededRandom(seed)
  const selectedTypes = pickDailyWishTypes(archetypes, rng)

  const charName = String(label || character?.name || '角色').trim() || '角色'
  return selectedTypes.map((wishType, index) => createDailyWishEntry(wishType, dayIndex, index, rng, charName))
}

const normalizeDailyWish = (rawWish, fallbackDayIndex = 1, fallbackOrder = 0) => {
  const type = String(rawWish?.type || 'chat').trim() || 'chat'
  const target = clampInt(rawWish?.target, 1, 9, 1)
  const progress = clampInt(rawWish?.progress, 0, target, 0)
  return {
    id: String(rawWish?.id || `wish_day_${fallbackDayIndex}_${type}_${fallbackOrder + 1}`),
    type,
    label: String(rawWish?.label || `${formatDailyWishTypeLabel(type)}心愿`),
    target,
    progress,
    rewardAffection: clampInt(rawWish?.rewardAffection, 0, 100, 0),
    rewardEnergy: clampInt(rawWish?.rewardEnergy, 0, 100, 0),
    completed: Boolean(rawWish?.completed) || progress >= target,
  }
}

const normalizeDailyWishList = (rawWishes, fallbackList = []) => {
  const normalized = Array.isArray(rawWishes)
    ? rawWishes.map((wish, index) => normalizeDailyWish(wish, 1, index))
    : []

  const cleaned = normalized
    .filter((wish) => wish.id && wish.type)
    .slice(0, DORM_DAILY_WISH_COUNT)

  if (cleaned.length > 0) return cleaned
  return Array.isArray(fallbackList) ? fallbackList.map((wish, index) => normalizeDailyWish(wish, 1, index)) : []
}

const resolveDailyWishesByAction = (wishList, wishType) => {
  const safeType = String(wishType || '').trim()
  const source = normalizeDailyWishList(wishList, [])
  if (!safeType || source.length <= 0) {
    return {
      wishes: source,
      rewardAffection: 0,
      rewardEnergy: 0,
      completedLabels: [],
    }
  }

  let rewardAffection = 0
  let rewardEnergy = 0
  const completedLabels = []

  const wishes = source.map((wish) => {
    if (wish.type !== safeType || wish.completed) return wish
    const nextProgress = clampInt(wish.progress + 1, 0, wish.target, wish.progress)
    const completed = nextProgress >= wish.target
    if (completed) {
      rewardAffection += wish.rewardAffection
      rewardEnergy += wish.rewardEnergy
      completedLabels.push(wish.label)
    }
    return {
      ...wish,
      progress: nextProgress,
      completed,
    }
  })

  return {
    wishes,
    rewardAffection,
    rewardEnergy,
    completedLabels,
  }
}

const readCharacterPersonalityProfile = (character) => {
  const raw =
    character?.personalityProfile ||
    character?.personality_profile ||
    character?.personality ||
    character?.mbtiProfile ||
    {}
  return raw && typeof raw === 'object' ? raw : {}
}

const readCharacterBehaviorTags = (profile) => {
  const raw =
    profile?.behaviorTags ||
    profile?.behaviorTraits ||
    profile?.traits ||
    profile?.tags ||
    []
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item || '').trim()).filter(Boolean)
  }
  return String(raw || '')
    .split(/\r?\n|[,，、;；]/g)
    .map((item) => item.trim())
    .filter(Boolean)
}

const readCharacterMbti = (profile) => String(profile?.mbti || profile?.mbtiType || profile?.type || '').trim().toUpperCase()

const readCognitiveDimensionValue = (rawDimensions, key, fallback = 50) => {
  if (!rawDimensions || typeof rawDimensions !== 'object') return fallback
  const lowerKey = key.toLowerCase()
  const upperKey = key.toUpperCase()
  return clampInt(
    rawDimensions[key] ?? rawDimensions[lowerKey] ?? rawDimensions[upperKey],
    0,
    100,
    fallback,
  )
}

const deriveCharacterDormArchetypes = (character) => {
  const profile = readCharacterPersonalityProfile(character)
  const mbti = readCharacterMbti(profile)
  const behaviorTags = readCharacterBehaviorTags(profile)
  const normalizedTagCorpus = behaviorTags.map(toLowerText).join(' ')
  const dimensions =
    (profile?.cognitiveDimensions && typeof profile.cognitiveDimensions === 'object')
      ? profile.cognitiveDimensions
      : profile

  const set = new Set()

  if (mbti.startsWith('I')) set.add('introvert')
  if (mbti.startsWith('E')) set.add('extrovert')
  if (mbti.charAt(1) === 'N') set.add('creative')
  if (mbti.charAt(1) === 'S') set.add('orderly')
  if (mbti.charAt(2) === 'T') set.add('analytical')
  if (mbti.charAt(2) === 'F') set.add('emotional')
  if (mbti.charAt(3) === 'J') set.add('orderly')
  if (mbti.charAt(3) === 'P') set.add('spontaneous')

  const se = readCognitiveDimensionValue(dimensions, 'Se')
  const si = readCognitiveDimensionValue(dimensions, 'Si')
  const ne = readCognitiveDimensionValue(dimensions, 'Ne')
  const ni = readCognitiveDimensionValue(dimensions, 'Ni')
  const te = readCognitiveDimensionValue(dimensions, 'Te')
  const ti = readCognitiveDimensionValue(dimensions, 'Ti')
  const fe = readCognitiveDimensionValue(dimensions, 'Fe')
  const fi = readCognitiveDimensionValue(dimensions, 'Fi')

  if (Math.max(ti, te) >= 60) set.add('analytical')
  if (Math.max(fe, fi) >= 60) set.add('emotional')
  if (Math.max(ne, ni) >= 60) set.add('creative')
  if (Math.max(si, te) >= 58) set.add('orderly')
  if (se >= 60) set.add('active')
  if (Math.max(fe, se) >= 58) set.add('social')
  if (Math.max(ni, fi) >= 58) set.add('quiet')
  if (te >= 62 && fi <= 45) set.add('orderly')
  if (ne >= 62 && si <= 45) set.add('spontaneous')

  DORM_TAG_ARCHETYPE_RULES.forEach((rule) => {
    if (!rule?.archetype || !Array.isArray(rule.keywords)) return
    const matched = rule.keywords.some((keyword) => normalizedTagCorpus.includes(toLowerText(keyword)))
    if (matched) set.add(rule.archetype)
  })

  if (set.size === 0) set.add('balanced')
  return [...set]
}

const buildDormSubScenesForCharacter = (character, label = '') => {
  const archetypes = deriveCharacterDormArchetypes(character)
  const archetypeSet = new Set(archetypes)
  const seed = `${String(character?.id || '')}:${String(label || '')}`

  const ranked = DORM_SUB_SCENE_LIBRARY
    .map((scene) => {
      const sceneArchetypes = Array.isArray(scene?.archetypes) ? scene.archetypes : []
      const matchedArchetypes = sceneArchetypes.filter((item) => archetypeSet.has(item))
      const tieBreaker = (hashString(`${seed}:${scene.id}`) % 1000) / 100000
      return {
        ...scene,
        matchedArchetypes,
        matchScore: 1 + matchedArchetypes.length * 2 + tieBreaker,
      }
    })
    .sort((left, right) => right.matchScore - left.matchScore)

  const personalized = ranked.slice(0, 4)
  return [DORM_BASE_SUB_SCENE, ...personalized].map((scene) => ({
    ...scene,
    matchedArchetypes: Array.isArray(scene.matchedArchetypes) ? scene.matchedArchetypes : [],
  }))
}

const createJournalEntry = (text, type = 'system') => ({
  id: `journal_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
  text: String(text || '').trim() || '记录',
  type: String(type || 'system').trim() || 'system',
  time: new Date().toISOString(),
})

const appendJournal = (list, text, type = 'system') => {
  const source = Array.isArray(list) ? list : []
  return [createJournalEntry(text, type), ...source].slice(0, DORM_JOURNAL_LIMIT)
}

const normalizeDormChatRole = (value) => {
  const role = String(value || '').trim().toLowerCase()
  if (role === 'assistant') return 'assistant'
  return 'user'
}

const createDormChatMessage = (role, text) => ({
  id: `chat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
  role: normalizeDormChatRole(role),
  text: String(text || '').replace(/\s+/g, ' ').trim().slice(0, 280),
  time: new Date().toISOString(),
})

const normalizeDormChatHistory = (rawValue) => {
  if (!Array.isArray(rawValue)) return []
  return rawValue
    .map((item) => ({
      id: String(item?.id || `chat_${Date.now()}`),
      role: normalizeDormChatRole(item?.role),
      text: String(item?.text || '').replace(/\s+/g, ' ').trim().slice(0, 280),
      time: String(item?.time || new Date().toISOString()),
    }))
    .filter((item) => item.text)
    .slice(-DORM_CHAT_HISTORY_LIMIT)
}

const appendDormChatMessage = (list, role, text) => {
  const normalizedText = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 280)
  if (!normalizedText) return normalizeDormChatHistory(list)
  const source = normalizeDormChatHistory(list)
  return [...source, createDormChatMessage(role, normalizedText)].slice(-DORM_CHAT_HISTORY_LIMIT)
}

const normalizeDormDriftBottleText = (value) => {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, DORM_DRIFT_BOTTLE_TEXT_LIMIT)
}

const normalizeDormDriftBottleReplyText = (value) => {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, DORM_DRIFT_BOTTLE_REPLY_TEXT_LIMIT)
}

const normalizeDormDriftBottleReplyState = (value, fallback = 'none') => {
  const key = String(value || '').trim().toLowerCase()
  if (key === 'pending' || key === 'ready' || key === 'none') return key
  return String(fallback || 'none').trim() || 'none'
}

const normalizeDormDriftBottleFollowUpReplies = (rawValue) => {
  if (!Array.isArray(rawValue)) return []
  return rawValue
    .map((item) => normalizeDormDriftBottleReplyText(item))
    .filter(Boolean)
    .slice(0, DORM_DRIFT_BOTTLE_FOLLOW_UP_LIMIT)
}

const buildDormDriftBottleFeedbackSnippet = (text, limit = DORM_DRIFT_BOTTLE_FEEDBACK_TEXT_LIMIT) => {
  const normalizedText = normalizeDormDriftBottleText(text)
  const safeLimit = clampInt(limit, 8, DORM_DRIFT_BOTTLE_TEXT_LIMIT, DORM_DRIFT_BOTTLE_FEEDBACK_TEXT_LIMIT)
  if (normalizedText.length <= safeLimit) return normalizedText
  return `${normalizedText.slice(0, safeLimit)}...`
}

const createDormDriftBottle = ({ text = '', authorBookId = '', authorCharId = '', authorName = '' } = {}) => {
  const normalizedText = normalizeDormDriftBottleText(text)
  if (!normalizedText) return null
  return {
    id: `drift_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    text: normalizedText,
    authorBookId: String(authorBookId || '').trim(),
    authorCharId: String(authorCharId || '').trim(),
    authorName: String(authorName || '匿名').trim() || '匿名',
    createdAt: new Date().toISOString(),
  }
}

const normalizeDormDriftBottlePool = (rawValue) => {
  if (!Array.isArray(rawValue)) return []
  return rawValue
    .map((item) => ({
      id: String(item?.id || `drift_${Date.now()}`).trim(),
      text: normalizeDormDriftBottleText(item?.text),
      authorBookId: String(item?.authorBookId || '').trim(),
      authorCharId: String(item?.authorCharId || '').trim(),
      authorName: String(item?.authorName || '匿名').trim() || '匿名',
      createdAt: String(item?.createdAt || new Date().toISOString()),
    }))
    .filter((item) => item.id && item.text)
    .slice(0, DORM_DRIFT_BOTTLE_POOL_LIMIT)
}

const normalizeDormDriftBottleSeenIds = (rawValue) => {
  if (!Array.isArray(rawValue)) return []
  const next = []
  rawValue.forEach((item) => {
    const key = String(item || '').trim()
    if (!key) return
    if (next.includes(key)) return
    next.push(key)
  })
  return next.slice(-DORM_DRIFT_BOTTLE_SEEN_LIMIT)
}

const createDormDriftBottleInboxEntry = (bottle, {
  replyState = 'none',
  replyText = '',
  replyAuthorName = '',
  replyAt = '',
} = {}) => {
  const normalizedBottle = bottle && typeof bottle === 'object' ? bottle : {}
  const normalizedText = normalizeDormDriftBottleText(normalizedBottle.text)
  if (!normalizedText) return null
  const normalizedReplyText = normalizeDormDriftBottleReplyText(replyText)
  const fallbackReplyState = normalizedReplyText ? 'ready' : 'none'
  const normalizedReplyState = normalizeDormDriftBottleReplyState(replyState, fallbackReplyState)
  return {
    id: `drift_pick_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    bottleId: String(normalizedBottle.id || '').trim(),
    text: normalizedText,
    authorName: String(normalizedBottle.authorName || '匿名').trim() || '匿名',
    pickedAt: new Date().toISOString(),
    createdAt: String(normalizedBottle.createdAt || ''),
    replyState: normalizedReplyState,
    replyText: normalizedReplyText,
    replyAuthorName: String(replyAuthorName || '角色').trim() || '角色',
    replyAt: normalizedReplyText
      ? String(replyAt || new Date().toISOString())
      : '',
    isStarred: false,
    followUpReplies: [],
  }
}

const normalizeDormDriftBottleInbox = (rawValue) => {
  if (!Array.isArray(rawValue)) return []
  return rawValue
    .map((item) => {
      const normalizedReplyText = normalizeDormDriftBottleReplyText(item?.replyText || item?.reply)
      const fallbackReplyState = normalizedReplyText ? 'ready' : 'none'
      return {
        id: String(item?.id || `drift_pick_${Date.now()}`).trim(),
        bottleId: String(item?.bottleId || '').trim(),
        text: normalizeDormDriftBottleText(item?.text),
        authorName: String(item?.authorName || '匿名').trim() || '匿名',
        pickedAt: String(item?.pickedAt || new Date().toISOString()),
        createdAt: String(item?.createdAt || ''),
        replyState: normalizeDormDriftBottleReplyState(item?.replyState, fallbackReplyState),
        replyText: normalizedReplyText,
        replyAuthorName: String(item?.replyAuthorName || '角色').trim() || '角色',
        replyAt: normalizedReplyText
          ? String(item?.replyAt || item?.pickedAt || new Date().toISOString())
          : '',
        isStarred: Boolean(item?.isStarred),
        followUpReplies: normalizeDormDriftBottleFollowUpReplies(item?.followUpReplies),
      }
    })
    .filter((item) => item.id && item.text)
    .slice(0, DORM_DRIFT_BOTTLE_INBOX_LIMIT)
}

const getCharacterDisplayName = (character, index = 0) => {
  const fallback = `角色 ${index + 1}`
  return String(character?.name || '').trim() || fallback
}

const pickCharacterPortrait = (character) => {
  if (!Array.isArray(character?.portraits) || character.portraits.length === 0) {
    return null
  }
  return character.portraits.find((portrait) => String(portrait?.emotion || '').trim() === 'default') || character.portraits[0]
}

const getDefaultDormOutfitId = () => {
  return String(DORM_OUTFIT_LIBRARY[0]?.id || 'campus-casual').trim() || 'campus-casual'
}

const getDormOutfitById = (outfitId) => {
  const key = String(outfitId || '').trim()
  if (!key) return null
  return DORM_OUTFIT_LIBRARY.find((item) => item.id === key) || null
}

const normalizeDormOutfitIds = (rawValue) => {
  const source = Array.isArray(rawValue) ? rawValue : []
  const set = new Set()
  source.forEach((item) => {
    const key = String(item || '').trim()
    if (!key) return
    if (!getDormOutfitById(key)) return
    set.add(key)
  })
  if (set.size <= 0) {
    set.add(getDefaultDormOutfitId())
  }
  return [...set]
}

const normalizeDormCoinValue = (value, fallback = DORM_WARDROBE_START_COINS) => {
  return clampInt(value, 0, DORM_WARDROBE_MAX_COINS, fallback)
}

const createDefaultDormState = (character = null, label = '') => {
  const favor = Number.parseFloat(String(character?.relationshipBase?.favor ?? 0))
  const trust = Number.parseFloat(String(character?.relationshipBase?.trust ?? 50))
  const baseAffinity = Number.isFinite(favor)
    ? clampInt(Math.round((favor + 100) / 2), DORM_AFFECTION_MIN, DORM_AFFECTION_MAX, 50)
    : 50
  const baseEnergy = Number.isFinite(trust)
    ? clampInt(Math.round(trust), DORM_ENERGY_MIN, DORM_ENERGY_MAX, 70)
    : 70
  const name = String(label || character?.name || '角色').trim() || '角色'
  const dayIndex = 1
  const relationshipStage = resolveDormRelationshipStageByAffection(baseAffinity)
  const defaultOutfitId = getDefaultDormOutfitId()
  return {
    affection: baseAffinity,
    energy: baseEnergy,
    dormCoins: DORM_WARDROBE_START_COINS,
    relationshipStage,
    mood: '平静',
    dayIndex,
    timeSlotIndex: 0,
    visitCount: 0,
    chatCount: 0,
    giftCount: 0,
    eventCount: 0,
    sceneCount: 0,
    facilityUpgradeCount: 0,
    driftBottleThrowCount: 0,
    driftBottlePickCount: 0,
    preferredSceneId: '',
    sceneVisitMap: {},
    sceneFacilityLevels: {},
    driftBottleSeenIds: [],
    driftBottleInbox: [],
    ownedOutfitIds: [defaultOutfitId],
    equippedOutfitId: defaultOutfitId,
    activeEvent: null,
    todayWishes: createDailyWishesForCharacter(character, name, dayIndex),
    chatHistory: [
      createDormChatMessage('assistant', `${name}看向你，示意你可以直接开口聊天。`),
    ],
    journal: [createJournalEntry(`寝室记录已建立：${name}`, 'system')],
  }
}

const normalizeDormState = (rawValue, fallbackCharacter = null, fallbackLabel = '') => {
  const fallback = createDefaultDormState(fallbackCharacter, fallbackLabel)
  const source = rawValue && typeof rawValue === 'object' ? rawValue : {}
  const rawJournal = Array.isArray(source.journal) ? source.journal : []
  const chatHistory = normalizeDormChatHistory(source.chatHistory)
  const driftBottleSeenIds = normalizeDormDriftBottleSeenIds(source.driftBottleSeenIds)
  const driftBottleInbox = normalizeDormDriftBottleInbox(source.driftBottleInbox)
  const ownedOutfitIds = normalizeDormOutfitIds(source.ownedOutfitIds)
  const equippedOutfitCandidate = String(source.equippedOutfitId || '').trim()
  const equippedOutfitId = ownedOutfitIds.includes(equippedOutfitCandidate)
    ? equippedOutfitCandidate
    : ownedOutfitIds[0]
  const journal = rawJournal
    .map((item) => ({
      id: String(item?.id || `journal_${Date.now()}`),
      text: String(item?.text || '').trim(),
      type: String(item?.type || 'system').trim() || 'system',
      time: String(item?.time || new Date().toISOString()),
    }))
    .filter((item) => item.text)
    .slice(0, DORM_JOURNAL_LIMIT)

  return {
    affection: clampInt(source.affection, DORM_AFFECTION_MIN, DORM_AFFECTION_MAX, fallback.affection),
    energy: clampInt(source.energy, DORM_ENERGY_MIN, DORM_ENERGY_MAX, fallback.energy),
    dormCoins: normalizeDormCoinValue(source.dormCoins, fallback.dormCoins),
    relationshipStage: normalizeDormRelationshipStage(
      source.relationshipStage,
      clampInt(source.affection, DORM_AFFECTION_MIN, DORM_AFFECTION_MAX, fallback.affection),
    ),
    mood: String(source.mood || fallback.mood).trim() || fallback.mood,
    dayIndex: clampInt(source.dayIndex, 1, 9999, fallback.dayIndex),
    timeSlotIndex: clampInt(source.timeSlotIndex, 0, DORM_TIME_SLOT_COUNT, fallback.timeSlotIndex),
    visitCount: clampInt(source.visitCount, 0, 9999, fallback.visitCount),
    chatCount: clampInt(source.chatCount, 0, 9999, fallback.chatCount),
    giftCount: clampInt(source.giftCount, 0, 9999, fallback.giftCount),
    eventCount: clampInt(source.eventCount, 0, 9999, fallback.eventCount),
    sceneCount: clampInt(source.sceneCount, 0, 9999, fallback.sceneCount),
    facilityUpgradeCount: clampInt(source.facilityUpgradeCount, 0, 9999, fallback.facilityUpgradeCount),
    driftBottleThrowCount: clampInt(source.driftBottleThrowCount, 0, 99, fallback.driftBottleThrowCount),
    driftBottlePickCount: clampInt(source.driftBottlePickCount, 0, 99, fallback.driftBottlePickCount),
    preferredSceneId: String(source.preferredSceneId || '').trim(),
    sceneVisitMap: normalizeCounterMap(source.sceneVisitMap, 32),
    sceneFacilityLevels: normalizeFacilityLevelMap(source.sceneFacilityLevels, 32),
    driftBottleSeenIds,
    driftBottleInbox,
    ownedOutfitIds,
    equippedOutfitId,
    activeEvent: normalizeActiveDormEventState(source.activeEvent),
    todayWishes: normalizeDailyWishList(source.todayWishes, fallback.todayWishes),
    chatHistory: chatHistory.length > 0 ? chatHistory : fallback.chatHistory,
    journal: journal.length > 0 ? journal : fallback.journal,
  }
}

const normalizeDormRuntimeMap = (rawValue) => {
  if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) return {}
  const next = {}
  Object.keys(rawValue).forEach((key) => {
    const runtimeKey = String(key || '').trim()
    if (!runtimeKey) return
    next[runtimeKey] = normalizeDormState(rawValue[key])
  })
  return next
}

const readDormRuntimeMap = () => {
  if (typeof window === 'undefined' || !window.localStorage) return {}
  try {
    const raw = window.localStorage.getItem(DORM_RUNTIME_STORAGE_KEY)
    if (!raw) return {}
    return normalizeDormRuntimeMap(JSON.parse(raw))
  } catch {
    return {}
  }
}

const persistDormRuntimeMap = (nextMap) => {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    window.localStorage.setItem(DORM_RUNTIME_STORAGE_KEY, JSON.stringify(normalizeDormRuntimeMap(nextMap)))
  } catch {
    // ignore
  }
}

const readDormDriftBottlePool = () => {
  if (typeof window === 'undefined' || !window.localStorage) return []
  try {
    const raw = window.localStorage.getItem(DORM_DRIFT_BOTTLE_POOL_STORAGE_KEY)
    if (!raw) return []
    return normalizeDormDriftBottlePool(JSON.parse(raw))
  } catch {
    return []
  }
}

const persistDormDriftBottlePool = (nextPool) => {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    window.localStorage.setItem(
      DORM_DRIFT_BOTTLE_POOL_STORAGE_KEY,
      JSON.stringify(normalizeDormDriftBottlePool(nextPool)),
    )
  } catch {
    // ignore
  }
}

const isAndroidPlatform = computed(() => isAndroid())

const activeBook = computed(() => {
  if (!worldBooks.value.length) return null
  const maxIndex = worldBooks.value.length - 1
  const nextIndex = Math.max(0, Math.min(activeCardIndex.value, maxIndex))
  if (nextIndex !== activeCardIndex.value) activeCardIndex.value = nextIndex
  return worldBooks.value[nextIndex] || null
})

const characterCards = computed(() => {
  const characters = Array.isArray(activeBook.value?.characters) ? activeBook.value.characters : []
  return characters.map((character, index) => ({
    id: String(character?.id || `char_${index + 1}`),
    label: getCharacterDisplayName(character, index),
    raw: character,
  }))
})

const selectedCharacter = computed(() => {
  return characterCards.value.find((card) => card.id === selectedCharacterId.value) || null
})

const selectedDormRuntimeKey = computed(() => {
  const bookId = String(activeBook.value?.id || '').trim()
  const characterId = String(selectedCharacterId.value || '').trim()
  if (!bookId || !characterId) return ''
  return `${bookId}::${characterId}`
})

const selectedDormState = computed(() => {
  if (!selectedDormRuntimeKey.value) {
    return createDefaultDormState(selectedCharacter.value?.raw, selectedCharacter.value?.label)
  }
  return normalizeDormState(
    dormRuntimeMap.value[selectedDormRuntimeKey.value],
    selectedCharacter.value?.raw,
    selectedCharacter.value?.label,
  )
})

const selectedDormRelationshipStageId = computed(() => {
  return normalizeDormRelationshipStage(selectedDormState.value.relationshipStage, selectedDormState.value.affection)
})

const selectedDormRelationshipStageLabel = computed(() => {
  return getDormRelationshipStageLabel(selectedDormRelationshipStageId.value)
})

const selectedDormUnlockedEventChainTitles = computed(() => {
  return getUnlockedDormEventChainsByStage(selectedDormRelationshipStageId.value)
    .map((chain) => String(chain?.title || '').trim())
    .filter(Boolean)
})

const selectedDormUnlockedEventChainCount = computed(() => {
  return selectedDormUnlockedEventChainTitles.value.length
})

const selectedDormUnlockedEventChainHint = computed(() => {
  if (selectedDormUnlockedEventChainTitles.value.length <= 0) return '当前关系阶段暂无可用事件链'
  return selectedDormUnlockedEventChainTitles.value.join('、')
})

const selectedDormEventChainPreviewList = computed(() => {
  const currentStageId = selectedDormRelationshipStageId.value
  const currentStageIndex = getDormRelationshipStageIndex(currentStageId)
  return DORM_EVENT_CHAIN_LIBRARY.map((chain) => {
    const requiredStageId = getDormEventChainMinRelationshipStage(chain)
    const requiredStageIndex = getDormRelationshipStageIndex(requiredStageId)
    const unlocked = currentStageIndex >= requiredStageIndex
    const steps = Array.isArray(chain?.steps) ? chain.steps.length : 0
    return {
      id: String(chain?.id || '').trim(),
      title: String(chain?.title || '事件链').trim() || '事件链',
      stepCount: clampInt(steps, 1, 20, 1),
      unlocked,
      requiredStageLabel: getDormRelationshipStageLabel(requiredStageId),
    }
  })
})

const selectedDormEventChainDetail = computed(() => {
  const previewList = selectedDormEventChainPreviewList.value
  if (previewList.length <= 0) return null

  const fallbackId = previewList.find((item) => item.unlocked)?.id || previewList[0].id
  const requestedId = String(selectedEventChainPreviewId.value || '').trim()
  const selectedPreview = previewList.find((item) => item.id === requestedId)
    || previewList.find((item) => item.id === fallbackId)
    || previewList[0]
  if (!selectedPreview) return null

  const chainTemplate = findDormEventChainTemplateById(selectedPreview.id)
  const characterLabel = selectedCharacter.value?.label || '角色'
  const stepList = getDormEventChainStepList(chainTemplate)
  const firstStep = stepList[0] || null
  const firstStepTitle = String(firstStep?.title || '').trim()
  const firstStepDescription = String(firstStep?.description || '').trim()
  const endingTags = collectDormEventChainEndingTags(chainTemplate, characterLabel)

  return {
    ...selectedPreview,
    summary: buildDormEventChainSummaryText(chainTemplate, characterLabel),
    firstStepTitle: firstStepTitle || '起始阶段',
    firstStepDescription: firstStepDescription ? renderTemplate(firstStepDescription, characterLabel) : '',
    endingTags,
  }
})

const selectedDormRelationshipNextStage = computed(() => {
  const currentIndex = getDormRelationshipStageIndex(selectedDormRelationshipStageId.value)
  return DORM_RELATIONSHIP_STAGE_LIBRARY[currentIndex + 1] || null
})

const selectedDormRelationshipProgressHint = computed(() => {
  const nextStage = selectedDormRelationshipNextStage.value
  if (!nextStage) return '已达到最高关系阶段'
  return `下一阶段「${nextStage.label}」需好感 ${nextStage.minAffection}`
})

const selectedCharacterArchetypes = computed(() => {
  return deriveCharacterDormArchetypes(selectedCharacter.value?.raw)
})

const selectedCharacterArchetypeLabels = computed(() => {
  const labels = selectedCharacterArchetypes.value.map(getDormArchetypeLabel).slice(0, 5)
  return labels.length > 0 ? labels.join(' / ') : '均衡'
})

const generatedDormSubScenes = computed(() => {
  if (!selectedCharacter.value) return []
  return buildDormSubScenesForCharacter(selectedCharacter.value.raw, selectedCharacter.value.label)
})

const activeDormSubScene = computed(() => {
  if (generatedDormSubScenes.value.length <= 0) return null
  return generatedDormSubScenes.value.find((scene) => scene.id === selectedSubSceneId.value) || generatedDormSubScenes.value[0]
})

const activeDormSubSceneActivityOptions = computed(() => {
  const pool = Array.isArray(activeDormSubScene.value?.activityPool) ? activeDormSubScene.value.activityPool : []
  return pool.map((activity, index) => ({
    ...activity,
    id: String(activity?.id || `scene_activity_${index + 1}`).trim() || `scene_activity_${index + 1}`,
    label: String(activity?.label || `场景互动 ${index + 1}`).trim() || `场景互动 ${index + 1}`,
  }))
})

const selectedDormSubSceneActivity = computed(() => {
  const source = activeDormSubSceneActivityOptions.value
  if (source.length <= 0) return null
  const selectedId = String(selectedSubSceneActivityId.value || '').trim()
  return source.find((activity) => activity.id === selectedId) || source[0]
})

const selectedDormQuickActionLabel = computed(() => {
  const key = String(dormQuickActionType.value || '').trim()
  return DORM_QUICK_ACTION_LABEL_MAP[key] || DORM_QUICK_ACTION_LABEL_MAP.chat
})

const canRunDormQuickAction = computed(() => {
  if (String(dormQuickActionType.value || '').trim() !== 'event') return true
  return !activeDormEvent.value
})

const dormQuickActionRunButtonText = computed(() => {
  const quickActionId = String(dormQuickActionType.value || '').trim()
  if (quickActionId === 'event') {
    return activeDormEvent.value ? '事件进行中' : '执行：触发事件'
  }
  return `执行：${selectedDormQuickActionLabel.value}`
})

const activeDormSubSceneVisitCount = computed(() => {
  const sceneId = String(activeDormSubScene.value?.id || '').trim()
  if (!sceneId) return 0
  return clampInt(selectedDormState.value.sceneVisitMap?.[sceneId], 0, 9999, 0)
})

const activeDormSubSceneFacilityLevel = computed(() => {
  return getSceneFacilityLevelFromState(selectedDormState.value, activeDormSubScene.value?.id)
})

const activeDormSubSceneFacilityBonusPercent = computed(() => {
  return getFacilityBonusPercentByLevel(activeDormSubSceneFacilityLevel.value)
})

const remainingDormActionSlots = computed(() => {
  const used = clampInt(selectedDormState.value.timeSlotIndex, 0, DORM_TIME_SLOT_COUNT, 0)
  return Math.max(0, DORM_TIME_SLOT_COUNT - used)
})

const currentDormTimeSlotLabel = computed(() => {
  if (remainingDormActionSlots.value <= 0) return '已结束'
  const used = clampInt(selectedDormState.value.timeSlotIndex, 0, DORM_TIME_SLOT_COUNT - 1, 0)
  return DORM_TIME_SLOT_LABELS[used] || DORM_TIME_SLOT_LABELS[0]
})

const isDormDayActionClosed = computed(() => {
  return remainingDormActionSlots.value <= 0
})

const completedTodayWishCount = computed(() => {
  return selectedDormState.value.todayWishes.filter((wish) => wish.completed).length
})

const totalTodayWishCount = computed(() => {
  return selectedDormState.value.todayWishes.length
})

const activeDormEventChainProgressText = computed(() => {
  if (!activeDormEvent.value || activeDormEvent.value.mode !== 'chain') return ''
  const stageText = `${activeDormEvent.value.chainStepIndex + 1} / ${activeDormEvent.value.chainStepTotal}`
  return `事件链进度 ${stageText}`
})

const canUpgradeActiveSceneFacility = computed(() => {
  if (!activeDormSubScene.value) return false
  if (activeDormSubSceneFacilityLevel.value >= DORM_SCENE_FACILITY_MAX_LEVEL) return false
  return true
})

const activeSceneUpgradeButtonText = computed(() => {
  if (activeDormSubSceneFacilityLevel.value >= DORM_SCENE_FACILITY_MAX_LEVEL) return '设施已满级'
  if (selectedDormState.value.energy < DORM_SCENE_FACILITY_UPGRADE_ENERGY_COST) return `体力不足（需 ${DORM_SCENE_FACILITY_UPGRADE_ENERGY_COST}）`
  return `升级设施（消耗 ${DORM_SCENE_FACILITY_UPGRADE_ENERGY_COST} 体力）`
})

const selectedDormAffectionStyle = computed(() => ({ width: `${selectedDormState.value.affection}%` }))
const selectedDormEnergyStyle = computed(() => ({ width: `${selectedDormState.value.energy}%` }))
const activeDormOverlayPanelLabel = computed(() => {
  const key = String(activeDormOverlayPanelId.value || '').trim()
  return DORM_OVERLAY_PANEL_LABEL_MAP[key] || DORM_OVERLAY_PANEL_LABEL_MAP.interaction
})
const selectedDormChatHistory = computed(() => {
  return normalizeDormChatHistory(selectedDormState.value.chatHistory)
})
const canSendDormChat = computed(() => {
  if (isDormChatSending.value) return false
  return String(dormChatDraft.value || '').trim().length > 0
})

const selectedDormOwnedOutfitIds = computed(() => {
  return normalizeDormOutfitIds(selectedDormState.value.ownedOutfitIds)
})

const selectedDormOwnedOutfitIdSet = computed(() => {
  return new Set(selectedDormOwnedOutfitIds.value)
})

const selectedDormOwnedOutfits = computed(() => {
  return selectedDormOwnedOutfitIds.value
    .map((outfitId) => getDormOutfitById(outfitId))
    .filter((item) => Boolean(item))
})

const selectedDormEquippedOutfit = computed(() => {
  const equippedId = String(selectedDormState.value.equippedOutfitId || '').trim()
  const matched = getDormOutfitById(equippedId)
  if (matched && selectedDormOwnedOutfitIdSet.value.has(matched.id)) return matched
  return selectedDormOwnedOutfits.value[0] || DORM_OUTFIT_LIBRARY[0] || null
})

const dormOutfitShopList = computed(() => {
  return DORM_OUTFIT_LIBRARY.map((outfit) => ({
    ...outfit,
    owned: selectedDormOwnedOutfitIdSet.value.has(outfit.id),
    affordable: selectedDormState.value.dormCoins >= outfit.price,
  }))
})

const selectedDormDriftAuthorBookId = computed(() => {
  return String(activeBook.value?.id || '').trim()
})

const selectedDormDriftAuthorCharId = computed(() => {
  return String(selectedCharacter.value?.id || '').trim()
})

const selectedDormDriftAuthorName = computed(() => {
  return String(selectedCharacter.value?.label || '匿名角色').trim() || '匿名角色'
})

const selectedDormDriftPoolList = computed(() => {
  return normalizeDormDriftBottlePool(driftBottlePool.value)
})

const selectedDormDriftExternalPoolList = computed(() => {
  const selfBookId = selectedDormDriftAuthorBookId.value
  const selfCharId = selectedDormDriftAuthorCharId.value
  return selectedDormDriftPoolList.value.filter((item) => {
    const isSelf = item.authorBookId === selfBookId && item.authorCharId === selfCharId
    return !isSelf
  })
})

const selectedDormDriftPickCandidates = computed(() => {
  const seenIdSet = new Set(normalizeDormDriftBottleSeenIds(selectedDormState.value.driftBottleSeenIds))
  return selectedDormDriftExternalPoolList.value.filter((item) => !seenIdSet.has(item.id))
})

const selectedDormDriftInbox = computed(() => {
  return normalizeDormDriftBottleInbox(selectedDormState.value.driftBottleInbox)
})

const selectedDormDriftMyThrowList = computed(() => {
  const bookId = selectedDormDriftAuthorBookId.value
  const charId = selectedDormDriftAuthorCharId.value
  if (!bookId || !charId) return []
  return selectedDormDriftPoolList.value
    .filter((item) => item.authorBookId === bookId && item.authorCharId === charId)
    .slice(0, 16)
})

const selectedDormDriftRemainingThrowCount = computed(() => {
  const used = clampInt(selectedDormState.value.driftBottleThrowCount, 0, DORM_DRIFT_BOTTLE_DAILY_THROW_LIMIT, 0)
  return Math.max(0, DORM_DRIFT_BOTTLE_DAILY_THROW_LIMIT - used)
})

const selectedDormDriftRemainingPickCount = computed(() => {
  const used = clampInt(selectedDormState.value.driftBottlePickCount, 0, DORM_DRIFT_BOTTLE_DAILY_PICK_LIMIT, 0)
  return Math.max(0, DORM_DRIFT_BOTTLE_DAILY_PICK_LIMIT - used)
})

const canThrowDormDriftBottle = computed(() => {
  if (!selectedDormRuntimeKey.value) return false
  if (selectedDormDriftRemainingThrowCount.value <= 0) return false
  return normalizeDormDriftBottleText(driftBottleDraft.value).length > 0
})

const canPickDormDriftBottle = computed(() => {
  if (!selectedDormRuntimeKey.value) return false
  if (isDormDriftPicking.value) return false
  if (selectedDormDriftRemainingPickCount.value <= 0) return false
  return selectedDormDriftPickCandidates.value.length > 0
})

const selectedDormDriftPickHint = computed(() => {
  if (isDormDriftPicking.value) return '正在捞取并等待角色回信...'
  if (selectedDormDriftRemainingPickCount.value <= 0) return '今日捞取次数已用完。'
  if (selectedDormDriftPickCandidates.value.length > 0) return `海域仍有 ${selectedDormDriftPickCandidates.value.length} 条可捞新漂流瓶。`
  if (selectedDormDriftExternalPoolList.value.length <= 0) return '海域里目前只有你投放的漂流瓶，等等别人再来吧。'
  return '你已经看过当前海域里的其他漂流瓶了。'
})

const isDormDriftFollowUpPending = (entryId = '') => {
  const safeId = String(entryId || '').trim()
  if (!safeId) return false
  return driftFollowupPendingEntryId.value === safeId
}

const canAskDormDriftBottleFollowUp = (entry = null) => {
  if (!selectedDormRuntimeKey.value) return false
  if (isDormDriftPicking.value) return false
  const safeEntry = entry && typeof entry === 'object' ? entry : null
  if (!safeEntry?.id) return false
  if (safeEntry.replyState === 'pending') return false
  const followUps = normalizeDormDriftBottleFollowUpReplies(safeEntry.followUpReplies)
  if (followUps.length >= DORM_DRIFT_BOTTLE_FOLLOW_UP_LIMIT) return false
  if (driftFollowupPendingEntryId.value && !isDormDriftFollowUpPending(safeEntry.id)) return false
  return true
}

const characterGridColumns = computed(() => {
  const count = characterCards.value.length
  if (count <= 0) return 1
  return Math.min(5, count)
})

const characterGridStyle = computed(() => ({
  '--dorm-grid-columns': String(characterGridColumns.value),
}))

const selectedCharacterPortraitUrl = computed(() => {
  const key = String(selectedCharacter.value?.id || '').trim()
  if (!key) return defaultPortraitUrl.value
  return portraitUrlMap.value[key] || defaultPortraitUrl.value
})

const getDefaultPortraitUrl = async () => {
  if (portraitImageCache.value.has(DEFAULT_PORTRAIT_PATH)) return portraitImageCache.value.get(DEFAULT_PORTRAIT_PATH)

  if (window.avgLLM?.file?.readImage) {
    try {
      const result = await window.avgLLM.file.readImage(DEFAULT_PORTRAIT_PATH)
      if (result?.base64) {
        const nextUrl = `data:${result.mimeType};base64,${result.base64}`
        portraitImageCache.value.set(DEFAULT_PORTRAIT_PATH, nextUrl)
        return nextUrl
      }
    } catch {
      return DEFAULT_PORTRAIT_PATH
    }
  }

  return DEFAULT_PORTRAIT_PATH
}

const getPortraitImageUrl = async (portrait) => {
  if (!portrait?.filePath) return getDefaultPortraitUrl()

  const rawPath = String(portrait.filePath || '').trim()
  if (!rawPath) return getDefaultPortraitUrl()

  if (rawPath.startsWith('data:image')) return rawPath
  if (rawPath.startsWith('http://') || rawPath.startsWith('https://')) return rawPath

  if (portraitImageCache.value.has(rawPath)) return portraitImageCache.value.get(rawPath)

  if (window.avgLLM?.file?.readImage) {
    try {
      const result = await window.avgLLM.file.readImage(rawPath)
      if (result?.base64) {
        const nextUrl = `data:${result.mimeType};base64,${result.base64}`
        portraitImageCache.value.set(rawPath, nextUrl)
        return nextUrl
      }
    } catch {
      return getDefaultPortraitUrl()
    }
  }

  return getDefaultPortraitUrl()
}

const preloadCharacterPortraits = async () => {
  const token = ++characterPreloadToken
  isLoadingCharacters.value = true

  try {
    const nextMap = {}
    await Promise.all(
      characterCards.value.map(async (card) => {
        const portrait = pickCharacterPortrait(card.raw)
        nextMap[card.id] = await getPortraitImageUrl(portrait)
      }),
    )

    if (token !== characterPreloadToken) return
    portraitUrlMap.value = nextMap
  } finally {
    if (token === characterPreloadToken) isLoadingCharacters.value = false
  }
}

const ensureSelectedBookAsActive = async () => {
  const bookId = String(activeBook.value?.id || '').trim()
  if (!bookId) return
  await setActiveWorldBookId(bookId)
}

const ensureDormStateForCharacter = (characterId) => {
  const bookId = String(activeBook.value?.id || '').trim()
  const charId = String(characterId || '').trim()
  if (!bookId || !charId) return

  const key = `${bookId}::${charId}`
  const card = characterCards.value.find((item) => item.id === charId) || null
  const normalized = normalizeDormState(dormRuntimeMap.value[key], card?.raw, card?.label)

  if (!dormRuntimeMap.value[key]) {
    const nextMap = { ...dormRuntimeMap.value, [key]: normalized }
    dormRuntimeMap.value = nextMap
    persistDormRuntimeMap(nextMap)
  }
}

const updateDormStateByRuntimeKey = (runtimeKey, updater, { fallbackCharacter = null, fallbackLabel = '' } = {}) => {
  const key = String(runtimeKey || '').trim()
  if (!key) return
  const previous = normalizeDormState(dormRuntimeMap.value[key], fallbackCharacter, fallbackLabel)
  const updated = typeof updater === 'function' ? updater({ ...previous }) : previous
  const normalized = normalizeDormState(updated, fallbackCharacter, fallbackLabel)
  const nextMap = { ...dormRuntimeMap.value, [key]: normalized }
  dormRuntimeMap.value = nextMap
  persistDormRuntimeMap(nextMap)
}

const updateSelectedDormState = (updater) => {
  updateDormStateByRuntimeKey(selectedDormRuntimeKey.value, updater, {
    fallbackCharacter: selectedCharacter.value?.raw,
    fallbackLabel: selectedCharacter.value?.label,
  })
}

const resolveDormDriftBottleFallbackReply = ({
  bottleText = '',
  bottleAuthorName = '',
  characterCard = null,
} = {}) => {
  const safeCharacter = characterCard && typeof characterCard === 'object' ? characterCard : null
  const archetypes = deriveCharacterDormArchetypes(safeCharacter?.raw)
  const snippet = buildDormDriftBottleFeedbackSnippet(bottleText, 24)
  const safeAuthorName = String(bottleAuthorName || '匿名').trim() || '匿名'
  const snippets = [
    `这句“${snippet}”让我有点在意，来自 ${safeAuthorName}。`,
    `看到“${snippet}”这条，我会记住的。`,
    `这条漂流瓶挺有意思，我想再看看后续。`,
  ]
  if (archetypes.includes('analytical') || archetypes.includes('orderly')) {
    snippets[0] = `“${snippet}”信息很清晰，来自 ${safeAuthorName}，先记录下来。`
  } else if (archetypes.includes('emotional') || archetypes.includes('quiet')) {
    snippets[0] = `“${snippet}”这句有点触动我，谢谢对方愿意写下来。`
  } else if (archetypes.includes('extrovert') || archetypes.includes('social')) {
    snippets[0] = `这条“${snippet}”很有互动感，下次我也想回一条。`
  }
  return normalizeDormDriftBottleReplyText(snippets[randomInt(0, snippets.length - 1)])
}

const resolveDormDriftBottleFollowUpFallbackReply = ({
  bottleText = '',
  previousReply = '',
  followUpCount = 0,
  characterCard = null,
} = {}) => {
  const safeCharacter = characterCard && typeof characterCard === 'object' ? characterCard : null
  const archetypes = deriveCharacterDormArchetypes(safeCharacter?.raw)
  const snippet = buildDormDriftBottleFeedbackSnippet(bottleText, 18)
  const previousSnippet = normalizeDormDriftBottleReplyText(previousReply)
  const sequenceLabel = followUpCount > 0 ? `补充第 ${followUpCount + 1} 条` : '补充'
  const snippets = [
    `${sequenceLabel}想法：关于“${snippet}”，我更在意对方当时的心境。`,
    `${sequenceLabel}一下，我会把“${snippet}”这句和最近发生的事一起看。`,
    `${sequenceLabel}一句：这条漂流瓶后劲很大。`,
  ]
  if (archetypes.includes('analytical') || archetypes.includes('orderly')) {
    snippets[0] = `${sequenceLabel}判断：这条“${snippet}”的关键是动机和时机。`
  } else if (archetypes.includes('emotional') || archetypes.includes('quiet')) {
    snippets[0] = `${sequenceLabel}感受：这句“${snippet}”有一种克制但真诚的情绪。`
  } else if (archetypes.includes('extrovert') || archetypes.includes('social')) {
    snippets[0] = `${sequenceLabel}看法：这句“${snippet}”很想让人立刻回应对方。`
  }
  if (previousSnippet) {
    snippets[1] = `${sequenceLabel}延伸：在我刚才“${buildDormDriftBottleFeedbackSnippet(previousSnippet, 16)}”的基础上，我想再观察一下。`
  }
  return normalizeDormDriftBottleReplyText(snippets[randomInt(0, snippets.length - 1)])
}

const requestDormDriftBottleRoleReply = async ({
  worldBook = null,
  characterCard = null,
  history = [],
  bottleText = '',
  bottleAuthorName = '',
  previousReply = '',
  followUpCount = 0,
  mode = 'pick',
  fallbackReply = '',
} = {}) => {
  const safeFallback = normalizeDormDriftBottleReplyText(fallbackReply)
  const safeBottleText = normalizeDormDriftBottleText(bottleText)
  if (!safeBottleText) return safeFallback
  const safeAuthorName = String(bottleAuthorName || '匿名').trim() || '匿名'
  const safePreviousReply = normalizeDormDriftBottleReplyText(previousReply)
  const safeMode = String(mode || 'pick').trim() === 'follow-up' ? 'follow-up' : 'pick'

  try {
    const smsResult = await generatePhoneSmsReply({
      worldBook,
      contact: buildDormChatContact(characterCard),
      userMessage: safeMode === 'follow-up'
        ? [
            '我们在寝室漂流瓶互动中继续追问同一条瓶子。',
            `漂流瓶内容：「${safeBottleText}」`,
            `署名：${safeAuthorName}`,
            safePreviousReply ? `你上一条回应是：「${safePreviousReply}」` : '',
            `这是第 ${Math.max(1, followUpCount + 1)} 次补充回复，请再补充 1-2 句自然回应。`,
          ].filter(Boolean).join('\n')
        : [
            '我们在寝室海域捞到一条漂流瓶。',
            `漂流瓶内容：「${safeBottleText}」`,
            `署名：${safeAuthorName}`,
            '请你以当前角色身份，给出对这条漂流瓶的即时回应（1-2句）。',
          ].join('\n'),
      history: (Array.isArray(history) ? history : [])
        .slice(-8)
        .map((item) => ({
          role: item.role === 'assistant' ? 'assistant' : 'user',
          text: String(item?.text || '').trim(),
        }))
        .filter((item) => item.text),
      options: {
        historyLimit: 6,
        dialogueLimit: 0,
        maxTokens: 220,
      },
    })

    if (!smsResult.success || !Array.isArray(smsResult.replies)) return safeFallback
    const reply = smsResult.replies
      .map((item) => normalizeDormDriftBottleReplyText(item))
      .filter(Boolean)
      .slice(0, 2)
      .join(' ')
    return reply ? normalizeDormDriftBottleReplyText(reply) : safeFallback
  } catch {
    return safeFallback
  }
}

const setActiveDormEvent = (nextEvent, { persist = true } = {}) => {
  const normalized = normalizeActiveDormEventState(nextEvent)
  activeDormEvent.value = normalized
  if (!persist || !selectedDormRuntimeKey.value) return
  updateSelectedDormState((previous) => ({
    ...previous,
    activeEvent: normalized,
  }))
}

const clearDormEvent = ({ persist = true } = {}) => {
  activeDormEvent.value = null
  if (!persist || !selectedDormRuntimeKey.value) return
  updateSelectedDormState((previous) => ({
    ...previous,
    activeEvent: null,
  }))
}

const buildFacilityBoostedAction = ({ affectionDelta = 0, energyDelta = 0 }, level, enabled = true) => {
  const baseAffection = Number(affectionDelta) || 0
  const baseEnergy = Number(energyDelta) || 0
  if (!enabled) {
    return {
      affectionDelta: baseAffection,
      energyDelta: baseEnergy,
      hasBoost: false,
    }
  }

  const nextAffection = applyFacilityBonusDelta(baseAffection, level)
  const nextEnergy = applyFacilityBonusDelta(baseEnergy, level)
  return {
    affectionDelta: nextAffection,
    energyDelta: nextEnergy,
    hasBoost: nextAffection !== baseAffection || nextEnergy !== baseEnergy,
  }
}

const ensureActionTimeAvailable = (actionLabel = '行动') => {
  if (!isDormDayActionClosed.value) return true
  actionFeedback.value = `今日时段已用尽，请先进入下一天再进行${actionLabel}。`
  return false
}

const applyDailyProgressToState = (state, { consumeTimeSlot = false, wishType = '', charLabel = '角色' } = {}) => {
  const next = { ...state }
  const usedSlot = clampInt(next.timeSlotIndex, 0, DORM_TIME_SLOT_COUNT, 0)
  const nextUsedSlot = consumeTimeSlot
    ? clampInt(usedSlot + 1, 0, DORM_TIME_SLOT_COUNT, usedSlot)
    : usedSlot
  next.timeSlotIndex = nextUsedSlot

  const wishResult = resolveDailyWishesByAction(next.todayWishes, wishType)
  next.todayWishes = wishResult.wishes

  if (wishResult.rewardAffection > 0 || wishResult.rewardEnergy > 0) {
    next.affection = clampInt(next.affection + wishResult.rewardAffection, DORM_AFFECTION_MIN, DORM_AFFECTION_MAX, next.affection)
    next.energy = clampInt(next.energy + wishResult.rewardEnergy, DORM_ENERGY_MIN, DORM_ENERGY_MAX, next.energy)
    wishResult.completedLabels.forEach((label) => {
      next.journal = appendJournal(
        next.journal,
        renderTemplate(`完成今日心愿：${label}（奖励 好感+${wishResult.rewardAffection} / 体力+${wishResult.rewardEnergy}）`, charLabel),
        'wish',
      )
    })
  }

  return {
    state: next,
    consumedSlot: consumeTimeSlot && nextUsedSlot > usedSlot,
    remainingSlots: Math.max(0, DORM_TIME_SLOT_COUNT - nextUsedSlot),
    completedWishLabels: wishResult.completedLabels,
  }
}

const applyDormAction = ({
  affectionDelta = 0,
  energyDelta = 0,
  mood = '',
  journalText = '',
  feedbackText = '',
  countKey = '',
  type = 'system',
  consumeTimeSlot = false,
  wishType = '',
}) => {
  const charName = selectedCharacter.value?.label || '角色'
  const nextJournal = renderTemplate(journalText, charName)
  const nextFeedback = renderTemplate(feedbackText || journalText, charName)
  if (consumeTimeSlot && isDormDayActionClosed.value) {
    actionFeedback.value = '今日时段已用尽，请先进入下一天。'
    return
  }
  let progressOutcome = {
    consumedSlot: false,
    remainingSlots: remainingDormActionSlots.value,
    completedWishLabels: [],
  }
  let stageOutcome = {
    changed: false,
    previousStage: '',
    nextStage: '',
    unlockedChainTitles: [],
  }

  updateSelectedDormState((previous) => {
    const previousStage = normalizeDormRelationshipStage(previous.relationshipStage, previous.affection)
    const previousUnlockedChainIdSet = new Set(
      getUnlockedDormEventChainsByStage(previousStage)
        .map((chain) => String(chain?.id || '').trim())
        .filter(Boolean),
    )
    const baseNext = {
      ...previous,
      affection: clampInt(previous.affection + affectionDelta, DORM_AFFECTION_MIN, DORM_AFFECTION_MAX, previous.affection),
      energy: clampInt(previous.energy + energyDelta, DORM_ENERGY_MIN, DORM_ENERGY_MAX, previous.energy),
      mood: String(mood || previous.mood).trim() || previous.mood,
      journal: nextJournal ? appendJournal(previous.journal, nextJournal, type) : previous.journal,
    }
    if (countKey && Number.isFinite(Number(baseNext[countKey]))) {
      baseNext[countKey] = clampInt(baseNext[countKey] + 1, 0, 9999, baseNext[countKey])
    }

    const progressed = applyDailyProgressToState(baseNext, {
      consumeTimeSlot,
      wishType,
      charLabel: charName,
    })
    progressOutcome = {
      consumedSlot: progressed.consumedSlot,
      remainingSlots: progressed.remainingSlots,
      completedWishLabels: progressed.completedWishLabels,
    }
    const progressedState = { ...progressed.state }
    const nextStage = resolveDormRelationshipStageByAffection(progressedState.affection)
    progressedState.relationshipStage = nextStage

    if (nextStage !== previousStage) {
      const nextUnlockedChains = getUnlockedDormEventChainsByStage(nextStage)
      const unlockedChainTitles = nextUnlockedChains
        .filter((chain) => !previousUnlockedChainIdSet.has(String(chain?.id || '').trim()))
        .map((chain) => String(chain?.title || '').trim())
        .filter(Boolean)
      stageOutcome = {
        changed: true,
        previousStage,
        nextStage,
        unlockedChainTitles,
      }

      const stageJournalText = unlockedChainTitles.length > 0
        ? `关系阶段提升为「${getDormRelationshipStageLabel(nextStage)}」，解锁事件链：${unlockedChainTitles.join('、')}。`
        : `关系阶段提升为「${getDormRelationshipStageLabel(nextStage)}」。`
      progressedState.journal = appendJournal(
        progressedState.journal,
        renderTemplate(stageJournalText, charName),
        'stage',
      )
    }
    return progressedState
  })

  let feedback = nextFeedback || '互动完成。'
  if (progressOutcome.completedWishLabels.length > 0) {
    feedback = `${feedback} 已完成心愿：${progressOutcome.completedWishLabels.join('、')}。`
  }
  if (stageOutcome.changed) {
    const stageText = `关系阶段提升：${getDormRelationshipStageLabel(stageOutcome.previousStage)} -> ${getDormRelationshipStageLabel(stageOutcome.nextStage)}。`
    const unlockText = stageOutcome.unlockedChainTitles.length > 0
      ? ` 已解锁事件链：${stageOutcome.unlockedChainTitles.join('、')}。`
      : ''
    feedback = `${feedback} ${stageText}${unlockText}`.trim()
    showStageUpgradeToast(stageOutcome)
  }
  if (progressOutcome.consumedSlot && progressOutcome.remainingSlots <= 0) {
    feedback = `${feedback} 今日时段已结束，可进入下一天。`
  }
  actionFeedback.value = feedback
}

const handleAdvanceDormDay = () => {
  const nextDay = clampInt(selectedDormState.value.dayIndex + 1, 1, 9999, selectedDormState.value.dayIndex + 1)
  const charName = selectedCharacter.value?.label || '角色'
  const bonusCoins = DORM_WARDROBE_DAILY_COINS

  updateSelectedDormState((previous) => ({
    ...previous,
    dayIndex: nextDay,
    timeSlotIndex: 0,
    driftBottleThrowCount: 0,
    driftBottlePickCount: 0,
    dormCoins: normalizeDormCoinValue(
      normalizeDormCoinValue(previous.dormCoins, DORM_WARDROBE_START_COINS) + bonusCoins,
      DORM_WARDROBE_START_COINS,
    ),
    mood: '平静',
    todayWishes: createDailyWishesForCharacter(selectedCharacter.value?.raw, charName, nextDay),
    journal: appendJournal(
      previous.journal,
      renderTemplate(`第${nextDay}天开始，今日心愿已刷新，并获得 ${bonusCoins} 寝室币。`, charName),
      'system',
    ),
  }))

  actionFeedback.value = `已进入第 ${nextDay} 天，新的时段与心愿已刷新，并获得 ${bonusCoins} 寝室币。`
}

const handleThrowDormDriftBottle = () => {
  if (!selectedDormRuntimeKey.value) return

  const content = normalizeDormDriftBottleText(driftBottleDraft.value)
  if (!content) {
    actionFeedback.value = '请输入要投放的漂流瓶内容。'
    return
  }
  if (selectedDormDriftRemainingThrowCount.value <= 0) {
    actionFeedback.value = '今天已经投放过漂流瓶了，明天再来吧。'
    return
  }

  const bottle = createDormDriftBottle({
    text: content,
    authorBookId: selectedDormDriftAuthorBookId.value,
    authorCharId: selectedDormDriftAuthorCharId.value,
    authorName: selectedDormDriftAuthorName.value,
  })
  if (!bottle) return

  const nextPool = [bottle, ...normalizeDormDriftBottlePool(driftBottlePool.value)]
    .slice(0, DORM_DRIFT_BOTTLE_POOL_LIMIT)
  driftBottlePool.value = nextPool
  persistDormDriftBottlePool(nextPool)

  const charName = selectedCharacter.value?.label || '角色'
  updateSelectedDormState((previous) => ({
    ...previous,
    driftBottleThrowCount: clampInt(previous.driftBottleThrowCount + 1, 0, 99, previous.driftBottleThrowCount),
    journal: appendJournal(
      previous.journal,
      renderTemplate(`你帮{char}投放了一个漂流瓶：「${bottle.text}」`, charName),
      'drift',
    ),
  }))

  driftBottleDraft.value = ''
  actionFeedback.value = '漂流瓶已投放到公共海域。'
}

const handlePickDormDriftBottle = async () => {
  if (!selectedDormRuntimeKey.value) return
  if (isDormDriftPicking.value) return
  if (selectedDormDriftRemainingPickCount.value <= 0) {
    actionFeedback.value = '今天捞瓶次数已用完，明天再来吧。'
    return
  }

  if (selectedDormDriftPickCandidates.value.length <= 0) {
    actionFeedback.value = selectedDormDriftPickHint.value
    return
  }

  const pickedBottle = selectedDormDriftPickCandidates.value[randomInt(0, selectedDormDriftPickCandidates.value.length - 1)]
  const runtimeKeyAtRequest = selectedDormRuntimeKey.value
  const worldBookAtRequest = activeBook.value
  const characterCardAtRequest = selectedCharacter.value
  const historyAtRequest = selectedDormChatHistory.value
  const requestToken = ++dormDriftPickRequestToken
  const charName = selectedCharacter.value?.label || '角色'
  const pickedInboxEntry = createDormDriftBottleInboxEntry(pickedBottle, {
    replyState: 'pending',
    replyAuthorName: charName,
  })
  if (!pickedInboxEntry) return

  updateSelectedDormState((previous) => ({
    ...previous,
    driftBottlePickCount: clampInt(previous.driftBottlePickCount + 1, 0, 99, previous.driftBottlePickCount),
    driftBottleSeenIds: normalizeDormDriftBottleSeenIds([
      ...normalizeDormDriftBottleSeenIds(previous.driftBottleSeenIds),
      pickedBottle.id,
    ]),
    driftBottleInbox: [pickedInboxEntry, ...normalizeDormDriftBottleInbox(previous.driftBottleInbox)]
      .slice(0, DORM_DRIFT_BOTTLE_INBOX_LIMIT),
    journal: appendJournal(
      previous.journal,
      renderTemplate(`你和{char}捞到漂流瓶：${pickedBottle.text}（来自 ${pickedBottle.authorName}）`, charName),
      'drift',
    ),
  }))

  actionFeedback.value = `捞到一条漂流瓶：「${buildDormDriftBottleFeedbackSnippet(pickedBottle.text)}」`
  isDormDriftPicking.value = true

  let resolvedReply = resolveDormDriftBottleFallbackReply({
    bottleText: pickedBottle.text,
    bottleAuthorName: pickedBottle.authorName,
    characterCard: characterCardAtRequest,
  })
  resolvedReply = await requestDormDriftBottleRoleReply({
    worldBook: worldBookAtRequest,
    characterCard: characterCardAtRequest,
    history: historyAtRequest,
    bottleText: pickedBottle.text,
    bottleAuthorName: pickedBottle.authorName,
    mode: 'pick',
    fallbackReply: resolvedReply,
  })
  if (requestToken === dormDriftPickRequestToken) {
    isDormDriftPicking.value = false
  }

  if (requestToken !== dormDriftPickRequestToken) return

  updateDormStateByRuntimeKey(runtimeKeyAtRequest, (previous) => {
    const inbox = normalizeDormDriftBottleInbox(previous.driftBottleInbox)
    let updated = false
    const nextInbox = inbox.map((entry) => {
      if (entry.id !== pickedInboxEntry.id) return entry
      updated = true
      return {
        ...entry,
        replyState: 'ready',
        replyText: resolvedReply,
        replyAuthorName: charName,
        replyAt: new Date().toISOString(),
      }
    })
    if (!updated) return previous
    return {
      ...previous,
      driftBottleInbox: nextInbox,
      journal: appendJournal(
        previous.journal,
        renderTemplate(`{char}看完漂流瓶后说：「${resolvedReply}」`, charName),
        'drift',
      ),
    }
  }, {
    fallbackCharacter: characterCardAtRequest?.raw,
    fallbackLabel: characterCardAtRequest?.label,
  })

  if (runtimeKeyAtRequest === selectedDormRuntimeKey.value) {
    actionFeedback.value = `${charName}看完漂流瓶后给出了回应。`
  }
}

const handleToggleDormDriftBottleStar = (entryId) => {
  const safeId = String(entryId || '').trim()
  if (!safeId) return

  let nextStarState = false
  updateSelectedDormState((previous) => {
    const inbox = normalizeDormDriftBottleInbox(previous.driftBottleInbox)
    let updated = false
    const nextInbox = inbox.map((entry) => {
      if (entry.id !== safeId) return entry
      updated = true
      nextStarState = !Boolean(entry.isStarred)
      return {
        ...entry,
        isStarred: nextStarState,
      }
    })
    if (!updated) return previous
    return {
      ...previous,
      driftBottleInbox: nextInbox,
    }
  })

  actionFeedback.value = nextStarState ? '已收藏这条漂流瓶。' : '已取消收藏。'
}

const handleDeleteDormDriftBottleInboxEntry = (entryId) => {
  const safeId = String(entryId || '').trim()
  if (!safeId) return
  if (isDormDriftFollowUpPending(safeId)) {
    actionFeedback.value = '该条目正在追问中，请稍候再删除。'
    return
  }

  let removed = false
  updateSelectedDormState((previous) => {
    const inbox = normalizeDormDriftBottleInbox(previous.driftBottleInbox)
    const nextInbox = inbox.filter((entry) => entry.id !== safeId)
    removed = nextInbox.length !== inbox.length
    if (!removed) return previous
    return {
      ...previous,
      driftBottleInbox: nextInbox,
    }
  })

  if (removed) {
    actionFeedback.value = '已删除这条漂流瓶记录。'
  }
}

const handleAskDormDriftBottleFollowUp = async (entryId) => {
  const safeId = String(entryId || '').trim()
  if (!safeId) return
  if (!selectedDormRuntimeKey.value) return
  if (isDormDriftPicking.value) {
    actionFeedback.value = '当前正在捞取漂流瓶，请稍后再追问。'
    return
  }
  if (driftFollowupPendingEntryId.value && !isDormDriftFollowUpPending(safeId)) {
    actionFeedback.value = '当前已有一条漂流瓶在追问中，请稍候。'
    return
  }

  const entry = selectedDormDriftInbox.value.find((item) => item.id === safeId)
  if (!entry) return
  if (!canAskDormDriftBottleFollowUp(entry)) {
    actionFeedback.value = '该条漂流瓶当前不可追问。'
    return
  }

  const runtimeKeyAtRequest = selectedDormRuntimeKey.value
  const worldBookAtRequest = activeBook.value
  const characterCardAtRequest = selectedCharacter.value
  const historyAtRequest = selectedDormChatHistory.value
  const requestToken = ++dormDriftFollowupRequestToken
  driftFollowupPendingEntryId.value = safeId

  const charName = selectedCharacter.value?.label || '角色'
  actionFeedback.value = `${charName}正在补充回应...`

  const followUpCount = normalizeDormDriftBottleFollowUpReplies(entry.followUpReplies).length
  const previousReply = normalizeDormDriftBottleReplyText(entry.replyText)
  let resolvedReply = resolveDormDriftBottleFollowUpFallbackReply({
    bottleText: entry.text,
    previousReply,
    followUpCount,
    characterCard: characterCardAtRequest,
  })

  resolvedReply = await requestDormDriftBottleRoleReply({
    worldBook: worldBookAtRequest,
    characterCard: characterCardAtRequest,
    history: historyAtRequest,
    bottleText: entry.text,
    bottleAuthorName: entry.authorName,
    previousReply,
    followUpCount,
    mode: 'follow-up',
    fallbackReply: resolvedReply,
  })

  if (requestToken !== dormDriftFollowupRequestToken) return

  updateDormStateByRuntimeKey(runtimeKeyAtRequest, (previous) => {
    const inbox = normalizeDormDriftBottleInbox(previous.driftBottleInbox)
    let updated = false
    const nextInbox = inbox.map((item) => {
      if (item.id !== safeId) return item
      updated = true
      const nextFollowUps = [
        ...normalizeDormDriftBottleFollowUpReplies(item.followUpReplies),
        resolvedReply,
      ].slice(0, DORM_DRIFT_BOTTLE_FOLLOW_UP_LIMIT)
      return {
        ...item,
        followUpReplies: nextFollowUps,
        replyAuthorName: charName,
        replyAt: new Date().toISOString(),
      }
    })
    if (!updated) return previous
    return {
      ...previous,
      driftBottleInbox: nextInbox,
      journal: appendJournal(
        previous.journal,
        renderTemplate(`{char}补充了漂流瓶回应：「${resolvedReply}」`, charName),
        'drift',
      ),
    }
  }, {
    fallbackCharacter: characterCardAtRequest?.raw,
    fallbackLabel: characterCardAtRequest?.label,
  })

  if (runtimeKeyAtRequest === selectedDormRuntimeKey.value) {
    actionFeedback.value = `${charName}补充了一条新回应。`
  }
  if (requestToken === dormDriftFollowupRequestToken) {
    driftFollowupPendingEntryId.value = ''
  }
}

const handleEquipDormOutfit = async (outfitId) => {
  const outfit = getDormOutfitById(outfitId)
  if (!outfit) return

  const charName = selectedCharacter.value?.label || '角色'
  const currentEquippedId = String(selectedDormState.value.equippedOutfitId || '').trim()
  if (currentEquippedId === outfit.id) {
    actionFeedback.value = `${charName}当前已穿着「${outfit.name}」。`
    return
  }
  if (!selectedDormOwnedOutfitIdSet.value.has(outfit.id)) {
    actionFeedback.value = `尚未拥有「${outfit.name}」，请先购买。`
    return
  }

  updateSelectedDormState((previous) => ({
    ...previous,
    equippedOutfitId: outfit.id,
    journal: appendJournal(
      previous.journal,
      renderTemplate(`你帮{char}换上了「${outfit.name}」。`, charName),
      'wardrobe',
    ),
  }))

  actionFeedback.value = `已为${charName}换上「${outfit.name}」。`

  // 触发LLM剧情：CHAR对衣服的看法
  await generateWardrobeOutfitComment(outfit)
}

const handleBuyDormOutfit = (outfitId) => {
  const outfit = getDormOutfitById(outfitId)
  if (!outfit) return

  const charName = selectedCharacter.value?.label || '角色'
  if (selectedDormOwnedOutfitIdSet.value.has(outfit.id)) {
    actionFeedback.value = `「${outfit.name}」已在衣柜中。`
    return
  }

  const currentCoins = normalizeDormCoinValue(selectedDormState.value.dormCoins, DORM_WARDROBE_START_COINS)
  if (currentCoins < outfit.price) {
    actionFeedback.value = `寝室币不足，购买「${outfit.name}」需要 ${outfit.price}。`
    return
  }

  updateSelectedDormState((previous) => {
    const ownedOutfitIds = normalizeDormOutfitIds(previous.ownedOutfitIds)
    if (ownedOutfitIds.includes(outfit.id)) return previous

    const previousCoins = normalizeDormCoinValue(previous.dormCoins, DORM_WARDROBE_START_COINS)
    return {
      ...previous,
      dormCoins: normalizeDormCoinValue(previousCoins - outfit.price, previousCoins),
      ownedOutfitIds: [...ownedOutfitIds, outfit.id],
      equippedOutfitId: outfit.id,
      journal: appendJournal(
        previous.journal,
        renderTemplate(`你为{char}购买了「${outfit.name}」，并立刻换上。`, charName),
        'wardrobe',
      ),
    }
  })

  actionFeedback.value = `购买成功：${outfit.name}（-${outfit.price} 寝室币）。`
}

const buildDormChatContact = (characterCard = selectedCharacter.value) => {
  const safeCharacterCard = characterCard && typeof characterCard === 'object' ? characterCard : null
  const character = safeCharacterCard?.raw || {}
  const personality = character?.personalityProfile && typeof character.personalityProfile === 'object'
    ? character.personalityProfile
    : {}
  const behaviorTags = Array.isArray(personality.behaviorTags)
    ? personality.behaviorTags.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 6)
    : []
  const dimensionText = personality?.cognitiveDimensions && typeof personality.cognitiveDimensions === 'object'
    ? Object.entries(personality.cognitiveDimensions)
      .map(([key, value]) => {
        const numeric = Number.parseFloat(String(value))
        if (!Number.isFinite(numeric)) return ''
        return `${key}:${numeric}`
      })
      .filter(Boolean)
      .slice(0, 4)
      .join(' | ')
    : ''
  const identityParts = [
    String(character?.identity || '').trim(),
    String(character?.background || '').trim(),
    behaviorTags.length > 0 ? `性格标签：${behaviorTags.join('、')}` : '',
    dimensionText ? `认知维度：${dimensionText}` : '',
  ].filter(Boolean)
  return {
    id: String(safeCharacterCard?.id || '').trim(),
    name: safeCharacterCard?.label || String(character?.name || '角色').trim() || '角色',
    identity: identityParts.join('；'),
    subtitle: String(character?.appearance || '').trim(),
  }
}

const generateWardrobeOutfitComment = async (outfit) => {
  if (!outfit || !selectedCharacter.value) return

  const charName = selectedCharacter.value?.label || '角色'
  const outfitName = outfit.name || '这件衣服'
  const outfitStyle = outfit.style || '日常'
  const outfitDescription = outfit.description || ''

  isWardrobeOutfitCommentGenerating.value = true
  wardrobeOutfitComment.value = ''
  wardrobeOutfitCommentError.value = ''

  try {
    const smsResult = await generatePhoneSmsReply({
      worldBook: activeBook.value,
      contact: buildDormChatContact(),
      userMessage: `对方让你穿上「${outfitName}」。这是一套${outfitStyle}风格的服装，${outfitDescription}。请以你当前角色的身份，对对方让你穿这件衣服这件事发表反应和看法，分成2-4条连续短信，每条8-40字，自然口语化，像平时聊天一样。可以表达对这件衣服的感受、态度，或者对让你穿这件衣服的人的反应。`,
      history: selectedDormChatHistory.value.slice(-4).map((item) => ({
        role: item.role === 'assistant' ? 'assistant' : 'user',
        text: String(item?.text || '').trim(),
      })).filter((item) => item.text),
      options: {
        historyLimit: 4,
        dialogueLimit: 0,
        maxTokens: 220,
      },
    })

    if (smsResult.success && smsResult.replies && smsResult.replies.length > 0) {
      const commentText = smsResult.replies.join(' ')
      wardrobeOutfitComment.value = commentText

      updateSelectedDormState((previous) => {
        let nextChatHistory = previous.chatHistory
        let nextJournal = previous.journal || []

        smsResult.replies.forEach((reply) => {
          nextChatHistory = appendDormChatMessage(nextChatHistory, 'assistant', reply)
          nextJournal = appendJournal(nextJournal, `你让{char}穿上「${outfitName}」，${charName}说：${reply}`, 'chat')
        })

        return {
          ...previous,
          chatHistory: nextChatHistory,
          journal: nextJournal,
        }
      })

      await nextTick()
      const container = dormChatHistoryRef.value
      if (container) {
        container.scrollTop = container.scrollHeight
      }
    } else {
      wardrobeOutfitCommentError.value = smsResult.error || '生成失败'
    }
  } catch (error) {
    wardrobeOutfitCommentError.value = `生成出错：${error.message}`
  } finally {
    isWardrobeOutfitCommentGenerating.value = false
  }
}

const handleSendDormChat = async () => {
  if (isDormChatSending.value) return
  if (!selectedDormRuntimeKey.value) return

  const userMessage = String(dormChatDraft.value || '').replace(/\s+/g, ' ').trim().slice(0, 280)
  if (!userMessage) return

  const runtimeKeyAtRequest = selectedDormRuntimeKey.value
  const historyBefore = selectedDormChatHistory.value
  const characterLabel = selectedCharacter.value?.label || '角色'
  const requestToken = ++dormChatRequestToken

  dormChatDraft.value = ''
  dormChatError.value = ''
  isDormChatSending.value = true

  updateSelectedDormState((previous) => ({
    ...previous,
    chatHistory: appendDormChatMessage(previous.chatHistory, 'user', userMessage),
    journal: appendJournal(previous.journal, `你对${characterLabel}说：「${userMessage}」`, 'chat'),
  }))

  try {
    const result = await generatePhoneSmsReply({
      worldBook: activeBook.value,
      contact: buildDormChatContact(),
      userMessage,
      history: historyBefore
        .slice(-12)
        .map((item) => ({
          role: item.role === 'assistant' ? 'assistant' : 'user',
          text: item.text,
        })),
      options: {
        historyLimit: 10,
        dialogueLimit: 0,
        maxTokens: 420,
      },
    })

    if (requestToken !== dormChatRequestToken) return
    if (runtimeKeyAtRequest !== selectedDormRuntimeKey.value) return

    if (!result.success || !Array.isArray(result.replies) || result.replies.length <= 0) {
      const errorText = String(result.error || '角色暂时没有回复，请稍后再试。').trim() || '角色暂时没有回复，请稍后再试。'
      dormChatError.value = errorText
      actionFeedback.value = errorText
      return
    }

    const replies = result.replies
      .map((item) => String(item || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .slice(0, 4)
    if (replies.length <= 0) {
      dormChatError.value = '角色暂时没有回复，请稍后再试。'
      actionFeedback.value = dormChatError.value
      return
    }

    updateSelectedDormState((previous) => {
      let nextChatHistory = normalizeDormChatHistory(previous.chatHistory)
      let nextJournal = previous.journal
      replies.forEach((reply) => {
        nextChatHistory = appendDormChatMessage(nextChatHistory, 'assistant', reply)
        nextJournal = appendJournal(nextJournal, `${characterLabel}：${reply}`, 'chat')
      })
      return {
        ...previous,
        chatHistory: nextChatHistory,
        journal: nextJournal,
      }
    })

    actionFeedback.value = `${characterLabel}回复了你。`
  } finally {
    if (requestToken === dormChatRequestToken) {
      isDormChatSending.value = false
    }
  }
}

const scrollDormChatToBottom = async () => {
  await nextTick()
  const container = dormChatHistoryRef.value
  if (!container) return
  container.scrollTop = container.scrollHeight
}

const handleRunDormQuickAction = () => {
  const actionType = String(dormQuickActionType.value || '').trim()
  if (actionType === 'gift') {
    handleGiftAction()
    return
  }
  if (actionType === 'rest') {
    handleRestAction()
    return
  }
  if (actionType === 'event') {
    if (activeDormEvent.value) {
      actionFeedback.value = '当前已有进行中的事件，请先完成后再触发新事件。'
      return
    }
    triggerDormEvent()
    return
  }
  if (actionType === 'outing') {
    handleOutingAction()
    return
  }
  handleChatAction()
}

const handleChatAction = () => {
  if (!ensureActionTimeAvailable('聊天')) return
  const pool = [
    '{char}靠在椅背上，认真听完了你的分享。',
    '你和{char}聊起最近的琐事，气氛很轻松。',
    '{char}说了句玩笑话，寝室里一下子热闹起来。',
  ]
  const boosted = buildFacilityBoostedAction(
    {
      affectionDelta: randomInt(3, 6),
      energyDelta: -randomInt(3, 6),
    },
    activeDormSubSceneFacilityLevel.value,
    true,
  )
  const boostSuffix = boosted.hasBoost ? `（${activeDormSubScene.value?.name || '当前场景'}设施加成）` : ''
  applyDormAction({
    affectionDelta: boosted.affectionDelta,
    energyDelta: boosted.energyDelta,
    mood: '开心',
    journalText: pool[randomInt(0, pool.length - 1)],
    feedbackText: `你们聊了很久，关系更近了一点。${boostSuffix}`,
    countKey: 'chatCount',
    type: 'chat',
    consumeTimeSlot: true,
    wishType: 'chat',
  })
}

const handleGiftAction = () => {
  if (!ensureActionTimeAvailable('送礼')) return
  const gifts = ['手作甜点', '书签', '便携耳机', '电影票']
  const pickedGift = gifts[randomInt(0, gifts.length - 1)]
  const boosted = buildFacilityBoostedAction(
    {
      affectionDelta: randomInt(6, 11),
      energyDelta: -randomInt(2, 5),
    },
    activeDormSubSceneFacilityLevel.value,
    true,
  )
  const boostSuffix = boosted.hasBoost ? `（${activeDormSubScene.value?.name || '当前场景'}设施加成）` : ''
  applyDormAction({
    affectionDelta: boosted.affectionDelta,
    energyDelta: boosted.energyDelta,
    mood: '惊喜',
    journalText: `你送给{char}一份${pickedGift}。`,
    feedbackText: `{char}收下了${pickedGift}，看起来很开心。${boostSuffix}`,
    countKey: 'giftCount',
    type: 'gift',
    consumeTimeSlot: true,
    wishType: 'gift',
  })
}

const isPolaroidScreenOpen = ref(false)

const handleOutingAction = () => {
  if (!ensureActionTimeAvailable('邀请出去玩')) return
  isPolaroidScreenOpen.value = true
}

const handlePolaroidBack = () => {
  isPolaroidScreenOpen.value = false
}

const handlePolaroidComplete = (photoData) => {
  isPolaroidScreenOpen.value = false
  const boosted = buildFacilityBoostedAction(
    {
      affectionDelta: randomInt(8, 15),
      energyDelta: -randomInt(5, 10),
    },
    activeDormSubSceneFacilityLevel.value,
    true,
  )
  const boostSuffix = boosted.hasBoost ? `（${activeDormSubScene.value?.name || '当前场景'}设施加成）` : ''
  applyDormAction({
    affectionDelta: boosted.affectionDelta,
    energyDelta: boosted.energyDelta,
    mood: '开心',
    journalText: `你和${selectedCharacter.value?.label || '角色'}一起出去玩，拍了一张拍立得照片。`,
    feedbackText: `和${selectedCharacter.value?.label || '角色'}度过了愉快的时光，关系更近了。${boostSuffix}`,
    countKey: 'outingCount',
    type: 'outing',
    consumeTimeSlot: true,
    wishType: 'outing',
  })
}

const handleRestAction = () => {
  if (!ensureActionTimeAvailable('休息')) return
  const boosted = buildFacilityBoostedAction(
    {
      affectionDelta: randomInt(1, 3),
      energyDelta: randomInt(14, 24),
    },
    activeDormSubSceneFacilityLevel.value,
    true,
  )
  const boostSuffix = boosted.hasBoost ? `（${activeDormSubScene.value?.name || '当前场景'}设施加成）` : ''
  applyDormAction({
    affectionDelta: boosted.affectionDelta,
    energyDelta: boosted.energyDelta,
    mood: '放松',
    journalText: '你和{char}在寝室休息了一会儿。',
    feedbackText: `休息后状态恢复了不少。${boostSuffix}`,
    type: 'rest',
    consumeTimeSlot: true,
    wishType: 'rest',
  })
}

const triggerDormEvent = () => {
  if (activeDormEvent.value) return
  if (!ensureActionTimeAvailable('触发事件')) return

  const charName = selectedCharacter.value?.label || '角色'
  const activeScene = activeDormSubScene.value
  const scenePool = getSceneEventPool(activeScene?.id)
  const hasSceneEvent = scenePool.length > 0
  const eventPool = hasSceneEvent ? scenePool : DORM_EVENT_LIBRARY
  const singleFacilityLevel = hasSceneEvent ? activeDormSubSceneFacilityLevel.value : DORM_SCENE_FACILITY_MIN_LEVEL
  const singleFacilityBonusPercent = hasSceneEvent ? getFacilityBonusPercentByLevel(singleFacilityLevel) : 0
  const singleSource = hasSceneEvent ? 'scene' : 'global'

  const chainSource = activeScene ? 'scene' : 'global'
  const chainFacilityLevel = chainSource === 'scene' ? activeDormSubSceneFacilityLevel.value : DORM_SCENE_FACILITY_MIN_LEVEL
  const chainFacilityBonusPercent = chainSource === 'scene' ? getFacilityBonusPercentByLevel(chainFacilityLevel) : 0
  const chainTemplate = pickDormEventChainTemplate({
    archetypes: selectedCharacterArchetypes.value,
    timeSlotId: getDormTimeSlotIdByIndex(selectedDormState.value.timeSlotIndex),
    sceneId: activeScene?.id,
    relationshipStage: selectedDormRelationshipStageId.value,
  })
  const chainChance = chainSource === 'scene' ? 0.72 : 0.58
  const shouldUseChain = Boolean(chainTemplate) && (eventPool.length <= 0 || Math.random() < chainChance)

  let nextEventState = null
  if (shouldUseChain && chainTemplate) {
    nextEventState = buildChainDormEventState(chainTemplate, 0, {
      charLabel: charName,
      source: chainSource,
      sourceSceneId: chainSource === 'scene' ? String(activeScene?.id || '').trim() : '',
      sourceSceneName: chainSource === 'scene' ? String(activeScene?.name || '').trim() : '',
      facilityLevel: chainFacilityLevel,
      facilityBonusPercent: chainFacilityBonusPercent,
      chainPathLabels: [],
    })
  }

  if (!nextEventState && eventPool.length > 0) {
    const eventTemplate = eventPool[randomInt(0, eventPool.length - 1)]
    nextEventState = buildSingleDormEventState(eventTemplate, {
      charLabel: charName,
      source: singleSource,
      sourceSceneId: singleSource === 'scene' ? String(activeScene?.id || '').trim() : '',
      sourceSceneName: singleSource === 'scene' ? String(activeScene?.name || '').trim() : '',
      facilityLevel: singleFacilityLevel,
      facilityBonusPercent: singleFacilityBonusPercent,
    })
  }

  if (!nextEventState) return
  setActiveDormEvent(nextEventState)
  if (nextEventState.mode === 'chain') {
    actionFeedback.value = nextEventState.source === 'scene'
      ? `触发场景事件链：${nextEventState.title}（${nextEventState.sourceSceneName || '当前场景'}）`
      : `触发事件链：${nextEventState.title}`
    return
  }
  actionFeedback.value = nextEventState.source === 'scene'
    ? `触发场景事件：${nextEventState.title}（${nextEventState.sourceSceneName || '当前场景'}）`
    : `触发事件：${nextEventState.title}`
}

const handleDormEventOption = (option) => {
  if (!option || !activeDormEvent.value) return
  if (!ensureActionTimeAvailable('处理事件')) return
  const currentEvent = normalizeActiveDormEventState(activeDormEvent.value)
  if (!currentEvent) return

  const isSceneEvent = currentEvent.source === 'scene'
  const facilityLevel = clampInt(
    currentEvent.facilityLevel,
    DORM_SCENE_FACILITY_MIN_LEVEL,
    DORM_SCENE_FACILITY_MAX_LEVEL,
    DORM_SCENE_FACILITY_MIN_LEVEL,
  )
  const boosted = buildFacilityBoostedAction(
    {
      affectionDelta: Number(option.affectionDelta) || 0,
      energyDelta: Number(option.energyDelta) || 0,
    },
    facilityLevel,
    isSceneEvent,
  )

  let nextAffectionDelta = boosted.affectionDelta
  let nextEnergyDelta = boosted.energyDelta
  let nextMood = String(option.mood || '').trim()
  let nextJournalText = option.message || '你们共同完成了一次事件。'
  let nextFeedbackText = option.message || '事件已结算。'
  let nextEventState = null
  let chainCompleted = false
  let endingSummary = ''

  if (currentEvent.mode === 'chain') {
    const chainTemplate = findDormEventChainTemplateById(currentEvent.chainId)
    const nextPathLabels = normalizeStringArray([...(currentEvent.chainPathLabels || []), option.label], 8)
    const nextStepIndex = resolveDormEventChainNextStepIndex(chainTemplate, currentEvent.chainStepIndex, option)
    if (nextStepIndex >= 0 && chainTemplate) {
      nextEventState = buildChainDormEventState(chainTemplate, nextStepIndex, {
        charLabel: selectedCharacter.value?.label || '角色',
        source: currentEvent.source,
        sourceSceneId: currentEvent.sourceSceneId,
        sourceSceneName: currentEvent.sourceSceneName,
        facilityLevel,
        facilityBonusPercent: currentEvent.facilityBonusPercent,
        chainPathLabels: nextPathLabels,
      })
      if (nextEventState) {
        nextFeedbackText = `${nextFeedbackText} 事件链推进到 ${nextEventState.chainStepTitle}（${nextEventState.chainStepIndex + 1}/${nextEventState.chainStepTotal}）。`
      }
    } else {
      chainCompleted = true
      nextAffectionDelta += clampInt(option.endingAffectionBonus, -100, 100, 0)
      nextEnergyDelta += clampInt(option.endingEnergyBonus, -100, 100, 0)
      const endingText = String(option.endingText || '').trim()
      const messageParts = [String(option.message || '').trim(), endingText].filter(Boolean)
      if (messageParts.length > 0) nextJournalText = messageParts.join(' ')
      nextFeedbackText = endingText || option.message || '事件链已完成。'
      endingSummary = String(option.endingTag || endingText).trim()
    }
  }

  if (isSceneEvent && currentEvent.sourceSceneId) {
    updateDormSubSceneState(currentEvent.sourceSceneId, { countVisit: true, appendSceneJournal: false })
  }

  const bonusSuffix = boosted.hasBoost ? `（设施 Lv${currentEvent.facilityLevel} 加成）` : ''
  const completionSuffix = chainCompleted ? ` 事件链「${currentEvent.title}」已完结。` : ''
  applyDormAction({
    affectionDelta: nextAffectionDelta,
    energyDelta: nextEnergyDelta,
    mood: nextMood,
    journalText: nextJournalText,
    feedbackText: `${nextFeedbackText}${bonusSuffix}${completionSuffix}`,
    countKey: 'eventCount',
    type: 'event',
    consumeTimeSlot: true,
    wishType: 'event',
  })

  if (chainCompleted && endingSummary) {
    updateSelectedDormState((previous) => ({
      ...previous,
      journal: appendJournal(previous.journal, renderTemplate(`事件链结局：${endingSummary}`, selectedCharacter.value?.label), 'event'),
    }))
  }

  if (nextEventState) {
    setActiveDormEvent(nextEventState)
    return
  }
  clearDormEvent()
}

const updateDormSubSceneState = (sceneId, { countVisit = false, appendSceneJournal = false } = {}) => {
  const safeSceneId = String(sceneId || '').trim()
  if (!safeSceneId) return

  updateSelectedDormState((previous) => {
    const nextSceneVisitMap = normalizeCounterMap(previous.sceneVisitMap, 32)
    if (countVisit) {
      nextSceneVisitMap[safeSceneId] = clampInt((nextSceneVisitMap[safeSceneId] || 0) + 1, 0, 9999, 0)
    }

    const selectedScene = generatedDormSubScenes.value.find((item) => item.id === safeSceneId)
    const sceneJournal = appendSceneJournal && selectedScene
      ? appendJournal(
          previous.journal,
          renderTemplate(`你和{char}来到${selectedScene.name}。`, selectedCharacter.value?.label),
          'scene',
        )
      : previous.journal

    return {
      ...previous,
      preferredSceneId: safeSceneId,
      sceneVisitMap: nextSceneVisitMap,
      journal: sceneJournal,
    }
  })
}

const handleSelectDormSubScene = (sceneId) => {
  const nextId = String(sceneId || '').trim()
  if (!nextId) return

  const selectedScene = generatedDormSubScenes.value.find((item) => item.id === nextId)
  if (!selectedScene) return

  const changed = selectedSubSceneId.value !== nextId
  selectedSubSceneId.value = nextId
  if (!changed) return

  updateDormSubSceneState(nextId, { countVisit: true, appendSceneJournal: true })
  clearDormEvent()
  actionFeedback.value = `已切换到二级场景：${selectedScene.name}`
}

const handleDormSubSceneSelectChange = (event) => {
  const nextId = String(event?.target?.value || '').trim()
  if (!nextId) return
  handleSelectDormSubScene(nextId)
}

const handleUpgradeActiveSceneFacility = () => {
  if (!activeDormSubScene.value) return
  if (!ensureActionTimeAvailable('升级设施')) return

  const scene = activeDormSubScene.value
  const currentLevel = activeDormSubSceneFacilityLevel.value
  if (currentLevel >= DORM_SCENE_FACILITY_MAX_LEVEL) {
    actionFeedback.value = `${scene.name} 的设施已满级。`
    return
  }

  if (selectedDormState.value.energy < DORM_SCENE_FACILITY_UPGRADE_ENERGY_COST) {
    actionFeedback.value = `体力不足，升级需要 ${DORM_SCENE_FACILITY_UPGRADE_ENERGY_COST} 点体力。`
    return
  }

  const nextLevel = currentLevel + 1
  const charName = selectedCharacter.value?.label || '角色'
  let progressOutcome = {
    consumedSlot: false,
    remainingSlots: remainingDormActionSlots.value,
    completedWishLabels: [],
  }
  let stageOutcome = {
    changed: false,
    previousStage: '',
    nextStage: '',
    unlockedChainTitles: [],
  }
  updateSelectedDormState((previous) => {
    const previousStage = normalizeDormRelationshipStage(previous.relationshipStage, previous.affection)
    const previousUnlockedChainIdSet = new Set(
      getUnlockedDormEventChainsByStage(previousStage)
        .map((chain) => String(chain?.id || '').trim())
        .filter(Boolean),
    )
    const nextFacilityLevels = normalizeFacilityLevelMap(previous.sceneFacilityLevels, 32)
    nextFacilityLevels[scene.id] = clampInt(
      nextLevel,
      DORM_SCENE_FACILITY_MIN_LEVEL,
      DORM_SCENE_FACILITY_MAX_LEVEL,
      DORM_SCENE_FACILITY_MIN_LEVEL,
    )

    const baseNext = {
      ...previous,
      energy: clampInt(
        previous.energy - DORM_SCENE_FACILITY_UPGRADE_ENERGY_COST,
        DORM_ENERGY_MIN,
        DORM_ENERGY_MAX,
        previous.energy,
      ),
      mood: '期待',
      facilityUpgradeCount: clampInt(previous.facilityUpgradeCount + 1, 0, 9999, previous.facilityUpgradeCount),
      sceneFacilityLevels: nextFacilityLevels,
      journal: appendJournal(
        previous.journal,
        renderTemplate(`你将${scene.name}的设施升级到了 Lv${nextLevel}。`, charName),
        'upgrade',
      ),
    }

    const progressed = applyDailyProgressToState(baseNext, {
      consumeTimeSlot: true,
      wishType: 'upgrade',
      charLabel: charName,
    })
    progressOutcome = {
      consumedSlot: progressed.consumedSlot,
      remainingSlots: progressed.remainingSlots,
      completedWishLabels: progressed.completedWishLabels,
    }
    const progressedState = { ...progressed.state }
    const nextStage = resolveDormRelationshipStageByAffection(progressedState.affection)
    progressedState.relationshipStage = nextStage
    if (nextStage !== previousStage) {
      const nextUnlockedChains = getUnlockedDormEventChainsByStage(nextStage)
      const unlockedChainTitles = nextUnlockedChains
        .filter((chain) => !previousUnlockedChainIdSet.has(String(chain?.id || '').trim()))
        .map((chain) => String(chain?.title || '').trim())
        .filter(Boolean)
      stageOutcome = {
        changed: true,
        previousStage,
        nextStage,
        unlockedChainTitles,
      }
      const stageJournalText = unlockedChainTitles.length > 0
        ? `关系阶段提升为「${getDormRelationshipStageLabel(nextStage)}」，解锁事件链：${unlockedChainTitles.join('、')}。`
        : `关系阶段提升为「${getDormRelationshipStageLabel(nextStage)}」。`
      progressedState.journal = appendJournal(
        progressedState.journal,
        renderTemplate(stageJournalText, charName),
        'stage',
      )
    }
    return progressedState
  })

  clearDormEvent()
  let feedback = `${scene.name} 设施已升级到 Lv${nextLevel}，场景收益提升至 +${getFacilityBonusPercentByLevel(nextLevel)}%。`
  if (progressOutcome.completedWishLabels.length > 0) {
    feedback = `${feedback} 已完成心愿：${progressOutcome.completedWishLabels.join('、')}。`
  }
  if (stageOutcome.changed) {
    const stageText = `关系阶段提升：${getDormRelationshipStageLabel(stageOutcome.previousStage)} -> ${getDormRelationshipStageLabel(stageOutcome.nextStage)}。`
    const unlockText = stageOutcome.unlockedChainTitles.length > 0
      ? ` 已解锁事件链：${stageOutcome.unlockedChainTitles.join('、')}。`
      : ''
    feedback = `${feedback} ${stageText}${unlockText}`.trim()
    showStageUpgradeToast(stageOutcome)
  }
  if (progressOutcome.consumedSlot && progressOutcome.remainingSlots <= 0) {
    feedback = `${feedback} 今日时段已结束，可进入下一天。`
  }
  actionFeedback.value = feedback
}

const handleDormSubSceneAction = (activity) => {
  if (!activity || !activeDormSubScene.value) return
  if (!ensureActionTimeAvailable('场景互动')) return

  const boosted = buildFacilityBoostedAction(
    {
      affectionDelta: Number(activity.affectionDelta) || 0,
      energyDelta: Number(activity.energyDelta) || 0,
    },
    activeDormSubSceneFacilityLevel.value,
    true,
  )
  const bonusSuffix = boosted.hasBoost ? `（设施 Lv${activeDormSubSceneFacilityLevel.value} 加成）` : ''

  updateDormSubSceneState(activeDormSubScene.value.id, { countVisit: true, appendSceneJournal: false })
  clearDormEvent()
  applyDormAction({
    affectionDelta: boosted.affectionDelta,
    energyDelta: boosted.energyDelta,
    mood: String(activity.mood || '').trim(),
    journalText: activity.journalText || '你们在二级场景完成了一次互动。',
    feedbackText: `${activity.feedbackText || '二级场景互动完成。'}${bonusSuffix}`,
    countKey: 'sceneCount',
    type: 'scene',
    consumeTimeSlot: true,
    wishType: 'scene',
  })
}

const handleDormSubSceneActivitySelectChange = (event) => {
  const nextId = String(event?.target?.value || '').trim()
  if (!nextId) return
  const exists = activeDormSubSceneActivityOptions.value.some((activity) => activity.id === nextId)
  if (!exists) return
  selectedSubSceneActivityId.value = nextId
}

const handleRunDormSubSceneActivity = () => {
  const selectedActivity = selectedDormSubSceneActivity.value
  if (!selectedActivity) return
  handleDormSubSceneAction(selectedActivity)
}

const handleSelectDormEventChainPreview = (chainId) => {
  const safeId = String(chainId || '').trim()
  if (!safeId) return
  const exists = selectedDormEventChainPreviewList.value.some((chain) => chain.id === safeId)
  if (!exists) return
  selectedEventChainPreviewId.value = safeId
}

const handleSelectDormOverlayPanel = (panelId) => {
  const safeId = String(panelId || '').trim()
  const exists = DORM_OVERLAY_PANEL_OPTIONS.some((panel) => panel.id === safeId)
  if (!exists) return
  isDormNavMenuOpen.value = false
  isDormMenuOpen.value = false
  if (activeDormOverlayPanelId.value === safeId && isDormOverlayPanelExpanded.value) {
    isDormOverlayPanelExpanded.value = false
    return
  }
  activeDormOverlayPanelId.value = safeId
  isDormOverlayPanelExpanded.value = true
}

const handleCollapseDormOverlayPanel = () => {
  isDormOverlayPanelExpanded.value = false
}

const handleToggleDormMenu = () => {
  isDormNavMenuOpen.value = false
  isDormMenuOpen.value = !isDormMenuOpen.value
}

const handleToggleDormNavMenu = () => {
  isDormMenuOpen.value = false
  isDormNavMenuOpen.value = !isDormNavMenuOpen.value
}

const handleDormNavBackMain = () => {
  isDormNavMenuOpen.value = false
  isDormMenuOpen.value = false
  emit('back')
}

const handleDormNavBackCharacterGrid = () => {
  isDormNavMenuOpen.value = false
  isDormMenuOpen.value = false
  backToCharacterGrid()
}

watch(
  selectedDormEventChainPreviewList,
  (list) => {
    const source = Array.isArray(list) ? list : []
    if (source.length <= 0) {
      selectedEventChainPreviewId.value = ''
      return
    }

    const currentId = String(selectedEventChainPreviewId.value || '').trim()
    const currentExists = source.some((item) => item.id === currentId)
    if (currentExists) return

    const fallbackId = source.find((item) => item.unlocked)?.id || source[0].id
    selectedEventChainPreviewId.value = fallbackId
  },
  { immediate: true },
)

watch(
  activeDormSubSceneActivityOptions,
  (activities) => {
    const source = Array.isArray(activities) ? activities : []
    if (source.length <= 0) {
      selectedSubSceneActivityId.value = ''
      return
    }

    const currentId = String(selectedSubSceneActivityId.value || '').trim()
    const exists = source.some((activity) => activity.id === currentId)
    if (exists) return
    selectedSubSceneActivityId.value = source[0].id
  },
  { immediate: true },
)

watch(
  dormQuickActionType,
  (value) => {
    const key = String(value || '').trim()
    if (Object.prototype.hasOwnProperty.call(DORM_QUICK_ACTION_LABEL_MAP, key)) return
    dormQuickActionType.value = 'chat'
  },
  { immediate: true },
)

watch(
  activeDormOverlayPanelId,
  (value) => {
    const key = String(value || '').trim()
    const exists = DORM_OVERLAY_PANEL_OPTIONS.some((panel) => panel.id === key)
    if (exists) return
    activeDormOverlayPanelId.value = 'interaction'
  },
  { immediate: true },
)

watch(
  selectedDormRuntimeKey,
  (runtimeKey) => {
    isDormNavMenuOpen.value = false
    isDormMenuOpen.value = false
    dormChatDraft.value = ''
    driftBottleDraft.value = ''
    dormChatError.value = ''
    isDormChatSending.value = false
    isDormDriftPicking.value = false
    dormDriftPickRequestToken += 1
    driftFollowupPendingEntryId.value = ''
    dormDriftFollowupRequestToken += 1
    if (!runtimeKey) {
      activeDormEvent.value = null
      return
    }
    activeDormEvent.value = normalizeActiveDormEventState(dormRuntimeMap.value[runtimeKey]?.activeEvent)
  },
  { immediate: true },
)

watch(
  [selectedDormRuntimeKey, generatedDormSubScenes],
  ([runtimeKey, scenes]) => {
    const sceneList = Array.isArray(scenes) ? scenes : []
    if (sceneList.length <= 0) {
      selectedSubSceneId.value = ''
      return
    }

    const currentExists = sceneList.some((scene) => scene.id === selectedSubSceneId.value)
    if (currentExists) return

    const preferredSceneId = runtimeKey
      ? String(dormRuntimeMap.value[runtimeKey]?.preferredSceneId || '').trim()
      : ''
    const preferredExists = preferredSceneId && sceneList.some((scene) => scene.id === preferredSceneId)
    selectedSubSceneId.value = preferredExists ? preferredSceneId : sceneList[0].id
  },
  { immediate: true },
)

watch(
  activeDormEvent,
  (eventState) => {
    if (!eventState) return
    activeDormOverlayPanelId.value = 'interaction'
    isDormOverlayPanelExpanded.value = true
  },
)

watch(
  selectedDormChatHistory,
  () => {
    void scrollDormChatToBottom()
  },
  { deep: true },
)

watch(
  [activeDormOverlayPanelId, isDormOverlayPanelExpanded],
  ([panelId, expanded]) => {
    if (!expanded || panelId !== 'interaction') return
    void scrollDormChatToBottom()
  },
)

const refreshWorldBooks = async () => {
  isLoadingBooks.value = true
  try {
    const books = await loadWorldBooks()
    worldBooks.value = Array.isArray(books) ? books : []

    if (!worldBooks.value.length) {
      activeCardIndex.value = 0
      portraitUrlMap.value = {}
      selectedCharacterId.value = ''
      return
    }

    const activeBookId = await getActiveWorldBookId()
    const matchedIndex = worldBooks.value.findIndex((book) => book.id === activeBookId)
    activeCardIndex.value = matchedIndex >= 0 ? matchedIndex : 0
    await ensureSelectedBookAsActive()
    await preloadCharacterPortraits()
  } finally {
    isLoadingBooks.value = false
  }
}

const switchWorldBookCard = async (direction = 1) => {
  if (worldBooks.value.length <= 1) return

  const step = Number(direction) >= 0 ? 1 : -1
  const total = worldBooks.value.length
  cardTransitionName.value = step > 0 ? 'card-slide-next' : 'card-slide-prev'
  activeCardIndex.value = (activeCardIndex.value + step + total) % total
  selectedCharacterId.value = ''
  actionFeedback.value = ''
  clearStageUpgradeToast()
  clearDormEvent({ persist: false })

  await ensureSelectedBookAsActive()
  await preloadCharacterPortraits()
}

const goToNextWorldBook = async () => {
  await switchWorldBookCard(1)
}

const goToPrevWorldBook = async () => {
  await switchWorldBookCard(-1)
}

const handleCardTouchStart = (event) => {
  const touch = event.touches?.[0]
  if (!touch) return
  cardTouchStartX = touch.clientX
  cardTouchStartY = touch.clientY
  cardTouchTracking = true
}

const handleCardTouchCancel = () => {
  cardTouchTracking = false
}

const handleCardTouchEnd = async (event) => {
  if (!cardTouchTracking) return
  cardTouchTracking = false

  const touch = event.changedTouches?.[0]
  if (!touch) return

  const deltaX = touch.clientX - cardTouchStartX
  const deltaY = touch.clientY - cardTouchStartY
  const horizontalSwipe = Math.abs(deltaX) >= CARD_SWIPE_TRIGGER_PX && Math.abs(deltaX) > Math.abs(deltaY)
  if (!horizontalSwipe) return

  if (deltaX < 0) {
    await goToNextWorldBook()
    return
  }
  await goToPrevWorldBook()
}

const enterCharacterGrid = async () => {
  if (!activeBook.value) return
  currentView.value = VIEW_CHARACTER_GRID
  activeCharacterIndex.value = 0
  selectedCharacterId.value = ''
  dormQuickActionType.value = 'chat'
  activeDormOverlayPanelId.value = 'interaction'
  isDormOverlayPanelExpanded.value = false
  isDormNavMenuOpen.value = false
  isDormMenuOpen.value = false
  dormChatDraft.value = ''
  driftBottleDraft.value = ''
  dormChatError.value = ''
  isDormChatSending.value = false
  isDormDriftPicking.value = false
  dormDriftPickRequestToken += 1
  driftFollowupPendingEntryId.value = ''
  dormDriftFollowupRequestToken += 1
  actionFeedback.value = ''
  clearStageUpgradeToast()
  clearDormEvent({ persist: false })
  await preloadCharacterPortraits()
}

const switchCharacterCard = async (step) => {
  const total = characterCards.value.length
  if (total <= 1) return
  characterTransitionName.value = step > 0 ? 'card-slide-next' : 'card-slide-prev'
  activeCharacterIndex.value = (activeCharacterIndex.value + step + total) % total
}

const goToNextCharacter = async () => {
  await switchCharacterCard(1)
}

const goToPrevCharacter = async () => {
  await switchCharacterCard(-1)
}

const switchToCharacter = async (targetIndex) => {
  const total = characterCards.value.length
  if (total <= 1) return
  const current = activeCharacterIndex.value
  if (targetIndex === current) return
  const diff = (targetIndex - current + total) % total
  const step = diff <= total / 2 ? diff : diff - total
  characterTransitionName.value = step > 0 ? 'card-slide-next' : 'card-slide-prev'
  activeCharacterIndex.value = targetIndex
}

let characterTouchTracking = false
let characterTouchStartX = 0

const handleCharacterTouchStart = (event) => {
  const touch = event.touches?.[0]
  if (!touch) return
  characterTouchTracking = true
  characterTouchStartX = touch.clientX
}

const handleCharacterTouchCancel = () => {
  characterTouchTracking = false
}

const handleCharacterTouchEnd = async (event) => {
  if (!characterTouchTracking) return
  characterTouchTracking = false
  const touch = event.changedTouches?.[0]
  if (!touch) return
  const deltaX = touch.clientX - characterTouchStartX
  const threshold = 40
  if (Math.abs(deltaX) < threshold) return
  if (deltaX < 0) {
    await goToNextCharacter()
    return
  }
  await goToPrevCharacter()
}

const backToBookCard = () => {
  currentView.value = VIEW_BOOK_CARD
  selectedCharacterId.value = ''
  dormQuickActionType.value = 'chat'
  activeDormOverlayPanelId.value = 'interaction'
  isDormOverlayPanelExpanded.value = false
  isDormNavMenuOpen.value = false
  dormChatDraft.value = ''
  driftBottleDraft.value = ''
  dormChatError.value = ''
  isDormChatSending.value = false
  isDormDriftPicking.value = false
  dormDriftPickRequestToken += 1
  driftFollowupPendingEntryId.value = ''
  dormDriftFollowupRequestToken += 1
  actionFeedback.value = ''
  clearStageUpgradeToast()
  clearDormEvent({ persist: false })
}

const enterCharacterRoom = (characterId) => {
  const nextId = String(characterId || '').trim()
  if (!nextId) return

  selectedCharacterId.value = nextId
  ensureDormStateForCharacter(nextId)
  currentView.value = VIEW_CHARACTER_ROOM
  dormQuickActionType.value = 'chat'
  activeDormOverlayPanelId.value = 'interaction'
  isDormOverlayPanelExpanded.value = false
  isDormNavMenuOpen.value = false
  isDormMenuOpen.value = false
  dormChatDraft.value = ''
  driftBottleDraft.value = ''
  dormChatError.value = ''
  isDormChatSending.value = false
  isDormDriftPicking.value = false
  dormDriftPickRequestToken += 1
  driftFollowupPendingEntryId.value = ''
  dormDriftFollowupRequestToken += 1
  clearStageUpgradeToast()
  setActiveDormEvent(dormRuntimeMap.value[selectedDormRuntimeKey.value]?.activeEvent, { persist: false })

  applyDormAction({
    affectionDelta: 0,
    energyDelta: 0,
    mood: selectedDormState.value.mood,
    journalText: '你进入了{char}的寝室。',
    feedbackText: '已进入角色寝室。',
    countKey: 'visitCount',
    type: 'visit',
  })
}

const backToCharacterGrid = () => {
  currentView.value = VIEW_CHARACTER_GRID
  dormQuickActionType.value = 'chat'
  activeDormOverlayPanelId.value = 'interaction'
  isDormOverlayPanelExpanded.value = false
  isDormNavMenuOpen.value = false
  isDormMenuOpen.value = false
  dormChatDraft.value = ''
  driftBottleDraft.value = ''
  dormChatError.value = ''
  isDormChatSending.value = false
  isDormDriftPicking.value = false
  dormDriftPickRequestToken += 1
  driftFollowupPendingEntryId.value = ''
  dormDriftFollowupRequestToken += 1
  actionFeedback.value = ''
  clearStageUpgradeToast()
  clearDormEvent({ persist: false })
}

const formatJournalTime = (value) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--:--'
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

onMounted(async () => {
  dormRuntimeMap.value = readDormRuntimeMap()
  driftBottlePool.value = readDormDriftBottlePool()
  defaultPortraitUrl.value = await getDefaultPortraitUrl()
  await refreshWorldBooks()
})

onBeforeUnmount(() => {
  clearStageUpgradeToast()
  characterPreloadToken += 1
  dormDriftPickRequestToken += 1
  dormDriftFollowupRequestToken += 1
})
</script>

<template>
  <main class="dormitory-screen" :class="{ 'platform-android': isAndroidPlatform, 'android-portrait': isAndroidPlatform }" role="main">
    <header class="dormitory-header">
      <button type="button" class="dorm-back-button" @click="handleDormNavBackMain">
        <span class="dorm-back-icon">‹</span>
      </button>
      <div class="dorm-title-group">
        <h1 class="dorm-title">
          <span>寝室系统</span>
          <span class="dorm-title-gradient">CHARACTER DORMITORY</span>
        </h1>
      </div>
    </header>

    <section class="dormitory-body">
      <div v-if="isLoadingBooks" class="dorm-state-box">正在加载世界书...</div>
      <div v-else-if="worldBooks.length === 0" class="dorm-state-box">未找到世界书，请先创建世界书。</div>

      <template v-else>
        <section
          v-if="currentView === VIEW_BOOK_CARD"
          class="worldbook-card-stage"
          @touchstart="handleCardTouchStart"
          @touchcancel="handleCardTouchCancel"
          @touchend="handleCardTouchEnd"
        >
          <div class="worldbook-card-wrap">
            <p class="card-swipe-hint">支持左右滑动切换世界书</p>
            <Transition :name="cardTransitionName" mode="out-in">
              <article :key="activeBook?.id || `book-${activeCardIndex}`" class="worldbook-card">
                <p class="card-index">世界书卡片 {{ activeCardIndex + 1 }} / {{ worldBooks.length }}</p>
                <h2 class="worldbook-title">{{ activeBook?.title || '未命名世界书' }}</h2>
                <p class="worldbook-summary">{{ activeBook?.summary || '该世界书暂未填写简介。' }}</p>
                <div class="worldbook-meta-row">
                  <span class="meta-chip">{{ characterCards.length }} 个 CHAR</span>
                  <span class="meta-chip">{{ activeBook?.isDefault ? '默认' : '自定义' }}</span>
                </div>
                <button type="button" class="enter-dorm-btn" :disabled="characterCards.length === 0" @click="enterCharacterGrid">
                  进入寝室
                </button>
                <p v-if="characterCards.length === 0" class="worldbook-hint">该世界书暂无 CHAR，请先在世界书中创建角色。</p>
              </article>
            </Transition>
          </div>
        </section>

        <section
          v-else-if="currentView === VIEW_CHARACTER_GRID"
          class="character-grid-stage"
          @touchstart="handleCharacterTouchStart"
          @touchcancel="handleCharacterTouchCancel"
          @touchend="handleCharacterTouchEnd"
        >
          <div v-if="isLoadingCharacters" class="dorm-state-box">正在加载角色立绘...</div>
          <div v-else-if="characterCards.length === 0" class="dorm-state-box">当前世界书暂无 CHAR。</div>
          <div v-else class="character-carousel">
            <p class="card-swipe-hint">左右滑动切换角色</p>
            <p class="character-card-name">{{ characterCards[activeCharacterIndex]?.label || '未命名角色' }}</p>
            <div class="character-carousel-track">
              <button
                v-for="(character, index) in characterCards"
                :key="character.id"
                type="button"
                class="character-carousel-card"
                :class="{
                  'is-active': index === activeCharacterIndex,
                  'is-prev': index === (activeCharacterIndex - 1 + characterCards.length) % characterCards.length,
                  'is-next': index === (activeCharacterIndex + 1) % characterCards.length
                }"
                @click="index === activeCharacterIndex ? enterCharacterRoom(character.id) : switchToCharacter(index)"
              >
                <img
                  class="character-card-portrait-img"
                  :src="portraitUrlMap[character.id] || defaultPortraitUrl"
                  :alt="character.label"
                />
              </button>
            </div>
          </div>
        </section>

        <section v-else class="character-room-stage">
          <article class="character-room-overlay-card">
            <img class="character-room-portrait" :src="selectedCharacterPortraitUrl" :alt="selectedCharacter?.label || '角色'" />
            <div class="character-room-overlay-mask" aria-hidden="true" />

            <section v-if="isDormOverlayPanelExpanded" class="dorm-overlay-panel" aria-label="寝室二级操作">
              <header class="dorm-overlay-panel-head">
                <p class="dorm-overlay-panel-title">{{ activeDormOverlayPanelLabel }}</p>
                <button type="button" class="dorm-overlay-panel-close" @click="handleCollapseDormOverlayPanel">×</button>
              </header>

              <div class="dorm-overlay-panel-body">

              <section v-if="activeDormOverlayPanelId === 'scene'" class="sub-scene-panel">
                <div class="sub-scene-head">
                  <p class="sub-scene-title">二级场景</p>
                  <p class="sub-scene-personality">性格倾向：{{ selectedCharacterArchetypeLabels }}</p>
                </div>

                <div v-if="generatedDormSubScenes.length === 0" class="sub-scene-empty">当前角色暂无可生成的二级场景。</div>
                <template v-else>
                  <div class="sub-scene-select-row">
                    <label class="sub-scene-select-wrap">
                      <span class="sub-scene-select-label">当前场景</span>
                      <select class="sub-scene-select" :value="activeDormSubScene?.id || ''" @change="handleDormSubSceneSelectChange">
                        <option
                          v-for="scene in generatedDormSubScenes"
                          :key="scene.id"
                          :value="scene.id"
                        >
                          {{ scene.name }} · {{ scene.subtitle }}
                        </option>
                      </select>
                    </label>
                  </div>

                  <article v-if="activeDormSubScene" class="sub-scene-card">
                    <p class="sub-scene-card-title">{{ activeDormSubScene.name }}</p>
                    <p class="sub-scene-card-desc">{{ renderTemplate(activeDormSubScene.ambience, selectedCharacter?.label) }}</p>
                    <p class="sub-scene-card-meta">
                      访问 {{ activeDormSubSceneVisitCount }} 次
                      ·
                      {{
                        activeDormSubScene.matchedArchetypes.length > 0
                          ? `匹配：${activeDormSubScene.matchedArchetypes.map(getDormArchetypeLabel).join(' / ')}`
                          : '通用场景'
                      }}
                    </p>

                    <div class="sub-scene-facility-row">
                      <p class="sub-scene-facility-meta">
                        设施等级 Lv{{ activeDormSubSceneFacilityLevel }} / {{ DORM_SCENE_FACILITY_MAX_LEVEL }}
                        · 场景收益 +{{ activeDormSubSceneFacilityBonusPercent }}%
                      </p>
                      <button
                        type="button"
                        class="sub-scene-upgrade-btn"
                        :disabled="!canUpgradeActiveSceneFacility"
                        @click="handleUpgradeActiveSceneFacility"
                      >
                        {{ activeSceneUpgradeButtonText }}
                      </button>
                    </div>

                    <div class="sub-scene-decor-row">
                      <span v-for="decor in activeDormSubScene.decor" :key="`${activeDormSubScene.id}_${decor}`" class="sub-scene-decor-chip">
                        {{ decor }}
                      </span>
                    </div>

                    <div class="sub-scene-action-compact">
                      <label class="sub-scene-action-select-wrap">
                        <span class="sub-scene-action-label">场景互动</span>
                        <select
                          class="sub-scene-action-select"
                          :value="selectedDormSubSceneActivity?.id || ''"
                          @change="handleDormSubSceneActivitySelectChange"
                        >
                          <option
                            v-for="activity in activeDormSubSceneActivityOptions"
                            :key="activity.id"
                            :value="activity.id"
                          >
                            {{ activity.label }}
                          </option>
                        </select>
                      </label>
                      <button
                        type="button"
                        class="sub-scene-action-run-btn"
                        :disabled="!selectedDormSubSceneActivity"
                        @click="handleRunDormSubSceneActivity"
                      >
                        执行场景互动
                      </button>
                    </div>
                  </article>
                </template>
              </section>

              <section v-if="activeDormOverlayPanelId === 'schedule'" class="daily-cycle-panel">
                <div class="daily-cycle-head">
                  <p class="daily-cycle-title">日程循环</p>
                  <p class="daily-cycle-meta">
                    第 {{ selectedDormState.dayIndex }} 天 · 当前时段：{{ currentDormTimeSlotLabel }} · 剩余行动 {{ remainingDormActionSlots }}
                  </p>
                </div>

                <div class="daily-cycle-toolbar">
                  <p class="daily-cycle-progress">今日心愿 {{ completedTodayWishCount }} / {{ totalTodayWishCount }}</p>
                  <button type="button" class="daily-next-day-btn" @click="handleAdvanceDormDay">
                    {{ isDormDayActionClosed ? '进入下一天' : '提前结束今日' }}
                  </button>
                </div>

                <ul class="daily-wish-list">
                  <li v-for="wish in selectedDormState.todayWishes" :key="wish.id" class="daily-wish-item" :class="{ completed: wish.completed }">
                    <span class="daily-wish-main">
                      {{ wish.label }}
                      <span class="daily-wish-type">[{{ formatDailyWishTypeLabel(wish.type) }}]</span>
                    </span>
                    <span class="daily-wish-progress">
                      {{ wish.progress }} / {{ wish.target }} · 奖励 好感+{{ wish.rewardAffection }} 体力+{{ wish.rewardEnergy }}
                    </span>
                  </li>
                </ul>
              </section>

              <section v-if="activeDormOverlayPanelId === 'chain'" class="event-chain-preview-panel">
                <div class="event-chain-preview-head">
                  <p class="event-chain-preview-title">事件链预览</p>
                  <p class="event-chain-preview-meta">当前关系阶段：{{ selectedDormRelationshipStageLabel }}</p>
                </div>
                <ul class="event-chain-preview-list">
                  <li
                    v-for="chain in selectedDormEventChainPreviewList"
                    :key="chain.id"
                    class="event-chain-preview-item"
                    :class="{
                      unlocked: chain.unlocked,
                      locked: !chain.unlocked,
                      selected: chain.id === selectedDormEventChainDetail?.id,
                    }"
                    role="button"
                    tabindex="0"
                    @click="handleSelectDormEventChainPreview(chain.id)"
                    @keydown.enter.prevent="handleSelectDormEventChainPreview(chain.id)"
                    @keydown.space.prevent="handleSelectDormEventChainPreview(chain.id)"
                  >
                    <div class="event-chain-preview-text">
                      <p class="event-chain-preview-main">{{ chain.title }} · {{ chain.stepCount }} 阶段</p>
                      <p class="event-chain-preview-sub">
                        {{ chain.unlocked ? '已解锁，可在触发事件时进入该事件链。' : `未解锁，需关系阶段达到「${chain.requiredStageLabel}」。` }}
                      </p>
                    </div>
                    <span class="event-chain-preview-badge" :class="{ unlocked: chain.unlocked, locked: !chain.unlocked }">
                      {{ chain.unlocked ? '已解锁' : `需 ${chain.requiredStageLabel}` }}
                    </span>
                  </li>
                </ul>

                <section v-if="selectedDormEventChainDetail" class="event-chain-detail-panel" :class="{ unlocked: selectedDormEventChainDetail.unlocked, locked: !selectedDormEventChainDetail.unlocked }">
                  <div class="event-chain-detail-head">
                    <p class="event-chain-detail-title">{{ selectedDormEventChainDetail.title }}</p>
                    <span class="event-chain-detail-status" :class="{ unlocked: selectedDormEventChainDetail.unlocked, locked: !selectedDormEventChainDetail.unlocked }">
                      {{ selectedDormEventChainDetail.unlocked ? '可触发' : `需 ${selectedDormEventChainDetail.requiredStageLabel}` }}
                    </span>
                  </div>

                  <p class="event-chain-detail-summary">{{ selectedDormEventChainDetail.summary }}</p>
                  <p class="event-chain-detail-meta">
                    总阶段数 {{ selectedDormEventChainDetail.stepCount }} · 起始阶段：{{ selectedDormEventChainDetail.firstStepTitle }}
                  </p>
                  <p class="event-chain-detail-meta">
                    {{
                      selectedDormEventChainDetail.unlocked
                        ? '当前关系阶段已满足触发条件，触发事件时有概率进入该事件链。'
                        : `解锁条件：关系阶段达到「${selectedDormEventChainDetail.requiredStageLabel}」。`
                    }}
                  </p>
                  <p v-if="selectedDormEventChainDetail.firstStepDescription" class="event-chain-detail-meta">
                    起始剧情：{{ selectedDormEventChainDetail.firstStepDescription }}
                  </p>

                  <div class="event-chain-detail-endings">
                    <p class="event-chain-detail-endings-title">可能结局</p>
                    <div v-if="selectedDormEventChainDetail.endingTags.length > 0" class="event-chain-detail-tag-list">
                      <span v-for="tag in selectedDormEventChainDetail.endingTags" :key="tag" class="event-chain-detail-tag">{{ tag }}</span>
                    </div>
                    <p v-else class="event-chain-detail-endings-empty">推进过程中会根据选项生成不同结局。</p>
                  </div>
                </section>
              </section>

              <div v-if="activeDormOverlayPanelId === 'status'" class="dorm-stat-grid">
                <div class="dorm-stat-card">
                  <p class="dorm-stat-label">好感度</p>
                  <p class="dorm-stat-value">{{ selectedDormState.affection }}</p>
                  <div class="dorm-stat-bar"><span class="dorm-stat-bar-fill is-affection" :style="selectedDormAffectionStyle"></span></div>
                </div>
                <div class="dorm-stat-card">
                  <p class="dorm-stat-label">体力</p>
                  <p class="dorm-stat-value">{{ selectedDormState.energy }}</p>
                  <div class="dorm-stat-bar"><span class="dorm-stat-bar-fill is-energy" :style="selectedDormEnergyStyle"></span></div>
                </div>
                <div class="dorm-stat-card mini">
                  <p class="dorm-stat-label">心情 / 关系阶段</p>
                  <p class="dorm-stat-value compact">{{ selectedDormState.mood }} · {{ selectedDormRelationshipStageLabel }}</p>
                  <p class="dorm-stat-tip">{{ selectedDormRelationshipProgressHint }}</p>
                </div>
                <div class="dorm-stat-card mini">
                  <p class="dorm-stat-label">事件链解锁</p>
                  <p class="dorm-stat-value compact">{{ selectedDormUnlockedEventChainCount }} / {{ DORM_EVENT_CHAIN_LIBRARY.length }}</p>
                  <p class="dorm-stat-tip">{{ selectedDormUnlockedEventChainHint }}</p>
                </div>
                <div class="dorm-stat-card mini">
                  <p class="dorm-stat-label">访问 / 聊天 / 送礼 / 事件 / 场景 / 升级</p>
                  <p class="dorm-stat-value compact">{{ selectedDormState.visitCount }} / {{ selectedDormState.chatCount }} / {{ selectedDormState.giftCount }} / {{ selectedDormState.eventCount }} / {{ selectedDormState.sceneCount }} / {{ selectedDormState.facilityUpgradeCount }}</p>
                </div>
              </div>

              <section v-if="activeDormOverlayPanelId === 'wardrobe'" class="dorm-wardrobe-panel">
                <div class="dorm-wardrobe-head">
                  <p class="dorm-wardrobe-title">角色衣橱</p>
                  <p class="dorm-wardrobe-coin">寝室币 {{ selectedDormState.dormCoins }}</p>
                </div>

                <article class="dorm-wardrobe-equipped">
                  <p class="dorm-wardrobe-section-label">当前穿搭</p>
                  <p class="dorm-wardrobe-equipped-main">{{ selectedDormEquippedOutfit?.name || '校园便服' }}</p>
                  <p class="dorm-wardrobe-equipped-sub">
                    {{ selectedDormEquippedOutfit?.style || '日常' }} · {{ selectedDormEquippedOutfit?.description || '默认穿搭。' }}
                  </p>
                </article>

                <section class="dorm-wardrobe-group">
                  <p class="dorm-wardrobe-section-label">我的衣柜（{{ selectedDormOwnedOutfits.length }}）</p>
                  <div class="dorm-wardrobe-list">
                    <article
                      v-for="outfit in selectedDormOwnedOutfits"
                      :key="`owned_${outfit.id}`"
                      class="dorm-wardrobe-item"
                    >
                      <div class="dorm-wardrobe-item-main">
                        <p class="dorm-wardrobe-item-name">{{ outfit.name }}</p>
                        <p class="dorm-wardrobe-item-meta">{{ outfit.style }} · {{ outfit.description }}</p>
                      </div>
                      <button
                        type="button"
                        class="dorm-wardrobe-action-btn"
                        :disabled="selectedDormEquippedOutfit?.id === outfit.id"
                        @click="handleEquipDormOutfit(outfit.id)"
                      >
                        {{ selectedDormEquippedOutfit?.id === outfit.id ? '已穿戴' : '穿上' }}
                      </button>
                    </article>
                  </div>
                </section>

                <section class="dorm-wardrobe-group">
                  <p class="dorm-wardrobe-section-label">服装商店</p>
                  <div class="dorm-wardrobe-list">
                    <article
                      v-for="outfit in dormOutfitShopList"
                      :key="`shop_${outfit.id}`"
                      class="dorm-wardrobe-item"
                      :class="{ owned: outfit.owned }"
                    >
                      <div class="dorm-wardrobe-item-main">
                        <p class="dorm-wardrobe-item-name">{{ outfit.name }}</p>
                        <p class="dorm-wardrobe-item-meta">{{ outfit.style }} · {{ outfit.description }}</p>
                      </div>
                      <button
                        type="button"
                        class="dorm-wardrobe-buy-btn"
                        :disabled="outfit.owned || !outfit.affordable"
                        @click="handleBuyDormOutfit(outfit.id)"
                      >
                        {{ outfit.owned ? '已拥有' : outfit.affordable ? `购买 ${outfit.price}` : `需 ${outfit.price}` }}
                      </button>
                    </article>
                  </div>
                </section>
              </section>

              <section v-if="activeDormOverlayPanelId === 'drift'" class="dorm-drift-panel">
                <div class="dorm-drift-head">
                  <p class="dorm-drift-title">漂流瓶海域</p>
                  <p class="dorm-drift-meta">
                    今日投放 {{ selectedDormState.driftBottleThrowCount }} / {{ DORM_DRIFT_BOTTLE_DAILY_THROW_LIMIT }}
                    ·
                    捞取 {{ selectedDormState.driftBottlePickCount }} / {{ DORM_DRIFT_BOTTLE_DAILY_PICK_LIMIT }}
                  </p>
                </div>

                <label class="dorm-drift-compose">
                  <span class="dorm-drift-label">投放新漂流瓶</span>
                  <textarea
                    v-model="driftBottleDraft"
                    class="dorm-drift-input"
                    :maxlength="DORM_DRIFT_BOTTLE_TEXT_LIMIT"
                    placeholder="写下一句话，扔进海里..."
                  />
                </label>

                <div class="dorm-drift-action-row">
                  <button
                    type="button"
                    class="dorm-drift-action-btn throw"
                    :disabled="!canThrowDormDriftBottle"
                    @click="handleThrowDormDriftBottle"
                  >
                    {{ selectedDormDriftRemainingThrowCount > 0 ? '投放漂流瓶' : '今日已投放' }}
                  </button>
                  <button
                    type="button"
                    class="dorm-drift-action-btn pick"
                    :disabled="!canPickDormDriftBottle"
                    @click="handlePickDormDriftBottle"
                  >
                    {{ isDormDriftPicking ? '捞取中...' : selectedDormDriftRemainingPickCount > 0 ? '捞一个' : '今日已捞满' }}
                  </button>
                </div>

                <p class="dorm-drift-tip">
                  剩余投放 {{ selectedDormDriftRemainingThrowCount }} 次 · 剩余捞取 {{ selectedDormDriftRemainingPickCount }} 次
                </p>
                <p class="dorm-drift-tip subtle">{{ selectedDormDriftPickHint }}</p>

                <section class="dorm-drift-group">
                  <p class="dorm-drift-group-title">我的捞取记录</p>
                  <p v-if="selectedDormDriftInbox.length <= 0" class="dorm-drift-empty">还没有捞到漂流瓶。</p>
                  <ul v-else class="dorm-drift-list">
                    <li v-for="entry in selectedDormDriftInbox" :key="entry.id" class="dorm-drift-item">
                      <p class="dorm-drift-item-text">“{{ entry.text }}”</p>
                      <p class="dorm-drift-item-meta">来自 {{ entry.authorName }} · 捞取于 {{ formatJournalTime(entry.pickedAt) }}</p>
                      <p v-if="entry.replyState === 'pending'" class="dorm-drift-item-reply pending">
                        {{ entry.replyAuthorName || (selectedCharacter?.label || '角色') }}正在写回信...
                      </p>
                      <p v-else-if="entry.replyText" class="dorm-drift-item-reply">
                        {{ entry.replyAuthorName || (selectedCharacter?.label || '角色') }}：{{ entry.replyText }}
                      </p>
                      <p
                        v-for="(followUpReply, followUpIndex) in entry.followUpReplies || []"
                        :key="`${entry.id}_followup_${followUpIndex}`"
                        class="dorm-drift-item-reply follow-up"
                      >
                        补充 {{ followUpIndex + 1 }}：{{ followUpReply }}
                      </p>
                      <div class="dorm-drift-item-actions">
                        <button
                          type="button"
                          class="dorm-drift-item-btn ask"
                          :disabled="!canAskDormDriftBottleFollowUp(entry)"
                          @click="handleAskDormDriftBottleFollowUp(entry.id)"
                        >
                          {{
                            isDormDriftFollowUpPending(entry.id)
                              ? '追问中...'
                              : (entry.followUpReplies?.length || 0) > 0
                                ? '再追问'
                                : '追问'
                          }}
                        </button>
                        <button
                          type="button"
                          class="dorm-drift-item-btn star"
                          :class="{ active: entry.isStarred }"
                          :disabled="isDormDriftFollowUpPending(entry.id)"
                          @click="handleToggleDormDriftBottleStar(entry.id)"
                        >
                          {{ entry.isStarred ? '已收藏' : '收藏' }}
                        </button>
                        <button
                          type="button"
                          class="dorm-drift-item-btn danger"
                          :disabled="isDormDriftFollowUpPending(entry.id)"
                          @click="handleDeleteDormDriftBottleInboxEntry(entry.id)"
                        >
                          删除
                        </button>
                      </div>
                    </li>
                  </ul>
                </section>

                <section class="dorm-drift-group">
                  <p class="dorm-drift-group-title">我的投放</p>
                  <p v-if="selectedDormDriftMyThrowList.length <= 0" class="dorm-drift-empty">你还没有投放过漂流瓶。</p>
                  <ul v-else class="dorm-drift-list">
                    <li v-for="entry in selectedDormDriftMyThrowList" :key="entry.id" class="dorm-drift-item">
                      <p class="dorm-drift-item-text">“{{ entry.text }}”</p>
                      <p class="dorm-drift-item-meta">投放于 {{ formatJournalTime(entry.createdAt) }}</p>
                    </li>
                  </ul>
                </section>
              </section>

              <div v-if="activeDormOverlayPanelId === 'interaction'" class="dorm-action-compact">
                <label class="dorm-action-select-wrap">
                  <span class="dorm-action-select-label">寝室互动</span>
                  <select v-model="dormQuickActionType" class="dorm-action-select">
                    <option
                      v-for="option in DORM_QUICK_ACTION_OPTIONS"
                      :key="option.id"
                      :value="option.id"
                    >
                      {{ option.label }}
                    </option>
                  </select>
                </label>
                <button
                  type="button"
                  class="dorm-action-run-btn"
                  :class="{ event: dormQuickActionType === 'event' }"
                  :disabled="!canRunDormQuickAction"
                  @click="handleRunDormQuickAction"
                >
                  {{ dormQuickActionRunButtonText }}
                </button>
              </div>

              <p v-if="actionFeedback" class="dorm-feedback">{{ actionFeedback }}</p>
              <Transition name="stage-toast">
                <section v-if="stageUpgradeToast" class="stage-upgrade-toast">
                  <p class="stage-upgrade-title">关系阶段提升</p>
                  <p class="stage-upgrade-main">{{ stageUpgradeToast.fromLabel }} -> {{ stageUpgradeToast.toLabel }}</p>
                  <p v-if="stageUpgradeToast.unlockedChainTitles.length > 0" class="stage-upgrade-sub">
                    新解锁事件链：{{ stageUpgradeToast.unlockedChainTitles.join('、') }}
                  </p>
                  <p v-else class="stage-upgrade-sub">本次阶段提升暂无新增事件链。</p>
                </section>
              </Transition>

              <section v-if="activeDormOverlayPanelId === 'interaction' && activeDormEvent" class="dorm-event-box">
                <h3 class="dorm-event-title">{{ activeDormEvent.title }}</h3>
                <p v-if="activeDormEvent.source === 'scene'" class="dorm-event-source">
                  场景事件 · {{ activeDormEvent.sourceSceneName || '当前场景' }} · 设施 Lv{{ activeDormEvent.facilityLevel }}（收益 +{{ activeDormEvent.facilityBonusPercent }}%）
                </p>
                <p v-else class="dorm-event-source">通用寝室事件</p>
                <p v-if="activeDormEvent.mode === 'chain'" class="dorm-event-chain-meta">
                  {{ activeDormEventChainProgressText }} · 当前阶段：{{ activeDormEvent.chainStepTitle || `阶段 ${activeDormEvent.chainStepIndex + 1}` }}
                </p>
                <p v-if="activeDormEvent.mode === 'chain' && activeDormEvent.chainPathLabels.length > 0" class="dorm-event-chain-path">
                  已选路线：{{ activeDormEvent.chainPathLabels.join(' → ') }}
                </p>
                <p class="dorm-event-desc">{{ activeDormEvent.description }}</p>
                <div class="dorm-event-options">
                  <button
                    v-for="option in activeDormEvent.options"
                    :key="option.id"
                    type="button"
                    class="dorm-event-option-btn"
                    @click="handleDormEventOption(option)"
                  >
                    <span class="event-option-main">{{ option.label }}</span>
                    <span class="event-option-sub">{{ formatDormEventOptionPreview(option, activeDormEvent) }}</span>
                  </button>
                </div>
              </section>

              <section v-if="activeDormOverlayPanelId === 'journal'" class="dorm-journal">
                <h3 class="dorm-journal-title">互动记录</h3>
                <ul class="dorm-journal-list">
                  <li v-for="item in selectedDormState.journal" :key="item.id" class="dorm-journal-item">
                    <span class="journal-time">{{ formatJournalTime(item.time) }}</span>
                    <span class="journal-text">{{ item.text }}</span>
                  </li>
                </ul>
              </section>
              </div>
            </section>

            <section class="dorm-chat-overlay" aria-label="寝室聊天内容">
              <div class="dorm-chat-head">
                <p class="dorm-chat-title">和 {{ selectedCharacter?.label || '角色' }} 聊天</p>
                <div class="dorm-chat-menu-wrap">
                  <button
                    type="button"
                    class="dorm-chat-menu-btn"
                    :class="{ active: isDormMenuOpen }"
                    :aria-expanded="isDormMenuOpen ? 'true' : 'false'"
                    aria-label="展开寝室操作菜单"
                    @click.stop="handleToggleDormMenu"
                  >
                    ···
                  </button>
                  <section v-if="isDormMenuOpen" class="dorm-popup-menu" aria-label="寝室操作菜单">
                    <button
                      v-for="panel in DORM_OVERLAY_PANEL_OPTIONS"
                      :key="panel.id"
                      type="button"
                      class="dorm-popup-menu-btn"
                      :class="{ active: panel.id === activeDormOverlayPanelId }"
                      @click="handleSelectDormOverlayPanel(panel.id)"
                    >
                      {{ panel.label }}
                    </button>
                  </section>
                </div>
              </div>
              <div ref="dormChatHistoryRef" class="dorm-chat-history">
                <p v-if="selectedDormChatHistory.length === 0" class="dorm-chat-empty">输入一句话，开始聊天。</p>
                <article
                  v-for="message in selectedDormChatHistory"
                  :key="message.id"
                  class="dorm-chat-message"
                  :class="{ user: message.role === 'user', assistant: message.role === 'assistant' }"
                >
                  <p class="dorm-chat-text">{{ message.text }}</p>
                </article>
              </div>

              <div class="dorm-chat-input-row">
                <input
                  v-model="dormChatDraft"
                  type="text"
                  class="dorm-chat-input"
                  :disabled="isDormChatSending"
                  placeholder="输入你想说的话..."
                  maxlength="280"
                  @keydown.enter.prevent="handleSendDormChat"
                >
                <button
                  type="button"
                  class="dorm-chat-send-btn"
                  :disabled="!canSendDormChat"
                  @click="handleSendDormChat"
                >
                  {{ isDormChatSending ? '回复中...' : '发送' }}
                </button>
              </div>
              <p v-if="dormChatError" class="dorm-chat-error">{{ dormChatError }}</p>
            </section>
          </article>
        </section>
      </template>
    </section>
  </main>

  <!-- 拍立得相机界面 -->
  <PolaroidCameraScreen
    v-if="isPolaroidScreenOpen"
    :character-name="selectedCharacter?.label || '角色'"
    @back="handlePolaroidBack"
    @complete="handlePolaroidComplete"
  />
</template>

<style scoped src="./DormitoryScreen.css"></style>
