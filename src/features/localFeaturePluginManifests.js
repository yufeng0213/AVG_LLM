import { validateFeaturePluginManifest } from '../../packages/plugin-sdk/src/index.js'
import cardCollectionManifest from '../../plugins/feature-card-collection/plugin.json'
import narratorManagerManifest from '../../plugins/feature-narrator-manager/plugin.json'
import pluginManagerManifest from '../../plugins/feature-plugin-manager/plugin.json'
import settingsManifest from '../../plugins/feature-settings/plugin.json'
import worldbookManifest from '../../plugins/feature-worldbook/plugin.json'
import adventureGameManifest from '../../plugins/feature-adventure-game/plugin.json'
import faceToFaceManifest from '../../plugins/feature-face-to-face/plugin.json'
import loadSaveManifest from '../../plugins/feature-load-save/plugin.json'
import newGameManifest from '../../plugins/feature-new-game/plugin.json'
import dormitoryManifest from '../../plugins/feature-dormitory/plugin.json'
import gameManifest from '../../plugins/feature-game/plugin.json'
import trpgManifest from '../../plugins/feature-trpg/plugin.json'
import phoneManifest from '../../plugins/feature-phone/plugin.json'
import mailManifest from '../../plugins/feature-mail/plugin.json'
import checkinManifest from '../../plugins/feature-checkin/plugin.json'
import taskManifest from '../../plugins/feature-task/plugin.json'
import shopManifest from '../../plugins/feature-shop/plugin.json'
import backStorageManifest from '../../plugins/feature-back-storage/plugin.json'
import testManifest from '../../plugins/feature-test/plugin.json'
import roseParticleManifest from '../../plugins/feature-rose-particle/plugin.json'
import bookParticleManifest from '../../plugins/feature-book-particle/plugin.json'
import musicPlayerManifest from '../../plugins/feature-music-player/plugin.json'

const LOCAL_FEATURE_PLUGIN_MANIFESTS = [
  loadSaveManifest,
  newGameManifest,
  faceToFaceManifest,
  dormitoryManifest,
  gameManifest,
  trpgManifest,
  cardCollectionManifest,
  narratorManagerManifest,
  pluginManagerManifest,
  settingsManifest,
  worldbookManifest,
  adventureGameManifest,
  phoneManifest,
  mailManifest,
  checkinManifest,
  taskManifest,
  shopManifest,
  backStorageManifest,
  testManifest,
  roseParticleManifest,
  bookParticleManifest,
  musicPlayerManifest,
]

export const getLocalFeaturePluginManifests = () => {
  const list = []
  LOCAL_FEATURE_PLUGIN_MANIFESTS.forEach((manifest, index) => {
    const result = validateFeaturePluginManifest(manifest)
    if (!result.ok) {
      console.error('[feature-plugin] invalid local manifest', {
        index,
        id: manifest?.id,
        errors: result.errors,
      })
      return
    }
    if (result.warnings.length > 0) {
      console.warn('[feature-plugin] local manifest warnings', {
        index,
        id: manifest?.id,
        warnings: result.warnings,
      })
    }
    list.push({
      ...manifest,
      ...result.normalized,
    })
  })
  return list
}
