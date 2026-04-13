/**
 * 商店商品相关常量与本地生成逻辑
 */

// 商店商品分类
export const DORM_SHOP_CATEGORIES = [
  { id: 'all', label: '全部', icon: '🏪' },
  { id: 'misc', label: '杂物', icon: '📦' },
  { id: 'gift', label: '礼品', icon: '🎁' },
  { id: 'clothes', label: '衣服', icon: '👔' },
  { id: 'plant', label: '花草', icon: '🌿' },
  { id: 'food', label: '食物', icon: '🍔' },
  { id: 'decoration', label: '装饰', icon: '✨' },
]

// 商店商品模板库
export const DORM_SHOP_ITEM_TEMPLATES = {
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
export function generateShopItems(category = 'all', count = 6) {
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
