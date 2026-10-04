import { test, expect } from 'claude-code/testing'

import type { Task, TaskList } from '../types'
import { cellsOf, fit, plain, width } from './cells'
import { layout, progressOf } from './layout'
import { put } from './lists'
import { register } from './register'
import { checkOf, checksOf, commandsOf, failureKey, failureLabel, hasPassed, ranAndFailed } from './shell'

const cp = (code: number) => String.fromCodePoint(code)

test('cellsOf: the first and the last code point on each side of every wide range', async () => {
  // [code point, cells]
  const table: [number, number][] = [
    [0x41, 1],
    [0x7e, 1],
    // emoji below the wide blocks: two cells inside a range, one cell on each side of it
    [0x2319, 1],
    [0x231a, 2],
    [0x231b, 2],
    [0x231c, 1],
    [0x2704, 1],
    [0x2705, 2],
    [0x2706, 1],
    [0x2b4f, 1],
    [0x2b50, 2],
    [0x2b51, 1],
    [0x1f004, 2],
    [0x1f005, 1],
    [0xe4, 1],
    [0x20ac, 1],
    [0x2ff, 1],
    [0x300, 0],
    [0x36f, 0],
    [0x370, 1],
    [0x200c, 1],
    [0x200d, 0],
    [0x200e, 1],
    [0xfdff, 1],
    [0xfe00, 0],
    [0xfe0f, 0],
    [0xfe10, 1],
    [0x10ff, 1],
    [0x1100, 2],
    [0x115f, 2],
    [0x1160, 1],
    [0x2e7f, 1],
    [0x2e80, 2],
    [0xa4cf, 2],
    [0xa4d0, 1],
    [0xabff, 1],
    [0xac00, 2],
    [0xd7a3, 2],
    [0xd7a4, 1],
    [0xf8ff, 1],
    [0xf900, 2],
    [0xfaff, 2],
    [0xfb00, 1],
    [0xfe2f, 1],
    [0xfe30, 2],
    [0xfe6f, 2],
    [0xfe70, 1],
    [0xfeff, 1],
    [0xff00, 2],
    [0xff60, 2],
    [0xff61, 1],
    [0xffdf, 1],
    [0xffe0, 2],
    [0xffe6, 2],
    [0xffe7, 1],
    // the wide enclosed ideographs and squares between the emoji blocks (East Asian Width W), one cell on each side
    [0x1f1ff, 1],
    [0x1f200, 2],
    [0x1f202, 2],
    [0x1f203, 1],
    [0x1f20f, 1],
    [0x1f210, 2],
    [0x1f23b, 2],
    [0x1f23c, 1],
    [0x1f23f, 1],
    [0x1f240, 2],
    [0x1f248, 2],
    [0x1f249, 1],
    [0x1f24f, 1],
    [0x1f250, 2],
    [0x1f251, 2],
    [0x1f252, 1],
    [0x1f25f, 1],
    [0x1f260, 2],
    [0x1f265, 2],
    [0x1f266, 1],
    [0x1f2ff, 1],
    [0x1f300, 2],
    [0x1f600, 2],
    [0x1faff, 2],
    [0x1fb00, 1],
    [0x1ffff, 1],
    [0x20000, 2],
    [0x3fffd, 2],
    [0x3fffe, 1],
  ]
  for (const [code, cells] of table) expect(cellsOf(cp(code)), `U+${code.toString(16)}`).toBe(cells)
})

test('width: empty text, plain text, wide text, combining marks and mixes', async () => {
  expect(width('')).toBe(0)
  expect(width('abc')).toBe(3)
  expect(width('日本')).toBe(4)
  expect(width('a日')).toBe(3)
  expect(width('é')).toBe(1)
  expect(width('👍🏽')).toBe(4)
  expect(width('Ünïcödé')).toBe(7)
  expect(width(' ')).toBe(1)
})

test('fit: always exactly the asked cells, cut with an ellipsis, never splitting a wide character', async () => {
  expect(fit('abc', 0)).toBe('')
  expect(fit('abc', -3)).toBe('')
  expect(fit('', 0)).toBe('')
  expect(fit('', 3)).toBe('   ')
  expect(fit('abc', 3)).toBe('abc')
  expect(fit('abc', 5)).toBe('abc  ')
  expect(fit('abcd', 3)).toBe('ab…')
  expect(fit('abcdef', 1)).toBe('…')
  expect(fit('abcdef', 2)).toBe('a…')
  // The ellipsis takes a cell: a text one cell too long is cut, one that fits is not.
  expect(fit('abcd', 4)).toBe('abcd')
  expect(fit('abcde', 4)).toBe('abc…')
  // A wide character that would cross the border is left out and its cell padded.
  expect(fit('日本語', 4)).toBe('日… ')
  expect(fit('日本語', 5)).toBe('日本…')
  expect(fit('日本語', 6)).toBe('日本語')
  expect(fit('日本語', 7)).toBe('日本語 ')
  expect(fit('日本語', 1)).toBe('…')
  expect(fit('日本語', 2)).toBe('… ')
  for (const text of ['', 'a', 'abc', '日本語', 'a日b本c', '👍🏽 ok', 'ééé'])
    for (let cells = 0; cells <= 12; cells++) expect(width(fit(text, cells)), `${JSON.stringify(text)} in ${cells}`).toBe(cells)
})

