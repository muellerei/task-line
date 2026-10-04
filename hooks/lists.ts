// The lists the line shows: statuses, and how a change is put into the list of a name.

import type { Status, Task, TaskList } from '../types'

// The built-in todo tools share one list; work_state_write has one per `list`.
export const BUILTIN = 'Tasks'
// A list holds this many tasks, the state this many lists: the state is no place for an endless list.
const MAX_TASKS = 500
const MAX_KEPT_LISTS = 20

// A Map, not an object: a status such as "constructor" must not find a property of Object.
const STATUS_OF = new Map<string, Status>([
  ['pending', 'pending'],
  ['todo', 'pending'],
  ['in_progress', 'active'],
  ['doing', 'active'],
  ['completed', 'done'],
  ['done', 'done'],
  ['dropped', 'done'],
])

export const statusOf = (raw: unknown, fallback: Status): Status => STATUS_OF.get(String(raw)) ?? fallback

// How long a finished list is shown, and how long after its end a new task of its name still joins it (the settings, in milliseconds).
export type Timing = { lingerMs: number; joinMs: number }

// The touched list moves to the end: the newest list is the one drawn last. A new task joins the finished list of its name only while
// that list is shown and finished no longer ago than the join time; otherwise the list is over: it is dropped, and the task starts a new
// list instead of joining the tasks of everything the name ever held. That holds by the time, not by `isHidden` alone, which only a
// timer or the button sets (a reload drops timers). Another finished list is dropped when it is hidden or no longer shown. Of the
// rest only the newest lists are kept.
export function put(all: TaskList[], name: string, change: (tasks: Task[]) => Task[], timing: Timing, now = Number.NaN): TaskList[] {
  const faded = (l: TaskList, ms: number) => l.doneAt !== null && (l.isHidden || now - l.doneAt >= ms)
  // A task joins only a list that is still shown, so the join time never reaches past the time the list is shown.
  const joinMs = Math.min(timing.joinMs, timing.lingerMs)
  const held = all.find(l => l.name === name)
  const tasks = change(held && !faded(held, joinMs) ? held.tasks : []).slice(0, MAX_TASKS)
  const rest = all.filter(l => l.name !== name && !faded(l, timing.lingerMs))
  return tasks.length === 0 ? rest : [...rest, { name, tasks, doneAt: null, isHidden: false }].slice(-MAX_KEPT_LISTS)
}
