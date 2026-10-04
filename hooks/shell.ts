// Reading a command line as a shell does, and finding the checks (tests, builds, linters) in it.

// Commands that test or build: a failing one turns the line red, other failing commands (a grep with no match) do not. The README
// (Failing checks) lists them: keep both in step. The name
// must end there: `cat pytest.ini`, `ls tsc/` and `make-dist` name a file or another command.
const CHECK_PATTERN = String.raw`(?:(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:test|build|lint|typecheck|check)|(?:npx\s+)?(?:pytest|jest|vitest|mocha|tsc|eslint|ruff|mypy|pyright|rspec|phpunit)|(?:just|task)\s+(?:test|build|check|lint)|deno\s+(?:test|check|lint)|cargo\s+(?:test|build|check|clippy)|go\s+(?:test|build|vet)|dotnet\s+(?:test|build)|claude\s+plugin\s+(?:test|validate)|python3?\s+-m\s+pytest)`
const CHECK = new RegExp(`^${CHECK_PATTERN}(?![\\w./-])`, 'i')

// Words that come before the command they start: a shell keyword, an environment assignment, a runner such as `uv run`.
const BEFORE = new Set(['sudo', 'time', 'nice', 'nohup', 'command', 'exec', 'env', 'bunx', 'if', 'then', 'elif', 'else', 'while', 'until', 'do', '!', '{'])

// The body of a here document is text, not commands: cut from the line after the opener to its terminator, and keep the rest of the
// opener's own line (`cat <<EOF > f && npm test` still runs the test). A scan, not one regular expression: a pattern that backtracks
// over the delimiter and then scans on for every opener costs time with the square of the length (64 KB of `<<aaa…` took 2 s). The
// lines that can end a here document are listed once, with their places, and every delimiter walks its own list forward, so the cost
// stays in step with the length however many openers there are. An opener without a terminator, a here-string (`<<<`) and a line
// break missing after the opener leave the text as it is.
function terminatorsOf(text: string): Map<string, number[]> {
  const places = new Map<string, number[]>()
  for (let start = 0; start <= text.length;) {
    const next = text.indexOf('\n', start)
    const last = next === -1 ? text.length : next
    const name = text.slice(start, last).trim()
    if (/^\w+$/.test(name)) {
      const list = places.get(name)
      if (list) list.push(start, last)
      else places.set(name, [start, last])
    }
    if (next === -1) break
    start = next + 1
  }
  return places
}

