/**
 * 线索收集游戏 Composable
 * 管理案件摘要、NPC对话、信任度、线索收集、结论判定
 */

import { ref, computed } from 'vue'

export function useClueGame() {
  const session = ref(null)

  const currentNpc = computed(() => {
    if (!session.value) return null
    const idx = session.value.currentNpcIndex
    if (idx < 0 || idx >= session.value.npcs.length) return null
    return session.value.npcs[idx]
  })

  const currentDialogue = computed(() => {
    const npc = currentNpc.value
    if (!npc) return null
    const round = session.value.npcDialogues[session.value.currentNpcIndex] || 0
    if (round >= npc.dialogues.length) return null
    return npc.dialogues[round]
  })

  const allClues = computed(() => {
    if (!session.value) return []
    const clues = []
    for (const npc of (session.value.npcs || [])) {
      for (const clue of (npc.clues || [])) {
        if (!clue) continue
        const unlocked = (session.value.npcTrust[npc.name] || 0) >= clue.condition
        clues.push({ ...clue, npcName: npc.name, unlocked })
      }
    }
    for (const clue of (session.value.globalClues || [])) {
      if (!clue) continue
      clues.push({ ...clue, npcName: null, unlocked: true })
    }
    return clues
  })

  const unlockedClueCount = computed(() => allClues.value.filter(c => c.unlocked).length)
  const totalClueCount = computed(() => allClues.value.length)

  function createSession(clueData, taskId) {
    const npcTrust = {}
    const npcDialogProgress = {}
    for (const npc of (clueData.npcs || [])) {
      npcTrust[npc.name] = 0
      npcDialogProgress[npc.name] = 0
    }

    session.value = {
      taskId,
      story: clueData.story || '',
      npcs: clueData.npcs || [],
      globalClues: clueData.clues || [],
      conclusion: clueData.conclusion || null,
      status: 'intro', // intro | investigating | concluding | result
      currentNpcIndex: 0,
      npcTrust,
      npcDialogues: npcDialogProgress, // track current round per npc
      unlockedClues: [], // { npcName, clueName, text }
      answeredNpcs: new Set(), // NPCs whose dialogue is complete
      conclusionAnswer: '',
      conclusionCorrect: false,
      createdAt: Date.now(),
    }
    return session.value
  }

  function startInvestigation() {
    if (!session.value || session.value.status !== 'intro') return
    session.value.status = 'investigating'
  }

  function selectDialogueOption(npcName, option) {
    if (!session.value || session.value.status !== 'investigating') return null

    // Apply trust change
    const oldTrust = session.value.npcTrust[npcName] || 0
    const newTrust = Math.max(0, oldTrust + option.trustChange)
    session.value.npcTrust[npcName] = newTrust

    // Advance dialogue
    const npcIdx = session.value.npcs.findIndex(n => n.name === npcName)
    if (npcIdx < 0) return { trust: newTrust, trustChange: option.trustChange, dialogueComplete: false, clueUnlocked: null }

    session.value.npcDialogues[npcName] = (session.value.npcDialogues[npcName] || 0) + 1

    // Check if any clue unlocked at this trust level
    const npc = session.value.npcs[npcIdx]
    let clueUnlocked = null
    for (const clue of npc.clues) {
      if (newTrust >= clue.condition && oldTrust < clue.condition) {
        session.value.unlockedClues.push({ npcName, clueName: clue.name, text: clue.text })
        clueUnlocked = clue
      }
    }

    // Check if all dialogues done for this NPC
    const currentRound = session.value.npcDialogues[npcName]
    const dialogueComplete = currentRound >= npc.dialogues.length

    if (dialogueComplete) {
      session.value.answeredNpcs.add(npcName)
    }

    return { trust: newTrust, trustChange: option.trustChange, dialogueComplete, clueUnlocked }
  }

  function nextNpc() {
    if (!session.value) return
    if (session.value.currentNpcIndex < session.value.npcs.length - 1) {
      session.value.currentNpcIndex += 1
    } else {
      // All NPCs visited, go to conclusion
      session.value.status = 'concluding'
    }
  }

  function selectNpc(index) {
    if (!session.value) return
    if (index >= 0 && index < session.value.npcs.length) {
      session.value.currentNpcIndex = index
    }
  }

  function submitConclusion(selectedIndex) {
    if (!session.value || session.value.status !== 'concluding') return false
    const conclusion = session.value.conclusion
    if (!conclusion) return false

    const selectedOption = conclusion.options?.[selectedIndex]
    if (!selectedOption) {
      session.value.conclusionCorrect = false
      session.value.status = 'result'
      return false
    }

    session.value.conclusionAnswer = selectedOption
    session.value.conclusionSelectedIndex = selectedIndex
    session.value.conclusionCorrect = selectedOption === conclusion.answer ||
      normalizeAnswer(selectedOption) === normalizeAnswer(conclusion.answer)

    session.value.status = 'result'
    return session.value.conclusionCorrect
  }

  function getRating() {
    if (!session.value) return { label: '', emoji: '', score: 0 }
    const total = totalClueCount.value
    const unlocked = unlockedClueCount.value
    const correct = session.value.conclusionCorrect
    const ratio = total > 0 ? unlocked / total : 0

    if (ratio >= 1 && correct) return { label: '完美侦探', emoji: '🔍', score: 150 }
    if (ratio >= 0.75 && correct) return { label: '优秀', emoji: '📋', score: 100 }
    if (ratio >= 0.5 && correct) return { label: '一般', emoji: '📝', score: 70 }
    if (correct) return { label: '勉强', emoji: '❓', score: 40 }
    return { label: '失败', emoji: '❌', score: 0 }
  }

  function normalizeAnswer(str) {
    return String(str || '').trim().toLowerCase().replace(/\s+/g, '')
  }

  function getTrustLabel(trust) {
    if (trust >= 15) return '非常信任'
    if (trust >= 10) return '比较信任'
    if (trust >= 5) return '有些信任'
    if (trust >= 0) return '中立'
    return '警惕'
  }

  return {
    session,
    currentNpc,
    currentDialogue,
    allClues,
    unlockedClueCount,
    totalClueCount,
    createSession,
    startInvestigation,
    selectDialogueOption,
    nextNpc,
    selectNpc,
    submitConclusion,
    getRating,
    getTrustLabel,
  }
}
