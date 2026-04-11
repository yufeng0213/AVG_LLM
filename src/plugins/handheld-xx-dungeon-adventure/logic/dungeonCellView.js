const toType = (value, fallback = 'empty') => String(value || fallback)

export const buildDungeonCellBadge = (cell, options = {}) => {
  if (!cell) return ''
  const {
    hasLeaderSprite = false,
    shouldRenderObject = null,
    tileTypes = {},
  } = options || {}
  const startType = toType(tileTypes.start, 'start')
  const exitType = toType(tileTypes.exit, 'exit')
  const bossType = toType(tileTypes.boss, 'boss')
  const monsterType = toType(tileTypes.monster, 'monster')
  const treasureType = toType(tileTypes.treasure, 'treasure')

  if (cell.isPlayer) return hasLeaderSprite ? '' : '我'
  if (typeof shouldRenderObject === 'function' && shouldRenderObject(cell)) return ''
  if (toType(cell.type, 'empty') === startType) return '起'
  if (toType(cell.type, 'empty') === exitType) return '终'
  if (toType(cell.type, 'empty') === bossType && !cell.cleared) return '王'
  if (toType(cell.type, 'empty') === monsterType && !cell.cleared) return '怪'
  if (toType(cell.type, 'empty') === treasureType && !cell.cleared) return '宝'
  return ''
}

export const buildDungeonCellClass = (cell, options = {}) => {
  const emptyType = toType(options?.tileTypes?.empty, 'empty')
  return [
    `is-type-${toType(cell?.type, emptyType)}`,
    {
      'is-passable': Boolean(cell?.terrainPassable),
      'is-blocked': !cell?.terrainPassable,
      'is-cleared': Boolean(cell?.cleared),
      'is-player': Boolean(cell?.isPlayer),
      'is-next-encounter': Boolean(cell?.isNextEncounter),
    },
  ]
}

export const buildDungeonCellTitle = (cell, options = {}) => {
  if (!cell) return ''
  const {
    tileTypes = {},
  } = options || {}
  const startType = toType(tileTypes.start, 'start')
  const exitType = toType(tileTypes.exit, 'exit')
  const bossType = toType(tileTypes.boss, 'boss')
  const monsterType = toType(tileTypes.monster, 'monster')
  const treasureType = toType(tileTypes.treasure, 'treasure')
  const emptyType = toType(tileTypes.empty, 'empty')

  const terrainName = String(cell?.terrainName || (cell?.terrainPassable ? '可通行地形' : '阻塞地形')).trim()
  const objectName = String(cell?.objectName || '').trim()
  const typeMap = {
    [startType]: '起点',
    [exitType]: '终点',
    [monsterType]: cell?.cleared ? '已清理小怪点' : '小怪点',
    [bossType]: cell?.cleared ? '已清理首领点' : '首领点',
    [treasureType]: cell?.cleared ? '已开启宝箱点' : '宝箱点',
    [emptyType]: cell?.terrainPassable ? '可通行空地' : '障碍地形',
  }
  const typeText = typeMap[toType(cell?.type, emptyType)] || '未知格子'
  return `${terrainName}${objectName ? ` · ${objectName}` : ''} · ${typeText} (${cell?.x},${cell?.y})`
}
