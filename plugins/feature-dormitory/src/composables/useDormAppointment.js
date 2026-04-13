/**
 * 寝室约定 & 角色主动来访 Composable
 * - 创建约定：只记录时间 + 预约系统通知，不调 LLM
 * - JS 定时器巡检（每 30 分钟）：扫描所有约定到期 + 随机来访概率
 * - 系统通知触发：用户点击通知 → 执行来访（调 LLM → 保存 visit → 追加聊天）
 * - 触发来访：调 LLM 生成内容 → 保存 visit 记录 → 发通知
 * - 如果用户在寝室页面，追加到聊天
 *
 * @param {object} deps - 依赖项
 * @param {import('vue').Ref} deps.selectedCharacter - 当前选中的角色 ref
 * @param {import('vue').Ref} deps.activeBook - 当前选中的世界书 ref
 * @param {import('vue').Ref} deps.selectedDormState - 寝室状态 ref
 * @param {import('vue').Ref} deps.actionFeedback - 操作反馈 ref
 * @param {Function} deps.scrollDormChatToBottom - 滚动聊天到底部
 * @param {Function} deps.getStageLabel - 根据阶段ID获取阶段标签
 * @param {Function} deps.normalizeStage - 规范化阶段ID
 * @param {Function} deps.emitPanelChange - 切换面板回调
 * @returns {object} 约定管理方法
 */

import { ref, computed } from 'vue'
import { generateCharacterVisit } from '../../../../src/llm'

const APPOINTMENT_STORAGE_KEY = 'avg_llm_dormitory_appointments_v2'
const VISIT_STORAGE_KEY = 'avg_llm_dormitory_visits_v1'
const COOLDOWN_STORAGE_KEY = 'avg_llm_dormitory_visit_cooldown_v1'

const VISIT_CHECK_INTERVAL_MS = 30 * 60 * 1000  // 30 分钟巡检
const VISIT_COOLDOWN_MS = 2 * 60 * 60 * 1000    // 2 小时冷却
const VISIT_BASE_PROBABILITY = 0.15              // 15% 基础概率

const DORM_AFFECTION_THRESHOLDS = [
  { max: 30,  multiplier: 0.3 },
  { max: 60,  multiplier: 0.7 },
  { max: 80,  multiplier: 1.0 },
  { max: 100, multiplier: 1.5 },
]

const VISIT_TYPE_ICONS = {
  note: '\ud83d\udcdd',
  message: '\ud83d\udcac',
  redPacket: '\ud83e\udde7',
  gift: '\ud83c\udf81',
}

const VISIT_TYPE_LABELS = {
  note: '\u7eb8\u6761',
  message: '\u7559\u8a00',
  redPacket: '\u7ea2\u5305',
  gift: '\u793c\u7269',
}

// ========== \u6301\u4e45\u5316\u5de5\u5177\u51fd\u6570 ==========

