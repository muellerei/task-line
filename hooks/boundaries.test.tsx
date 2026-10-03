import { test, expect, mock } from 'claude-code/testing'

import { answering, barCells, call, engine, exactly, failedRun, filled, has, mountBand, runCommand, todo, todos, WORK_STATE } from './test-support'
import type { TestEngine, TestOn } from './test-support'

// The engine's own drawing, the clock and a tool that answers with whatever `answer` returns.
function setup($: TestEngine, on: TestOn, answer: Parameters<typeof answering>[1] = () => ({ result: {}, text: 'ok' })) {
  const clock = mock.clock(on)
  engine(on)
  answering(on, answer)
  const mount = (extra: object = {}) => mountBand($, 'terminal', extra)
  const write = (data: object) => call($, data)
  return { clock, mount, write }
}

test('the bar and the percent at the ends: one in many is not empty, all but one is not full, all is full', async ($, on) => {
  const { mount, write } = setup($, on)
  const band = await mount()
  // 120 columns: the bar is 48 cells
  const cases: [number, number, number, string][] = [
    [200, 0, 0, '0%'],
    [200, 1, 1, '1%'],
    [200, 100, 24, '50%'],
    [200, 199, 47, '99%'],
    [200, 200, 48, '100%'],
    [1, 0, 0, '0%'],
    [1, 1, 48, '100%'],
    [3, 1, 16, '33%'],
    [3, 2, 32, '67%'],
    [2, 1, 24, '50%'],
  ]
  for (const [total, done, cells, percent] of cases) {
    await write({ tool: 'TodoWrite', todos: todos(total, done) })
    expect(await barCells(band), `${done}/${total} keeps the bar at 48`).toBe(48)
    expect(await filled(band), `${done}/${total} fills`).toBe(cells)
    expect(await has(band, new RegExp(`^\\s*${percent}$`)), `${done}/${total} shows ${percent}`).toBe(true)
    expect(await has(band, `${done}/${total}`), `${done}/${total} counts`).toBe(true)
  }
})

test('at most two lists are drawn, the newest ones, and an empty or odd list never draws', async ($, on) => {
  const { mount, write } = setup($, on)
  const band = await mount()
  const item = (list: string, task: string) => write({ tool: WORK_STATE, list, fields: { task, status: 'doing' } })
  await item('a', 'one')
  await item('b', 'two')
  expect(await has(band, 'a: one')).toBe(true)
  expect(await has(band, 'b: two')).toBe(true)
  await item('c', 'three')
  expect(await has(band, 'a: one')).toBe(false)
  expect(await has(band, 'b: two')).toBe(true)
  expect(await has(band, 'c: three')).toBe(true)
  // touching the oldest again brings it back and pushes the middle one out
  await item('a', 'one more')
  expect(await has(band, 'a: one')).toBe(true)
  expect(await has(band, 'b: two')).toBe(false)
  expect(await has(band, 'c: three')).toBe(true)
})

test('an empty or blank task name is shown as Task, a long one does not break the line', async ($, on) => {
  const { mount, write } = setup($, on)
  const band = await mount()
  for (const content of ['', '   ', '\t\n', undefined, null, 5]) {
    await write({ tool: 'TodoWrite', todos: [todo(content, 'in_progress')] })
    expect(await has(band, content === 5 ? '5' : 'Task'), JSON.stringify(content)).toBe(true)
  }
  await write({ tool: 'TodoWrite', todos: [todo('x'.repeat(10_000), 'in_progress')] })
  expect(await has(band, '0/1')).toBe(true)
  expect(await barCells(band)).toBe(48)
})

test('a status the mod does not know counts as pending, whatever its spelling, and never as a property of Object', async ($, on) => {
  const { mount, write } = setup($, on)
  const band = await mount()
  const odd = ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'DONE', 'Completed', ' done', 'finished', '', 5, null, undefined, {}, []]
  await write({ tool: 'TodoWrite', todos: odd.map((status, i) => todo(`Step ${i}`, status)) })
  expect(await has(band, `0/${odd.length}`)).toBe(true)
  await write({ tool: 'TodoWrite', todos: [...odd.map((status, i) => todo(`Step ${i}`, status)), todo('Last', 'completed')] })
  expect(await has(band, `1/${odd.length + 1}`)).toBe(true)
  // every known spelling of done and doing
  await write({ tool: 'TodoWrite', todos: ['completed', 'done', 'dropped'].map(s => todo(s, s)).concat(['in_progress', 'doing'].map(s => todo(s, s))) })
  expect(await has(band, '3/5')).toBe(true)
})