function withoutHeredocs(line: string): string {
  const opener = /<<-?[ \t]*(['"]?)(\w+)\1/g
  const walked = new Map<string, number>()
  let places: Map<string, number[]> | null = null
  let out = ''
  let from = 0
  for (let found = opener.exec(line); found !== null; found = opener.exec(line)) {
    const end = found.index + found[0].length
    const lineEnd = line.indexOf('\n', end)
    // No line break after this opener means none after any later one.
    if (lineEnd === -1) break
    if (found.index > 0 && line[found.index - 1] === '<') continue
    places ??= terminatorsOf(line)
    const delimiter = found[2]!
    const list = places.get(delimiter)
    if (!list) continue
    let at = walked.get(delimiter) ?? 0
    while (at < list.length && list[at]! <= lineEnd) at += 2
    walked.set(delimiter, at)
    if (at >= list.length) continue
    const stop = list[at + 1]!
    out += line.slice(from, found.index) + line.slice(end, lineEnd)
    from = stop
    opener.lastIndex = stop
  }
  return out + line.slice(from)
}

// The words of a command line as a shell reads them: quotes group a word and hide separators, an unquoted `;`, `|`, `&`, `(`, `)`,
// a backtick or a line break ends a command, a backslash before a line break joins the lines, and the body of a here document is no command.
export function commandsOf(line: string): string[][] {
  const text = withoutHeredocs(line)
  const commands: string[][] = []
  let words: string[] = []
  let word = ''
  let started = false
  let quote = ''
  const endWord = () => {
    if (started) words.push(word)
    word = ''
    started = false
  }
  const endCommand = () => {
    endWord()
    if (words.length > 0) commands.push(words)
    words = []
  }
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!
    if (quote) {
      if (char === quote) quote = ''
      else if (char === '\\' && quote === '"' && i + 1 < text.length) word += text[++i]
      else word += char
    } else if (char === '"' || char === "'") {
      quote = char
      started = true
    } else if (char === '\\' && text[i + 1] === '\n') {
      i++
    } else if (char === '\\' && i + 1 < text.length) {
      word += text[++i]
      started = true
    } else if (char === ' ' || char === '\t') endWord()
    else if ('\n;|&()`'.includes(char)) endCommand()
    else {
      word += char
      started = true
    }
  }
  endCommand()
  return commands
}

// make, gradle and mvn name the work as targets or goals among options and variables, so they are not matched by the pattern above: the
// check is the program and the first of its test, build or check goal (`make -C build test`, `mvn clean verify`). A word that an option
// takes as its value (`-C build`, `-pl app`) is no goal. `make` and `gradle` with no goal at all build everything and count, `mvn` alone does not.
const MAKE_VALUES = ['-C', '-f', '-I', '-o', '-W', '--directory', '--file', '--makefile']
const GRADLE_VALUES = [
  '-p',
  '-b',
  '-c',
  '-I',
  '-g',
  '-x',
  '--project-dir',
  '--build-file',
  '--settings-file',
  '--init-script',
  '--gradle-user-home',
  '--exclude-task',
]
const MAVEN_VALUES = ['-f', '-pl', '-P', '-T', '-s', '-rf', '-gs', '-t', '-l', '-b']
const BUILD_GOALS = ['test', 'build', 'check']
const MAVEN_GOALS = ['test', 'package', 'verify']
const GOAL_PROGRAMS = new Map([
  ['make', { goals: BUILD_GOALS, values: MAKE_VALUES, bare: true }],
  ['gradle', { goals: BUILD_GOALS, values: GRADLE_VALUES, bare: true }],
  ['gradlew', { goals: BUILD_GOALS, values: GRADLE_VALUES, bare: true }],
  ['mvn', { goals: MAVEN_GOALS, values: MAVEN_VALUES, bare: false }],
  ['mvnw', { goals: MAVEN_GOALS, values: MAVEN_VALUES, bare: false }],
])
function goalCheck(program: string, args: string[]): string | null {
  const spec = GOAL_PROGRAMS.get(program)!
  const goals: string[] = []
  for (let i = 0; i < args.length; i++) {
    const word = args[i]!
    if (spec.values.includes(word)) i += 1
    else if (word === '-j' && /^\d+$/.test(args[i + 1] ?? '')) i += 1
    else if (!word.startsWith('-') && !/^[A-Za-z_]\w*=/.test(word)) goals.push(word.toLowerCase())
  }
  // the name has to end there, as for the pattern above: `test:unit` is the goal `test`, `testing` is none
  for (const goal of goals) {
    const name = spec.goals.find(g => goal.startsWith(g) && !/[\w./-]/.test(goal[g.length] ?? ''))
    if (name !== undefined) return `${program} ${name}`
  }
  return goals.length === 0 && spec.bare ? program : null
}

// Options between a package manager and its subcommand (`npm --prefix app test`, `pnpm -r test`, `yarn workspace a test`, `cargo +nightly
// test`) are skipped, with the word an option takes as its value.
const FRONT_VALUES = new Map([
  ['npm', ['--prefix', '-C', '--workspace', '-w']],
  ['pnpm', ['--filter', '-F', '--dir', '-C']],
  ['yarn', ['--cwd']],
  ['bun', ['--cwd']],
])
function withoutFrontOptions(program: string, args: string[]): string[] {
  if (program === 'cargo') return args[0]?.startsWith('+') ? args.slice(1) : args
  const values = FRONT_VALUES.get(program)
  if (!values) return args
  let i = program === 'yarn' && args[0] === 'workspace' ? 2 : 0
  while (i < args.length && args[i]!.startsWith('-')) i += values.includes(args[i]!) ? 2 : 1
  return args.slice(i)
}

// The check one command runs, in a form that matches the same check run again with other arguments, or null.
function checkOfWords(all: string[]): string | null {
  let i = 0
  while (i < all.length) {
    const word = all[i]!
    const next = all[i + 1]
    if (/^[A-Za-z_]\w*=/.test(word) || BEFORE.has(word)) i += 1
    else if ((word === 'uv' || word === 'poetry' || word === 'pipenv') && next === 'run') i += 2
    else if ((word === 'bundle' || word === 'pnpm') && next === 'exec') i += 2
    else break
  }
  const [first, ...rest] = all.slice(i)
  if (first === undefined) return null
  // a path names the program by its last part: ./gradlew, node_modules/.bin/eslint
  const program = first.slice(first.lastIndexOf('/') + 1).toLowerCase()
  if (GOAL_PROGRAMS.has(program)) return goalCheck(program, rest)
  const found = [program, ...withoutFrontOptions(program, rest)].join(' ').match(CHECK)
  return found ? found[0].toLowerCase().replace(/\s+/g, ' ') : null
}

// Every check a command line runs, in order, each once: `npm run build && npm test` runs two.
export function checksOf(line: string): string[] {
  const checks: string[] = []
  for (const words of commandsOf(line)) {
    const check = checkOfWords(words)
    if (check !== null && !checks.includes(check)) checks.push(check)
  }
  return checks
}

// The first check of a command line, or null.
export const checkOf = (line: string): string | null => checksOf(line)[0] ?? null

// A line that ran several checks tells only that it failed, not which of them: the exit code is one for the whole line. The failure
// is kept as the checks joined, shown as the check when there is one, and as `check` when there are several.
const JOIN = ' + '
export const failureKey = (checks: string[]) => checks.join(JOIN)
export const failureLabel = (key: string) => (key.includes(JOIN) ? 'check' : key)
// A line that exited with 0 passed every check it ran, so it takes away a failure whose checks were all among them.
export const hasPassed = (key: string, passed: string[]) => key.split(JOIN).every(check => passed.includes(check))

// What the tool answers for a command that ran and exited with a code other than 0 (measured: `Exit code 254`, then the output).
// A command the person interrupted or that ran into its timeout is answered the same way, with the code of the signal that ended it and
// one more line (measured: `Exit code 137` and `[Request interrupted by user for tool use]`, `Exit code 143` and `Command timed out
// after 1s`). That is no result of the check, so it counts as no failure.
const RAN_AND_FAILED = /^Exit code [1-9]\d*/
const CUT_OFF = /^Exit code \d+\n(?:\[Request interrupted|Command timed out)/
export const ranAndFailed = (text: unknown) => typeof text === 'string' && RAN_AND_FAILED.test(text) && !CUT_OFF.test(text)
