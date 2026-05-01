/**
 * 向后兼容层 — 所有导出已迁移至 connection.js 和 repos/
 * 新代码请直接导入 connection.js 或对应的 repo 文件
 */
export {
  openDatabase, getDB, isSQLiteAvailable,
  exec, query, transaction, batchExecute,
  createTables,
} from './connection.js'

export { appConfigRepo } from './repos/appConfig.repo.js'
export {
  loadBookFull, loadAllBooksFull, insertBook, clearAllTables,
  rowToWorldBook,
} from './repos/worldBook.repo.js'

export {
  saveRoomState, loadRoomState,
  saveFurnitureLibrary, loadFurnitureLibrary,
  savePawnSprites, loadPawnSprites, loadAllPawnSprites,
  deleteFurnitureFromLibrary,
  clearRoomSimData, isRoomSimSQLiteAvailable,
} from '../plugins/handheld-xx-room-simulation/state/roomSimRepo.js'