test('progressOf: neither the bar nor the percent reaches the end early or stays empty once a task is done', async () => {
  // [done, total, bar, filled, percent]
  const table: [number, number, number, number, number][] = [
    [0, 5, 20, 0, 0],
    [1, 5, 20, 4, 20],
    [1, 2, 10, 5, 50],
    [1, 3, 10, 3, 33],
    [2, 3, 10, 7, 67],
    [5, 5, 20, 20, 100],
    [1, 1, 10, 10, 100],
    // one done in many: rounding would say 0, the bar shows one cell and the percent one
    [1, 200, 60, 1, 1],
    [1, 100, 10, 1, 1],
    // all but one done in many: rounding would say 100, the bar stops one cell short and the percent at 99
    [199, 200, 60, 59, 99],
    [99, 100, 10, 9, 99],
    [995, 1000, 60, 59, 99],
    // lists that make no sense are empty and never throw
    [0, 0, 20, 0, 0],
    [3, 0, 20, 0, 0],
    [-1, 5, 20, 0, 0],
    // more done than there are tasks is finished
    [6, 5, 20, 20, 100],
  ]
  for (const [done, total, bar, filled, percent] of table) expect(progressOf(done, total, bar), `${done}/${total} in ${bar}`).toEqual({ filled, percent })
})

const row = (label: string, done = 0, total = 2, note: string | null = null) => ({ name: label, glyph: '●', color: 'claude', label, done, total, note })

test('layout: the bar takes its share of the width within its limits, the label slot fits the longest label', async () => {
  const one = [row('Write tests')]
  // columns -> bar. Fixed part: margin 2 + glyph 1 + count 3 + percent 4 + gaps 4 = 14; label 11.
  const bars: [number, number][] = [
    [1000, 60],
    [200, 60],
    [150, 60],
    // the share (40%) reaches the maximum at 150 columns
    [149, 59],
    [148, 59],
    [100, 40],
    [80, 32],
    [60, 24],
    [50, 20],
    // the room left (columns - 14 - 11) becomes the limit below 42 columns
    [43, 17],
    [42, 16],
    [41, 16],
    [40, 15],
    [36, 11],
    [35, 10],
    // below that the minimum bar stays
    [34, 10],
    [30, 10],
    [10, 10],
    [1, 10],
    [0, 10],
    [-5, 10],
  ]
  for (const [columns, bar] of bars) expect(layout(one, columns).bar, `${columns} columns`).toBe(bar)
  // a width that is no number counts as the default of 100
  expect(layout(one, NaN).bar).toBe(40)
  expect(layout(one, Infinity).bar).toBe(40)
  expect(layout(one, -Infinity).bar).toBe(40)

  // the label slot: as long as the longest label, at least 8 cells, at most 35% of the width (but never below 8)
  expect(layout([row('Done')], 100).label).toBe(8)
  expect(layout([row('12345678')], 100).label).toBe(8)
  expect(layout([row('123456789')], 100).label).toBe(9)
  expect(layout([row('x'.repeat(35))], 100).label).toBe(35)
  expect(layout([row('x'.repeat(36))], 100).label).toBe(35)
  expect(layout([row('x'.repeat(500))], 100).label).toBe(35)
  // the label gives way to the floor of 4 cells when the row would not fit
  expect(layout([row('x'.repeat(500))], 20).label).toBe(4)
  expect(layout([row('x'.repeat(500))], 0).label).toBe(4)
  expect(layout([row('日本語のタスク')], 100).label).toBe(14)
  // the longest of several labels decides
  expect(layout([row('ab'), row('abcdefghijkl'), row('abc')], 100).label).toBe(12)
})

