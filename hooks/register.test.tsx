import { test, expect, mock } from 'claude-code/testing'

import { answerOk, answering, call, engine, failedRun, has, mountBand, runCommand, todo, todos, WORK_STATE } from './test-support'
import type { TestEngine } from './test-support'

const surfaces = ['terminal', 'desktop'] as const

for (const surface of surfaces) {
  test(`${surface}: a todo list is one line, the plugins beneath keep drawing, a finished list goes away`, async ($, on) => {
    const clock = mock.clock(on)
    engine(on)
    answerOk(on)

    const band = await mountBand($, surface)

    // Nothing to show: only what the engine draws.
    expect(await band.find({ text: 'engine' })).toBeDefined()
    expect(await band.find({ text: /\d\/\d/ })).toBeUndefined()

    await call($, {
      tool: 'TodoWrite',
      todos: [
        { content: 'Read the code', status: 'completed', activeForm: 'Reading' },
        { content: 'Write tests', status: 'in_progress', activeForm: 'Writing' },
        { content: 'Ship it', status: 'pending', activeForm: 'Shipping' },
      ],
    })

    expect(await band.find({ text: 'engine' })).toBeDefined()
    expect(await band.find({ text: 'Write tests' })).toBeDefined()
    expect(await band.find({ text: '1/3' })).toBeDefined()
    expect(await band.find({ text: /33%/ })).toBeDefined()

    await call($, {
      tool: 'TodoWrite',
      todos: [
        { content: 'Read the code', status: 'completed', activeForm: 'Reading' },
        { content: 'Write tests', status: 'completed', activeForm: 'Writing' },
        { content: 'Ship it', status: 'completed', activeForm: 'Shipping' },
      ],
    })

    expect(await band.find({ text: 'Done' })).toBeDefined()
    expect(await band.find({ text: '3/3' })).toBeDefined()

    await clock.advance(21_000)

    expect(await band.find({ text: 'engine' })).toBeDefined()
    expect(await band.find({ text: '3/3' })).toBeUndefined()
    // A band drawn later, as after a reload that dropped the timer, does not show it either.
    const later = await mountBand($, surface)
    expect(await later.find({ text: '3/3' })).toBeUndefined()
  })
}

test('work_state_write items make a list named after the list, a call without task is ignored', async ($, on) => {
  mock.clock(on)
  engine(on)
  answerOk(on)
  const band = await mountBand($, 'terminal')
  const write = (fields: Record<string, string>) => call($, { tool: 'mcp__plugin_claude-mem_mcp-search__work_state_write', list: 'release', fields })

  await write({ status: 'doing' })
  expect(await band.find({ text: /\d\/\d/ })).toBeUndefined()

  await write({ task: 'Tag it', status: 'doing' })
  await write({ task: 'Publish', status: 'todo' })
  expect(await band.find({ text: 'release: Tag it' })).toBeDefined()
  expect(await band.find({ text: '0/2' })).toBeDefined()

  await write({ task: 'Tag it', status: 'done' })
  expect(await band.find({ text: '1/2' })).toBeDefined()
})

test('a subagent, a failed call and a survey leave the line alone', async ($, on) => {
  mock.clock(on)
  engine(on)
  let isError = false
  answering(on, () => ({ result: {}, text: 'ok', ...(isError && failedRun) }))
  const band = await mountBand($, 'terminal')
  const todos = [{ content: 'One', status: 'pending', activeForm: 'One' }]

  await call($, { tool: 'TodoWrite', todos, agentId: 'a1' })
  expect(await band.find({ text: /\d\/\d/ })).toBeUndefined()

  isError = true
  await call($, { tool: 'TodoWrite', todos })
  expect(await band.find({ text: /\d\/\d/ })).toBeUndefined()

  isError = false
  await call($, { tool: 'TodoWrite', todos })
  expect(await band.find({ text: '0/1' })).toBeDefined()

  const survey = await mountBand($, 'terminal', { hasSurvey: true })
  expect(await survey.find({ text: '0/1' })).toBeUndefined()
  expect(await survey.find({ text: 'engine' })).toBeDefined()
})

