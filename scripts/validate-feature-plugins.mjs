import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateFeaturePluginManifest } from '../packages/plugin-sdk/src/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT_DIR = path.resolve(__dirname, '..')
const PLUGINS_DIR = path.join(ROOT_DIR, 'plugins')

const readDirSafe = async (target) => {
  try {
    return await fs.readdir(target, { withFileTypes: true })
  } catch {
    return []
  }
}

const loadJsonSafe = async (filePath) => {
  try {
    const raw = await fs.readFile(filePath, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

const run = async () => {
  const dirs = (await readDirSafe(PLUGINS_DIR))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)

  if (dirs.length === 0) {
    console.log('[plugins:validate] no plugin directories found')
    return 0
  }

  let hasError = false
  let checked = 0

  for (const dirName of dirs) {
    const manifestPath = path.join(PLUGINS_DIR, dirName, 'plugin.json')
    const manifest = await loadJsonSafe(manifestPath)
    if (!manifest) {
      continue
    }

    checked += 1
    const result = validateFeaturePluginManifest(manifest)
    const pluginId = manifest?.id || dirName

    if (!result.ok) {
      hasError = true
      console.error(`\n[plugins:validate][ERROR] ${pluginId}`)
      result.errors.forEach((item) => console.error(`  - ${item}`))
    } else {
      console.log(`[plugins:validate][OK] ${pluginId}`)
    }

    if (result.warnings.length > 0) {
      console.warn(`[plugins:validate][WARN] ${pluginId}`)
      result.warnings.forEach((item) => console.warn(`  - ${item}`))
    }
  }

  if (checked === 0) {
    console.log('[plugins:validate] no plugin.json found under plugins/*')
    return 0
  }

  if (hasError) {
    console.error(`\n[plugins:validate] failed. checked=${checked}`)
    return 1
  }

  console.log(`\n[plugins:validate] success. checked=${checked}`)
  return 0
}

run().then((code) => {
  process.exit(code)
})