test('layout: a note and a longer count make room, so the bar gives way', async () => {
  const waiting = [row('Write tests', 0, 2, 'needs you')]
  // fixed 14 + note 9 + 1 = 24; label 11
  expect(layout(waiting, 100).bar).toBe(40)
  expect(layout(waiting, 60).bar).toBe(24)
  expect(layout(waiting, 46).bar).toBe(11)
  expect(layout(waiting, 45).bar).toBe(10)
  // the widest count of all rows counts: 10/12 has five cells where 1/2 has three
  const counts = [row('Write tests', 1, 2), row('Write tests', 10, 12)]
  expect(layout(counts, 40).bar).toBe(13)
  expect(layout([row('Write tests', 1, 2)], 40).bar).toBe(15)
  // the note of any row counts
  expect(layout([row('Write tests'), row('Write tests', 0, 2, 'npm test failed')], 100).bar).toBe(40)
  // fixed 14 + note 15 + 1 = 30; label 11; the room left is columns - 41
  const failed = [row('Write tests'), row('Write tests', 0, 2, 'npm test failed')]
  expect(layout(failed, 56).bar).toBe(15)
  expect(layout(failed, 57).bar).toBe(16)
  expect(layout(failed, 58).bar).toBe(17)
})

const list = (name: string, tasks: number, extra: Partial<TaskList> = {}): TaskList => ({
  name,
  tasks: Array.from({ length: tasks }, (_, i): Task => ({ id: `${name}${i}`, subject: `Task ${i}`, status: 'pending' })),
  doneAt: null,
  isHidden: false,
  ...extra,
})

test('put: the touched list moves to the end, an empty result drops it, faded finished lists are forgotten', async () => {
  const keep = (tasks: Task[]) => tasks
  // a new list is appended
  expect(put([], 'a', () => list('a', 1).tasks).map(l => l.name)).toEqual(['a'])
  expect(put([list('a', 1)], 'b', () => list('b', 1).tasks).map(l => l.name)).toEqual(['a', 'b'])
  // the touched list moves to the end, and starts visible and unfinished
  const moved = put([list('a', 1, { doneAt: 5 }), list('b', 1)], 'a', keep)
  expect(moved.map(l => l.name)).toEqual(['b', 'a'])
  expect(moved[1]).toMatchObject({ doneAt: null, isHidden: false })
  // the change sees the tasks held, none for a list that is not there
  let seen: unknown = 'unset'
  put([], 'a', tasks => ((seen = tasks), []))
  expect(seen).toEqual([])
  put([list('a', 2)], 'a', tasks => ((seen = tasks.length), tasks))
  expect(seen).toBe(2)
  // no tasks left: the list is gone, the others stay
  expect(put([list('a', 1), list('b', 1)], 'a', () => []).map(l => l.name)).toEqual(['b'])
  expect(put([], 'a', () => [])).toEqual([])
  // another list that is hidden and finished is dropped; hidden but unfinished (dismissed), or finished but not yet hidden, stay
  const dropped = put(
    [list('done', 1, { isHidden: true, doneAt: 1 }), list('dismissed', 1, { isHidden: true }), list('fresh', 1, { doneAt: 1 })],
    'x',
    () => list('x', 1).tasks,
  )
  expect(dropped.map(l => l.name)).toEqual(['dismissed', 'fresh', 'x'])
  // the touched list itself, hidden and finished, is over: a task that comes to its name starts a new list
  const back = put([list('a', 3, { isHidden: true, doneAt: 1 })], 'a', tasks => [...tasks, ...list('b', 1).tasks])
  expect(back).toHaveLength(1)
  expect(back[0]?.tasks).toHaveLength(1)
  expect(back[0]).toMatchObject({ isHidden: false, doneAt: null })
  // hidden but not finished (dismissed with the button) carries on
  expect(put([list('a', 3, { isHidden: true })], 'a', tasks => [...tasks, ...list('b', 1).tasks])[0]?.tasks).toHaveLength(4)
  // faded by age: finished 20000 ms before now and more are over, 19999 is still shown, no time known is not faded
  const finished = (doneAt: number | null) => [list('a', 3, { doneAt })]
  const grown = (all: TaskList[], now?: number) => put(all, 'a', tasks => [...tasks, ...list('b', 1).tasks], now)[0]?.tasks.length
  expect(grown(finished(1000), 20_999)).toBe(4)
  expect(grown(finished(1000), 21_000)).toBe(1)
  expect(grown(finished(1000), 21_001)).toBe(1)
  expect(grown(finished(1000))).toBe(4)
  expect(grown(finished(1000), Number.NaN)).toBe(4)
  expect(grown(finished(null), 1e12)).toBe(4)
  expect(grown(finished(0), 20_000)).toBe(1)
  // the same holds for the lists beside it
  expect(put([list('x', 1, { doneAt: 1000 }), list('y', 1, { doneAt: 1000 })], 'z', () => list('z', 1).tasks, 21_000).map(l => l.name)).toEqual(['z'])
  expect(put([list('x', 1, { doneAt: 1000 }), list('y', 1, { doneAt: 1000 })], 'z', () => list('z', 1).tasks, 20_999).map(l => l.name)).toEqual(['x', 'y', 'z'])
  // the list given is left as it was
  const before = [list('a', 1), list('b', 1)]
  const snapshot = JSON.stringify(before)
  put(before, 'a', () => [])
  expect(JSON.stringify(before)).toBe(snapshot)
})

