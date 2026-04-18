import adventureGameEntry from '../../plugins/feature-adventure-game/src/entry.js'
import cardCollectionEntry from '../../plugins/feature-card-collection/src/entry.js'
import dormitoryEntry from '../../plugins/feature-dormitory/src/entry.js'
import faceToFaceEntry from '../../plugins/feature-face-to-face/src/entry.js'
import gameEntry from '../../plugins/feature-game/src/entry.js'
import loadSaveEntry from '../../plugins/feature-load-save/src/entry.js'
import narratorManagerEntry from '../../plugins/feature-narrator-manager/src/entry.js'
import newGameEntry from '../../plugins/feature-new-game/src/entry.js'
import pluginManagerEntry from '../../plugins/feature-plugin-manager/src/entry.js'
import phoneEntry from '../../plugins/feature-phone/src/entry.js'
import mailEntry from '../../plugins/feature-mail/src/entry.js'
import taskEntry from '../../plugins/feature-task/src/entry.js'
import shopEntry from '../../plugins/feature-shop/src/entry.js'
import backStorageEntry from '../../plugins/feature-back-storage/src/entry.js'
import testEntry from '../../plugins/feature-test/src/entry.js'
import roseParticleEntry from '../../plugins/feature-rose-particle/src/entry.js'
import bookParticleEntry from '../../plugins/feature-book-particle/src/entry.js'
import settingsEntry from '../../plugins/feature-settings/src/entry.js'
import worldbookEntry from '../../plugins/feature-worldbook/src/entry.js'
import trpgEntry from '../../plugins/feature-trpg/src/entry.js'
import musicPlayerEntry from '../../plugins/feature-music-player/src/entry.js'

const LOCAL_FEATURE_PLUGIN_ENTRIES = [
  backStorageEntry,
  loadSaveEntry,
  newGameEntry,
  faceToFaceEntry,
  dormitoryEntry,
  gameEntry,
  cardCollectionEntry,
  narratorManagerEntry,
  pluginManagerEntry,
  settingsEntry,
  worldbookEntry,
  adventureGameEntry,
  trpgEntry,
  phoneEntry,
  mailEntry,
  taskEntry,
  shopEntry,
  testEntry,
  roseParticleEntry,
  bookParticleEntry,
  musicPlayerEntry,
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
