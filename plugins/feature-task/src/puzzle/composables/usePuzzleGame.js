/**
 * 解谜游戏 Composable
 * 管理解谜会话：谜题进度、提示使用、推理点数、答案校验
 */

import { ref, computed } from 'vue'

export function usePuzzleGame() {
  const session = ref(null)

  const currentPuzzle = computed(() => {
    if (!session.value) return null
    const idx = session.value.currentPuzzleIndex
    if (idx < 0 || idx >= session.value.puzzles.length) return null
    return session.value.puzzles[idx]
  })

  const currentHintIndex = computed(() => {
    if (!session.value) return 0
    return session.value.hintsUsed.length
  })

  const availableHints = computed(() => {
    const puzzle = currentPuzzle.value
    if (!puzzle) return 0
    return Math.max(0, puzzle.hints.length - (session.value?.hintsUsed.length || 0))
  })

  const isLastPuzzle = computed(() => {
    if (!session.value) return false
    return session.value.currentPuzzleIndex >= session.value.puzzles.length - 1
  })

  function createPuzzleSession(puzzleData, taskId) {
    session.value = {
      taskId,
      story: puzzleData.story || '',
      finalAnswerPrompt: puzzleData.finalAnswerPrompt || '',
      puzzles: puzzleData.puzzles || [],
      status: 'intro', // intro | playing | solved | failed
      currentPuzzleIndex: 0,
      reasoningPoints: 0,
      hintsUsed: [],
      answers: [],
      createdAt: Date.now(),
    }
    return session.value
  }

  function startPuzzles() {
    if (!session.value || session.value.status !== 'intro') return
    session.value.status = 'playing'
  }

  function submitAnswer(userAnswer) {
    if (!session.value || session.value.status !== 'playing') return { success: false, correct: false }
    const puzzle = currentPuzzle.value
    if (!puzzle) return { success: false, correct: false }

    const correct = normalizeAnswer(userAnswer) === normalizeAnswer(puzzle.answer)

    if (correct) {
      session.value.reasoningPoints += 10
      session.value.answers.push({ puzzleIndex: session.value.currentPuzzleIndex, answer: userAnswer, correct: true })
    } else {
      session.value.reasoningPoints = Math.max(0, session.value.reasoningPoints - 5)
      session.value.answers.push({ puzzleIndex: session.value.currentPuzzleIndex, answer: userAnswer, correct: false })
    }

    // Move to next puzzle
    session.value.currentPuzzleIndex += 1
    session.value.hintsUsed = [] // reset hint tracking for new puzzle

    if (session.value.currentPuzzleIndex >= session.value.puzzles.length) {
      session.value.status = 'solved'
    }

    return { success: true, correct }
  }

  function useHint() {
    if (!session.value || session.value.status !== 'playing') return null
    const puzzle = currentPuzzle.value
    if (!puzzle) return null

    const nextHintIdx = session.value.hintsUsed.length
    if (nextHintIdx >= puzzle.hints.length) return null

    session.value.reasoningPoints = Math.max(0, session.value.reasoningPoints - 3)
    session.value.hintsUsed.push(nextHintIdx)
    return puzzle.hints[nextHintIdx]
  }

  function completeFinalAnswer() {
    if (!session.value || session.value.status !== 'solved') return
    session.value.status = 'completed'
  }

  function failPuzzle() {
    if (!session.value) return
    session.value.status = 'failed'
  }

  function normalizeAnswer(str) {
    return String(str || '').trim().toLowerCase().replace(/\s+/g, '')
  }

  return {
    session,
    currentPuzzle,
    currentHintIndex,
    availableHints,
    isLastPuzzle,
    createPuzzleSession,
    startPuzzles,
    submitAnswer,
    useHint,
    completeFinalAnswer,
    failPuzzle,
  }
}