test('the bar takes a share of the width, within its limits, and the row never drops below the minimum', async ($, on) => {
  mock.clock(on)
  engine(on)
  answerOk(on)
  const bar = async (bodyColumns: number) => {
    const band = await mountBand($, 'terminal', { bodyColumns })
    return (await band.find({ key: 'bar' }))?.text.length
  }
  await call($, { tool: 'TodoWrite', todos: [todo('Write tests', 'in_progress'), todo('Ship it', 'pending')] })

  const wide = await bar(200)
  const medium = await bar(80)
  const narrow = await bar(40)
  expect(wide).toBe(60)
  expect(medium).toBe(32)
  expect(narrow).toBeGreaterThanOrEqual(10)
  expect(narrow).toBeLessThan(medium!)
})

test('a question turns the line yellow until it is answered, a subagent or a finished list never waits', async ($, on) => {
  mock.clock(on)
  engine(on)
  let answer: (() => void) | undefined
  answering(on, async e => {
    if (e.tool === 'AskUserQuestion' || e.tool === 'ExitPlanMode') await new Promise<void>(resolve => (answer = resolve))
    return { result: {}, text: 'ok' }
  })
  const band = await mountBand($, 'terminal')
  const waiting = async () => (await band.find({ text: 'needs you' })) !== undefined
  const ask = (tool: string, extra: object = {}) => call($, { tool, questions: [], ...extra })

  await call($, { tool: 'TodoWrite', todos: [todo('Write tests', 'in_progress'), todo('Ship it', 'pending')] })
  expect(await waiting()).toBe(false)

  for (const tool of ['AskUserQuestion', 'ExitPlanMode']) {
    const pending = ask(tool)
    await Promise.resolve()
    expect(await waiting()).toBe(true)
    answer?.()
    await pending
    expect(await waiting()).toBe(false)
  }

  // A subagent's question goes to Claude, not to the person.
  const sub = ask('AskUserQuestion', { agentId: 'a1' })
  await Promise.resolve()
  expect(await waiting()).toBe(false)
  answer?.()
  await sub

  // A finished list does not wait.
  await call($, { tool: 'TodoWrite', todos: [todo('Write tests', 'completed')] })
  const done = ask('AskUserQuestion')
  await Promise.resolve()
  expect(await waiting()).toBe(false)
  answer?.()
  await done
})

test('a failing test or build command turns the line red, until it passes or a task moves on; other commands never count', async ($, on) => {
  mock.clock(on)
  engine(on)
  let exits = new Set<string>()
  answering(on, e => ({ result: {}, text: 'ok', ...(e.tool === 'Bash' && exits.has(String(e.command)) && failedRun) }))
  const band = await mountBand($, 'terminal')
  const run = (command: string, extra: object = {}) => call($, { tool: 'Bash', command, ...extra })
  const failed = async (check: string) => (await band.find({ text: `${check} failed` })) !== undefined
  const list = (...statuses: string[]) => call($, { tool: 'TodoWrite', todos: statuses.map((s, i) => todo(`Step ${i}`, s)) })

  await list('in_progress', 'pending')
  expect(await band.find({ text: '✕' })).toBeUndefined()

  // A failing command that is no check does not count, nor does a failing check in a subagent.
  exits = new Set(['grep nothing file', 'cd app && npm test -- --watch=false', 'pytest -x'])
  await run('grep nothing file')
  await run('pytest -x', { agentId: 'a1' })
  expect(await band.find({ text: '✕' })).toBeUndefined()

  // A failing check turns the line red and names the check.
  await run('cd app && npm test -- --watch=false')
  expect(await band.find({ text: '✕' })).toBeDefined()
  expect(await failed('npm test')).toBe(true)

  // Another check passing does not clear it; the same check passing, with other arguments, does.
  await run('npm run build')
  expect(await failed('npm test')).toBe(true)
  await run('npm test -- --coverage')
  expect(await failed('npm test')).toBe(false)
  expect(await band.find({ text: '✕' })).toBeUndefined()

  // A task moving on clears it, a list sent again unchanged does not.
  await run('cd app && npm test -- --watch=false')
  expect(await failed('npm test')).toBe(true)
  await list('in_progress', 'pending')
  expect(await failed('npm test')).toBe(true)
  await list('done', 'in_progress')
  expect(await failed('npm test')).toBe(false)

  // A pytest failure is named too, and a finished list is never red.
  await run('pytest -x')
  expect(await failed('pytest')).toBe(true)
  await list('done', 'done')
  expect(await band.find({ text: '✕' })).toBeUndefined()
  expect(await band.find({ text: '✓' })).toBeDefined()
})