test('lists that do not fit: no list, no todos, todos that are no list', async ($, on) => {
  const { mount, write } = setup($, on)
  const band = await mount()
  await write({ tool: 'TodoWrite', todos: todos(2, 0) })
  expect(await has(band, '0/2')).toBe(true)
  // todos that are no array leave the list as it was
  for (const bad of ['x', null, undefined, {}, 7]) {
    await write({ tool: 'TodoWrite', todos: bad })
    expect(await has(band, '0/2'), JSON.stringify(bad)).toBe(true)
  }
  // an empty list takes the line away, and the next list brings it back
  await write({ tool: 'TodoWrite', todos: [] })
  expect(await has(band, /\d\/\d/)).toBe(false)
  expect(await has(band, 'engine')).toBe(true)
  await write({ tool: 'TodoWrite', todos: todos(1, 0) })
  expect(await has(band, '0/1')).toBe(true)
})

test('the finished list stays for 20 seconds to the millisecond, and a list that goes on is not hidden by the old timer', async ($, on) => {
  const { clock, mount, write } = setup($, on)
  const band = await mount()
  await write({ tool: 'TodoWrite', todos: todos(1, 1) })
  expect(await has(band, '1/1')).toBe(true)
  await clock.advance(19_999)
  expect(await has(band, '1/1')).toBe(true)
  await clock.advance(1)
  expect(await has(band, '1/1')).toBe(false)
  expect(await has(band, 'engine')).toBe(true)

  // finished at t0, taken up again at t0+10s, the first wait runs out at t0+20s and must not hide it
  await write({ tool: 'TodoWrite', todos: todos(2, 2) })
  await clock.advance(10_000)
  await write({ tool: 'TodoWrite', todos: todos(3, 2) })
  await clock.advance(15_000)
  expect(await has(band, '2/3')).toBe(true)
  // finished again: a new wait of its own
  await write({ tool: 'TodoWrite', todos: todos(3, 3) })
  await clock.advance(19_999)
  expect(await has(band, '3/3')).toBe(true)
  await clock.advance(1)
  expect(await has(band, '3/3')).toBe(false)
})

test('a question counts once per call, also when the call fails, and never below zero', async ($, on) => {
  const waits: (() => void)[] = []
  let fail = false
  const { mount, write } = setup($, on, async e => {
    if (e.tool === 'AskUserQuestion' || e.tool === 'ExitPlanMode') {
      if (fail) throw new Error('refused')
      await new Promise<void>(resolve => waits.push(resolve))
    }
    return { result: {}, text: 'ok' }
  })
  const band = await mount()
  const waiting = () => has(band, 'needs you')
  await write({ tool: 'TodoWrite', todos: todos(2, 0) })

  // a failing call gives its count back
  fail = true
  await write({ tool: 'AskUserQuestion', questions: [] }).catch(() => undefined)
  expect(await waiting()).toBe(false)
  fail = false

  // a question and a plan at once: both have to be answered
  const ask = write({ tool: 'AskUserQuestion', questions: [] })
  const plan = write({ tool: 'ExitPlanMode', plan: 'x' })
  await Promise.resolve()
  expect(await waiting()).toBe(true)
  waits[0]?.()
  await ask
  expect(await waiting()).toBe(true)
  waits[1]?.()
  await plan
  expect(await waiting()).toBe(false)

  // the count did not go below zero on the way: one question is yellow again, and ends
  const again = write({ tool: 'AskUserQuestion', questions: [] })
  await Promise.resolve()
  expect(await waiting()).toBe(true)
  waits[2]?.()
  await again
  expect(await waiting()).toBe(false)
})

