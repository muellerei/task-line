// What the tests share: the host's drawing and tool answers as a test says them, and the questions a test asks of a mounted line.

import type { TestBody } from 'claude-code/testing'

export type TestEngine = Parameters<TestBody>[0]
export type TestOn = Parameters<TestBody>[1]
export type Band = Awaited<ReturnType<typeof mountBand>>

export const WORK_STATE = 'mcp__plugin_claude-mem_mcp-search__work_state_write'

// The props of the band that the mod reads. The host's `scroll` and `view` it never reads, so the tests leave them out.
const props = { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 120 }

export const mountBand = ($: TestEngine, surface: 'terminal' | 'desktop' = 'terminal', extra: object = {}) =>
  $.ui.mount({ plugin: 'task-line', surface, component: 'AbovePrompt', props: { ...props, ...extra } as never })

// A tool call as a test says it: plain data. The engine's input type for it is wider than a test needs.
export const call = ($: TestEngine, input: object) => $.tool.call(input as never)

export const runCommand = ($: TestEngine, command: string) => $.command.run({ command, args: '' } as never)

type ToolCall = { tool: string; agentId?: string; command?: string; [key: string]: unknown }

// The answer of every tool, whatever `answer` returns for the call.
export const answering = (on: TestOn, answer: (e: ToolCall) => unknown) => on('tool.call', async (_, e) => (await answer(e as ToolCall)) as never)
export const answerOk = (on: TestOn) => answering(on, () => ({ result: {}, text: 'ok' }))

// The engine's own drawing beneath the mod: the plugins beneath keep drawing.
export const engine = (on: TestOn) =>
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })

// What a command that ran and failed answers (measured): the error flag, and the text starts with the exit code.
export const failedRun = { isError: true, text: 'Exit code 1\nboom' }

export const todo = (content: unknown, status: unknown) => ({ content, status, activeForm: String(content) })
export const todos = (total: number, done: number) => Array.from({ length: total }, (_, i) => todo(`Step ${i}`, i < done ? 'completed' : 'pending'))

export const has = async (band: Band, text: string | RegExp) => (await band.find({ text })) !== undefined
// `find` with a string matches a part of the text: where the whole text counts, this is the test for it
export const exactly = (text: string) => new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)
export const filled = async (band: Band) => ((await band.find({ key: 'bar' }))?.text.split('━').length ?? 1) - 1
export const barCells = async (band: Band) => (await band.find({ key: 'bar' }))?.text.length