test('a command that was interrupted, ran into its timeout or went to the background neither turns the line red nor clears it', async ($, on) => {
  mock.clock(on)
  engine(on)
  let answer: object = {}
  answering(on, e => ({ result: {}, text: 'ok', ...(e.tool === 'Bash' && answer) }))
  const band = await mountBand($, 'terminal')
  const run = (command: string, extra: object = {}) => call($, { tool: 'Bash', command, ...extra })
  const red = async () => (await band.find({ text: 'npm test failed' })) !== undefined
  await call($, { tool: 'TodoWrite', todos: [todo('Step 0', 'in_progress'), todo('Step 1', 'pending')] })

  // measured: the tool answers both with the error flag and the code of the signal that ended the command, then one more line
  answer = { isError: true, text: 'Exit code 137\n[Request interrupted by user for tool use]' }
  await run('npm test')
  expect(await red()).toBe(false)
  answer = { isError: true, text: 'Exit code 143\nCommand timed out after 1s' }
  await run('npm test', { timeout: 1000 })
  expect(await red()).toBe(false)

  // a real failure counts, also when its output names a timeout
  answer = { isError: true, text: 'Exit code 1\nrun\nCommand timed out after 5s in a test' }
  await run('npm test')
  expect(await red()).toBe(true)

  // started in the background: answered at once, without the error flag, before it has run (measured). The red stays.
  answer = { text: 'Command running in background with ID: b1', result: { backgroundTaskId: 'b1' } }
  await run('npm test')
  expect(await red()).toBe(true)
  answer = {}
  await run('npm test', { run_in_background: true })
  expect(await red()).toBe(true)

  // a run that finished with 0 clears it
  await run('npm test')
  expect(await red()).toBe(false)
})

test('a finished list is not turned red by a check that fails after it', async ($, on) => {
  mock.clock(on)
  engine(on)
  answering(on, e => ({ result: {}, text: 'ok', ...(e.tool === 'Bash' && failedRun) }))
  const band = await mountBand($, 'terminal')
  await call($, { tool: 'TodoWrite', todos: todos(2, 2) })
  expect(await band.find({ text: 'Done' })).toBeDefined()

  await call($, { tool: 'Bash', command: 'npm test' })

  expect(await band.find({ text: '✕' })).toBeUndefined()
  expect(await band.find({ text: 'npm test failed' })).toBeUndefined()
  expect(await band.find({ text: '✓' })).toBeDefined()
  expect(await band.find({ text: 'Done' })).toBeDefined()
})

// [command, the check it is named by in the line]
const CHECKS: [string, string][] = [
  ['npm test', 'npm test'],
  ['pnpm run lint', 'pnpm run lint'],
  ['yarn build', 'yarn build'],
  ['bun test --watch', 'bun test'],
  ['npm run typecheck', 'npm run typecheck'],
  ['pytest -x tests/', 'pytest'],
  ['python3 -m pytest', 'python3 -m pytest'],
  ['npx vitest run', 'npx vitest'],
  ['jest --ci', 'jest'],
  ['tsc --noEmit', 'tsc'],
  ['eslint src', 'eslint'],
  ['ruff check .', 'ruff'],
  ['mypy pkg', 'mypy'],
  ['rspec spec/models', 'rspec'],
  ['bundle exec rspec', 'rspec'],
  ['vendor/bin/phpunit', 'phpunit'],
  ['just test', 'just test'],
  ['task test', 'task test'],
  ['deno test --allow-read', 'deno test'],
  ['cargo test', 'cargo test'],
  ['cargo clippy', 'cargo clippy'],
  ['go test ./...', 'go test'],
  ['mvn verify', 'mvn verify'],
  ['dotnet test', 'dotnet test'],
  ['./gradlew test', 'gradlew test'],
  ['./gradlew build --info', 'gradlew build'],
  ['./gradlew --no-daemon', 'gradlew'],
  ['make test', 'make test'],
  ['claude plugin validate .', 'claude plugin validate'],
]

