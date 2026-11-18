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

const stop = ($: TestEngine, kinds: string[]) => $.classic.Stop({ stop_hook_active: false, background_tasks: kinds.map(type => ({ type })) } as never)
const rowsOf = async (view: Awaited<ReturnType<typeof dialog>>) => (await view.findAll({ type: 'Box', text: /./ })).filter(b => b.props.flexDirection === 'row')

test('the dialog without a list shows the line of background tasks, one row, at most 40 cells', async ($, on) => {
  mock.clock(on)
  stopBeneath(on)
  await stop($, ['shell', 'monitor'])
  const view = await dialog($)
  expect(await view.find({ text: '2 tasks' })).toBeUndefined()
  expect(await view.find({ type: 'Text', text: /1 shell · 1 monitor/ })).toBeDefined()
  expect((await rowsOf(view)).length).toBe(1)
})

test('the dialog with a list shows the list row only, never both rows', async ($, on) => {
  mock.clock(on)
  stopBeneath(on)
  answerOk(on)
  await stop($, ['shell'])
  await call($, { tool: 'TodoWrite', todos: [todo('Write tests', 'in_progress')] })
  const view = await dialog($)
  expect(await view.find({ text: 'Write tests' })).toBeDefined()
  expect(await view.find({ text: '⏵' })).toBeUndefined()
  expect((await rowsOf(view)).length).toBe(1)
})

test('in the dialog the line is cut to 40 cells only when it is longer, and is not padded otherwise', async ($, on) => {
  mock.clock(on)
  stopBeneath(on)
  await stop($, ['shell'])
  const short = await (await dialog($)).find({ type: 'Text', text: /shell/ })
  expect(short?.text).toBe('1 shell')
  await stop($, ['shell', 'monitor', 'subagent', 'workflow', 'verylongtypename', 'another-kind'])
  const long = await (await dialog($)).find({ type: 'Text', text: /shell/ })
  expect([...(long?.text ?? '')].length).toBeLessThanOrEqual(37)
  expect(long?.text.endsWith('…')).toBe(true)
})

test('the 40 columns of the dialog are the limit: glyph and text fill 40 cells at most, and 37 cells of text are not cut', async ($, on) => {
  mock.clock(on)
  stopBeneath(on)
  const shown = async (kinds: string[]) => {
    await stop($, kinds)
    return (await (await dialog($)).find({ type: 'Text', text: /^\d/ }))?.text ?? ''
  }
  // six kinds: "1 a · 1 b · 1 c · 1 d · 1 e · 1 " is 32 cells, and the last kind adds its length
  const fits = await shown(['a', 'b', 'c', 'd', 'e', 'fffff'])
  expect(width(fits)).toBe(37)
  expect(fits.endsWith('…')).toBe(false)
  const cut = await shown(['a', 'b', 'c', 'd', 'e', 'ffffff'])
  expect(cut.endsWith('…')).toBe(true)
  // the glyph cell and the cut text are 40 cells together
  expect(width(' ⏵ ') + width(cut)).toBe(40)
})
