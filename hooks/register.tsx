import { atom, read, update } from 'claude-code'
import type { EngineInterface as Engine, Register } from 'claude-code'

import type { Task, TaskList } from '../types'
import { LIST_MAX, plain, fit } from './cells'
import { BUILTIN, LINGER_MS, put, statusOf } from './lists'
import { DEFAULT_COLUMNS, PERCENT_WIDTH, layout, progressOf, rowOf } from './layout'
import type { Row } from './layout'
import { checksOf, failureKey, hasPassed, ranAndFailed } from './shell'

const lists = atom({ plugin: 'task-line', key: 'lists' } as const, [] as TaskList[])
// How many questions or plans wait for the person's answer right now.
const questions = atom({ plugin: 'task-line', key: 'questions' } as const, 0)
// Switched off with /task-line: no line is drawn, the lists keep being filled.
const isOff = atom({ plugin: 'task-line', key: 'isOff' } as const, false)
// The check (`npm test`, `pytest`, ...) whose last run failed, until it passes or the statuses of a list change (a task moves on, is added or removed).
const failure = atom({ plugin: 'task-line', key: 'failure' } as const, null as string | null)

// The tool of claude-mem's to-do list, whatever the plugin is called in the person's setup: told by how its name ends.
const WORK_STATE = /^mcp__.+__work_state_write$/
const NBSP = '\u00a0'
// The theme color of the bar's empty part: a quiet area.
const TRACK_COLOR = 'userMessageBackground'
const MAX_LISTS = 2

// Only the main conversation counts, and only a call the tool accepted.
const counts = (e: { agentId?: string }, r: { deny?: unknown; isError?: boolean }) => e.agentId === undefined && r.deny === undefined && !r.isError

// A note for the debug log. A log that fails must not fail the work it reports on, so the failure of the log itself is let go.
function debugLog($: Engine, text: string) {
  try {
    $.ui.log(`task-line: ${text}`, { to: 'debug' })
  } catch {
    // nothing left to tell
  }
}

// The line is a display: whatever goes wrong in its own work is logged and never reaches the tool call it watches.
async function safely<T>($: Engine, what: string, work: () => Promise<T>): Promise<T | null> {
  try {
    return await work()
  } catch (error) {
    debugLog($, `${what} failed: ${String(error)}`)
    return null
  }
}

// One wait per list and stamp, however often the line is drawn meanwhile.
const scheduled = new Set<string>()

// Hides the list after the wait, unless it was touched again meanwhile (a new stamp, or none).
function hideLater($: Engine, name: string, stamp: number, ms: number) {
  const key = `${name}@${stamp}`
  if (scheduled.has(key)) return
  // The key is set before the timer is asked for, since a timer may run at once, and given back when no timer came: a key that stays
  // without a timer would keep the list from ever being hidden.
  scheduled.add(key)
  try {
    $.clock.after(ms, () => {
      scheduled.delete(key)
      void safely($, 'hide', () => update($, lists, all => all.map(l => (l.name === name && l.doneAt === stamp ? { ...l, isHidden: true } : l))))
    })
  } catch (error) {
    scheduled.delete(key)
    debugLog($, `hide failed: ${String(error)}`)
  }
}

// Applies the change, and once every task is done hides the list after a short while.
async function touch($: Engine, name: string, change: (tasks: Task[]) => Task[]) {
  const statuses = (list?: TaskList) => list?.tasks.map(t => t.status).join(',') ?? ''
  const now = await $.clock.now()
  const before = statuses((await read($, lists)).find(l => l.name === name))
  await update($, lists, all => put(all, name, change, now))
  const list = (await read($, lists)).find(l => l.name === name)
  // A task moved on: the failure belonged to the step before.
  if (statuses(list) !== before) await update($, failure, () => null)
  if (!list || list.tasks.some(t => t.status !== 'done')) return
  const stamp = await $.clock.now()
  await update($, lists, all => all.map(l => (l.name === name ? { ...l, doneAt: stamp } : l)))
  hideLater($, name, stamp, LINGER_MS)
}