const NOT_CHECKS = ['git status', 'cat tasks.md', 'taskset -c 0 ls', 'just dance', 'task list', 'go run main.go', 'cargo run', 'ls -la', 'grep -rn needle src']

test('every command of the table is a check named as expected, and the other commands are none', async ($, on) => {
  mock.clock(on)
  engine(on)
  const failing = new Set<string>()
  answering(on, e => ({ result: {}, text: 'ok', ...(e.tool === 'Bash' && failing.has(String(e.command)) && failedRun) }))
  const band = await mountBand($, 'terminal')
  const run = (command: string) => call($, { tool: 'Bash', command })
  await call($, { tool: 'TodoWrite', todos: [todo('Write tests', 'in_progress'), todo('Ship it', 'pending')] })

  for (const [command, check] of CHECKS) {
    failing.add(command)
    await run(command)
    expect(await band.find({ text: `${check} failed` }), `${command} fails as ${check}`).toBeDefined()
    // The same command passing again clears it.
    failing.delete(command)
    await run(command)
    expect(await band.find({ text: '✕' }), `${command} passes again`).toBeUndefined()
  }

  for (const command of NOT_CHECKS) {
    failing.add(command)
    await run(command)
    expect(await band.find({ text: '✕' }), `${command} is no check`).toBeUndefined()
  }
})

test('the line is dismissed by a button where there is a click, and /task-line hides and shows it', async ($, on) => {
  mock.clock(on)
  engine(on)
  answerOk(on)
  const terminal = await mountBand($, 'terminal')
  const desktop = await mountBand($, 'desktop')
  const shown = async (band: { find: (query: { text: string }) => Promise<unknown> }) => (await band.find({ text: '0/2' })) !== undefined
  const list = () => call($, { tool: 'TodoWrite', todos: [todo('Write tests', 'in_progress'), todo('Ship it', 'pending')] })

  await list()
  // A terminal band has no click, so no button either.
  expect(await terminal.find({ key: 'dismiss:Tasks' })).toBeUndefined()
  expect(await desktop.find({ key: 'dismiss:Tasks' })).toBeDefined()

  await runCommand($, 'task-line')
  expect(await shown(terminal)).toBe(false)
  expect(await shown(desktop)).toBe(false)
  expect(await terminal.find({ text: 'engine' })).toBeDefined()
  await runCommand($, 'task-line')
  expect(await shown(terminal)).toBe(true)
  expect(await shown(desktop)).toBe(true)

  await desktop.press({ key: 'dismiss:Tasks' })
  expect(await shown(desktop)).toBe(false)
  expect(await desktop.find({ text: 'engine' })).toBeDefined()
  // New activity on the list brings it back.
  await list()
  expect(await shown(desktop)).toBe(true)
})

test('two questions at once keep the line yellow until both are answered', async ($, on) => {
  mock.clock(on)
  engine(on)
  const answers: (() => void)[] = []
  answering(on, async e => {
    if (e.tool === 'AskUserQuestion') await new Promise<void>(resolve => answers.push(resolve))
    return { result: {}, text: 'ok' }
  })
  const band = await mountBand($, 'terminal')
  const waiting = async () => (await band.find({ text: 'needs you' })) !== undefined
  await call($, { tool: 'TodoWrite', todos: [todo('Write tests', 'in_progress'), todo('Ship it', 'pending')] })

  const first = call($, { tool: 'AskUserQuestion', questions: [] })
  const second = call($, { tool: 'AskUserQuestion', questions: [] })
  await Promise.resolve()
  expect(await waiting()).toBe(true)
  answers[0]?.()
  await first
  expect(await waiting()).toBe(true)
  answers[1]?.()
  await second
  expect(await waiting()).toBe(false)
})

