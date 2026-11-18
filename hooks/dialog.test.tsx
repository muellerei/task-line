import { test, expect, mock } from 'claude-code/testing'

import { answerOk, call, stopBeneath, todo } from './test-support'
import type { TestEngine } from './test-support'
import { width } from './cells'

// The question dialog as the terminal raises it. The viewport is what the host counts the tree at: 40 columns.
const dialog = ($: TestEngine, columns = 40) =>
  $.ui.mount({
    plugin: 'task-line',
    surface: 'terminal',
    component: 'AskUserQuestion',
    props: { tool: 'AskUserQuestion', questions: [] },
    viewport: { columns, rows: 24 },
  } as never)

const stop = ($: TestEngine, tasks: object[]) => $.classic.Stop({ stop_hook_active: false, background_tasks: tasks } as never)
const task = (description: string, type = 'shell') => ({ type, description })
const rowsOf = async (view: Awaited<ReturnType<typeof dialog>>) => (await view.findAll({ type: 'Box', text: /./ })).filter(b => b.props.flexDirection === 'row')

test('the dialog without a list shows one row of the first task, with its kind and +N for the others', async ($, on) => {
  mock.clock(on)
  stopBeneath(on)
  await stop($, [task('Run the build'), task('Count', 'subagent'), task('Watch')])
  const view = await dialog($)
  expect(await view.find({ type: 'Text', text: 'Run the build' })).toBeDefined()
  expect(await view.find({ type: 'Text', text: 'shell' })).toBeDefined()
  expect(await view.find({ type: 'Text', text: '+2' })).toBeDefined()
  expect(await view.find({ text: 'Count' })).toBeUndefined()
  expect((await rowsOf(view)).length).toBe(1)
})

test('the dialog with a list shows the list row only, never both rows', async ($, on) => {
  mock.clock(on)
  stopBeneath(on)
  answerOk(on)
  await stop($, [task('Run the build')])
  await call($, { tool: 'TodoWrite', todos: [todo('Write tests', 'in_progress')] })
  const view = await dialog($)
  expect(await view.find({ text: 'Write tests' })).toBeDefined()
  expect(await view.find({ text: '↻' })).toBeUndefined()
  expect((await rowsOf(view)).length).toBe(1)
})

test('in the dialog a short description is not cut or padded, a long one is cut so that the row is 40 cells', async ($, on) => {
  mock.clock(on)
  stopBeneath(on)
  await stop($, [task('Run the build')])
  const short = await (await dialog($)).find({ type: 'Text', text: /build/ })
  expect(short?.text).toBe('Run the build')
  await stop($, [task('A description far too long for forty cells of a dialog'), task('b')])
  const long = await (await dialog($)).find({ type: 'Text', text: /description/ })
  expect(long?.text.endsWith('…')).toBe(true)
  // glyph with its spaces, description, space, kind, space, +1: 40 cells
  expect(width(' ↻ ') + width(long!.text) + width(' shell') + width(' +1')).toBe(40)
})

test('in the dialog a description that fits exactly is not cut', async ($, on) => {
  mock.clock(on)
  stopBeneath(on)
  // room = 40 - 3 (' ↻ ') - 6 (' shell') = 31
  await stop($, [task('x'.repeat(31))])
  const fits = await (await dialog($)).find({ type: 'Text', text: /^x/ })
  expect(fits?.text).toBe('x'.repeat(31))
  await stop($, [task('x'.repeat(32))])
  const cut = await (await dialog($)).find({ type: 'Text', text: /^x/ })
  expect(cut?.text).toBe('x'.repeat(30) + '…')
})

test('in the dialog a task without a description shows its kind in its place', async ($, on) => {
  mock.clock(on)
  stopBeneath(on)
  await stop($, [{ type: 'shell', command: 'sleep 90' }])
  const view = await dialog($)
  expect((await view.findAll({ type: 'Text' })).map(t => t.text)).toEqual([' ↻ ', 'shell'])
})
