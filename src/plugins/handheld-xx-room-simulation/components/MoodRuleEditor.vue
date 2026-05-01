<script setup>
import { ref, computed, onMounted } from 'vue'
import {
  TRIGGER_TYPES,
  CONDITION_OPERATORS,
  FURNITURE_MOOD_EFFECT_TEMPLATES,
} from '../config/moodRules.js'

const props = defineProps({
  triggerEngine: { type: Object, required: true },
  visible: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'save'])

// ========== 规则列表 ==========

const rules = computed(() => props.triggerEngine?.getAllRules() || [])
const enabledRules = ref({})

// 初始化启用状态
onMounted(() => {
  for (const rule of rules.value) {
    enabledRules.value[rule.id] = rule.enabled
  }
})

// ========== 编辑面板 ==========

const showEditor = ref(false)
const editingRule = ref(null)
const isNewRule = ref(false)

const ruleForm = ref({
  id: '',
  name: '',
  triggerType: TRIGGER_TYPES.NEED,
  condition: {
    needType: 'hunger',
    operator: CONDITION_OPERATORS.LT,
    value: 20,
  },
  moodEffect: {
    label: '',
    description: '',
    modifier: -5,
    duration: 200,
    icon: '',
    category: 'negative',
  },
  enabled: true,
  priority: 50,
})

// 触发类型选项
const triggerTypeOptions = [
  { value: TRIGGER_TYPES.NEED, label: '需求值' },
  { value: TRIGGER_TYPES.TIME, label: '时间' },
  { value: TRIGGER_TYPES.ENVIRONMENT, label: '环境' },
]

// 需求类型选项
const needTypeOptions = [
  { value: 'hunger', label: '饥饿' },
  { value: 'rest', label: '休息' },
  { value: 'comfort', label: '舒适' },
  { value: 'joy', label: '娱乐' },
  { value: 'social', label: '社交' },
  { value: 'work_satisfaction', label: '工作满足' },
]

// 操作符选项
const operatorOptions = [
  { value: CONDITION_OPERATORS.LT, label: '小于 <' },
  { value: CONDITION_OPERATORS.LTE, label: '小于等于 ≤' },
  { value: CONDITION_OPERATORS.GT, label: '大于 >' },
  { value: CONDITION_OPERATORS.GTE, label: '大于等于 ≥' },
]

// 时间段选项
const timePhaseOptions = [
  { value: 'morning', label: '早晨' },
  { value: 'afternoon', label: '下午' },
  { value: 'evening', label: '傍晚' },
  { value: 'night', label: '夜晚' },
]

// 心情类别选项
const categoryOptions = [
  { value: 'positive', label: '正面' },
  { value: 'negative', label: '负面' },
  { value: 'neutral', label: '中性' },
]

// ========== 规则操作 ==========

const toggleRule = (ruleId) => {
  enabledRules.value[ruleId] = !enabledRules.value[ruleId]
  props.triggerEngine?.setRuleEnabled(ruleId, enabledRules.value[ruleId])
}

const openNewRule = () => {
  isNewRule.value = true
  editingRule.value = null
  ruleForm.value = {
    id: `rule-custom-${Date.now().toString(36)}`,
    name: '',
    triggerType: TRIGGER_TYPES.NEED,
    condition: {
      needType: 'hunger',
      operator: CONDITION_OPERATORS.LT,
      value: 20,
    },
    moodEffect: {
      label: '',
      description: '',
      modifier: -5,
      duration: 200,
      icon: '',
      category: 'negative',
    },
    enabled: true,
    priority: 50,
  }
  showEditor.value = true
}

const openEditRule = (rule) => {
  isNewRule.value = false
  editingRule.value = rule
  ruleForm.value = JSON.parse(JSON.stringify(rule))
  showEditor.value = true
}

const saveRule = () => {
  if (!ruleForm.value.id || !ruleForm.value.moodEffect.label) {
    alert('请填写规则ID和心情标签')
    return
  }

  if (isNewRule.value) {
    props.triggerEngine?.addCustomRule(ruleForm.value)
  } else {
    props.triggerEngine?.updateCustomRule(ruleForm.value.id, ruleForm.value)
  }

  enabledRules.value[ruleForm.value.id] = ruleForm.value.enabled
  showEditor.value = false
  emit('save')
}

const deleteRule = (ruleId) => {
  if (confirm('确定删除这个规则吗？')) {
    props.triggerEngine?.deleteCustomRule(ruleId)
    emit('save')
  }
}

// ========== UI ==========

const getRuleCategoryClass = (rule) => {
  if (rule.moodEffect.modifier > 0) return 'positive'
  if (rule.moodEffect.modifier < 0) return 'negative'
  return 'neutral'
}