test('checkOf: names the check, in lower case and with single spaces, and finds nothing in look-alikes', async () => {
  const found: [string, string][] = [
    ['npm test', 'npm test'],
    ['NPM TEST', 'npm test'],
    ['npm   test', 'npm test'],
    ['npm\ttest', 'npm test'],
    ['npm run test', 'npm run test'],
    ['npm run  build', 'npm run build'],
    ['cd app && npm test -- --watch=false', 'npm test'],
    ['npm test && npm run build', 'npm test'],
    ['  pytest', 'pytest'],
    ['pytest;', 'pytest'],
    ['(pytest)', 'pytest'],
    ['"pytest"', 'pytest'],
    ['make', 'make'],
    ['make test', 'make test'],
    ['make -j4 test', 'make test'],
    ['make -j4', 'make'],
    ['make clean test', 'make test'],
    ['./gradlew clean build', 'gradlew build'],
    ['./gradlew', 'gradlew'],
    ['make -j 4', 'make'],
    ['make test:unit', 'make test'],
    ['mvn test:unit', 'mvn test'],
    ['make -C src', 'make'],
    ['make -f Makefile', 'make'],
    ['make CC=gcc', 'make'],
    ['make -C build test', 'make test'],
    ['make -j 4 test', 'make test'],
    ['gradle -p app test', 'gradle test'],
    ['mvn clean verify', 'mvn verify'],
    ['mvn -q test', 'mvn test'],
    ['mvn -pl app test', 'mvn test'],
    ['./mvnw test', 'mvnw test'],
    ['npm --prefix app test', 'npm test'],
    ['pnpm -r test', 'pnpm test'],
    ['pnpm --filter x build', 'pnpm build'],
    ['yarn workspace a test', 'yarn test'],
    ['cargo +nightly test', 'cargo test'],
    ['./gradlew test', 'gradlew test'],
    ['gradle check', 'gradle check'],
    ['CLAUDE PLUGIN TEST .', 'claude plugin test'],
    ['npm run test:unit', 'npm run test'],
    ['node_modules/.bin/tsc', 'tsc'],
    ['./node_modules/.bin/eslint src', 'eslint'],
    ['vendor/bin/phpunit', 'phpunit'],
  ]
  for (const [command, check] of found) expect(checkOf(command), command).toBe(check)
  const none = [
    '',
    ' ',
    'ls',
    'npm',
    'npm install',
    'npm testing',
    'npm tests',
    'npm run tester',
    'echo pytesting',
    'mypytest',
    'unittest',
    'pytests',
    'tsconfig.json',
    'tscheck',
    'cat tsc.log',
    'makefile',
    'cmake',
    'remake',
    'go tests',
    'go run main.go',
    'goto test',
    'taskset -c 0 ls',
    'tasks test',
    'task list',
    'just dance',
    'justtest',
    'cat pytest.ini',
    'cat jest.config.js',
    'ls tsc/',
    'rm -rf pytest_cache/',
    'make-dist',
    'make deploy',
    'make install',
    'make -C build install',
    'mvn',
    'mvn -v',
    'make testing',
    'mvn -f test clean',
    'make -C test install',
    'make CC=gcc install',
    'gradle -p test bootRun',
    'npm --prefix test install',
    'pnpm --filter build add x',
    'mvn -pl test clean',
    './gradlew bootRun',
    'gradle clean',
    'cat tsc.log',
    'git commit -m test',
    'cargo run',
    'cargo tests',
    'dotnet run',
    'mvn clean',
    'deno run x.ts',
    'python3 -m http.server',
  ]
  for (const command of none) expect(checkOf(command), `"${command}"`).toBeNull()
})

