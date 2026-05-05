// 物品系统 - 食物、材料、产品管理

const fallbackMakeId = (prefix = 'item') => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

// 物品类型
export const ITEM_TYPE_FOOD = 'food'
export const ITEM_TYPE_MATERIAL = 'material'
export const ITEM_TYPE_PRODUCT = 'product'

// 默认物品模板
const ITEM_TEMPLATES = {
  food: [
    { id: 'food-simple', name: '简单餐食', quality: 1, effect: { hunger: 20 }, stackable: true, maxStack: 10 },
    { id: 'food-good', name: '美味佳肴', quality: 2, effect: { hunger: 35, joy: 5 }, stackable: true, maxStack: 10 },
    { id: 'food-excellent', name: '豪华盛宴', quality: 3, effect: { hunger: 50, joy: 10, comfort: 5 }, stackable: true, maxStack: 5 },
  ],
  material: [
    { id: 'material-basic', name: '基础材料', quality: 1, effect: {}, stackable: true, maxStack: 50 },
    { id: 'material-refined', name: '精炼材料', quality: 2, effect: {}, stackable: true, maxStack: 30 },
    { id: 'material-rare', name: '稀有材料', quality: 3, effect: {}, stackable: true, maxStack: 10 },
  ],
  product: [
    { id: 'product-craft', name: '手工艺品', quality: 1, effect: { joy: 5 }, stackable: false },
    { id: 'product-fine', name: '精品制品', quality: 2, effect: { joy: 10, comfort: 5 }, stackable: false },
    { id: 'product-masterwork', name: '大师之作', quality: 3, effect: { joy: 20, comfort: 10 }, stackable: false },
  ],
}

