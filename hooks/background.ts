// The background work of the session: what the host says is running, as far as the line shows it.

import type { Item } from '../types'
import { TYPE_MAX, plain } from './cells'

// How many tasks the line names. The rest is a count.
export const SHOWN_MAX = 2

// The first two tasks of the `background_tasks` the host sends with a stop, and how many there are. Of each entry only the `type` and
// the `description` are read, never the command. A description that is missing or empty is no label (`null`), so that one that reads like
// the kind (`shell`) is still a label. A kind the host names without text counts as `task`. Entries that are no objects do not count.
// `undefined` when the field is missing or no array: the caller keeps what it has. An array is final, also an empty one, or one whose
// entries are all unusable.
export function itemsOf(tasks: unknown): { shown: Item[]; total: number } | undefined {
  if (!Array.isArray(tasks)) return undefined
  const shown: Item[] = []
  let total = 0
  for (const entry of tasks) {
    if (typeof entry !== 'object' || entry === null) continue
    total++
    if (shown.length >= SHOWN_MAX) continue
    const { type, description } = entry as { type?: unknown; description?: unknown }
    shown.push({ label: plain(description) || null, type: plain(type, TYPE_MAX) || 'task' })
  }
  return { shown, total }
}
