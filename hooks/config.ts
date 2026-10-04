// Reads the settings of the plugin into the times the lists work with.

import type { Timing } from './lists'

const SETTING_MAX_SECONDS = 120
// The default of plugin.json, for a value that is no number. The host checks the type before it loads the mod, so this is a second line
// of defence; the tests pin it and the default of plugin.json to the same value.
const SETTING_FALLBACK_SECONDS = 15

// Not `Number(raw)`: it turns an empty text, null and an empty list into 0 ("never show"), true into 1 and "5" into 5.
export const settingToMs = (raw: unknown): number => {
  const seconds = typeof raw === 'number' && Number.isFinite(raw) ? Math.min(SETTING_MAX_SECONDS, Math.max(0, raw)) : SETTING_FALLBACK_SECONDS
  return Math.round(seconds * 1000)
}

export const timingOf = (options: Record<string, unknown>): Timing => ({
  lingerMs: settingToMs(options.lingerSeconds),
  joinMs: settingToMs(options.joinSeconds),
})