test('a call with odd input is answered as the tool answered it (the guard `safely` is not reached by any test)', async ($, on) => {
  mock.clock(on)
  engine(on)
  answerOk(on)
  // The test kit hands over plain data only, so no input makes the line's own work throw: these two calls show that odd shapes pass. The
  // guard (`safely`) stays for the host refusing a state write (seen in another mod's debug log: `state.set: denied`), which the kit
  // cannot simulate; no test reaches it.
  const malformed = await call($, { tool: 'TodoWrite', todos: [null] })
  expect(malformed.text).toBe('ok')
  const odd = await call($, { tool: 'mcp__plugin_claude-mem_mcp-search__work_state_write', list: {}, fields: { task: {} } })
  expect(odd.text).toBe('ok')
})

test('a call that was refused draws nothing, whichever tool made the list', async ($, on) => {
  mock.clock(on)
  engine(on)
  answering(on, () => ({ deny: 'no' }))
  const band = await mountBand($, 'terminal')
  const shown = async () => (await band.find({ text: /\d\/\d/ })) !== undefined
  await call($, { tool: 'TodoWrite', todos: [todo('Write tests', 'in_progress')] })
  await call($, { tool: 'TaskCreate', subject: 'Write tests', description: '', activeForm: '' })
  await call($, { tool: 'mcp__plugin_claude-mem_mcp-search__work_state_write', list: 'plan', fields: { task: 'A', status: 'doing' } })
  expect(await shown()).toBe(false)
})

test('a question to you shows yellow while a check has failed, and the red comes back after the answer', async ($, on) => {
  mock.clock(on)
  engine(on)
  const answers: (() => void)[] = []
  answering(on, async e => {
    if (e.tool === 'AskUserQuestion') await new Promise<void>(resolve => answers.push(resolve))
    return { result: {}, ...(e.tool === 'Bash' ? failedRun : { text: 'ok' }) }
  })
  const band = await mountBand($, 'terminal')
  const has = async (text: string) => (await band.find({ text })) !== undefined
  await call($, { tool: 'TodoWrite', todos: [todo('Write tests', 'in_progress')] })
  await call($, { tool: 'Bash', command: 'npm test' })
  expect(await has('✕')).toBe(true)

  const asked = call($, { tool: 'AskUserQuestion', questions: [] })
  await Promise.resolve()
  expect(await has('needs you')).toBe(true)
  expect(await has('✕')).toBe(false)
  answers[0]?.()
  await asked
  expect(await has('✕')).toBe(true)
})

test('TaskCreate and TaskUpdate make, move and drop the items of one list', async ($, on) => {
  mock.clock(on)
  engine(on)
  let id = 6
  answering(on, e => ({ result: e.tool === 'TaskCreate' ? { task: { id: String(++id) } } : {}, text: 'ok' }))
  const band = await mountBand($, 'terminal')
  const has = async (text: string | RegExp) => (await band.find({ text })) !== undefined

  await call($, { tool: 'TaskCreate', subject: 'Write tests', description: '', activeForm: '' })
  await call($, { tool: 'TaskCreate', subject: 'Ship it', description: '', activeForm: '' })
  expect(await has('0/2')).toBe(true)
  expect(await has('Write tests')).toBe(true)

  await call($, { tool: 'TaskUpdate', taskId: '7', status: 'in_progress' })
  await call($, { tool: 'TaskUpdate', taskId: '7', status: 'completed' })
  expect(await has('1/2')).toBe(true)
  expect(await has('Ship it')).toBe(true)

  await call($, { tool: 'TaskUpdate', taskId: '8', status: 'deleted' })
  expect(await has('1/1')).toBe(true)
  expect(await has('✓')).toBe(true)
})

test('the button of one list hides that list and leaves the other', async ($, on) => {
  mock.clock(on)
  engine(on)
  answerOk(on)
  const band = await mountBand($, 'desktop')
  const write = (list: string, task: string) =>
    call($, { tool: 'mcp__plugin_claude-mem_mcp-search__work_state_write', list, fields: { task, status: 'doing' } })
  const has = async (text: string) => (await band.find({ text })) !== undefined

  await write('alpha', 'First job')
  await write('beta', 'Second job')
  expect(await has('alpha: First job'), 'step 1: alpha: First job').toBe(true)
  expect(await has('beta: Second job'), 'step 2: beta: Second job').toBe(true)

  await band.press({ key: 'dismiss:alpha' })
  expect(await has('alpha: First job'), 'step 3: alpha: First job').toBe(false)
  expect(await has('beta: Second job'), 'step 4: beta: Second job').toBe(true)

  // The other way round: alpha comes back with new activity, then beta is dismissed.
  await write('alpha', 'Third job')
  expect(await has('alpha: First job'), 'step 5: alpha is back').toBe(true)
  await band.press({ key: 'dismiss:beta' })
  expect(await has('beta: Second job'), 'step 6: beta: Second job').toBe(false)
  expect(await has('alpha: First job'), 'step 7: alpha stays').toBe(true)
})

