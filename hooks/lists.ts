// The lists the line shows: statuses, and how a change is put into the list of a name.

import type { Status, Task, TaskList } from '../types'

// The built-in todo tools share one list; work_state_write has one per `list`.
export const BUILTIN = 'Tasks'
export const LINGER_MS = 20_000
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

// The touched list moves to the end: the newest list is the one drawn last. A finished list that has faded (hidden, or finished
// `LINGER_MS` ago by the time `now`) is over: it is dropped, and a task that comes to its name starts a new list instead of joining
// the tasks of everything the name ever held. Of the rest only the newest lists are kept.
export function put(all: TaskList[], name: string, change: (tasks: Task[]) => Task[], now = Number.NaN): TaskList[] {
  const faded = (l: TaskList) => l.doneAt !== null && (l.isHidden || now - l.doneAt >= LINGER_MS)
  const held = all.find(l => l.name === name)
  const tasks = change(held && !faded(held) ? held.tasks : []).slice(0, MAX_TASKS)
  const rest = all.filter(l => l.name !== name && !faded(l))
  return tasks.length === 0 ? rest : [...rest, { name, tasks, doneAt: null, isHidden: false }].slice(-MAX_KEPT_LISTS)
}
