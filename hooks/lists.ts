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

// The task at `index` with `status`; an index outside the list changes nothing.
export const withStatus = (tasks: Task[], index: number, status: Status): Task[] => tasks.map((t, i) => (i === index ? { ...t, status } : t))

// How long a finished list is shown, and how long after its end a new task of its name still joins it (the settings, in milliseconds).
export type Timing = { lingerMs: number; joinMs: number }

// The touched list moves to the end: the newest list is the one drawn last. A new task joins the finished list of its name only while
// that list is shown and finished no longer ago than the join time; otherwise the list is over: it is dropped, and the task starts a new
// list instead of joining the tasks of everything the name ever held. That holds by the time, not by `isHidden` alone, which only a
// timer or the button sets (a reload drops timers). Another finished list is dropped when it is hidden or no longer shown. Of the
// rest only the newest lists are kept. A change that answers `null` leaves `all` itself as it was: nothing is touched, moved or reopened.
export function put(all: TaskList[], name: string, change: (tasks: Task[]) => Task[] | null, timing: Timing, now = Number.NaN): TaskList[] {
  const faded = (l: TaskList, ms: number) => l.doneAt !== null && (l.isHidden || now - l.doneAt >= ms)
  // A task joins only a list that is still shown, so the join time never reaches past the time the list is shown.
  const joinMs = Math.min(timing.joinMs, timing.lingerMs)
  const held = all.find(l => l.name === name)
  const changed = change(held && !faded(held, joinMs) ? held.tasks : [])
  if (changed === null) return all
  const tasks = changed.slice(0, MAX_TASKS)
  const rest = all.filter(l => l.name !== name && !faded(l, timing.lingerMs))
  return tasks.length === 0 ? rest : [...rest, { name, tasks, doneAt: null, isHidden: false }].slice(-MAX_KEPT_LISTS)
}

// The calls of one turn reach the tools in the order Claude issues them, but they answer in any order, and the line hears an answer when
// it comes. Each call takes a number when it starts, and a change counts by that number: a write to a task is let go when a call issued
// later already wrote the task, a write to a list is let go when a call issued later already closed it, and a close takes away only the
// tasks written by calls issued before it. So the list ends as if the calls had answered in the order they were issued.
// The number starts from the clock, not from 0: the counter lives in the module and starts again when the mod is reloaded, while the `seq`
// of the tasks stays in the state. A counter from 0 would let a call after the reload lose against every task written before it.
let issued = 0
export const issue = () => (issued = Math.max(issued + 1, Date.now()))

// The newest close of each list name, to let go a write that was issued before it and answers after it (the list itself is gone by then).
const closedAt = new Map<string, number>()

// The change a write to one task makes: the task is added or replaced by what `make` builds from the old one.
export const writeTask =
  (list: string, id: string, make: (old: Task | undefined) => Task, seq: number) =>
  (tasks: Task[]): Task[] | null => {
    const old = tasks.find(t => t.id === id)
    if (seq < (closedAt.get(list) ?? 0) || (old?.seq !== undefined && old.seq > seq)) return null
    const item = { ...make(old), seq }
    return old ? tasks.map(t => (t.id === id ? item : t)) : [...tasks, item]
  }

// The change a close makes: the tasks written by calls issued before it go, a task written by a later call (it answered first) stays.
export const closeTasks =
  (list: string, seq: number) =>
  (tasks: Task[]): Task[] => {
    const before = closedAt.get(list) ?? 0
    closedAt.delete(list)
    closedAt.set(list, Math.max(seq, before))
    // The oldest names go first, so the memory of closed lists is no place for an endless list either.
    if (closedAt.size > MAX_KEPT_LISTS) closedAt.delete(closedAt.keys().next().value as string)
    return tasks.filter(t => (t.seq ?? 0) > seq)
  }
