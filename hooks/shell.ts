// Reading a command line as a shell does, and finding the checks (tests, builds, linters) in it.

// Commands that test or build: a failing one turns the line red, other failing commands (a grep with no match) do not. The README
// (Failing checks) lists them: keep both in step. The name
// must end there: `cat pytest.ini`, `ls tsc/` and `make-dist` name a file or another command.
const CHECK_PATTERN = String.raw`(?:(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:test|build|lint|typecheck|check)|(?:npx\s+)?(?:pytest|jest|vitest|mocha|tsc|eslint|ruff|mypy|pyright|rspec|phpunit)|(?:just|task)\s+(?:test|build|check|lint)|deno\s+(?:test|check|lint)|cargo\s+(?:test|build|check|clippy)|go\s+(?:test|build|vet)|make(?:(?:\s+\S+)*?\s+(?:test|build|check)|(?:\s+-\S+)*\s*$)|gradlew?(?:(?:\s+\S+)*?\s+(?:test|build|check)|(?:\s+-\S+)*\s*$)|mvn\s+(?:test|package|verify)|dotnet\s+(?:test|build)|claude\s+plugin\s+(?:test|validate)|python3?\s+-m\s+pytest)`
const CHECK = new RegExp(`^${CHECK_PATTERN}(?![\\w./-])`, 'i')

// Words that come before the command they start: a shell keyword, an environment assignment, a runner such as `uv run`.
const BEFORE = new Set(['sudo', 'time', 'nice', 'nohup', 'command', 'exec', 'env', 'bunx', 'if', 'then', 'elif', 'else', 'while', 'until', 'do', '!', '{'])

// The words of a command line as a shell reads them: quotes group a word and hide separators, an unquoted `;`, `|`, `&`, `(`, `)`,
// a backtick or a line break ends a command, and the body of a here document is no command.
export function commandsOf(line: string): string[][] {
  const text = line.replace(/<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n[ \t]*\2[ \t]*(?=\n|$)/g, '')
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
  const found = [first.slice(first.lastIndexOf('/') + 1), ...rest].join(' ').match(CHECK)
  if (!found) return null
  const text = found[0].toLowerCase().replace(/\s+/g, ' ')
  // make and gradle take a target among other words and flags: the check is the program and its test, build or check target.
  if (/^(?:make|gradlew?) /.test(text) || /^(?:make|gradlew?)$/.test(text)) {
    const target = text.match(/ (test|build|check)$/)
    return `${text.split(' ')[0]}${target ? ` ${target[1]}` : ''}`
  }
  return text
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
const RAN_AND_FAILED = /^Exit code [1-9]\d*/
export const ranAndFailed = (text: unknown) => typeof text === 'string' && RAN_AND_FAILED.test(text)