const getRuleTriggerLabel = (rule) => {
  switch (rule.triggerType) {
    case TRIGGER_TYPES.NEED:
      const needLabel = needTypeOptions.find(o => o.value === rule.condition.needType)?.label || rule.condition.needType
      const opLabel = operatorOptions.find(o => o.value === rule.condition.operator)?.label || ''
      return `${needLabel} ${opLabel} ${rule.condition.value}`
    case TRIGGER_TYPES.TIME:
      return `时间段: ${timePhaseOptions.find(o => o.value === rule.condition.timePhase)?.label || rule.condition.timePhase}`
    case TRIGGER_TYPES.ENVIRONMENT:
      return `环境: ${rule.condition.envType}`
    default:
      return rule.triggerType
  }
}
</script>

<template>
  <div v-if="visible" class="mood-rule-panel">
    <!-- 头部 -->
    <div class="rule-header">
      <h3>心情触发规则</h3>
      <button class="close-btn" @click="$emit('close')">✕</button>
    </div>

    <!-- 规则列表 -->
    <div class="rule-list">
      <div class="rule-section">
        <div class="rule-section-header">
          <span>默认规则</span>
        </div>
        <div
          v-for="rule in rules.filter(r => r.id.startsWith('rule-'))"
          :key="rule.id"
          class="rule-item"
          :class="{ disabled: !enabledRules[rule.id] }"
        >
          <div class="rule-toggle">
            <input
              type="checkbox"
              :checked="enabledRules[rule.id]"
              @change="toggleRule(rule.id)"
            />
          </div>
          <div class="rule-info">
            <div class="rule-name">
              <span class="rule-icon">{{ rule.moodEffect.icon }}</span>
              <span>{{ rule.moodEffect.label }}</span>
              <span class="rule-mod" :class="getRuleCategoryClass(rule)">
                {{ rule.moodEffect.modifier > 0 ? '+' : '' }}{{ rule.moodEffect.modifier }}
              </span>
            </div>
            <div class="rule-condition">{{ getRuleTriggerLabel(rule) }}</div>
          </div>
        </div>
      </div>

      <!-- 自定义规则 -->
      <div class="rule-section" v-if="rules.filter(r => r.id.startsWith('rule-custom')).length > 0">
        <div class="rule-section-header">
          <span>自定义规则</span>
        </div>
        <div
          v-for="rule in rules.filter(r => r.id.startsWith('rule-custom'))"
          :key="rule.id"
          class="rule-item custom"
          :class="{ disabled: !enabledRules[rule.id] }"
        >
          <div class="rule-toggle">
            <input
              type="checkbox"
              :checked="enabledRules[rule.id]"
              @change="toggleRule(rule.id)"
            />
          </div>
          <div class="rule-info">
            <div class="rule-name">
              <span class="rule-icon">{{ rule.moodEffect.icon }}</span>
              <span>{{ rule.moodEffect.label }}</span>
              <span class="rule-mod" :class="getRuleCategoryClass(rule)">
                {{ rule.moodEffect.modifier > 0 ? '+' : '' }}{{ rule.moodEffect.modifier }}
              </span>
            </div>
            <div class="rule-condition">{{ getRuleTriggerLabel(rule) }}</div>
          </div>
          <div class="rule-actions">
            <button class="edit-btn" @click="openEditRule(rule)">✏️</button>
            <button class="delete-btn" @click="deleteRule(rule.id)">🗑️</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 新建按钮 -->
    <div class="rule-actions-bar">
      <button class="add-btn" @click="openNewRule">+ 新建规则</button>
    </div>

    <!-- 编辑面板 -->
    <div v-if="showEditor" class="rule-editor-overlay">
      <div class="rule-editor">
        <div class="editor-header">
          <h4>{{ isNewRule ? '新建规则' : '编辑规则' }}</h4>
          <button class="close-btn" @click="showEditor = false">✕</button>
        </div>

        <div class="editor-form">
          <!-- 规则名称 -->
          <div class="form-row">
            <label>规则名称</label>
            <input v-model="ruleForm.name" placeholder="例如：极度饥饿" />
          </div>

          <!-- 触发类型 -->
          <div class="form-row">
            <label>触发类型</label>
            <select v-model="ruleForm.triggerType">
              <option v-for="opt in triggerTypeOptions" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </div>

          <!-- 需求类条件 -->
          <div v-if="ruleForm.triggerType === TRIGGER_TYPES.NEED" class="condition-row">
            <select v-model="ruleForm.condition.needType">
              <option v-for="opt in needTypeOptions" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
            <select v-model="ruleForm.condition.operator">
              <option v-for="opt in operatorOptions" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
            <input type="number" v-model.number="ruleForm.condition.value" min="0" max="100" />
          </div>

          <!-- 时间类条件 -->
          <div v-if="ruleForm.triggerType === TRIGGER_TYPES.TIME" class="condition-row">
            <select v-model="ruleForm.condition.timePhase">
              <option v-for="opt in timePhaseOptions" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </div>

          <!-- 心情效果 -->
          <div class="form-section">
            <div class="form-section-title">心情效果</div>
            <div class="form-row">
              <label>显示标签</label>
              <input v-model="ruleForm.moodEffect.label" placeholder="例如：极度饥饿" />
            </div>
            <div class="form-row">
              <label>描述文字</label>
              <input v-model="ruleForm.moodEffect.description" placeholder="例如：急需食物补充能量" />
            </div>
            <div class="form-row">
              <label>心情值变化</label>
              <input type="number" v-model.number="ruleForm.moodEffect.modifier" min="-50" max="50" />
              <span class="modifier-hint">{{ ruleForm.moodEffect.modifier > 0 ? '正面效果' : '负面效果' }}</span>
            </div>
            <div class="form-row">
              <label>持续时间（秒）</label>
              <input type="number" v-model.number="ruleForm.moodEffect.duration" min="-1" max="1000" />
              <span class="duration-hint">-1 表示永久持续</span>
            </div>
            <div class="form-row">
              <label>图标</label>
              <input v-model="ruleForm.moodEffect.icon" placeholder="例如：🥭" />
            </div>
          </div>
        </div>

        <div class="editor-actions">
          <button class="cancel-btn" @click="showEditor = false">取消</button>
          <button class="save-btn" @click="saveRule">保存</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mood-rule-panel {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: #1a1a22;
  border: 1px solid #3a3a42;
  border-radius: 12px;
  width: 420px;
  max-height: 80vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  z-index: 1000;
  color: #eaeaea;
}

