import { computed, ref } from 'vue'

const STORAGE_KEY = 'avg_llm_world_book_data_v1'

// 全局单例状态：{ [bookId]: { userName, userDescription, mainStory, tasks, plotItems } }
const allBookData = ref({})

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      allBookData.value = JSON.parse(raw)
    }
  } catch (e) {
    console.warn('[BookData] Failed to load world book data:', e)
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(allBookData.value))
  } catch (e) {
    console.error('[BookData] Failed to persist world book data:', e)
  }
}

function getBookData(bookId) {
  return allBookData.value[bookId] || {
    userName: '玩家',
    userDescription: '',
    mainStory: { progress: 0 },
    tasks: [],
    plotItems: [],
  }
}

function setBookData(bookId, updater) {
  const existing = getBookData(bookId)
  const next = typeof updater === 'function' ? updater(existing) : updater
  allBookData.value[bookId] = {
    userName: next.userName ?? existing.userName,
    userDescription: next.userDescription ?? existing.userDescription,
    mainStory: next.mainStory ?? existing.mainStory,
    tasks: Array.isArray(next.tasks) ? next.tasks : existing.tasks,
    plotItems: Array.isArray(next.plotItems) ? next.plotItems : existing.plotItems,
  }
  persist()
}

function updateUserName(bookId, name) {
  setBookData(bookId, (prev) => ({ ...prev, userName: name }))
}

function updateUserDescription(bookId, desc) {
  setBookData(bookId, (prev) => ({ ...prev, userDescription: desc }))
}

function updateMainStory(bookId, storyData) {
  setBookData(bookId, (prev) => ({ ...prev, mainStory: { ...prev.mainStory, ...storyData } }))
}

function setTasks(bookId, tasks) {
  setBookData(bookId, (prev) => ({ ...prev, tasks }))
}

function updatePlotItems(bookId, items) {
  setBookData(bookId, (prev) => ({ ...prev, plotItems: items }))
}

function addPlotItem(bookId, item) {
  setBookData(bookId, (prev) => {
    const existing = prev.plotItems.find(i => i.id === item.id)
    if (existing) {
      existing.quantity = (existing.quantity || 1) + (item.quantity || 1)
      return prev
    }
    return { ...prev, plotItems: [...prev.plotItems, { ...item, quantity: item.quantity || 1 }] }
  })
}

function removePlotItem(bookId, itemId, quantity = 1) {
  setBookData(bookId, (prev) => {
    const idx = prev.plotItems.findIndex(i => i.id === itemId)
    if (idx === -1) return prev
    const items = [...prev.plotItems]
    if ((items[idx].quantity || 1) <= quantity) {
      items.splice(idx, 1)
    } else {
      items[idx] = { ...items[idx], quantity: items[idx].quantity - quantity }
    }
    return { ...prev, plotItems: items }
  })
}

// 模块加载时自动读取
load()

export function useBookData(bookId) {
  const data = ref(getBookData(bookId))

  // 监听 allBookData 变化，同步更新当前 book 的数据
  const sync = () => {
    data.value = getBookData(bookId)
  }

  return {
    data,
    userName: computed(() => data.value.userName),
    userDescription: computed(() => data.value.userDescription),
    mainStory: computed(() => data.value.mainStory),
    tasks: computed(() => data.value.tasks),
    plotItems: computed(() => data.value.plotItems),
    updateUserName: (name) => { updateUserName(bookId, name); sync() },
    updateUserDescription: (desc) => { updateUserDescription(bookId, desc); sync() },
    updateMainStory: (storyData) => { updateMainStory(bookId, storyData); sync() },
    setTasks: (tasks) => { setTasks(bookId, tasks); sync() },
    updatePlotItems: (items) => { updatePlotItems(bookId, items); sync() },
    addPlotItem: (item) => { addPlotItem(bookId, item); sync() },
    removePlotItem: (itemId, quantity) => { removePlotItem(bookId, itemId, quantity); sync() },
    refresh: sync,
  }
}


