export type Status = 'pending' | 'active' | 'done'

// `seq`: the number of the `work_state_write` call that wrote the task last (see `issue` in lists.ts); other sources leave it out.
export type Task = { id: string; subject: string; status: Status; seq?: number }

// One list per todo source: the built-in todo tools share one list, work_state_write has one per `list`.
export type TaskList = { name: string; tasks: Task[]; doneAt: number | null; isHidden: boolean }

// A background task the line names: what Claude called it (null when it said nothing) and its kind.
export type Item = { label: string | null; type: string }

declare module 'claude-code' {
  interface PluginState {
    'task-line': { lists: TaskList[]; questions: number; failure: string | null; isOff: boolean; background: { shown: Item[]; total: number } }
  }
}