.rule-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid #3a3a42;
}

.rule-header h3 {
  font-size: 18px;
  margin: 0;
}

.close-btn {
  background: transparent;
  border: none;
  color: #aaa;
  font-size: 20px;
  cursor: pointer;
  padding: 4px 8px;
}

.rule-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.rule-section {
  margin-bottom: 16px;
}

.rule-section-header {
  font-size: 13px;
  color: #888;
  margin-bottom: 8px;
  padding-bottom: 4px;
  border-bottom: 1px solid #2a2a32;
}

.rule-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  background: #2a2a32;
  border-radius: 6px;
  margin-bottom: 6px;
}

.rule-item.disabled {
  opacity: 0.5;
}

.rule-item.custom {
  background: #3a3a42;
}

.rule-toggle input {
  width: 18px;
  height: 18px;
}

.rule-info {
  flex: 1;
}

.rule-name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}

.rule-icon {
  font-size: 16px;
}

.rule-mod {
  font-size: 12px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 3px;
}

.rule-mod.positive {
  background: #4a6a4a;
  color: #8c8;
}

.rule-mod.negative {
  background: #6a4a4a;
  color: #c88;
}

.rule-mod.neutral {
  background: #5a5a6a;
  color: #aaa;
}

.rule-condition {
  font-size: 12px;
  color: #888;
  margin-top: 4px;
}

.rule-actions {
  display: flex;
  gap: 4px;
}

.edit-btn, .delete-btn {
  background: transparent;
  border: none;
  font-size: 14px;
  cursor: pointer;
  padding: 4px 8px;
}

.delete-btn {
  color: #c88;
}

.rule-actions-bar {
  padding: 12px;
  border-top: 1px solid #3a3a42;
}

.add-btn {
  width: 100%;
  padding: 10px;
  background: #4a6a4a;
  border: none;
  border-radius: 6px;
  color: #fff;
  font-size: 14px;
  cursor: pointer;
}

.add-btn:hover {
  background: #5a7a5a;
}

/* 编辑面板 */
.rule-editor-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1001;
}

.rule-editor {
  background: #1a1a22;
  border: 1px solid #3a3a42;
  border-radius: 12px;
  width: 380px;
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.editor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #3a3a42;
}

.editor-header h4 {
  font-size: 16px;
  margin: 0;
}

.editor-form {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.form-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.form-row label {
  min-width: 80px;
  font-size: 13px;
  color: #aaa;
}

.form-row input, .form-row select {
  flex: 1;
  padding: 8px 12px;
  background: #2a2a32;
  border: 1px solid #4a4a52;
  border-radius: 4px;
  color: #eaeaea;
  font-size: 14px;
}

.form-row input:focus, .form-row select:focus {
  border-color: #6a8a6a;
}

.condition-row {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.condition-row select, .condition-row input {
  padding: 8px 12px;
  background: #2a2a32;
  border: 1px solid #4a4a52;
  border-radius: 4px;
  color: #eaeaea;
  font-size: 14px;
}

.form-section {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid #3a3a42;
}

.form-section-title {
  font-size: 14px;
  color: #aaa;
  margin-bottom: 12px;
}

.modifier-hint, .duration-hint {
  font-size: 12px;
  color: #888;
}

.editor-actions {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid #3a3a42;
}

.cancel-btn, .save-btn {
  padding: 10px 16px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
}

.cancel-btn {
  background: #4a4a52;
  color: #eaeaea;
}

.save-btn {
  flex: 1;
  background: #6a8a6a;
  color: #fff;
}
</style>