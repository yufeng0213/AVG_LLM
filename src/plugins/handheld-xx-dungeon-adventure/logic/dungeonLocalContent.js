export const EQUIPMENT_POOL = {
  R: [
    { name: '铁脊短剑', slot: 'weapon', atk: 12, def: 0, hp: 0 },
    { name: '矿石战斧', slot: 'weapon', atk: 14, def: 0, hp: 0 },
    { name: '鳞片轻甲', slot: 'armor', atk: 0, def: 11, hp: 18 },
    { name: '灰土护肩', slot: 'armor', atk: 0, def: 10, hp: 20 },
    { name: '回响戒指', slot: 'relic', atk: 6, def: 5, hp: 16 },
    { name: '幸运护符', slot: 'relic', atk: 4, def: 6, hp: 20 },
  ],
  SR: [
    { name: '雷鸣重剑', slot: 'weapon', atk: 24, def: 2, hp: 8 },
    { name: '裂风长枪', slot: 'weapon', atk: 22, def: 3, hp: 10 },
    { name: '龙鳞重甲', slot: 'armor', atk: 4, def: 22, hp: 36 },
    { name: '银月板甲', slot: 'armor', atk: 3, def: 24, hp: 32 },
    { name: '星痕吊坠', slot: 'relic', atk: 14, def: 10, hp: 24 },
    { name: '回春徽章', slot: 'relic', atk: 8, def: 12, hp: 42 },
  ],
  SSR: [
    { name: '天陨之刃', slot: 'weapon', atk: 40, def: 8, hp: 18 },
    { name: '幽冥圣枪', slot: 'weapon', atk: 42, def: 7, hp: 14 },
    { name: '不落王铠', slot: 'armor', atk: 10, def: 40, hp: 70 },
    { name: '苍穹壁垒甲', slot: 'armor', atk: 8, def: 42, hp: 66 },
    { name: '命运星核', slot: 'relic', atk: 24, def: 16, hp: 52 },
    { name: '深渊圣印', slot: 'relic', atk: 20, def: 20, hp: 58 },
  ],
}

export const LOCAL_BANTER_LINES = [
  '这波怪还行，至少没把我鞋踩坏。',
  '别急着冲，我的法杖还没热身完。',
  '说好是探险，怎么又是加班打工副本？',
  '前面那团雾看着不对劲，先把盾抬起来。',
  '宝箱要是空的，我要实名吐槽策划。',
  '队长，下一抽出金我就承认你是欧皇。',
]

export const LOCAL_SCENE_LIBRARY = {
  battle: [
    { title: '碎石回廊', description: '阴影里传来铁靴声，巡逻怪冲了出来。', banterHint: '别省技能，快收掉。' },
    { title: '潮湿墓室', description: '青苔覆盖石砖，亡骨在角落重新拼起身形。', banterHint: '它们看起来很能扛。' },
    { title: '矿井断桥', description: '桥面半塌，敌人从两侧包夹。', banterHint: '稳住阵型，别被推下去。' },
  ],
  treasure: [
    { title: '密封藏宝间', description: '一排锁箱静置多年，似乎还能开。', banterHint: '快看看有没有值钱货。' },
    { title: '裂纹祭坛', description: '祭坛中央浮着微光，像是奖励节点。', banterHint: '这次应该不是陷阱吧？' },
  ],
  rest: [
    { title: '旧营地火盆', description: '火苗尚温，说明这里曾有人停留。', banterHint: '抓紧喘口气。' },
    { title: '温泉暗室', description: '岩缝里冒出热雾，伤势能慢慢缓解。', banterHint: '休整一下再推进。' },
  ],
  trap: [
    { title: '毒针走廊', description: '墙体机关被触发，细针成片射出。', banterHint: '这设计太恶意了。' },
    { title: '坍塌通道', description: '头顶岩块突然砸落，队伍被迫后撤。', banterHint: '先保命，别贪。' },
  ],
  boss: [
    { title: '深层王座厅', description: '黑曜石王座前，守层首领已苏醒。', banterHint: '硬仗开始了，别慌。' },
    { title: '深渊升降井', description: '机械巨像堵住去路，战斗无法回避。', banterHint: '先拆护甲，再打核心。' },
  ],
}
