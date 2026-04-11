import adventureGameEntry from '../../plugins/feature-adventure-game/src/entry.js'
import cardCollectionEntry from '../../plugins/feature-card-collection/src/entry.js'
import dormitoryEntry from '../../plugins/feature-dormitory/src/entry.js'
import faceToFaceEntry from '../../plugins/feature-face-to-face/src/entry.js'
import loadSaveEntry from '../../plugins/feature-load-save/src/entry.js'
import narratorManagerEntry from '../../plugins/feature-narrator-manager/src/entry.js'
import newGameEntry from '../../plugins/feature-new-game/src/entry.js'
import pluginManagerEntry from '../../plugins/feature-plugin-manager/src/entry.js'
import settingsEntry from '../../plugins/feature-settings/src/entry.js'
import worldbookEntry from '../../plugins/feature-worldbook/src/entry.js'

const LOCAL_FEATURE_PLUGIN_ENTRIES = [
  loadSaveEntry,
  newGameEntry,
  faceToFaceEntry,
  dormitoryEntry,
  cardCollectionEntry,
  narratorManagerEntry,
  pluginManagerEntry,
  settingsEntry,
  worldbookEntry,
  adventureGameEntry,
]

export const getLocalFeaturePluginEntries = () => {
  const entries = []
  const seen = new Set()

  LOCAL_FEATURE_PLUGIN_ENTRIES.forEach((entry, index) => {
    const id = String(entry?.id || '').trim()
    if (!id) {
      console.error('[feature-plugin] invalid local entry: missing id', { index })
      return
    }
    if (seen.has(id)) {
      console.error('[feature-plugin] duplicated local entry id', { index, id })
      return
    }
    seen.add(id)
    entries.push(entry)
  })

  return entries
}