function readList(key, fallback = []) {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function persistList(key, list) {
  window.localStorage.setItem(key, JSON.stringify(list))
}

function readAppointmentList() { return readList(APPOINTMENT_STORAGE_KEY, []) }
function persistAppointmentList(list) { persistList(APPOINTMENT_STORAGE_KEY, list) }
function readVisitList() { return readList(VISIT_STORAGE_KEY, []) }
function persistVisitList(list) { persistList(VISIT_STORAGE_KEY, list) }
function readCooldownMap() { return readList(COOLDOWN_STORAGE_KEY, {}) }
function persistCooldownMap(map) { persistList(COOLDOWN_STORAGE_KEY, map) }

// ========== Composable ==========

let visitWatcherTimer = null
let isExecuting = false  // \u9632\u6b62\u5e76\u53d1\u6267\u884c

export function useDormAppointment(deps) {
  const showAppointmentModal = ref(false)
  const isAppointmentCreating = ref(false)
  const appointmentList = ref(readAppointmentList())
  const visitList = ref(readVisitList())
  const appointmentFeedback = ref('')

  // \u5f53\u524d\u89d2\u8272\u7684\u7ea6\u5b9a\u5217\u8868\uff08\u672a\u6267\u884c\u7684\uff09
  const characterAppointments = computed(() => {
    const bookId = String(deps.activeBook.value?.id || '').trim()
    const charId = String(deps.selectedCharacter.value?.id || '').trim()
    if (!bookId || !charId) return []
    return appointmentList.value.filter(
      (a) => a.bookId === bookId && a.charId === charId && !a.executed
    )
  })

  // \u5f53\u524d\u89d2\u8272\u7684\u6765\u8bbf\u8bb0\u5f55
  const characterVisits = computed(() => {
    const bookId = String(deps.activeBook.value?.id || '').trim()
    const charId = String(deps.selectedCharacter.value?.id || '').trim()
    if (!bookId || !charId) return []
    return visitList.value.filter(
      (v) => v.bookId === bookId && v.charId === charId
    ).sort((a, b) => b.triggeredAt - a.triggeredAt)
  })

  // \u7528\u4e8e\u804a\u5929\u6e32\u67d3\u7684\u6765\u8bbf\u6d88\u606f\uff08\u6700\u8fd1 20 \u6761\uff09
  const visitChatMessages = computed(() => {
    const bookId = String(deps.activeBook.value?.id || '').trim()
    const charId = String(deps.selectedCharacter.value?.id || '').trim()
    if (!bookId || !charId) return []
    return visitList.value
      .filter((v) => v.bookId === bookId && v.charId === charId)
      .sort((a, b) => b.triggeredAt - a.triggeredAt)
      .slice(0, 20)
      .reverse()
  })

  /**
   * \u9884\u7ea6\u7cfb\u7edf\u901a\u77e5\uff1a\u5728\u521b\u5efa\u7ea6\u5b9a\u65f6\u6ce8\u518c\uff0c\u5230\u70b9\u5f39\u51fa
   * \u8fd9\u6837\u5373\u4f7f\u7528\u6237\u79bb\u5f00\u5bdd\u5ba4\u9875\u9762\uff0c\u901a\u77e5\u4ecd\u4f1a\u5728\u5230\u70b9\u65f6\u5f39\u51fa
   */
  async function scheduleAppointmentNotification(appointment) {
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications')
      const delay = appointment.scheduledAt - Date.now()
      if (delay <= 0) return

      const notifId = parseInt(appointment.id.replace(/\D/g, '').slice(-8), 10) || Date.now() % 100000

      await LocalNotifications.schedule({
        notifications: [
          {
            title: `\ud83d\udcdd ${appointment.charName} \u6765\u770b\u4f60\u4e86`,
            body: `\u7ea6\u5b9a\u65f6\u95f4\u5230\u4e86\uff01\u8fdb\u5165\u5bdd\u5ba4\u770b\u770b ${appointment.charName} \u7559\u4e0b\u4e86\u4ec0\u4e48\u5427\u3002`,
            id: notifId,
            schedule: {
              at: new Date(appointment.scheduledAt),
              allowsWhileIdle: true,
            },
            extra: {
              appointmentId: appointment.id,
              bookId: appointment.bookId,
              charId: appointment.charId,
              type: 'dorm_appointment_due',
            },
            actionTypeId: '',
            sound: null,
            attachments: null,
          },
        ],
      })
    } catch (err) {
      console.warn('[Appointment] \u7cfb\u7edf\u901a\u77e5\u8c03\u5ea6\u5931\u8d25\uff08\u53ef\u80fd\u56e0\u4e3a\u975e\u539f\u751f\u73af\u5883\uff09:', err.message)
    }
  }

  /**
   * \u521b\u5efa\u7ea6\u5b9a\uff1a\u53ea\u8bb0\u5f55\u65f6\u95f4\uff0c\u4e0d\u8c03 LLM
   * @param {number} scheduledAt - \u89e6\u53d1\u65f6\u95f4\u6233\uff08\u6beb\u79d2\uff09
   */
  async function createAppointment(scheduledAt) {
    if (isAppointmentCreating.value) return false
    if (!deps.selectedCharacter.value) {
      deps.actionFeedback.value = '\u8bf7\u5148\u9009\u62e9\u4e00\u4e2a\u89d2\u8272'
      return false
    }
    if (!deps.activeBook.value) {
      deps.actionFeedback.value = '\u672a\u627e\u5230\u5f53\u524d\u4e16\u754c\u4e66'
      return false
    }
    if (!scheduledAt || scheduledAt <= Date.now()) {
      deps.actionFeedback.value = '\u8bf7\u9009\u62e9\u4e00\u4e2a\u672a\u6765\u7684\u65f6\u95f4'
      return false
    }

    isAppointmentCreating.value = true
    appointmentFeedback.value = ''

    const bookId = String(deps.activeBook.value.id).trim()
    const charId = String(deps.selectedCharacter.value.id).trim()
    const charName = String(deps.selectedCharacter.value.label || '\u89d2\u8272').trim()

    try {
      const appointment = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        bookId,
        charId,
        charName,
        scheduledAt,
        createdAt: Date.now(),
        executed: false,
      }

      const currentList = readAppointmentList()
      currentList.push(appointment)
      persistAppointmentList(currentList)
      appointmentList.value = [...currentList]

      // \u9884\u7ea6\u7cfb\u7edf\u901a\u77e5\uff0c\u5230\u70b9\u5f39\u51fa\uff08\u5373\u4f7f\u79bb\u5f00\u5bdd\u5ba4\u9875\u9762\u4e5f\u4f1a\u5f39\uff09
      await scheduleAppointmentNotification(appointment)

      const scheduledDate = new Date(scheduledAt)
      const scheduledTimeStr = `${scheduledDate.getMonth() + 1}/${scheduledDate.getDate()} ${String(scheduledDate.getHours()).padStart(2, '0')}:${String(scheduledDate.getMinutes()).padStart(2, '0')}`
      appointmentFeedback.value = `\u5df2\u7ea6\u5b9a\u5728 ${scheduledTimeStr} \u89e6\u53d1\uff0c${charName} \u4f1a\u5728\u90a3\u65f6\u6765\u770b\u4f60\u3002`
      showAppointmentModal.value = false
      return true
    } catch (err) {
      appointmentFeedback.value = '\u521b\u5efa\u7ea6\u5b9a\u65f6\u53d1\u751f\u9519\u8bef\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5'
      console.error('[Appointment] create error:', err)
      return false
    } finally {
      isAppointmentCreating.value = false
    }
  }

  /**
   * \u53d6\u6d88\u7ea6\u5b9a
   */
  async function cancelAppointment(appointmentId) {
    const currentList = readAppointmentList()
    const appointment = currentList.find((a) => a.id === appointmentId)
    if (!appointment) return

    // \u53d6\u6d88\u7cfb\u7edf\u901a\u77e5
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications')
      const notifId = parseInt(appointmentId.replace(/\D/g, '').slice(-8), 10)
      if (!Number.isNaN(notifId)) {
        await LocalNotifications.cancel({ notifications: [notifId] })
      }
    } catch (err) {
      console.warn('[Appointment] \u53d6\u6d88\u901a\u77e5\u5931\u8d25:', err.message)
    }

    const filtered = currentList.filter((a) => a.id !== appointmentId)
    persistAppointmentList(filtered)
    appointmentList.value = [...filtered]

    appointmentFeedback.value = `\u5df2\u53d6\u6d88\u4e0e ${appointment.charName} \u7684\u7ea6\u5b9a\u3002`
  }

  /**
   * \u8ba1\u7b97\u968f\u673a\u6765\u8bbf\u6982\u7387
   */
  function calcVisitProbability(bookId, charId) {
    // \u597d\u611f\u5ea6\u7cfb\u6570
    const currentAffection = deps.selectedDormState.value?.affection ?? 0
    let affectionMultiplier = 1.0
    for (const threshold of DORM_AFFECTION_THRESHOLDS) {
      if (currentAffection < threshold.max) {
        affectionMultiplier = threshold.multiplier
        break
      }
    }

    // \u51b7\u5374\u7cfb\u6570
    const cooldownMap = readCooldownMap()
    const cooldownKey = `${bookId}::${charId}`
    const lastVisit = cooldownMap[cooldownKey] || 0
    const timeSinceLastVisit = Date.now() - lastVisit
    let cooldownMultiplier = 1.0
    if (timeSinceLastVisit < 30 * 60 * 1000) {
      cooldownMultiplier = 0.1  // <30\u5206\u949f\uff1a\u6781\u4f4e\u6982\u7387
    } else if (timeSinceLastVisit < VISIT_COOLDOWN_MS) {
      cooldownMultiplier = 0.5  // \u51b7\u5374\u4e2d\uff1a\u51cf\u534a
    }

    const finalProb = VISIT_BASE_PROBABILITY * affectionMultiplier * cooldownMultiplier
    return Math.min(finalProb, 0.8)  // \u4e0a\u9650 80%
  }

  /**
   * \u6267\u884c\u6765\u8bbf\uff1a\u8c03 LLM \u2192 \u4fdd\u5b58 visit \u8bb0\u5f55 \u2192 \u53d1\u901a\u77e5 \u2192 \u8ffd\u52a0\u804a\u5929\uff08\u5982\u679c\u5728\u5bf9\u5e94\u89d2\u8272\u9875\u9762\uff09
   */
  async function executeVisit(appointment, reason) {
    if (isExecuting) return false
    isExecuting = true

    const bookId = appointment.bookId
    const charId = appointment.charId
    const charName = appointment.charName

    try {
      // \u51c6\u5907\u89d2\u8272\u4fe1\u606f
      let characterData = {
        name: charName,
        identity: '',
        subtitle: '',
        background: '',
        tags: [],
      }
      let currentAffection = 0
      let relationshipStage = '\u964c\u751f'
      let normalizedRecentChat = []
      let isCurrentCharacter = false  // \u662f\u5426\u662f\u5f53\u524d\u9009\u4e2d\u7684\u89d2\u8272

      // \u5982\u679c\u5f53\u524d\u9009\u4e2d\u7684\u89d2\u8272\u5c31\u662f\u8fd9\u4e2a\u89d2\u8272\uff0c\u4f7f\u7528\u5b9e\u65f6\u6570\u636e
      const currentCharId = String(deps.selectedCharacter.value?.id || '').trim()
      const currentBookId = String(deps.activeBook.value?.id || '').trim()
      isCurrentCharacter = (charId === currentCharId && bookId === currentBookId)

      if (isCurrentCharacter) {
        characterData = {
          name: charName,
          identity: deps.selectedCharacter.value?.raw?.identity || '',
          subtitle: deps.selectedCharacter.value?.raw?.subtitle || '',
          background: deps.selectedCharacter.value?.raw?.background || '',
          tags: Array.isArray(deps.selectedCharacter.value?.raw?.tags) ? deps.selectedCharacter.value.raw.tags : [],
        }
        currentAffection = deps.selectedDormState.value?.affection || 0
        relationshipStage = deps.getStageLabel(
          deps.normalizeStage(deps.selectedDormState.value?.relationshipStage, currentAffection)
        )
        const recentChat = deps.selectedDormState.value?.chatHistory || []
        normalizedRecentChat = recentChat
          .slice(-8)
          .map((msg) => ({
            role: msg.role,
            text: msg.type === 'redPacket' && msg.redPacket
              ? `${msg.redPacket.senderName || '\u73a9\u5bb6'}\u53d1\u4e86\u4e00\u4e2a\u7ea2\u5305`
              : msg.text,
          }))
          .filter((m) => m.text)
      } else {
        // \u4e0d\u5728\u8be5\u89d2\u8272\u9875\u9762\uff0c\u4f7f\u7528\u57fa\u7840\u4fe1\u606f\u8c03\u7528 LLM
        // \u4f46\u4ecd\u7136\u53ef\u4ee5\u751f\u6210\u6765\u8bbf\u5185\u5bb9
        currentAffection = appointment.lastKnownAffection || 0
        relationshipStage = appointment.lastKnownStage || ''
      }

      // \u5982\u679c\u5b8c\u5168\u6ca1\u6709\u89d2\u8272\u6570\u636e\uff08\u4e0d\u5728\u5bf9\u5e94\u9875\u9762\u4e14\u6ca1\u6709\u7f13\u5b58\uff09\uff0c\u4ecd\u7136\u7528\u57fa\u7840\u4fe1\u606f\u751f\u6210
      const triggeredDate = new Date()
      const triggeredTimeStr = `${triggeredDate.getMonth() + 1}/${triggeredDate.getDate()} ${String(triggeredDate.getHours()).padStart(2, '0')}:${String(triggeredDate.getMinutes()).padStart(2, '0')}`

      const visitReason = reason === 'appointment' ? 'appointment' : 'random'

      const visitResult = await generateCharacterVisit({
        worldBook: deps.activeBook.value,
        character: characterData,
        currentAffection,
        relationshipStage,
        recentChat: normalizedRecentChat,
        visitReason,
        triggerTime: triggeredTimeStr,
      })

      if (!visitResult.success || !visitResult.visit) {
        console.error('[Visit] LLM \u751f\u6210\u5931\u8d25:', visitResult.error)
        return false
      }

      const visit = visitResult.visit

      // 2. \u4fdd\u5b58 visit \u8bb0\u5f55
      const visitRecord = {
        id: `visit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        bookId,
        charId,
        charName,
        visitType: visit.visitType,
        content: visit.content,
        mood: visit.mood,
        redPacket: visit.redPacket || null,
        giftItem: visit.giftItem || null,
        triggeredAt: Date.now(),
        isAppointment: reason === 'appointment',
        appointmentId: appointment?.id || null,
      }

      const currentVisits = readVisitList()
      currentVisits.push(visitRecord)
      persistVisitList(currentVisits)
      visitList.value = [...currentVisits]

      // 3. \u66f4\u65b0\u51b7\u5374
      const cooldownMap = readCooldownMap()
      const cooldownKey = `${bookId}::${charId}`
      cooldownMap[cooldownKey] = Date.now()
      persistCooldownMap(cooldownMap)

      // 4. \u5982\u679c\u662f\u7ea6\u5b9a\uff0c\u6807\u8bb0\u4e3a\u5df2\u6267\u884c
      if (reason === 'appointment' && appointment?.id) {
        const currentAppointments = readAppointmentList()
        const updated = currentAppointments.map((a) =>
          a.id === appointment.id ? { ...a, executed: true } : a
        )
        persistAppointmentList(updated)
        appointmentList.value = [...updated]
      }

      // 5. \u53d1\u901a\u77e5
      await sendVisitNotification(visitRecord)

      // 6. \u5982\u679c\u7528\u6237\u5728\u8be5\u89d2\u8272\u7684\u5bdd\u5ba4\u9875\u9762\uff0c\u8ffd\u52a0\u5230\u804a\u5929\u8bb0\u5f55
      if (isCurrentCharacter && deps.emitPanelChange) {
        deps.emitPanelChange('interaction')
        if (deps.scrollDormChatToBottom) {
          deps.scrollDormChatToBottom()
        }
      }

      deps.actionFeedback.value = `${charName} \u6765\u8fc7\u4e86\uff0c\u7559\u4e0b\u4e86${VISIT_TYPE_LABELS[visit.visitType] || '\u5185\u5bb9'}\u3002`
      return true
    } catch (err) {
      console.error('[Visit] execute error:', err)
      deps.actionFeedback.value = '\u5904\u7406\u6765\u8bbf\u5185\u5bb9\u65f6\u53d1\u751f\u9519\u8bef'
      return false
    } finally {
      isExecuting = false
    }
  }

  /**
   * \u53d1\u901a\u77e5\uff08\u52a8\u6001\u6587\u6848\uff09
   */
  async function sendVisitNotification(visit) {
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications')

      const icon = VISIT_TYPE_ICONS[visit.visitType] || '\ud83d\udcdd'
      const typeLabel = VISIT_TYPE_LABELS[visit.visitType] || '\u5185\u5bb9'
      const title = `${icon} ${visit.charName} \u6765\u770b\u4e86\u4f60`
      const body = `${visit.charName} \u53d1\u73b0\u4f60\u4e0d\u5728\uff0c\u7559\u4e0b\u4e86\u4e00\u4efd${typeLabel}\u3002\u70b9\u51fb\u8fdb\u5165\u5bdd\u5ba4\u770b\u770b\u5427\u3002`

      const notifId = parseInt(visit.id.replace(/\D/g, '').slice(-8), 10) || Date.now() % 100000

      await LocalNotifications.schedule({
        notifications: [
          {
            title,
            body: body.slice(0, 200),
            id: notifId,
            schedule: {
              at: new Date(Date.now() + 5000),  // 5 \u79d2\u540e\u5f39\u51fa
              allowsWhileIdle: true,
            },
            extra: {
              visitId: visit.id,
              bookId: visit.bookId,
              charId: visit.charId,
              type: 'dorm_visit',
            },
            actionTypeId: '',
            sound: null,
            attachments: null,
          },
        ],
      })
    } catch (err) {
      console.warn('[Visit] \u901a\u77e5\u53d1\u9001\u5931\u8d25\uff08\u53ef\u80fd\u56e0\u4e3a\u975e\u539f\u751f\u73af\u5883\uff09:', err.message)
    }
  }

  /**
   * \u901a\u77e5\u88ab\u70b9\u51fb\u65f6\u7684\u5904\u7406
   */
  async function handleNotificationClicked(extra) {
    if (extra?.type === 'dorm_visit') {
      if (deps.emitPanelChange) {
        deps.emitPanelChange('interaction')
      }
      deps.actionFeedback.value = '\u6765\u81ea\u89d2\u8272\u7684\u6765\u8bbf\u901a\u77e5\uff0c\u8fdb\u5165\u5bdd\u5ba4\u67e5\u770b\u3002'
    }

    // \u7ea6\u5b9a\u5230\u671f\u901a\u77e5\u88ab\u70b9\u51fb\uff1a\u76f4\u63a5\u6267\u884c\u6765\u8bbf
    if (extra?.type === 'dorm_appointment_due') {
      const appointmentId = extra.appointmentId
      const currentAppointments = readAppointmentList()
      const appointment = currentAppointments.find((a) => a.id === appointmentId)
      if (appointment && !appointment.executed) {
        await executeVisit(appointment, 'appointment')
      } else if (appointment?.executed) {
        deps.actionFeedback.value = '\u8be5\u7ea6\u5b9a\u5df2\u6267\u884c\u8fc7\u4e86\u3002'
      } else {
        deps.actionFeedback.value = '\u672a\u627e\u5230\u5bf9\u5e94\u7684\u7ea6\u5b9a\u3002'
      }
    }
  }

  /**
   * \u68c0\u67e5\u5230\u671f\u7684\u7ea6\u5b9a + \u968f\u673a\u6765\u8bbf
   * \u5173\u952e\u6539\u52a8\uff1a\u626b\u63cf\u6240\u6709\u7ea6\u5b9a\uff0c\u4e0d\u53ea\u662f\u5f53\u524d\u9009\u4e2d\u7684\u89d2\u8272
   */
  function runVisitCheck() {
    const now = Date.now()

    // 1. \u68c0\u67e5\u6240\u6709\u5230\u671f\u7684\u7ea6\u5b9a\uff08\u4e0d\u9650\u5236\u5f53\u524d\u89d2\u8272\uff09
    const currentAppointments = readAppointmentList()
    const dueAppointments = currentAppointments.filter(
      (a) => !a.executed && a.scheduledAt <= now
    )

    for (const appt of dueAppointments) {
      executeVisit(appt, 'appointment')
    }

    // 2. \u968f\u673a\u6765\u8bbf\uff1a\u53ea\u5728\u5f53\u524d\u6709\u9009\u4e2d\u89d2\u8272\u65f6\u624d\u68c0\u67e5
    const bookId = String(deps.activeBook.value?.id || '').trim()
    const charId = String(deps.selectedCharacter.value?.id || '').trim()

    if (bookId && charId && deps.selectedCharacter.value) {
      const prob = calcVisitProbability(bookId, charId)
      if (Math.random() < prob) {
        executeVisit(
          { bookId, charId, charName: deps.selectedCharacter.value.label || '\u89d2\u8272' },
          'random'
        )
      }
    }
  }

  /**
   * \u6ce8\u518c\u5de1\u68c0\u5b9a\u65f6\u5668
   */
  function startVisitWatcher() {
    stopVisitWatcher()  // \u5148\u6e05\u7406\u65e7\u7684

    // \u7acb\u5373\u6267\u884c\u4e00\u6b21\u68c0\u67e5
    runVisitCheck()

    // \u6bcf 30 \u5206\u949f\u6267\u884c\u4e00\u6b21
    visitWatcherTimer = setInterval(runVisitCheck, VISIT_CHECK_INTERVAL_MS)
    console.log('[Appointment] \u5de1\u68c0\u5b9a\u65f6\u5668\u5df2\u542f\u52a8\uff0c\u95f4\u9694 30 \u5206\u949f')
  }

  /**
   * \u6e05\u7406\u5de1\u68c0\u5b9a\u65f6\u5668
   */
  function stopVisitWatcher() {
    if (visitWatcherTimer) {
      clearInterval(visitWatcherTimer)
      visitWatcherTimer = null
      console.log('[Appointment] \u5de1\u68c0\u5b9a\u65f6\u5668\u5df2\u505c\u6b62')
    }
  }

  /**
   * \u6e05\u7406\u5df2\u8fc7\u671f\u7684\u7ea6\u5b9a
   */
  function cleanExpiredAppointments() {
    const currentList = readAppointmentList()
    const now = Date.now()
    const filtered = currentList.filter((a) => {
      if (a.executed) return (now - a.scheduledAt) < 24 * 60 * 60 * 1000
      return a.scheduledAt > now || (now - a.scheduledAt) < 24 * 60 * 60 * 1000
    })
    if (filtered.length !== currentList.length) {
      persistAppointmentList(filtered)
      appointmentList.value = [...filtered]
    }
  }

  /**
   * \u6e05\u7406\u8fc7\u65e7\u7684\u6765\u8bbf\u8bb0\u5f55\uff08\u4fdd\u7559 7 \u5929\u5185\u7684\uff09
   */
  function cleanOldVisits() {
    const currentVisits = readVisitList()
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
    const filtered = currentVisits.filter((v) => v.triggeredAt > sevenDaysAgo)
    if (filtered.length !== currentVisits.length) {
      persistVisitList(filtered)
      visitList.value = [...filtered]
    }
  }

  /**
   * \u6253\u5f00\u7ea6\u5b9a\u6a21\u6001\u6846
   */
  function openAppointmentModal() {
    cleanExpiredAppointments()
    showAppointmentModal.value = true
  }

  /**
   * \u5173\u95ed\u7ea6\u5b9a\u6a21\u6001\u6846
   */
  function closeAppointmentModal() {
    showAppointmentModal.value = false
    appointmentFeedback.value = ''
  }

  return {
    showAppointmentModal,
    isAppointmentCreating,
    appointmentList,
    characterAppointments,
    characterVisits,
    visitChatMessages,
    appointmentFeedback,
    createAppointment,
    cancelAppointment,
    handleNotificationClicked,
    startVisitWatcher,
    stopVisitWatcher,
    runVisitCheck,
    openAppointmentModal,
    closeAppointmentModal,
    cleanExpiredAppointments,
    cleanOldVisits,
    VISIT_TYPE_ICONS,
    VISIT_TYPE_LABELS,
  }
}
