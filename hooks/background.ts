// The background work of the session as one line: how many tasks of each kind the host says are running.

import type { Group } from '../types'
import { TYPE_MAX, plain } from './cells'

// The groups of the `background_tasks` the host sends with a stop, in the order a kind is named first. Only the `type` of each entry
// is read; what the task is called or runs stays unread. A kind the host names without text counts as `task`.
// `undefined` when the field is missing or no array: the caller keeps what it has. An array is final, also an empty one, or one whose
// entries are all unusable. A Map counts, so that a kind named `constructor` or `__proto__` is a kind like any other.
export function groupsOf(tasks: unknown): Group[] | undefined {
  if (!Array.isArray(tasks)) return undefined
  const counts = new Map<string, number>()
  for (const entry of tasks) {
    if (typeof entry !== 'object' || entry === null) continue
    const type = plain((entry as { type?: unknown }).type, TYPE_MAX) || 'task'
    counts.set(type, (counts.get(type) ?? 0) + 1)
  }
  return [...counts].map(([type, count]) => ({ type, count }))
}

// `2 shell · 1 monitor`. No plural: a kind the host adds later has no safe one.
export const textOf = (groups: Group[]) => groups.map(g => `${g.count} ${g.type}`).join(' · ')
