/**
 * 世界书用户数据：每本书的用户名、描述、主线、任务、剧情道具
 * 替换原 useBookData.js
 */

import { defineStore } from 'pinia'

const defaultBookData = () => ({
  userName: '玩家',
  userDescription: '',
  mainStory: { progress: 0 },
  tasks: [],
  plotItems: [],
})

export const useWorldBookData = defineStore('worldBookData', {
  state: () => ({
    books: {},
  }),

  getters: {
    getBookData: (s) => (bookId) => s.books[bookId] || defaultBookData(),
  },

  actions: {
    setBookData(bookId, updater) {
      const existing = this.getBookData(bookId)
      const next = typeof updater === 'function' ? updater(existing) : updater
      this.books[bookId] = {
        userName: next.userName ?? existing.userName,
        userDescription: next.userDescription ?? existing.userDescription,
        mainStory: next.mainStory ?? existing.mainStory,
        tasks: Array.isArray(next.tasks) ? next.tasks : existing.tasks,
        plotItems: Array.isArray(next.plotItems) ? next.plotItems : existing.plotItems,
      }
    },

    updateUserName(bookId, name) {
      this.setBookData(bookId, (prev) => ({ ...prev, userName: name }))
    },

    updateUserDescription(bookId, desc) {
      this.setBookData(bookId, (prev) => ({ ...prev, userDescription: desc }))
    },

    updateMainStory(bookId, storyData) {
      this.setBookData(bookId, (prev) => ({ ...prev, mainStory: { ...prev.mainStory, ...storyData } }))
    },

    setTasks(bookId, tasks) {
      this.setBookData(bookId, (prev) => ({ ...prev, tasks }))
    },

    updatePlotItems(bookId, items) {
      this.setBookData(bookId, (prev) => ({ ...prev, plotItems: items }))
    },

    addPlotItem(bookId, item) {
      this.setBookData(bookId, (prev) => {
        const existing = prev.plotItems.find(i => i.id === item.id)
        if (existing) {
          existing.quantity = (existing.quantity || 1) + (item.quantity || 1)
          return prev
        }
        return { ...prev, plotItems: [...prev.plotItems, { ...item, quantity: item.quantity || 1 }] }
      })
    },

    removePlotItem(bookId, itemId, quantity = 1) {
      this.setBookData(bookId, (prev) => {
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
    },
  },

  persist: {
    key: 'avg_llm_world_book_data_v1',
    paths: ['books'],
  },
})