test('TaskCreate without an id still makes distinct items, and TaskUpdate leaves unknown ids and statuses alone', async ($, on) => {
  const { mount, write } = setup($, on, e => ({ result: e.tool === 'TaskCreate' ? {} : {}, text: 'ok' }))
  const band = await mount()
  await write({ tool: 'TaskCreate', subject: 'First', description: '', activeForm: '' })
  await write({ tool: 'TaskCreate', subject: 'Second', description: '', activeForm: '' })
  expect(await has(band, '0/2')).toBe(true)
  // an id that is none of theirs changes nothing, and does not throw
  await write({ tool: 'TaskUpdate', taskId: 'nope', status: 'completed' })
  await write({ tool: 'TaskUpdate', taskId: undefined, status: 'completed' })
  expect(await has(band, '0/2')).toBe(true)
})

test('TaskUpdate: numeric ids, a rename, an unknown status keeps the old one, deleting the last item takes the line away', async ($, on) => {
  let id = 0
  const { mount, write } = setup($, on, e => ({ result: e.tool === 'TaskCreate' ? { task: { id: ++id } } : {}, text: 'ok' }))
  const band = await mount()
  await write({ tool: 'TaskCreate', subject: 'First', description: '', activeForm: '' })
  await write({ tool: 'TaskCreate', subject: 'Second', description: '', activeForm: '' })
  await write({ tool: 'TaskUpdate', taskId: 1, status: 'completed' })
  expect(await has(band, '1/2')).toBe(true)
  // an unknown status does not reset a finished item
  await write({ tool: 'TaskUpdate', taskId: '1', status: 'bogus' })
  expect(await has(band, '1/2')).toBe(true)
  // a rename shows once the item is the open one
  await write({ tool: 'TaskUpdate', taskId: '2', subject: 'Renamed' })
  expect(await has(band, 'Renamed')).toBe(true)
  // deleting an id that is not there changes nothing, deleting both takes the line away
  await write({ tool: 'TaskUpdate', taskId: '9', status: 'deleted' })
  expect(await has(band, '1/2')).toBe(true)
  await write({ tool: 'TaskUpdate', taskId: '1', status: 'deleted' })
  expect(await has(band, '0/1')).toBe(true)
  await write({ tool: 'TaskUpdate', taskId: '2', status: 'deleted' })
  expect(await has(band, /\d\/\d/)).toBe(false)
})

test('work_state_write: a blank task or list is ignored, an unknown status keeps the old one, a task name is its id', async ($, on) => {
  const { mount, write } = setup($, on)
  const band = await mount()
  const item = (fields: object, list: unknown = 'plan') => write({ tool: WORK_STATE, list, fields })
  for (const task of ['', ' ', '\t']) await item({ task, status: 'doing' })
  await item({ task: 'x', status: 'doing' }, '')
  await item({ task: 'x', status: 'doing' }, null)
  await item({ task: 'x', status: 'doing' }, {})
  await item({ task: 'x', status: 'doing' }, 5)
  await item({ status: 'doing' })
  await item({ task: 5 })
  await item({ task: null })
  expect(await has(band, /\d\/\d/)).toBe(false)

  await item({ task: 'A', status: 'done' })
  await item({ task: 'B', status: 'todo' })
  expect(await has(band, '1/2')).toBe(true)
  // an unknown status keeps what was, a new task without status is pending
  await item({ task: 'A', status: 'weird' })
  expect(await has(band, '1/2')).toBe(true)
  await item({ task: 'C' })
  expect(await has(band, '1/3')).toBe(true)
  // the same name is the same item, a different spelling is another one
  await item({ task: 'B', status: 'done' })
  expect(await has(band, '2/3')).toBe(true)
  await item({ task: 'b', status: 'todo' })
  expect(await has(band, '2/4')).toBe(true)
  // dropped counts as closed
  await item({ task: 'C', status: 'dropped' })
  expect(await has(band, '3/4')).toBe(true)
})

