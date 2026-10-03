// What one list shows, and how wide each part of a row is.

import type { TaskList } from '../types'
import { width } from './cells'
import { BUILTIN } from './lists'
import { failureLabel } from './shell'

// The width assumed when the host gives none.
export const DEFAULT_COLUMNS = 100
export const PERCENT_WIDTH = 4
// The bar takes a share of the width, within these limits (terminal columns).
const BAR_SHARE = 0.4
const BAR_MIN = 10
const BAR_MAX = 60
const LABEL_SHARE = 0.35
const LABEL_MIN = 8
const LABEL_FLOOR = 4
const WAITING_TEXT = 'needs you'
const UNTITLED = 'Task'

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

// How much of the bar is filled and which percent is shown. Neither reaches the end before the list is finished, and neither is
// empty once one task is done, whatever rounding says.
export function progressOf(done: number, total: number, bar: number) {
  if (total <= 0 || done <= 0) return { filled: 0, percent: 0 }
  if (done >= total) return { filled: bar, percent: 100 }
  const share = done / total
  return { filled: clamp(Math.round(share * bar), 1, bar - 1), percent: clamp(Math.round(share * 100), 1, 99) }
}

export type Row = { name: string; glyph: string; color: string; label: string; done: number; total: number; note: string | null }

// What one list shows. A finished list is done; an unfinished one waits when Claude asks, which beats a failed check.
export function rowOf(list: TaskList, asking: boolean, failed: string | null): Row {
  const total = list.tasks.length
  const done = list.tasks.filter(t => t.status === 'done').length
  const active = list.tasks.find(t => t.status === 'active')
  const state = done === total ? 'done' : asking ? 'asking' : failed ? 'failed' : active ? 'working' : 'waiting'
  const subject = state === 'done' ? 'Done' : (active ?? list.tasks.find(t => t.status === 'pending'))?.subject.trim() || UNTITLED
  const color = { done: 'success', asking: 'warning', failed: 'error', working: 'claude', waiting: 'inactive' }[state]
  const glyph = { done: '✓', asking: '?', failed: '✕', working: '●', waiting: '○' }[state]
  const note = state === 'asking' ? WAITING_TEXT : state === 'failed' ? `${failureLabel(failed!)} failed` : null
  return { name: list.name, glyph, color, label: `${list.name === BUILTIN ? '' : `${list.name}: `}${subject}`, done, total, note }
}

// The label slot fits the longest label, the bar takes what is left up to its share of the width. When the row would not fit, the
// label gives way first, down to a floor, then the note is left out (the glyph and the color say it as well), and last the bar
// stays at its minimum: a row fits at every width from the floor of label and bar, with or without its note.
export function layout(rows: Row[], columns_: number, hasButton = false) {
  const columns = Number.isFinite(columns_) ? columns_ : DEFAULT_COLUMNS
  const count = Math.max(...rows.map(r => width(`${r.done}/${r.total}`)))
  // The dismiss button and the gap before it take two more cells.
  const fixed = 2 + 1 + count + PERCENT_WIDTH + 4 + (hasButton ? 2 : 0)
  const noteWidth = Math.max(0, ...rows.map(r => (r.note ? width(r.note) + 1 : 0)))
  const showNote = noteWidth === 0 || columns >= fixed + noteWidth + LABEL_FLOOR + BAR_MIN
  const room = columns - fixed - (showNote ? noteWidth : 0)
  const wanted = clamp(Math.max(...rows.map(r => width(r.label))), LABEL_MIN, Math.max(LABEL_MIN, Math.floor(columns * LABEL_SHARE)))
  const label = clamp(wanted, LABEL_FLOOR, Math.max(LABEL_FLOOR, room - BAR_MIN))
  const bar = clamp(Math.min(Math.floor(columns * BAR_SHARE), room - label), BAR_MIN, BAR_MAX)
  return { label, bar, showNote }
}