test('wide characters count as two cells, so the bar shrinks to keep the row inside the width', async ($, on) => {
  mock.clock(on)
  engine(on)
  answerOk(on)
  const bar = async (subject: string) => {
    const band = await mountBand($, 'terminal', { bodyColumns: 40 })
    await call($, { tool: 'TodoWrite', todos: [todo(subject, 'in_progress')] })
    return (await band.find({ key: 'bar' }))?.text.length
  }
  // Seven characters either way; the wide ones take 14 cells.
  expect(await bar('Write t')).toBe(16)
  expect(await bar('日本語のタスク')).toBe(12)
})

test('where the row has a dismiss button, the bar leaves its two cells', async ($, on) => {
  mock.clock(on)
  engine(on)
  answerOk(on)
  const bar = async (surface: (typeof surfaces)[number]) => {
    const band = await mountBand($, surface, { bodyColumns: 40 })
    await call($, { tool: 'TodoWrite', todos: [todo('x'.repeat(40), 'in_progress')] })
    return (await band.find({ key: 'bar' }))?.text.length
  }
  // A terminal band has no button, the desktop app has one: the label takes 14 of 40 columns either way, the bar gets what is left.
  expect(await bar('terminal')).toBe(12)
  expect(await bar('desktop')).toBe(10)
})

test('a finished list that has faded is forgotten, the next item of that list starts a new one', async ($, on) => {
  const clock = mock.clock(on)
  engine(on)
  answerOk(on)
  const band = await mountBand($, 'terminal')
  const write = (list: string, task: string, status: string) =>
    call($, { tool: 'mcp__plugin_claude-mem_mcp-search__work_state_write', list, fields: { task, status } })
  const has = async (text: string) => (await band.find({ text })) !== undefined

  await write('release', 'Tag it', 'done')
  expect(await has('✓')).toBe(true)
  await clock.advance(21_000)
  await write('docs', 'Check links', 'doing')
  await write('release', 'Publish', 'todo')
  expect(await has('release: Publish')).toBe(true)
  expect(await has('0/1')).toBe(true)
  expect(await has('1/2')).toBe(false)
})

// One item of a claude-mem list, as the tool call says it.
const item = ($: TestEngine, list: string, task: string, status: string) => call($, { tool: WORK_STATE, list, fields: { task, status } })

test('lingerSeconds sets how long a finished list stays', { options: { lingerSeconds: 5 } }, async ($, on) => {
  const clock = mock.clock(on)
  engine(on)
  answerOk(on)
  const band = await mountBand($, 'terminal')

  await call($, { tool: 'TodoWrite', todos: todos(3, 3) })
  await clock.advance(4_000)
  expect(await has(band, '3/3')).toBe(true)
  await clock.advance(2_000)
  expect(await has(band, '3/3')).toBe(false)
})

test('a shorter lingerSeconds also ends the time a new item joins the finished list', { options: { lingerSeconds: 5 } }, async ($, on) => {
  const clock = mock.clock(on)
  engine(on)
  answerOk(on)
  const band = await mountBand($, 'terminal')

  await item($, 'release', 'Tag it', 'done')
  await clock.advance(6_000)
  await item($, 'docs', 'Check links', 'doing')
  await item($, 'release', 'Publish', 'todo')
  expect(await has(band, 'release: Publish')).toBe(true)
  expect(await has(band, '0/1')).toBe(true)
  expect(await has(band, '1/2')).toBe(false)
})