test('a failed check: refused or errored calls and an earlier list do not count, a waiting list shows it, a finished list does not', async ($, on) => {
  let outcome: object = {}
  // a refusal is an answer of its own: { deny } and nothing beside it
  const { mount, write } = setup($, on, e => (e.tool === 'Bash' && 'deny' in outcome ? outcome : { result: {}, text: 'x', ...(e.tool === 'Bash' && outcome) }))
  const band = await mount()
  const run = (command: string, o: object = {}) => ((outcome = o), write({ tool: 'Bash', command }))
  const failed = (check: string) => has(band, `${check} failed`)

  // a check that fails before any list exists is not held against the list that comes later
  await run('npm test', { isError: true, text: 'Exit code 1\nboom' })
  await write({ tool: 'TodoWrite', todos: [todo('Write tests', 'pending'), todo('Ship it', 'pending')] })
  expect(await has(band, '✕')).toBe(false)

  // a list with no task in progress is waiting, and shows the failure as well
  await run('npm test', { isError: true, text: 'Exit code 1\nboom' })
  expect(await failed('npm test')).toBe(true)
  // a call that was refused, or has no command, changes nothing
  await run('pytest', { deny: 'no' })
  await write({ tool: 'Bash' })
  await write({ tool: 'Bash', command: 12 })
  expect(await failed('npm test')).toBe(true)
  expect(await failed('pytest')).toBe(false)
  // a different check failing replaces the name
  await run('pytest -x', { isError: true, text: 'Exit code 1\nboom' })
  expect(await failed('pytest')).toBe(true)
  expect(await failed('npm test')).toBe(false)
  // that check passing clears it
  await run('pytest -q')
  expect(await has(band, '✕')).toBe(false)
  // a finished list is never red
  await run('pytest -x', { isError: true, text: 'Exit code 1\nboom' })
  await write({ tool: 'TodoWrite', todos: todos(2, 2) })
  expect(await has(band, '✕')).toBe(false)
  expect(await has(band, '✓')).toBe(true)
})

test('/task-line answers what it did, and a hidden line comes back with the lists it kept filling', async ($, on) => {
  const { mount, write } = setup($, on)
  const band = await mount()
  const toggle = async () => (await runCommand($, 'task-line'))?.text
  await write({ tool: 'TodoWrite', todos: todos(2, 1) })
  expect(await toggle()).toBe('Task line hidden.')
  expect(await has(band, '1/2')).toBe(false)
  await write({ tool: 'TodoWrite', todos: todos(3, 1) })
  expect(await toggle()).toBe('Task line shown.')
  expect(await has(band, '1/3')).toBe(true)
  // the argument makes no difference, and a toggle is a toggle also three times
  expect(await toggle()).toBe('Task line hidden.')
  expect(await has(band, '1/3')).toBe(false)
  expect(await toggle()).toBe('Task line shown.')
  expect(await has(band, '1/3')).toBe(true)
})

test('a long list and a narrow band: 300 tasks, and widths from the narrowest to the widest', async ($, on) => {
  const { mount, write } = setup($, on)
  await write({ tool: 'TodoWrite', todos: todos(300, 150) })
  for (const [columns, bar] of [
    [0, 40],
    [1, 10],
    [30, 10],
    [80, 32],
    [149, 59],
    [150, 60],
    [10_000, 60],
  ] as const) {
    const band = await mount({ bodyColumns: columns })
    expect(await has(band, '150/300'), `${columns} columns`).toBe(true)
    expect(await has(band, /^\s*50%$/), `${columns} columns`).toBe(true)
    expect(await barCells(band), `${columns} columns`).toBe(bar)
    expect(await filled(band), `${columns} columns`).toBe(Math.round(bar / 2))
  }
})

