// The background work of the session: what the host says is running, as far as the line shows it.

import type { Item } from '../types'
import { TYPE_MAX, fit, plain, width } from './cells'

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

// A description in fewer cells than this is no help, and an ellipsis alone says nothing: it goes whole.
export const LABEL_MIN = 4

// The description in `room` cells: whole when it fits, cut with an ellipsis (not padded) when it does not, `null` when the room is
// under LABEL_MIN.
export const labelIn = (label: string, room: number): string | null => (room < LABEL_MIN ? null : width(label) <= room ? label : fit(label, room).trimEnd())

// How a row of the band is drawn in `columns` columns (the room is the band less its padding). The description gives way first; the kind
// is cut only when it does not fit even alone, to one cell at least; `+N` (`more`) is never cut. `label` is `null` when there is no
// description to draw, `kindInPlace` when the kind stands where the description would (the task had none).
export function rowShapeOf(item: Item, more: number, columns: number): { label: string | null; type: string; kindInPlace: boolean } {
  const room = columns - 2
  // glyph, gap, kind, and the gap and `+N` of the last row
  const tail = more > 0 ? 1 + width(`+${more}`) : 0
  const label = item.label === null ? null : labelIn(item.label, room - (2 + width(item.type) + tail) - 1)
  if (label !== null) return { label, type: item.type, kindInPlace: false }
  const kindRoom = room - 2 - tail
  const type = width(item.type) > kindRoom ? fit(item.type, Math.max(1, kindRoom)).trimEnd() : item.type
  return { label: null, type, kindInPlace: item.label === null }
}
