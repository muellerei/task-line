# task-line

One clean line per task list above the Claude Code prompt, filled from Claude's own todo tools. You do not operate it.

It is a Claude Code mod (a plugin of function hooks).

```text
● Write the tests    ━━━━━━━━━━━━━━━━━━━━────────────────────  2/5   40%
? Ship it            ━━━━━━━━━━━━━━━━━━━━────────────────────  2/5   40%  needs you
✕ Fix the build      ━━━━━━━━━━━━━━━━━━━━────────────────────  2/5   40%  npm test failed
✓ Done               ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  5/5  100%
```

## What you see

A line shows the task Claude is working on, a bar that grows with finished tasks, the count and the percent. It turns yellow with `needs you` while Claude waits for your answer to a question, red with the name of the check when a test or build command fails, and green when the list is finished. A finished list goes away after 20 seconds.

Cut from real terminal screenshots (dark theme, fullscreen, so the `×` button shows):

**Working on a task**

![A line while Claude works on a task](docs/state-working.png)

**A check failed**

![The line turns red and names the failed check](docs/state-failed.png)

**Claude waits for your answer** (drawn above the question dialog, which has no `×`)

![The line turns yellow while Claude waits for an answer](docs/state-waiting.png)

**Finished** (the success color is blue in this theme)

![A finished list](docs/state-done.png)

## Install

Run these inside Claude Code:

```text
/plugin marketplace add muellerei/task-line
/plugin install task-line@muellerei-mods
```