test('names and subjects are cleaned when they come in: escape sequences, controls, invisible characters, and a limit', async ($, on) => {
  const { mount, write } = setup($, on)
  const band = await mount()
  const cases: [string, string][] = [
    ['\u001b[31mred\u001b[0m\nline\t2', 'red line 2'],
    ['a\u{10eeee}b', 'ab'],
    ['a\u202eb', 'ab'],
    ['a\u200bb', 'ab'],
    ['\u001b]0;title\u0007text', 'text'],
    ['x'.repeat(200), 'x'.repeat(200)],
    ['x'.repeat(201), 'x'.repeat(199) + '…'],
    ['x'.repeat(100_000), 'x'.repeat(199) + '…'],
    ['😀'.repeat(250), '😀'.repeat(199) + '…'],
  ]
  for (const [subject, shown] of cases) {
    await write({ tool: 'TodoWrite', todos: [todo(subject, 'in_progress')] })
    expect(await has(band, exactly(shown)), JSON.stringify(subject.slice(0, 20))).toBe(true)
  }
  // the same for the other two tools (the list is emptied first: the open task of the last case would be the one shown)
  await write({ tool: 'TodoWrite', todos: [] })
  await write({ tool: 'TaskCreate', subject: 'a\nb\u001b[1mc', description: '', activeForm: '' })
  expect(await has(band, exactly('a bc'))).toBe(true)
  await write({ tool: 'TaskUpdate', taskId: 'x', subject: 'ignored' })
  // a subject of nothing but controls is blank: Task
  await write({ tool: 'TodoWrite', todos: [todo('\u001b[31m\n\u202e', 'in_progress')] })
  expect(await has(band, 'Task')).toBe(true)
})

test('work_state_write: the list name and the task are cleaned, a name of nothing visible is ignored', async ($, on) => {
  const { mount, write } = setup($, on)
  const band = await mount()
  const item = (list: unknown, task: unknown) => write({ tool: WORK_STATE, list, fields: { task, status: 'doing' } })
  await item('\u001b[31mplan\u001b[0m\n2', 'step\tone')
  expect(await has(band, exactly('plan 2: step one'))).toBe(true)
  await item('x'.repeat(100), 'a')
  expect(await has(band, exactly('x'.repeat(59) + '…: a'))).toBe(true)
  // nothing visible left: no list, no task
  const before = await band.find({ text: /\d\/\d/ })
  await item('\u001b[31m\u202e', 'a')
  await item('ok', '\u001b[31m\u202e')
  await item('ok', '\u{10eeee}')
  expect(await has(band, 'ok: ')).toBe(false)
  expect(await band.find({ text: /\d\/\d/ })).toEqual(before)
})

test('the work_state_write tool is found by its ending, whichever name the plugin has, and nothing else is', async ($, on) => {
  const { mount, write } = setup($, on)
  const band = await mount()
  const names = ['mcp__plugin_claude-mem_mcp-search__work_state_write', 'mcp__claude-mem__work_state_write', 'mcp__x__work_state_write']
  for (const [i, tool] of names.entries()) {
    await write({ tool, list: `l${i}`, fields: { task: 't', status: 'doing' } })
    expect(await has(band, `l${i}: t`), tool).toBe(true)
  }
  for (const [i, tool] of [
    'work_state_write',
    'mcp__x__work_state_writer',
    'mcp__work_state_write',
    'mcp__x__work_state_write_all',
    'xmcp__x__work_state_write',
    'my_mcp__x__work_state_write',
    'Bash',
  ].entries()) {
    await write({ tool, list: `n${i}`, fields: { task: 't', status: 'doing' } })
    expect(await has(band, `n${i}: t`), tool).toBe(false)
  }
})

test('a check is told by how a command starts, not by what it mentions', async ($, on) => {
  let failing = ''
  const { mount, write } = setup($, on, e => ({
    result: {},
    text: 'x',
    ...(e.tool === 'Bash' && e.command === failing && { isError: true, text: 'Exit code 1\nboom' }),
  }))
  const band = await mount()
  const fails = async (command: string) => {
    failing = command
    await write({ tool: 'Bash', command })
    const red = await has(band, '✕')
    // the same command passing clears a check that failed, so the next one starts clean
    failing = ''
    await write({ tool: 'Bash', command })
    expect(await has(band, '✕'), `${command} passes again`).toBe(false)
    return red
  }
  await write({ tool: 'TodoWrite', todos: [todo('Write tests', 'in_progress'), todo('Ship it', 'pending')] })
  for (const command of ['FOO=1 pytest -x', 'uv run pytest', '(cd app; npm test)', 'npm test 2>&1 | tail -5', 'time make test', 'bundle exec rspec'])
    expect(await fails(command), command).toBe(true)
  for (const command of [
    'echo "run cargo test"',
    'git commit -m "fix npm test"',
    'grep -r pytest .',
    'ls | grep jest',
    'cat <<EOF\npytest\nEOF',
    'which pytest',
  ])
    expect(await fails(command), command).toBe(false)
})