test('layout: with a dismiss button the row is two cells wider, and what is drawn stays inside the width', async () => {
  const note = (text: string | null) => [row('Write tests'), row('Write tests', 0, 2, text)]
  // the button and the gap before it take 2 more cells: the note is shown from 46 columns instead of 44
  expect(layout(note('npm test failed'), 46, true).showNote).toBe(true)
  expect(layout(note('npm test failed'), 45, true).showNote).toBe(false)
  expect(layout(note('npm test failed'), 44).showNote).toBe(true)
  // seen on a screen of about 58 columns: label 18 and bar 10 drew 60 cells
  const wide = [row('Probe9: Wait for sleep'), row('Probe10: bidi esrever test', 2, 3, 'npm test failed')]
  const l = layout(wide, 58, true)
  expect(l.showNote).toBe(true)

  // the cells that are drawn: margin 2, glyph 1, label, bar, count, percent 4, the note and the button 1, one gap between every two
  const drawn = (rows: ReturnType<typeof row>[], columns: number, button: boolean) => {
    const out = layout(rows, columns, button)
    const count = Math.max(...rows.map(r => width(`${r.done}/${r.total}`)))
    const notes = out.showNote ? Math.max(0, ...rows.map(r => (r.note ? width(r.note) : 0))) : 0
    const parts = [1, out.label, out.bar, count, 4, ...(notes > 0 ? [notes] : []), ...(button ? [1] : [])]
    return 2 + parts.reduce((a, b) => a + b, 0) + parts.length - 1
  }
  expect(drawn(wide, 58, true)).toBeLessThanOrEqual(58)
  const sets = [note(null), note('npm test failed'), note('needs you'), wide]
  for (const rows of sets) {
    for (const button of [true, false]) {
      // from the width where label floor 4 and bar 10 fit, the drawn row stays inside the width
      for (let columns = 36; columns <= 300; columns++)
        expect(drawn(rows, columns, button), `${columns} columns, button ${button}`).toBeLessThanOrEqual(columns)
    }
  }
})

test('cellsOf: control characters take no cell, a space and a no-break space take one', async () => {
  const table: [number, number][] = [
    [0x00, 0],
    [0x07, 0],
    [0x09, 0],
    [0x0a, 0],
    [0x0d, 0],
    [0x1b, 0],
    [0x1f, 0],
    [0x20, 1],
    [0x7e, 1],
    [0x7f, 0],
    [0x80, 0],
    [0x9f, 0],
    [0xa0, 1],
  ]
  for (const [code, cells] of table) expect(cellsOf(cp(code)), `U+${code.toString(16)}`).toBe(cells)
})

test('plain: no escape sequence, control or invisible character survives, and the text is cut at its limit', async () => {
  const same: [unknown, string][] = [
    ['abc', 'abc'],
    ['', ''],
    [undefined, ''],
    [null, ''],
    [5, '5'],
    [true, 'true'],
    [[], ''],
    [{}, '[object Object]'],
    ['  a  ', 'a'],
    ['a   b', 'a b'],
    ['a \u00a0 b', 'a b'],
    // escape sequences go before the control characters do, so no `[31m` is left over
    ['\u001b[31mred\u001b[0m', 'red'],
    ['\u001b[1;38;5;196mx', 'x'],
    ['\u001b[?25lx\u001b[?25h', 'x'],
    ['\u001b]0;title\u0007text', 'text'],
    ['\u001b]8;;http://x\u001b\\link\u001b]8;;\u001b\\', 'link'],
    ['a\u001bcb', 'acb'],
    ['\u001b', ''],
    ['x\u001b', 'x'],
    // controls become one space, invisible characters vanish
    ['a\nb\tc\rd', 'a b c d'],
    ['\u0000a\u0007b', 'a b'],
    ['a\u0085b\u2028c\u2029d', 'a b c d'],
    ['a\u007fb', 'a b'],
    ['a\u202eb\u202cc', 'abc'],
    ['a\u2066b\u2069c', 'abc'],
    ['a\u200bb\u200ec\u200fd', 'abcd'],
    ['a\ufeffb', 'ab'],
    ['a\u061cb', 'ab'],
    // the private-use planes (the Kitty placeholder U+10EEEE), the tag characters and the interlinear marks
    ['a\u{10eeee}b', 'ab'],
    ['a\u{f0000}b\u{10ffff}c', 'abc'],
    ['a\u{e0001}b\u{e007f}c', 'abc'],
    ['a\ufff9b\ufffbc', 'abc'],
    // what stays: the private use area of the BMP (icon fonts), the zero width joiner of an emoji, the variation selector
    ['a\ue000b', 'a\ue000b'],
    ['👨\u200d👩', '👨\u200d👩'],
    ['❤\ufe0f', '❤\ufe0f'],
    ['日本語', '日本語'],
    ['Ünïcödé', 'Ünïcödé'],
  ]
  for (const [input, out] of same) expect(plain(input), JSON.stringify(input)).toBe(out)
  expect(() =>
    plain({
      toString() {
        throw new Error('boom')
      },
    }),
  ).toThrow()

  // the limit counts code points, never splits one, and is 200 unless given
  expect(plain('x'.repeat(200))).toBe('x'.repeat(200))
  expect(plain('x'.repeat(201))).toBe('x'.repeat(199) + '…')
  expect([...plain('😀'.repeat(300))]).toHaveLength(200)
  expect(plain('😀'.repeat(300))).toBe('😀'.repeat(199) + '…')
  expect(plain('abcdef', 6)).toBe('abcdef')
  expect(plain('abcdefg', 6)).toBe('abcde…')
  expect(plain('abcdef', 1)).toBe('…')
  expect(plain('abcdef', 0)).toBe('')
  expect(plain('abcdef', -3)).toBe('')
  expect(plain('', 0)).toBe('')
  // what is removed is not counted: 150 escape sequences around 10 letters stay 10 letters
  expect(plain('\u001b[31m'.repeat(150) + 'x'.repeat(10), 20)).toBe('x'.repeat(10))
})