Or from a shell: `claude plugin marketplace add muellerei/task-line`, then `claude plugin install task-line@muellerei-mods`. Then run `/reload-plugins`. The line needs a todo list to read: see [Requirements](#requirements).

## Requirements

- **Claude Code 2.1.287 or later.** Mods are on by default from that version (an administrator can switch them off). Tested with 2.1.288.
- **A todo list that Claude keeps.** The mod only shows lists Claude already writes and creates none itself, on purpose: a model does not use a substitute tool unless told to. Without a list the line stays empty.

| Your setup | Todo list? | What to do |
|---|---|---|
| Claude 3.x, Opus 4 to 4.7, Sonnet 4 to 4.6, Haiku 4.5 | yes, by default | nothing |
| Background and cloud sessions, any model | yes | nothing |
| Newer models (for example Sonnet 5.5) | **no**, left out since Claude Code 2.1.268 | set `CLAUDE_CODE_ENABLE_TODO_TOOLS=1` (Claude Code 2.1.233 or later), for example with [enable-todo-tools](https://github.com/muellerei/enable-todo-tools), or use a tool named `work_state_write` for the lists |

[enable-todo-tools](https://github.com/muellerei/enable-todo-tools) is a small companion mod that sets that variable when a session starts, so the todo tools are on without touching your settings. It is a separate mod on purpose: task-line only reads the lists Claude keeps and creates none, while the variable makes Claude keep lists, which costs extra turns. Install it only if you want that. It does not need task-line, and task-line does not need it.

Details under [What it reads](#what-it-reads).

## Hide it

- `/task-line` hides the line and shows it again. The lists keep being filled while it is hidden.
- `×` at the end of a line hides that list until it changes again. The button is drawn where there is a click: in the desktop app and in a fullscreen terminal. A terminal band has none.

## Try it

Three things to say to Claude, each shows one state of the line:

1. "Make a todo list with three tasks for this change and start the first one." The line shows the task in progress, `0/3`, and the bar grows as tasks are finished.
2. "Run `npm test` in a folder that has no `package.json`, as the only command." The newest list turns red and names the check (`npm test failed`). A command that ends with `echo` or `|| true` exits with 0 and does not count.
3. "Ask me a question with the question tool." The line turns yellow with `needs you` above the dialog.

## Troubleshooting

- **No line.** Ask Claude to "make a todo list with three tasks": if it answers that it has no todo tool, there is nothing for the line to read (see [Requirements](#requirements)). If it does have the tool, the usual reason is that Claude keeps no list for the work at hand: the line shows only the list Claude writes, it moves only when Claude changes a task's status, and what a subagent does is not shown. A short question or a single step makes no list. Ask for one at the start, or tell Claude in your `CLAUDE.md` to keep a todo list for work with several steps. Mods need Claude Code 2.1.287 or later. Run `/reload-plugins`, then `claude plugin validate` on the plugin folder. A finished list goes away after 20 seconds, a list you closed with `×` comes back with the next change to it, and `/task-line` may have hidden the line (it says `Task line hidden.` or `Task line shown.`).
- **No red after a failed command.** Only a check that ran and exited with a code other than 0 counts, a finished list is never red, and a command refused by you or by a hook is no failure.
- **Only one list above a question.** Claude Code refuses a larger tree around the dialog, so the newest list is shown there.
- **The bar wraps or looks cut.** Report the width of the window and whether it is the terminal or the desktop app.

## Support

Report problems and ideas as issues at https://github.com/muellerei/task-line/issues. Say which Claude Code version and surface (terminal, desktop app) you use, and what the line showed.

## What it reads

The line is filled from tool calls Claude already makes, so there is nothing to configure and no extra instruction in the prompt:

| Source | Use |
| --- | --- |
| `TodoWrite` | one list, replaced on each call |
| `TaskCreate`, `TaskUpdate` | one list, items added and changed |
| `work_state_write` (the to-do list tool of [claude-mem](https://github.com/thedotmack/claude-mem), which task-line is not affiliated with, or any MCP tool of that name) | one list per `list`, items from `fields.task` and `fields.status` |

Calls from subagents, calls that were refused and calls that failed are ignored. Of `work_state_write` the mod sees only the inputs of Claude's calls and whether a call was refused or failed, never what the tool stores or returns.

Claude Code leaves its task tools out on newer models because they keep track of multi-step work without a written checklist (Claude Code's documentation, [Task tool availability](https://code.claude.com/docs/en/tools-reference#task-tool-availability)). With `CLAUDE_CODE_ENABLE_TODO_TOOLS=1` Claude keeps the list with `TaskCreate` and `TaskUpdate`, and `TodoWrite` only with `CLAUDE_CODE_ENABLE_TASKS=0`. A `work_state_write` tool can come with instructions that make Claude keep its lists there instead of with the built-in tools, and the line reads those lists too.

**Where the data comes from.** Nothing on the line is made up or measured by the mod. The tasks are the todo list Claude Code itself keeps for the work (its own todo tools, or a `work_state_write` to-do list tool), and the mod reads them as Claude writes them. The count and the percent are finished tasks over all tasks of that list, so the bar is only as good as Claude's list: it is no estimate of time or effort. A red line comes from a test or build command Claude ran that exited with an error code (a command that a hook blocked, you refused, an interrupt or a timeout cut off, or that went to the background never counts), a yellow one from a question Claude asked you. The mod runs no commands and reads no files itself (see [Privacy](#privacy)).

## Failing checks

A failing test or build command turns the newest list red (a list that is already finished is never red) and names the check (`npm test failed`). These count:

| Program | Counts with |
| --- | --- |
| `npm`, `pnpm`, `yarn`, `bun` | `test`, `build`, `lint`, `typecheck` or `check` |
| `just`, `task` | `test`, `build`, `check` or `lint` |
| `deno` | `test`, `check` or `lint` |
| `make`, `gradle`, `gradlew` | the target `test`, `build` or `check` among the options (`make -C build test`), or no target at all (`make -j 4`); `make deploy`, `make -C build install` and `./gradlew bootRun` are no checks |
| `pytest` (also `python -m pytest`), `jest`, `vitest`, `mocha`, `tsc`, `eslint`, `ruff`, `mypy`, `pyright`, `rspec`, `phpunit`, `claude plugin test`/`validate` | any call |
| `cargo` | `test`, `build`, `check` or `clippy` |
| `go` | `test`, `build` or `vet` |
| `mvn`, `mvnw` | the goal `test`, `package` or `verify`, also after other goals (`mvn clean verify`); `mvn clean` is no check |
| `dotnet` | `test` or `build` |

- A check has to be the command that starts, read as a shell reads a line: `cd app && npm test` counts, `echo "run cargo test"` does not. How the line is read is in [How a command is read](docs/failing-checks.md).
- Options between the program and its subcommand are skipped (`npm --prefix app test` counts), and so is what comes before the program (`sudo`, `uv run`, `FOO=1`).
- Any other failing command (a `grep` with no match for one) never counts, and neither does a command run by a subagent.
- A command that you interrupted, that ran into its timeout or that was started in the background does not count either, and neither turns the line red nor clears it.
- A line that runs several checks (`npm run build && npm test`) fails as `check failed`: the exit code is one for the whole line, so the line cannot tell which of them failed.
- A check in front of a pipe or `|| true` (`npm test | tail -5`) is not seen: the line gets the exit code the shell reports for the whole line (the last command of a pipe, unless `pipefail` is set), so a line that exits with 0 takes a red one away.
- The line does not understand a `#` comment (`echo hi # && pytest` still counts as a pytest run) and reads a `<<` inside quotes as a here document. Both only change what the line shows.
- The line goes back when the same check passes again (other arguments are fine), when a line that exited with 0 ran all the checks of the failure, or when the list changes: a task moves on, a task is added or one is removed.
- A question to you (yellow) wins over a failed check.

## Where it draws

- In the band above the prompt. It calls `next(e)` first, so every other mod that draws there keeps its output and the line sits below it.
- Above the question dialog (`AskUserQuestion`) in the terminal. A question replaces the prompt area there, so the band is not drawn then. The desktop app keeps the band below its dialog, so nothing is added above it. Only the newest list is shown there: Claude Code refuses a tree with more than 12 rows around the dialog (its debug log says so), and two lists are over that.

## Good to know

- The lists belong to the session: `/clear`, `/resume` and `/branch` start with none, a reload of the mod keeps them.
- A narrow band keeps its shape: the label gives way first, then the note (`npm test failed`, `needs you`) is left out, the glyph and the color still say it. The bar never gets shorter than 10 cells.
- `/task-line` also works while Claude is busy.
- Another mod that draws in the band above the prompt without calling `next(e)` hides the other mods' output, this one included, and the other way round. The documentation names the tiers of the chain (managed mods, installed mods, then built-in ones), not the order of two installed mods that do not depend on each other. Mods that call `next(e)` (like this one) coexist.
- A plan approval (`ExitPlanMode`) has no render component of its own, so the line is not drawn there. The yellow state is set while the plan waits, but only the question dialog shows it.
- Checked by hand in the terminal. In the desktop app the line, the bar, the `×` button and the colors of a finished (green) and of a failed (red) list were checked by hand; the yellow state above the question dialog was seen in the terminal only. The desktop app draws the bar as two filled areas, the terminal as characters.
- At most two lists are drawn in the band, the newest ones. A third active list is kept, but not shown.
- Colors are theme colors (`success`, `warning`, `error`, `claude`, `inactive`), so they follow your theme. In some themes `success` is not green.

## Privacy

The mod sees the `Bash` commands Claude runs and the task names of the lists. It keeps the lists and the name of a failed check in the mod's session state, nothing else of a command. It reads and writes no files and makes no network calls itself. It does not read Claude's memory, the chat history, summaries or your files: it sees the inputs of tool calls Claude makes, and of a result only what it needs: of a `Bash` result the error flag, whether the text starts with `Exit code` and a number (and is not an interrupt or a timeout), and whether a background task started; of a `TaskCreate` result the id of the new task; of a `TaskUpdate` result whether it succeeded; of every result whether the call was refused or failed. It does not watch what you type: it hooks the tool calls Claude makes, the start of a session, the command `/task-line` (whose arguments it does not read) and the drawing of the line, and no event of your prompt or your messages. Of a question to you it knows only that one is open, not your answer. A test fails when a hook on another event is added.

## Details

- The bar takes about 40% of the terminal width, at least 10 and at most 60 characters, and gives way when the row would not fit. The label slot fits the longest label (wanting at least 8 and at most 35% of the width, and giving way down to 4 cells when the row is narrow), and wide characters such as CJK or emoji count as two cells. Neither the bar nor the percent shows a finished list before the list is finished (199 of 200 is 99%), and both show something as soon as one task is done.
- Names and subjects are made safe to draw. Escape sequences and invisible characters (bidi controls, zero width spaces, the private-use planes) are removed, other control characters and line breaks become spaces, and a name is cut at 200 characters (a list name at 60). A list holds 500 tasks and the 20 newest lists are kept.
- A `work_state_write` list stays as long as its name is in use: when Claude closes it (a write with the status `done` and no task) the line lets it go, and the next task of that name starts a new list. A finished list that has faded (20 seconds after its last task, or hidden with `×`) is over as well: a task that comes to its name then starts a new list. A task that comes while the finished list is still shown joins it, so that adding one task, finishing it and adding the next keeps the progress. Without both rules a name used again and again would grow into one list of everything it ever held.

## Develop

```bash
claude plugin validate .
claude plugin test .
claude --plugin-dir .          # lays the engine's types into .claude-plugin/types for the editor and tsc
npx -p typescript@5 tsc -p .
npx prettier@3 --check hooks types
```

The tests mount the band on the terminal and the desktop surface. `units.test.ts` tests the pure functions with their limits, `boundaries.test.tsx` the line at its limits (the ends of the bar and the percent, the 20 seconds to the millisecond, odd statuses and names, concurrent questions, failed checks), `register.test.tsx` the rest: the list sources, the question state, the table of recognized commands, the `×` button and `/task-line`. The question dialog itself cannot be mounted in the test kit, so its look is only checked in a session.

## License

MIT, see [LICENSE](LICENSE).