test('a narrow band drops the note before it would overflow, and keeps the glyph and the color', async ($, on) => {
  let failing = false
  const { mount, write } = setup($, on, e => ({
    result: {},
    text: 'x',
    ...(e.tool === 'Bash' && failing && { isError: true, text: 'Exit code 1\nboom' }),
  }))
  await write({ tool: 'TodoWrite', todos: [todo('Write tests', 'in_progress'), todo('Ship it', 'pending')] })
  failing = true
  await write({ tool: 'Bash', command: 'npm test' })
  // 14 + 16 (the note and a space) + 4 + 10 = 44
  for (const [columns, shown] of [
    [200, true],
    [100, true],
    [45, true],
    [44, true],
    [43, false],
    [30, false],
    [10, false],
    [0, true],
  ] as const) {
    const band = await mount({ bodyColumns: columns })
    expect(await has(band, '✕'), `${columns} columns`).toBe(true)
    // 0 columns reads as the default of 100
    expect(await has(band, 'npm test failed'), `${columns} columns`).toBe(shown)
  }
})

test('at most 500 tasks and 20 lists are kept, and the oldest list goes first', async ($, on) => {
  const { mount, write } = setup($, on)
  const band = await mount()
  for (const [given, shown] of [
    [1, 1],
    [499, 499],
    [500, 500],
    [501, 500],
    [3000, 500],
  ] as const) {
    await write({ tool: 'TodoWrite', todos: todos(given, 0) })
    expect(await has(band, `0/${shown}`), `${given} tasks`).toBe(true)
  }
  const item = (list: string, task: string) => write({ tool: WORK_STATE, list, fields: { task, status: 'todo' } })
  for (let i = 0; i < 25; i++) await item(`l${i}`, 'first')
  // l5 is the oldest list that is kept (l0 to l4 went), touching it adds to what it held
  await item('l5', 'second')
  expect(await has(band, 'l5: first')).toBe(true)
  expect(await has(band, '0/2')).toBe(true)
  // l4 went: it starts again with the one task it was given now
  await item('l4', 'second')
  expect(await has(band, 'l4: second')).toBe(true)
  expect(await has(band, 'l4: first')).toBe(false)
})

test('a call that was refused or interrupted before it ran is no failed check, whatever its error flag says', async ($, on) => {
  let outcome: object = {}
  const { mount, write } = setup($, on, e => (e.tool === 'Bash' ? { result: {}, ...outcome } : { result: {}, text: 'ok' }))
  const band = await mount()
  const run = (command: string, o: object) => ((outcome = o), write({ tool: 'Bash', command }))
  await write({ tool: 'TodoWrite', todos: [todo('Write tests', 'in_progress'), todo('Ship it', 'pending')] })
  const red = () => has(band, '✕')

  // what a command that ran and failed looks like: the exit code leads the text
  for (const text of ['Exit code 1\nboom', 'Exit code 2', 'Exit code 127\nnot found', 'Exit code 130\n', 'Exit code 255\nx', 'Exit code 10 and more']) {
    await run('npm test', { isError: true, text })
    expect(await red(), JSON.stringify(text)).toBe(true)
    await run('npm test', { text: 'fine' })
    expect(await red(), 'passes again').toBe(false)
  }

  // what a call that never ran looks like (measured: a hook that blocks the call answers with isError and this text), or none at all
  const refused = [
    'PreToolUse:Bash hook error: [/x/hook.sh]: Blocked: nope',
    "The user doesn't want to proceed with this tool use. The tool use was rejected",
    '[Request interrupted by user for tool use]',
    'Permission to use Bash with command npm test has been denied.',
    'Exit code 0',
    'exit code 1',
    ' Exit code 1',
    'Command failed with Exit code 1',
    'Exit code',
    'Exit code x',
    'Exit code -1',
    '',
    undefined,
    null,
    5,
    {},
    ['Exit code 1'],
    { toString: () => 'Exit code 1' },
  ]
  for (const text of refused) {
    await run('npm test', { isError: true, text })
    expect(await red(), JSON.stringify(text)).toBe(false)
  }
  // no text at all is no text
  await run('npm test', { isError: true })
  expect(await red()).toBe(false)

  // a refusal neither sets a failure nor clears one that is there
  await run('npm test', { isError: true, text: 'Exit code 1' })
  expect(await red()).toBe(true)
  await run('npm test', { isError: true, text: 'PreToolUse:Bash hook error: blocked' })
  expect(await red()).toBe(true)
  await run('pytest', { isError: true, text: '[Request interrupted by user for tool use]' })
  expect(await has(band, 'npm test failed')).toBe(true)
  await run('npm test', { text: 'ok' })
  expect(await red()).toBe(false)
})