test('commandsOf: words as a shell reads them, a separator outside quotes ends a command', async () => {
  const table: [string, string[][]][] = [
    ['', []],
    [' ', []],
    [';;', []],
    ['a', [['a']]],
    ['a b  c', [['a', 'b', 'c']]],
    ['echo "a b" c', [['echo', 'a b', 'c']]],
    ["echo 'a;b' c", [['echo', 'a;b', 'c']]],
    ['echo "a && b"', [['echo', 'a && b']]],
    ['a && b || c; d | e & f', [['a'], ['b'], ['c'], ['d'], ['e'], ['f']]],
    ['a\nb', [['a'], ['b']]],
    ['(a; b)', [['a'], ['b']]],
    ['x `a` y', [['x'], ['a'], ['y']]],
    ['a\\ b', [['a b']]],
    [
      'cd app && \\\n  npm test',
      [
        ['cd', 'app'],
        ['npm', 'test'],
      ],
    ],
    ['FOO=1 \\\n  pytest', [['FOO=1', 'pytest']]],
    ['npm \\\ntest', [['npm', 'test']]],
    ['ab\\\ncd', [['abcd']]],
    ["echo 'a\\\nb'", [['echo', 'a\\\nb']]],
    ['echo "a\\"b"', [['echo', 'a"b']]],
    ["echo 'a\\b'", [['echo', 'a\\b']]],
    ['echo "abc', [['echo', 'abc']]],
    ['echo ""', [['echo', '']]],
    ['"pytest"', [['pytest']]],
    ['p"yt"est', [['pytest']]],
    ['npm test 2>&1 | tail -5', [['npm', 'test', '2>'], ['1'], ['tail', '-5']]],
    // a here document is no command
    ['cat <<EOF\npytest\nEOF\nnpm test', [['cat'], ['npm', 'test']]],
    ["cat <<'EOF'\npytest\nEOF", [['cat']]],
    ['cat <<-EOF\n\tpytest\n\tEOF\nls', [['cat'], ['ls']]],
  ]
  for (const [line, commands] of table) expect(commandsOf(line), JSON.stringify(line)).toEqual(commands)
})

test('checkOf: a check is a command that starts a command, not a word in an argument, a string or a here document', async () => {
  const found: [string, string][] = [
    ['time pytest -x', 'pytest'],
    ['sudo make test', 'make test'],
    ['FOO=1 BAR=2 npm test', 'npm test'],
    ['env CI=1 npm test', 'npm test'],
    ['nohup pytest', 'pytest'],
    ['command pytest', 'pytest'],
    ['uv run pytest -x', 'pytest'],
    ['poetry run pytest', 'pytest'],
    ['pipenv run pytest', 'pytest'],
    ['bundle exec rspec', 'rspec'],
    ['pnpm exec eslint .', 'eslint'],
    ['bunx vitest', 'vitest'],
    ['echo hi; pytest -x', 'pytest'],
    ['(cd app; npm test)', 'npm test'],
    ['cd app && npm test -- --watch=false', 'npm test'],
    ['if pytest; then echo ok; fi', 'pytest'],
    ['npm test 2>&1 | tail -5', 'npm test'],
    ['"pytest"', 'pytest'],
    ['./node_modules/.bin/eslint src', 'eslint'],
    ['/usr/local/bin/pytest', 'pytest'],
    ['vendor/bin/phpunit', 'phpunit'],
    ['./gradlew test', 'gradlew test'],
    ['echo "x"; npm run build', 'npm run build'],
    ['cat <<EOF\nx\nEOF\nnpm test', 'npm test'],
  ]
  for (const [command, check] of found) expect(checkOf(command), command).toBe(check)
  const none = [
    'echo "run cargo test"',
    'echo run cargo test',
    'git commit -m "fix npm test"',
    "git commit -m 'npm test'",
    'grep -r pytest .',
    'grep -rn "npm test" src',
    'ls | grep jest',
    'cat tsc.log | grep error',
    'man npm test',
    'which pytest',
    'type tsc',
    'npm help test',
    'npm view jest',
    'pip install pytest',
    'brew install make',
    'npm install --save-dev jest',
    'cd pytest',
    'ls tsc',
    'cat <<EOF\npytest\nEOF',
    "cat <<'EOF'\nnpm test\nEOF",
    'echo $(date)',
    'FOO=pytest ls',
    'sudo ls',
    'time ls',
    'if true; then ls; fi',
    'echo "a; pytest"',
  ]
  for (const command of none) expect(checkOf(command), `"${command}"`).toBeNull()
})

