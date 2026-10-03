export type Status = 'pending' | 'active' | 'done'

export type Task = { id: string; subject: string; status: Status }

// One list per todo source: the built-in todo tools share one list, work_state_write has one per `list`.
export type TaskList = { name: string; tasks: Task[]; doneAt: number | null; isHidden: boolean }

declare module 'claude-code' {
  interface PluginState {
    'task-line': { lists: TaskList[]; questions: number; failure: string | null; isOff: boolean }
  }
}