test('work_state_write with the status done and no task closes the list, so the next task of that name starts a new one', async ($, on) => {
  const { mount, write } = setup($, on)
  const band = await mount()
  const item = (list: string, task: string, status = 'doing') => write({ tool: WORK_STATE, list, fields: { task, status } })
  const state = (list: unknown, fields: unknown, extra: object = {}) => write({ tool: WORK_STATE, list, fields, ...extra })

  await item('plan', 'A')
  await item('plan', 'B', 'todo')
  expect(await has(band, '0/2')).toBe(true)

  // list state that does not close: another status, another spelling, no status, no fields, a status that is no string
  for (const fields of [
    { status: 'doing' },
    { status: 'DONE' },
    { status: 'done ' },
    { status: 'todo' },
    { status: 'dropped' },
    {},
    { note: 'x' },
    { status: null },
    { status: 5 },
    { status: ['done'] },
    null,
    undefined,
    'done',
  ]) {
    await state('plan', fields)
    expect(await has(band, '0/2'), JSON.stringify(fields)).toBe(true)
  }
  // a call of a subagent, a refused call, and another list's name close nothing
  await state('plan', { status: 'done' }, { agentId: 'a1' })
  await state('other', { status: 'done' })
  await state('', { status: 'done' })
  await state(5, { status: 'done' })
  expect(await has(band, '0/2')).toBe(true)

  // an item with the status done is an item, also when it carries a note
  await item('plan', 'A', 'done')
  expect(await has(band, '1/2')).toBe(true)
  await state('plan', { task: 'B', status: 'done', note: 'x' })
  expect(await has(band, '2/2')).toBe(true)

  // the list state done closes the list: the line goes, the name is free again
  await item('plan', 'C', 'doing')
  expect(await has(band, '2/3')).toBe(true)
  await state('plan', { status: 'done' })
  expect(await has(band, /\d\/\d/)).toBe(false)
  await item('plan', 'D')
  expect(await has(band, exactly('plan: D'))).toBe(true)
  expect(await has(band, '0/1')).toBe(true)
  expect(await has(band, '0/2')).toBe(false)

  // closing a list that is not there changes nothing, and closing one list leaves the others
  await state('never-there', { status: 'done' })
  await item('second', 'E')
  await state('plan', { status: 'done', note: 'finished' })
  expect(await has(band, exactly('second: E'))).toBe(true)
  expect(await has(band, 'plan: ')).toBe(false)
})