// What the mod reads of inputs and results the engine's own types do not name (tools of other plugins, the viewport of a dialog).
type WorkStateInput = { list?: unknown; fields?: Record<string, unknown> }
type CreatedResult = { result?: { task?: { id?: unknown } } }
type UpdatedResult = { result?: { success?: unknown } }
type BashResult = { result?: { backgroundTaskId?: unknown } }
type RenderInput = Parameters<Engine['ui']['resolve']>[0] & { surface: string; viewport?: { columns?: number; isFullscreen?: boolean } }

// The rows of the line, or null when there is nothing to show.
async function lineOf($: Engine, e: RenderInput, columns: number, isPlain = false) {
  if (await read($, isOff)) return null
  // A finished list is judged by its age, not by a timer alone: a reload of this module drops timers, the state stays.
  const now = await $.clock.now()
  const age = (l: TaskList) => (typeof l.doneAt === 'number' && Number.isFinite(l.doneAt) ? now - l.doneAt : 0)
  // Above the question dialog only the newest list is drawn. With two rows Claude Code refuses the tree and draws no line at all (its
  // debug log: "more than 12 rows around the dialog"); one row passes. Found by hand, the limit is not documented.
  const shown = (await read($, lists)).filter(l => !l.isHidden && l.tasks.length > 0 && age(l) < LINGER_MS).slice(isPlain ? -1 : -MAX_LISTS)
  if (shown.length === 0) return null
  // A render may not write state: the hide runs just after, once the wait is over.
  for (const l of shown) if (l.doneAt !== null && Number.isFinite(l.doneAt)) hideLater($, l.name, l.doneAt, LINGER_MS - age(l))

  const asking = (await read($, questions)) > 0
  const failed = await read($, failure)
  // Only the newest list is the one Claude is working on.
  const rows = shown.map((l, i) => rowOf(l, asking && i === shown.length - 1, i === shown.length - 1 ? failed : null))
  // A button needs a click: the desktop app and a fullscreen terminal have one, a terminal band does not.
  const canClick = e.surface !== 'terminal' || e.viewport?.isFullscreen === true
  const { label: labelWidth, bar: barWidth, showNote } = layout(rows, columns, canClick && !isPlain)
  const visible = showNote ? rows : rows.map(r => ({ ...r, note: null }))
  const { Box, Button, Text } = $.ui.resolve(e)
  const dismiss = (name: string) => () => safely($, 'dismiss', () => update($, lists, all => all.map(l => (l.name === name ? { ...l, isHidden: true } : l))))

  // The bar. A terminal draws characters. The desktop app draws a box-drawing character wider than a cell, so a bar of them wrapped into
  // a second line there (found by hand; `overflow` and `height` do not clip it): it draws two boxes with a width in cells and a background.
  const isDesktop = e.surface === 'desktop'
  const barOf = (r: Row, filled: number) =>
    !isDesktop ? (
      <Box key="bar">
        <Text color={r.color}>{'━'.repeat(filled)}</Text>
        <Text dimColor>{'─'.repeat(barWidth - filled)}</Text>
      </Box>
    ) : (
      <Box key="bar" width={barWidth} flexShrink={0}>
        <Box width={filled} flexShrink={0} backgroundColor={r.color}>
          <Text>{NBSP.repeat(filled)}</Text>
        </Box>
        <Box width={barWidth - filled} flexShrink={0} backgroundColor={TRACK_COLOR}>
          <Text>{NBSP.repeat(barWidth - filled)}</Text>
        </Box>
      </Box>
    )

  // Around the question dialog the engine refuses layout props such as width: spaces do the aligning there.
  if (isPlain) {
    return (
      <Box flexDirection="column">
        {visible.map(r => {
          const { filled, percent } = progressOf(r.done, r.total, barWidth)
          return (
            <Box key={`row:${r.name}`} flexDirection="row">
              <Text color={r.color}>{` ${r.glyph} `}</Text>
              <Text>{`${fit(r.label, labelWidth)} `}</Text>
              {barOf(r, filled)}
              <Text>{` ${r.done}/${r.total}`}</Text>
              <Text dimColor>{` ${`${percent}%`.padStart(PERCENT_WIDTH)}`}</Text>
              {r.note && (
                <Text color={r.color} bold>
                  {` ${r.note}`}
                </Text>
              )}
            </Box>
          )
        })}
      </Box>
    )
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      {visible.map(r => {
        const { filled, percent } = progressOf(r.done, r.total, barWidth)
        return (
          <Box key={`row:${r.name}`} flexDirection="row" gap={1}>
            <Text color={r.color}>{r.glyph}</Text>
            <Box key="label" width={labelWidth} flexShrink={0}>
              <Text wrap="truncate">{r.label}</Text>
            </Box>
            {barOf(r, filled)}
            <Text>{`${r.done}/${r.total}`}</Text>
            <Text dimColor>{`${percent}%`.padStart(PERCENT_WIDTH)}</Text>
            {r.note && (
              <Text color={r.color} bold>
                {r.note}
              </Text>
            )}
            {canClick && <Button key={`dismiss:${r.name}`} label="×" plain dimColor onPress={dismiss(r.name)} />}
          </Box>
        )
      })}
    </Box>
  )
}