test('layout: the label gives way before the bar, the note goes before the row would not fit, and a row always fits where it can', async () => {
  const note = (text: string | null) => [row('Write tests'), row('Write tests', 0, 2, text)]
  // the note is shown from 14 (margin, glyph, count, percent, gaps) + its width + 1 + 4 (label floor) + 10 (bar) columns
  expect(layout(note('npm test failed'), 44).showNote).toBe(true)
  expect(layout(note('npm test failed'), 43).showNote).toBe(false)
  expect(layout(note('needs you'), 38).showNote).toBe(true)
  expect(layout(note('needs you'), 37).showNote).toBe(false)
  expect(layout(note(null), 0).showNote).toBe(true)
  expect(layout(note(null), 1000).showNote).toBe(true)
  // a bar of 10 and a label of 4 are what is left at the smallest width that shows the note
  expect(layout(note('needs you'), 38)).toEqual({ label: 4, bar: 10, showNote: true })
  expect(layout(note(null), 28)).toEqual({ label: 4, bar: 10, showNote: true })
  expect(layout(note(null), 29)).toEqual({ label: 5, bar: 10, showNote: true })
  expect(layout(note(null), 27)).toEqual({ label: 4, bar: 10, showNote: true })

  // for every width the row fits, wherever it can: the label, the bar and the note together stay inside the width
  const sets = [note(null), note('npm test failed'), note('needs you'), [row('x'.repeat(500), 12, 99, 'needs you')], [row('日本語のタスク'), row('Done', 1, 1)]]
  for (const rows of sets) {
    for (let columns = 0; columns <= 300; columns++) {
      const l = layout(rows, columns)
      const count = Math.max(...rows.map(r => width(`${r.done}/${r.total}`)))
      const noteWidth = l.showNote ? Math.max(0, ...rows.map(r => (r.note ? width(r.note) + 1 : 0))) : 0
      const fixed = 2 + 1 + count + 4 + 4
      expect(l.label, `label at ${columns}`).toBeGreaterThanOrEqual(4)
      expect(l.bar, `bar at ${columns}`).toBeGreaterThanOrEqual(10)
      expect(l.bar, `bar at ${columns}`).toBeLessThanOrEqual(60)
      if (columns >= fixed + noteWidth + 4 + 10) expect(fixed + noteWidth + l.label + l.bar, `row at ${columns}`).toBeLessThanOrEqual(columns)
    }
  }
})

test('put: at most 20 lists and 500 tasks a list are kept, the oldest lists go first', async () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => list(`l${i}`, 1))
  // 19 others and the touched one are 20: nothing goes. 20 others and the touched one are 21: the oldest goes.
  expect(put(many(19), 'x', () => list('x', 1).tasks)).toHaveLength(20)
  const full = put(many(20), 'x', () => list('x', 1).tasks)
  expect(full).toHaveLength(20)
  expect(full.map(l => l.name)).toEqual([
    ...many(20)
      .slice(1)
      .map(l => l.name),
    'x',
  ])
  expect(put(many(60), 'x', () => list('x', 1).tasks).map(l => l.name)).toEqual([
    ...many(60)
      .slice(41)
      .map(l => l.name),
    'x',
  ])
  // touching a list that is held does not count it twice
  const again = put(many(20), 'l5', tasks => tasks)
  expect(again).toHaveLength(20)
  expect(again.at(-1)?.name).toBe('l5')
  expect(again[0]?.name).toBe('l0')
  // the tasks of one list
  expect(put([], 'a', () => list('a', 499).tasks)[0]?.tasks).toHaveLength(499)
  expect(put([], 'a', () => list('a', 500).tasks)[0]?.tasks).toHaveLength(500)
  expect(put([], 'a', () => list('a', 501).tasks)[0]?.tasks).toHaveLength(500)
  expect(put([], 'a', () => list('a', 5000).tasks)[0]?.tasks.at(-1)?.id).toBe('a499')
})