test('a finished list that has faded and gets a new task starts again, one that is still shown or unfinished grows', async ($, on) => {
  let id = 0
  const { clock, mount, write } = setup($, on, e => ({ result: e.tool === 'TaskCreate' ? { task: { id: String(++id) } } : {}, text: 'ok' }))
  const band = await mount()
  const item = (task: string, status = 'doing', list = 'plan') => write({ tool: WORK_STATE, list, fields: { task, status } })
  const create = (subject: string) => write({ tool: 'TaskCreate', subject, description: '', activeForm: '' })

  // finished, but still shown: a task that comes now is part of the same run (add one, finish it, add the next)
  await item('A', 'done')
  expect(await has(band, '1/1')).toBe(true)
  await clock.advance(19_999)
  await item('B', 'doing')
  expect(await has(band, '1/2')).toBe(true)
  await item('B', 'done')
  expect(await has(band, '2/2')).toBe(true)

  // finished and faded (20 seconds, to the millisecond): the name is free again
  await clock.advance(19_999)
  await item('C', 'todo')
  expect(await has(band, '2/3')).toBe(true)
  await item('C', 'done')
  expect(await has(band, '3/3')).toBe(true)
  await clock.advance(20_000)
  expect(await has(band, '3/3')).toBe(false)
  await item('D', 'todo')
  expect(await has(band, exactly('plan: D'))).toBe(true)
  expect(await has(band, '0/1')).toBe(true)
  // unfinished: it grows, however long it takes
  await clock.advance(600_000)
  await item('E', 'doing')
  expect(await has(band, '0/2')).toBe(true)

  // the same item again is no new task
  await item('F', 'done', 'solo')
  await clock.advance(20_000)
  await item('F', 'done', 'solo')
  expect(await has(band, exactly('solo: F'))).toBe(false)
  expect(await has(band, '1/1')).toBe(true)

  // TaskCreate: the same, for the built-in list
  await write({ tool: 'TodoWrite', todos: [] })
  await create('First')
  await write({ tool: 'TaskUpdate', taskId: '1', status: 'completed' })
  await create('Second')
  expect(await has(band, '1/2')).toBe(true)
  await write({ tool: 'TaskUpdate', taskId: '2', status: 'completed' })
  await clock.advance(20_000)
  await create('Third')
  expect(await has(band, '0/1')).toBe(true)
  expect(await has(band, exactly('Third'))).toBe(true)
  await create('Fourth')
  expect(await has(band, '0/2')).toBe(true)
})

test('a line that ran several checks says check failed, and only a line that passed all of them takes the red away', async ($, on) => {
  let outcome: object = {}
  const { mount, write } = setup($, on, e => (e.tool === 'Bash' ? { result: {}, text: 'x', ...outcome } : { result: {}, text: 'ok' }))
  const band = await mount()
  const run = (command: string, o: object) => ((outcome = o), write({ tool: 'Bash', command }))
  await write({ tool: 'TodoWrite', todos: [todo('Write tests', 'in_progress')] })

  await run('npm run build && npm test', failedRun)
  expect(await has(band, 'check failed')).toBe(true)
  expect(await has(band, 'npm test failed')).toBe(false)
  // one of the two passing alone says nothing about the other
  await run('npm test', {})
  expect(await has(band, 'check failed')).toBe(true)
  await run('npm run build && npm test', {})
  expect(await has(band, '✕')).toBe(false)

  // a single check keeps its name, and a later line that passed it among others takes it away
  await run('npm test', failedRun)
  expect(await has(band, 'npm test failed')).toBe(true)
  await run('cd app && npm run build && npm test', {})
  expect(await has(band, '✕')).toBe(false)
})

test('a TaskUpdate that the tool answered with success false changes nothing', async ($, on) => {
  let id = 0
  const { mount, write } = setup($, on, e => ({
    result: e.tool === 'TaskCreate' ? { task: { id: String(++id) } } : e.tool === 'TaskUpdate' ? { success: e.taskId === '2', error: 'nope' } : {},
    text: 'ok',
  }))
  const band = await mount()
  await write({ tool: 'TaskCreate', subject: 'Write tests', description: '', activeForm: '' })
  await write({ tool: 'TaskCreate', subject: 'Ship it', description: '', activeForm: '' })
  expect(await has(band, '0/2')).toBe(true)
  // the tool refused this update: the task stays as it was
  await write({ tool: 'TaskUpdate', taskId: '1', status: 'completed' })
  expect(await has(band, '0/2')).toBe(true)
  // and accepted this one
  await write({ tool: 'TaskUpdate', taskId: '2', status: 'completed' })
  expect(await has(band, '1/2')).toBe(true)
})