// Runs a question or a plan approval with the count of waiting questions raised. A subagent's question goes to Claude, not to the
// person, and does not count.
async function whileAsked<T>($: Engine, tool: string, agentId: string | undefined, run: () => Promise<T>): Promise<T> {
  if (agentId !== undefined) return run()
  await safely($, tool, () => update($, questions, n => n + 1))
  try {
    return await run()
  } finally {
    // Never below zero, should the count have been reset while the question was open. The test kit has no state to reset, so this
    // guard is the one line that no test reaches.
    await safely($, tool, () => update($, questions, n => Math.max(0, n - 1)))
  }
}

export const register: Register = on => {
  on('tool.call', { tool: 'TodoWrite' }, async ($, e, next) => {
    const r = await next(e)
    if (!counts(e, r) || !Array.isArray(e.todos)) return r
    const todos = e.todos
    await safely($, 'TodoWrite', () =>
      touch($, BUILTIN, () => todos.map((todo, i) => ({ id: `todo${i}`, subject: plain(todo?.content), status: statusOf(todo?.status, 'pending') }))),
    )
    return r
  })

  on('tool.call', { tool: 'TaskCreate' }, async ($, e, next) => {
    const r = await next(e)
    if (!counts(e, r)) return r
    // The id the tool answers with is the one TaskUpdate names; without one the item still gets an id of its own.
    const made = (r as CreatedResult).result?.task?.id ?? e.tool_use_id
    await safely($, 'TaskCreate', () =>
      touch($, BUILTIN, tasks => [...tasks, { id: String(made ?? `created${tasks.length}`), subject: plain(e.subject), status: 'pending' }]),
    )
    return r
  })

  on('tool.call', { tool: 'TaskUpdate' }, async ($, e, next) => {
    const r = await next(e)
    // The tool answers `success: false` (with an `error`) for an update it did not make: then nothing changed.
    if (!counts(e, r) || (r as UpdatedResult).result?.success === false) return r
    const id = String(e.taskId)
    await safely($, 'TaskUpdate', () =>
      touch($, BUILTIN, tasks =>
        e.status === 'deleted'
          ? tasks.filter(t => t.id !== id)
          : tasks.map(t =>
              t.id === id ? { ...t, subject: (e.subject === undefined ? '' : plain(e.subject)) || t.subject, status: statusOf(e.status, t.status) } : t,
            ),
      ),
    )
    return r
  })

  // The to-do list claude-mem keeps for a project: fields {task, status}; a call without `task` is list state, not an item.
  on('tool.call', { tool: WORK_STATE }, async ($, e, next) => {
    const r = await next(e)
    const { fields, list } = e as unknown as WorkStateInput
    const name = typeof list === 'string' ? plain(list, LIST_MAX) : ''
    const task = typeof fields?.task === 'string' ? plain(fields.task) : ''
    if (!counts(e, r) || !name) return r
    // The state of the list itself: claude-mem closes a list when it is written with the status done and no task. The line lets the
    // list go, so that the next task of that name starts a new one and does not grow a list of everything the name ever held.
    if (fields?.task === undefined && fields?.status === 'done') {
      await safely($, 'work_state_write', () => touch($, name, () => []))
      return r
    }
    if (!task) return r
    await safely($, 'work_state_write', () =>
      touch($, name, tasks => {
        const old = tasks.find(t => t.id === task)
        const status = statusOf(fields?.status, old?.status ?? 'pending')
        const item: Task = { id: task, subject: task, status }
        return old ? tasks.map(t => (t.id === task ? item : t)) : [...tasks, item]
      }),
    )
    return r
  })

  // A check that fails turns the line red; the same check passing again turns it back. Other commands never count. A result with the
  // error flag is a failure only when the command ran: its text then starts with `Exit code N`. A call that a hook blocked or the
  // person refused also comes with the error flag (measured), but with another text. An interrupt or a timeout comes with
  // `Exit code 137` or `143` and one more line, which `ranAndFailed` reads as cut off. None of them says anything about the check:
  // it neither turns the line red nor takes the red away.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const r = await next(e)
    if (e.agentId !== undefined || r.deny !== undefined) return r
    const checks = checksOf(String(e.command ?? ''))
    if (checks.length === 0) return r
    if (r.isError && !ranAndFailed(r.text)) return r
    // A command started in the background is answered at once, without an error flag and before it has run: it neither passed nor failed.
    if (e.run_in_background === true || typeof (r as BashResult).result?.backgroundTaskId === 'string') return r
    await safely($, 'Bash', () =>
      r.isError
        ? update($, failure, () => failureKey(checks))
        : update($, failure, current => (current !== null && hasPassed(current, checks) ? null : current)),
    )
    return r
  })

  // Claude asks: the line turns yellow until the person has answered, however many questions are open at once.
  on('tool.call', { tool: 'AskUserQuestion' }, ($, e, next) => whileAsked($, 'AskUserQuestion', e.agentId, () => next(e)))
  on('tool.call', { tool: 'ExitPlanMode' }, ($, e, next) => whileAsked($, 'ExitPlanMode', e.agentId, () => next(e)))

  on('session.start', async ($, e, next) => {
    await safely($, 'session.start', () => $.command.register({ name: 'task-line', description: 'Show or hide the task line', immediate: true }))
    return next(e)
  })

  on('command.run', { command: 'task-line' }, async $ => {
    const wasOff = await safely($, 'task-line', async () => {
      const was = await read($, isOff)
      await update($, isOff, () => !was)
      return was
    })
    return { text: wasOff === null ? 'Task line could not be switched.' : wasOff ? 'Task line shown.' : 'Task line hidden.' }
  })

  // Every plugin beneath keeps drawing: next(e) first, the line below its output.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props.hasSurvey) return below
    const line = await safely($, 'AbovePrompt', () => lineOf($, e as RenderInput, e.props.bodyColumns || DEFAULT_COLUMNS))
    if (!line) return below
    const { Box } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {below}
        {line}
      </Box>
    )
  })

  // In the terminal a question replaces the prompt area, so the band is not drawn then: the line goes above the dialog instead.
  on('ui.render', { component: 'AskUserQuestion' }, async ($, e, next) => {
    const below = await next(e)
    // The desktop app keeps the band below its dialog (seen by hand: a line above it showed the list twice).
    if ((e as RenderInput).surface === 'desktop') return below
    const line = await safely($, 'AskUserQuestion', () => lineOf($, e as RenderInput, (e as RenderInput).viewport?.columns || DEFAULT_COLUMNS, true))
    if (!line) return below
    const { Box } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {line}
        {below}
      </Box>
    )
  })
}
