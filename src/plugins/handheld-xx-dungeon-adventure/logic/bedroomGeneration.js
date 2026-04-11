export const generateBedroomFurnitureDraftsWithFallback = async (options = {}) => {
  const {
    loadWorldSnapshot = null,
    requestBedroomFurnitureItems = null,
    floor = 1,
    itemCount = 4,
    styleHint = '',
    makeId = null,
    clampInt = null,
    buildLocalDrafts = null,
    logger = console,
  } = options || {}

  let drafts = []
  let usedLLM = false

  try {
    if (typeof requestBedroomFurnitureItems === 'function') {
      const worldSnapshot = typeof loadWorldSnapshot === 'function'
        ? await loadWorldSnapshot()
        : { worldTitle: '', worldSummary: '' }
      const llmResult = await requestBedroomFurnitureItems({
        worldTitle: worldSnapshot.worldTitle,
        worldSummary: worldSnapshot.worldSummary,
        floor,
        itemCount,
        styleHint,
      })
      if (llmResult?.success && Array.isArray(llmResult.items) && llmResult.items.length > 0) {
        drafts = llmResult.items.map((item, index) => ({
          ...item,
          id: typeof makeId === 'function' ? makeId('br') : `br-${Date.now()}-${index}`,
          z: item?.kind === 'floor'
            ? 0
            : (typeof clampInt === 'function' ? clampInt(item?.z, 0, 200, 14 + index * 2) : (14 + index * 2)),
        }))
        usedLLM = true
      } else if (typeof buildLocalDrafts === 'function') {
        drafts = buildLocalDrafts()
      }
    } else if (typeof buildLocalDrafts === 'function') {
      drafts = buildLocalDrafts()
    }
  } catch (e) {
    if (logger && typeof logger.warn === 'function') {
      logger.warn('[xx-dungeon] bedroom furniture llm generation failed, fallback local:', e)
    }
    drafts = typeof buildLocalDrafts === 'function' ? buildLocalDrafts() : []
  }

  return {
    drafts: Array.isArray(drafts) ? drafts : [],
    usedLLM,
  }
}