test('checksOf: every check of a line once and in order, and the failure that names them', async () => {
  expect(checksOf('npm run build && npm test')).toEqual(['npm run build', 'npm test'])
  expect(checksOf('cd app && npm test')).toEqual(['npm test'])
  expect(checksOf('npm test; npm test')).toEqual(['npm test'])
  expect(checksOf('echo hi | grep pytest')).toEqual([])
  expect(checksOf('cd app && \\\n  npm test')).toEqual(['npm test'])
  expect(checksOf('npm run build && \\\n  npm test')).toEqual(['npm run build', 'npm test'])
  expect(checksOf('')).toEqual([])
  expect(checkOf('npm run build && npm test')).toBe('npm run build')

  // the exit code is one for the whole line: with several checks only `check` is told, with one its name
  expect(failureKey(['npm test'])).toBe('npm test')
  expect(failureLabel('npm test')).toBe('npm test')
  expect(failureKey(['npm run build', 'npm test'])).toBe('npm run build + npm test')
  expect(failureLabel('npm run build + npm test')).toBe('check')

  // a line that exited with 0 passed all its checks: it takes away a failure whose checks were all among them, and no other
  expect(hasPassed('npm test', ['npm test'])).toBe(true)
  expect(hasPassed('npm test', ['npm run build', 'npm test'])).toBe(true)
  expect(hasPassed('npm run build + npm test', ['npm test'])).toBe(false)
  expect(hasPassed('npm run build + npm test', ['npm run build', 'npm test'])).toBe(true)
  expect(hasPassed('npm test', [])).toBe(false)
  expect(hasPassed('npm test', ['pytest'])).toBe(false)
})

test('checksOf: the rest of the line that opens a here document is read, its body is not', async () => {
  const table: [string, string[]][] = [
    // the check on the line of the opener
    ['cat <<EOF > f && npm test\nbody\nEOF', ['npm test']],
    ['python - <<EOF && npm test\nprint(1)\nEOF', ['npm test']],
    // an empty body, a body that names a check, a here-string that is no here document
    ['cat <<EOF\nEOF\nnpm test', ['npm test']],
    ['cat <<EOF\nnpm test\nEOF', []],
    ['cat <<< "EOF"\nnpm test\nEOF', ['npm test']],
    // two here documents, then a check
    ['cat <<A\nx\nA\ncat <<B\npytest\nB\nnpm test', ['npm test']],
    // a line of the body that only starts like the delimiter ends nothing, an opener inside the body is body
    ['cat <<EOF\nEOFX\nnpm test\nEOF', []],
    ["cat >s.sh <<'EOF'\nrun <<INNER && npm test\nbody\nINNER\nEOF", []],
    // no limit on how many here documents or how long a delimiter: the body after them is still no command
    [`${'cat <<A\nx\nA\n'.repeat(60)}cat <<L\nnpm test\nL`, []],
    [`cat <<${'d'.repeat(70)}\nnpm test\n${'d'.repeat(70)}`, []],
    // no terminator and no line break after the opener: the text stays as it is
    ['cat <<EOF\nnpm test', ['npm test']],
    ['cat <<EOF', []],
  ]
  for (const [line, checks] of table) expect(checksOf(line), JSON.stringify(line)).toEqual(checks)
})

test('commandsOf: a line made to cost time is read in time', async () => {
  // A single pattern that backtracked over the delimiter and scanned on for every opener took 2 seconds for the first of these (64 KB).
  const lines = [
    `<<${'a'.repeat(65536)}\n`,
    '<<a\n'.repeat(16000),
    Array.from({ length: 20000 }, (_, i) => `<<d${i}\n`).join(''),
    '<<a '.repeat(250000),
    'cat <<A\nx\nA\n'.repeat(100000),
    `${'<<a'.repeat(20000)}\n${'x\n'.repeat(5000)}`,
  ]
  for (const line of lines) {
    const started = Date.now()
    commandsOf(line)
    expect(Date.now() - started, `${line.length} characters`).toBeLessThan(500)
  }
})

test('ranAndFailed: a command that exited with a code counts, one that was cut off or never ran does not', async () => {
  // measured: the tool answers an interrupt and a timeout with the code of the signal and one more line
  const failed = ['Exit code 1\nboom', 'Exit code 254', 'Exit code 1\nrun\nCommand timed out after 5s in a test']
  const other = [
    'Exit code 137\n[Request interrupted by user for tool use]',
    'Exit code 143\nCommand timed out after 1s',
    'Exit code 0',
    '<tool_use_error>Blocked: sleep 60 followed by: false.',
    'ok',
    '',
    undefined,
    null,
    42,
  ]
  for (const text of failed) expect(ranAndFailed(text), JSON.stringify(text)).toBe(true)
  for (const text of other) expect(ranAndFailed(text), JSON.stringify(text)).toBe(false)
})

test('the mod hooks four events and none of them is the prompt: what the person types is never read', async () => {
  // The README (Privacy) promises it. A hook on `prompt.edit` or `prompt.submit` would break the promise and must fail here first.
  const events = new Set<string>()
  register(
    ((event: string) => {
      events.add(event)
    }) as never,
    {} as never,
  )
  expect([...events].sort()).toEqual(['command.run', 'session.start', 'tool.call', 'ui.render'])
})