export const createItemEngine = (deps = {}) => {
  const makeId = deps.makeId || fallbackMakeId

  // 创建物品实例
  const createItem = (templateId, type = ITEM_TYPE_MATERIAL, amount = 1) => {
    const templates = ITEM_TEMPLATES[type] || ITEM_TEMPLATES.material
    const template = templates.find(t => t.id === templateId) || templates[0]

    return {
      id: makeId('item'),
      templateId: template.id,
      name: template.name,
      type,
      quality: template.quality || 1,
      effect: { ...template.effect },
      amount: Math.max(1, Number(amount) || 1),
      stackable: template.stackable !== false,
      maxStack: template.maxStack || 99,
      createdAt: Date.now(),
    }
  }

  // 添加物品到库存
  const addItemToInventory = (inventory, item) => {
    const existing = inventory.find(i =>
      i.templateId === item.templateId &&
      i.type === item.type &&
      i.stackable
    )

    if (existing) {
      existing.amount = Math.min(existing.maxStack, existing.amount + item.amount)
    } else {
      inventory.push(item)
    }

    return inventory
  }

  // 从库存移除物品
  const removeItemFromInventory = (inventory, itemId, amount = 1) => {
    const item = inventory.find(i => i.id === itemId)
    if (!item) return { success: false, inventory }

    if (item.amount > amount) {
      item.amount -= amount
      return { success: true, inventory, remaining: item.amount }
    }

    // 完全移除
    const index = inventory.indexOf(item)
    inventory.splice(index, 1)
    return { success: true, inventory, remaining: 0 }
  }

  // 使用物品（消耗效果）
  const useItem = (pawn, item) => {
    if (!pawn || !item) return { success: false }

    // 应用效果
    if (item.effect) {
      for (const [needType, value] of Object.entries(item.effect)) {
        if (pawn.needs?.[needType]) {
          pawn.needs[needType].value = Math.min(100, pawn.needs[needType].value + value)
        }
      }
    }

    return { success: true, effects: item.effect }
  }

  // 检查库存中是否有某类物品
  const hasItemType = (inventory, type) => {
    return inventory.some(i => i.type === type && i.amount > 0)
  }

  // 获取某类物品的总数量
  const getItemCountByType = (inventory, type) => {
    return inventory
      .filter(i => i.type === type)
      .reduce((sum, i) => sum + i.amount, 0)
  }

  // 规范化物品数据
  const normalizeItem = (raw) => {
    if (!raw || typeof raw !== 'object') return createItem('material-basic', ITEM_TYPE_MATERIAL)

    return {
      id: String(raw.id || makeId('item')).slice(0, 48),
      templateId: String(raw.templateId || 'material-basic').slice(0, 32),
      name: String(raw.name || '物品').slice(0, 24),
      type: [ITEM_TYPE_FOOD, ITEM_TYPE_MATERIAL, ITEM_TYPE_PRODUCT].includes(raw.type)
        ? raw.type : ITEM_TYPE_MATERIAL,
      quality: Math.max(1, Math.min(5, Number(raw.quality) || 1)),
      effect: raw.effect || {},
      amount: Math.max(1, Math.min(99, Number(raw.amount) || 1)),
      stackable: Boolean(raw.stackable !== false),
      maxStack: Math.max(1, Math.min(99, Number(raw.maxStack) || 99)),
      createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now(),
    }
  }

  // 规范化库存列表
  const normalizeInventory = (rawList) => {
    if (!Array.isArray(rawList)) return []
    return rawList.slice(0, 100).map(normalizeItem)
  }

  // 生成随机物品
  const generateRandomItem = (type, qualityRange = [1, 3]) => {
    const templates = ITEM_TEMPLATES[type] || ITEM_TEMPLATES.material
    const quality = Math.floor(Math.random() * (qualityRange[1] - qualityRange[0] + 1)) + qualityRange[0]
    const matchingTemplates = templates.filter(t => t.quality === quality)
    const template = matchingTemplates.length > 0
      ? matchingTemplates[Math.floor(Math.random() * matchingTemplates.length)]
      : templates[0]

    return createItem(template.id, type, 1)
  }

  // ========== 存储和售货机相关方法 ==========

  // 检查库存是否有满足需求的物品
  const hasItemForNeed = (inventory, needType) => {
    if (!Array.isArray(inventory)) return false
    return inventory.some(item =>
      item.effect && item.effect[needType] > 0 && item.amount > 0
    )
  }

  // 获取满足需求的最佳物品（效果最强）
  const getBestItemForNeed = (inventory, needType) => {
    if (!Array.isArray(inventory)) return null
    const candidates = inventory.filter(item =>
      item.effect && item.effect[needType] > 0 && item.amount > 0
    )
    if (candidates.length === 0) return null
    return candidates.reduce((best, item) =>
      item.effect[needType] > best.effect[needType] ? item : best
    )
  }

  // 消耗物品并应用效果（给小人）
  const consumeItemForPawn = (pawn, inventory, itemId, amount = 1) => {
    if (!Array.isArray(inventory)) return { success: false }
    const item = inventory.find(i => i.id === itemId)
    if (!item || item.amount < amount) return { success: false }

    // 应用效果到小人需求
    if (item.effect) {
      for (const [needType, value] of Object.entries(item.effect)) {
        if (pawn.needs?.[needType]) {
          pawn.needs[needType].value = Math.min(100, pawn.needs[needType].value + value)
        }
      }
    }

    // 减少数量
    item.amount -= amount
    if (item.amount <= 0) {
      const index = inventory.indexOf(item)
      inventory.splice(index, 1)
    }

    return { success: true, effects: item.effect, itemName: item.name }
  }

  // 从售货机购买商品
  const purchaseFromShop = (currency, shopInventory, templateId, amount = 1) => {
    if (!Array.isArray(shopInventory)) return { success: false, error: 'no_shop' }
    const product = shopInventory.find(p => p.templateId === templateId)
    if (!product || product.stock < amount) return { success: false, error: 'out_of_stock' }

    const totalPrice = product.price * amount
    if (!currency || currency.coins < totalPrice) return { success: false, error: 'not_enough_money' }

    // 扣款减库存
    currency.coins -= totalPrice
    product.stock -= amount

    // 创建物品实例（用于显示效果）
    const purchasedItem = {
      name: product.name,
      type: product.type,
      effect: { ...product.effect },
      price: product.price,
    }

    return { success: true, item: purchasedItem, cost: totalPrice }
  }

  // 售货机自动补货
  const restockShopInventory = (shopInventory, restockAmount = 5) => {
    if (!Array.isArray(shopInventory)) return
    for (const product of shopInventory) {
      if (product.stock < product.maxStock) {
        product.stock = Math.min(product.maxStock, product.stock + restockAmount)
      }
    }
  }

  return {
    createItem,
    addItemToInventory,
    removeItemFromInventory,
    useItem,
    hasItemType,
    getItemCountByType,
    normalizeItem,
    normalizeInventory,
    generateRandomItem,
    hasItemForNeed,
    getBestItemForNeed,
    consumeItemForPawn,
    purchaseFromShop,
    restockShopInventory,
    ITEM_TEMPLATES,
  }
}

export default createItemEngine