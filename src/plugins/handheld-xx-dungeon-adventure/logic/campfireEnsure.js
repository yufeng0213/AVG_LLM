const buildCampfireCharacterHints = (characters = [], fallbackList = [], maxCampfireCompanions = 240) => {
  const characterHints = (Array.isArray(characters) ? characters : [])
    .map((item) => {
      const parts = [
        item?.name,
        item?.role,
        item?.hint ? `外观与设定:${item.hint}` : '',
      ].filter(Boolean)
      return parts.join('|')
    })
    .filter(Boolean)
    .slice(0, maxCampfireCompanions)

  const fallbackHints = (Array.isArray(fallbackList) ? fallbackList : [])
    .map((item) => {
      const parts = [
        item?.name,
        item?.role,
        item?.line ? `动作:${item.line}` : '',
      ].filter(Boolean)
      return parts.join('|')
    })
    .filter(Boolean)

  return characterHints.length > 0 ? characterHints : fallbackHints
}

export const resolveCampfireCompanionsState = async (options = {}) => {
  const {
    forceRegenerate = false,
    normalizedState = null,
    loadWorldSnapshot = null,
    buildWorldBookCharacterSignature = null,
    buildWorldBookTeammates = null,
    buildFallbackCampfireCompanions = null,
    calcTargetCampfireCompanionCount = null,
    normalizeCampfireCompanionList = null,
    mergeGeneratedCompanions = null,
    applyCompanionRolesToTeammates = null,
    requestCampfireCompanions = null,
    maxCampfireLlmCount = 48,
    maxCampfireCompanions = 240,
  } = options || {}

  if (
    !normalizedState ||
    typeof loadWorldSnapshot !== 'function' ||
    typeof buildWorldBookCharacterSignature !== 'function' ||
    typeof buildWorldBookTeammates !== 'function' ||
    typeof buildFallbackCampfireCompanions !== 'function' ||
    typeof calcTargetCampfireCompanionCount !== 'function' ||
    typeof normalizeCampfireCompanionList !== 'function' ||
    typeof mergeGeneratedCompanions !== 'function' ||
    typeof applyCompanionRolesToTeammates !== 'function'
  ) {
    throw new Error('resolveCampfireCompanionsState invalid options')
  }

  const worldSnapshot = await loadWorldSnapshot()
  const worldCharacters = Array.isArray(worldSnapshot?.characters) ? worldSnapshot.characters : []
  const worldSignature = buildWorldBookCharacterSignature(worldCharacters)
  const syncedTeammates = buildWorldBookTeammates(worldCharacters, normalizedState.teammates)
  const fallbackList = buildFallbackCampfireCompanions(worldSnapshot, syncedTeammates)
  const targetCompanionCount = calcTargetCampfireCompanionCount(worldCharacters, fallbackList)
  const currentCompanions = normalizeCampfireCompanionList(normalizedState.campfireCompanions)
  const hasEnoughCompanions = currentCompanions.length >= targetCompanionCount
  const shouldRegenerate =
    forceRegenerate ||
    !hasEnoughCompanions ||
    normalizedState.worldBookId !== worldSnapshot.worldBookId ||
    normalizedState.worldBookCharacterSignature !== worldSignature

  let nextCompanions = fallbackList

  if (shouldRegenerate) {
    const hints = buildCampfireCharacterHints(worldCharacters, fallbackList, maxCampfireCompanions)
    const generatedCompanions = []
    for (
      let offset = 0;
      offset < hints.length && generatedCompanions.length < targetCompanionCount;
      offset += maxCampfireLlmCount
    ) {
      const remaining = targetCompanionCount - generatedCompanions.length
      const chunkSize = Math.min(maxCampfireLlmCount, remaining)
      const hintChunk = hints.slice(offset, offset + chunkSize)
      if (hintChunk.length === 0) break
      if (typeof requestCampfireCompanions !== 'function') break

      const llmResult = await requestCampfireCompanions({
        worldTitle: worldSnapshot.worldTitle,
        worldSummary: worldSnapshot.worldSummary,
        characterHints: hintChunk,
        companionCount: hintChunk.length,
      })

      if (!llmResult?.success || !Array.isArray(llmResult.companions) || llmResult.companions.length === 0) {
        break
      }
      generatedCompanions.push(...llmResult.companions)
    }

    if (generatedCompanions.length > 0) {
      nextCompanions = mergeGeneratedCompanions(generatedCompanions, worldCharacters, fallbackList)
    }
  } else {
    nextCompanions = mergeGeneratedCompanions(normalizedState.campfireCompanions, worldCharacters, fallbackList)
  }

  const teammatesWithCompanionRoles = applyCompanionRolesToTeammates(syncedTeammates, nextCompanions)
  return {
    worldSnapshot,
    worldCharacters,
    worldSignature,
    syncedTeammates,
    targetCompanionCount,
    nextCompanions,
    teammatesWithCompanionRoles,
    shouldRegenerate,
  }
}