test('without settings a finished list stays 15 seconds and a new item joins it for as long', async ($, on) => {
  const clock = mock.clock(on)
  engine(on)
  answerOk(on)
  const band = await mountBand($, 'terminal')

  // This number is typed on purpose: the test falls when the default in plugin.json changes, and so asks for a CHANGELOG entry.
  await item($, 'release', 'Tag it', 'done')
  await clock.advance(14_999)
  expect(await has(band, '1/1')).toBe(true)
  await item($, 'release', 'Publish', 'todo')
  expect(await has(band, '1/2')).toBe(true)
  await item($, 'release', 'Publish', 'done')
  await clock.advance(15_000)
  expect(await has(band, '2/2')).toBe(false)
  await item($, 'release', 'Ship', 'todo')
  expect(await has(band, '0/1')).toBe(true)
})

test('a longer lingerSeconds keeps the finished list shown, also in a band drawn later', { options: { lingerSeconds: 30 } }, async ($, on) => {
  const clock = mock.clock(on)
  engine(on)
  answerOk(on)
  const band = await mountBand($, 'terminal')

  await call($, { tool: 'TodoWrite', todos: todos(3, 3) })
  await clock.advance(25_000)
  // The test kit does not draw a band again after the clock moved: a band mounted now is the one that tells.
  expect(await has(await mountBand($, 'terminal'), '3/3')).toBe(true)
  await clock.advance(5_000)
  expect(await has(band, '3/3')).toBe(false)
})

test('joinSeconds sets how long a new item still joins a finished list that is shown', { options: { lingerSeconds: 100, joinSeconds: 10 } }, async ($, on) => {
  const clock = mock.clock(on)
  engine(on)
  answerOk(on)
  const band = await mountBand($, 'terminal')

  await item($, 'release', 'Tag it', 'done')
  await clock.advance(5_000)
  await item($, 'release', 'Publish', 'todo')
  expect(await has(band, '1/2')).toBe(true)
  await item($, 'release', 'Publish', 'done')
  await clock.advance(11_000)
  // still shown (100 s), but no longer inside the 10 s to join
  expect(await has(band, '2/2')).toBe(true)
  await item($, 'release', 'Ship', 'todo')
  expect(await has(band, '0/1')).toBe(true)
  expect(await has(band, '2/3')).toBe(false)
})

test('another finished list stays as long as it is shown, however short the join time', { options: { lingerSeconds: 100, joinSeconds: 10 } }, async ($, on) => {
  const clock = mock.clock(on)
  engine(on)
  answerOk(on)
  const band = await mountBand($, 'terminal')

  await item($, 'release', 'Tag it', 'done')
  await clock.advance(30_000)
  await item($, 'docs', 'Check links', 'doing')
  expect(await has(band, '✓')).toBe(true)
  expect(await has(band, 'docs: Check links')).toBe(true)
})

test('lingerSeconds of 0 never shows a finished list, a running one stays', { options: { lingerSeconds: 0 } }, async ($, on) => {
  mock.clock(on)
  engine(on)
  answerOk(on)
  const band = await mountBand($, 'terminal')

  await call($, { tool: 'TodoWrite', todos: todos(3, 1) })
  expect(await has(band, '1/3')).toBe(true)
  await call($, { tool: 'TodoWrite', todos: todos(3, 3) })
  expect(await has(band, '3/3')).toBe(false)
  expect(await has(band, 'engine')).toBe(true)
})

test('the settings reach TaskCreate and TaskUpdate, the built-in todo tools', { options: { lingerSeconds: 60, joinSeconds: 60 } }, async ($, on) => {
  const clock = mock.clock(on)
  engine(on)
  let id = 0
  answering(on, e => ({ result: e.tool === 'TaskCreate' ? { task: { id: String(++id) } } : {}, text: 'ok' }))
  const band = await mountBand($, 'terminal')
  const create = (subject: string) => call($, { tool: 'TaskCreate', subject, description: '', activeForm: '' })

  await create('First')
  await call($, { tool: 'TaskUpdate', taskId: '1', status: 'completed' })
  // the timer of a finished list runs for lingerSeconds, not for the default
  await clock.advance(20_000)
  expect(await has(band, '1/1')).toBe(true)
  // a new task joins for joinSeconds, not for the default
  await create('Second')
  expect(await has(band, '1/2')).toBe(true)
  await call($, { tool: 'TaskUpdate', taskId: '2', status: 'completed' })
  await clock.advance(16_000)
  expect(await has(band, '2/2')).toBe(true)
})
