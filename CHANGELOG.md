# Changelog

All notable changes to task-line are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.5.0] - 2026-11-18

Checked by hand in the terminal and in the desktop app with Claude Code 2.1.327.

### Changed

- The background rows name each running task, with what Claude called it and its kind (`↻ Run a 90-second background wait as… shell`), up to two rows with `+N` for the rest, instead of one row with a count per kind (`⏵ 2 shell · 1 subagent`). The triangle looked like a folded section that invites opening, which it was not, and a count did not say what was running. The `Stop` input is now read for the `description` of each entry as well as its `type`; the command is still never read, and only the first two tasks are kept, with their number. A task without a description shows its kind in its place. In a narrow window the description gives way first, then the kind; `+N` is never cut. Above the question dialog it stays one row: the first task with `+N`, at most 40 cells.
- Checked by hand in the terminal with Claude Code 2.1.327: three background tasks show as two rows, the second ending on `+1`; two show as two rows without `+N`; at 30 columns the descriptions are cut while the kind and `+N` stay whole; above the question dialog one row with `+2` stands for three tasks; the rows go once the tasks have ended and the answer they wake is done. Checked by hand in the desktop app as well: the rows show, do not wrap and do not look like something to open. Not checked: the drop of the description under 4 cells (covered by tests only).
- The plugin descriptions and the README name the background rows, and why they help: Claude Code shows background work in the terminal only as a count in its footer and in `/tasks`.

## [0.4.0] - 2026-11-18

Checked by hand in the terminal with Claude Code 2.1.327. The desktop app was not checked.

### Added

- A row for running background tasks, such as `⏵ 2 shell · 1 subagent`, under the lists or alone. A forgotten monitor, agent or background command is easy to miss, and it kept running across `/clear` unseen. The row counts what the `background_tasks` of the host's `Stop` input lists, by kind, and stays until a later `Stop` reports nothing running. Only the kind of each entry is read, never what a task is called or runs. Above the question dialog it takes the place of the list row when there is no list, never joins it, and is cut to 40 cells. `/task-line` hides it too.
- Measured with Claude Code 2.1.327, headless and interactive: the `Stop` input carries the list, a task that ends by itself wakes the session and the next `Stop` carries the new list, also after an answer interrupted with Esc, which raises no `Stop` of its own. Checked by hand in the terminal with the same version: a background `sleep` shows `⏵ 1 shell` after the answer and the row goes with the answer that its end wakes; `/task-line` hides and shows it; after `/clear` the row is empty until the first answer, then back for the task that kept running. A task of the `Monitor` tool comes with the kind `shell`, so the row says `1 shell`; a monitor of an MCP server was not checked. Not checked: the desktop app (where the row repeats its side panel). A task you end with `/tasks` stays in the row until the next answer, and one Claude started in an interrupted answer is missing until then.

## [0.3.0] - 2026-10-31

The desktop app was checked by hand after `/reload-plugins`: a new plan, a step moved on by `advance` and steps set out of order by `done` and `start` showed in the line. The yellow state while Claude waits for an answer was seen in the desktop app as well, where it was seen in the terminal only before.

### Added

- The line reads the task list of the desktop app. Its Code tab tells Claude to keep the list with its own `update_plan` tool instead of the todo tools, so the line stayed empty there. The plan's steps fill one list, and the `wrap_up` that ends the turn finishes it.

## [0.2.0] - 2026-10-11

The two settings were tried by hand in the `/config` menu. The order in which the host starts parallel calls was not checked in the host (see Fixed).

### Added

- Two settings in the `/config` menu: `lingerSeconds` (how long a finished list stays in the line) and `joinSeconds` (how long a new task of the same name still joins it). A new task joins a finished list only while the list is shown. A number outside 0 to 120 seconds is set to the nearest. The limits are set in the code and not with `min` and `max` in `plugin.json`, because the plugin test kit refuses to load a plugin whose option breaks one of them (not tried in the host). `0` never shows a finished list, or never joins one. If `joinSeconds` is shorter than `lingerSeconds`, a change to a task of the finished list after the join time drops that list.

### Fixed

- The calls of a `work_state_write` list are counted in the order they were issued, not in the order they answer. Before, a close that answered before a write issued ahead of it left the list standing as a finished `1/1` for the time `lingerSeconds` sets, two writes to one task could end on the older one, and a close removed a task that a later call had added. A write that is let go touches nothing, so it no longer restarts the time a finished list stays. The order is taken from the order in which the host starts the calls, which the test kit does and the host was not checked for.

### Changed

- A finished list stays 15 seconds now, and a new task of the same name joins it for 15 seconds, where both were 20. The 15 are chosen, not measured: a count over nine cases in one day of own sessions found none between 15 and 20 seconds after a list finished (seven were under 3 seconds), which is too little to tell. Set both to 20 to get the old behavior.

## [0.1.0] - 2026-10-03

First version. Tested with Claude Code 2.1.288 in the terminal. The checks of an interrupt, a timeout and a background start were repeated with 2.1.289. In the desktop app the line, the bar, the `×` button and the colors of a finished (green) and of a failed (red) list were checked by hand; the yellow state above the question dialog was seen in the terminal only.

### Fixed

- Two questions open at once keep the line yellow until both are answered. The state was a flag, so the first answer ended it.
- A command that only names a check no longer turns the line red when it fails: `cat pytest.ini`, `ls tsc/` and `make-dist` are no checks. A check's name must end where the name ends, so `npm run test:unit` still counts.
- The bar and the percent never show a full list before the list is finished (199 of 200 was shown as 100%), and never show an empty bar once one task is done.
- Wide characters (CJK, emoji such as ✅ and ⭐) count as two cells, so the bar shrinks to keep the row inside the width.
- A status such as `constructor` counts as pending and no longer finds a property of `Object`. A blank task name is shown as `Task`. A blank task name or a list name that is no string in `work_state_write` is ignored, and an unknown status keeps the old status of the item. A `TaskCreate` without an id still gets an id of its own.
- A width that is not a number is read as 100 columns.
- A check has to be the command that starts. A command line is read as a shell reads it (quotes group a word, `;`, `&&`, `||`, `|` and a line break end a command, a here document is skipped), and what comes before the program is skipped (`FOO=1`, `sudo`, `time`, `env`, `uv run`, `poetry run`, `pipenv run`, `bundle exec`, `pnpm exec`, shell keywords, a path such as `./gradlew`). `echo "run cargo test"` and `grep -r pytest .` no longer turn the line red when they fail, `cd app && npm test` and `FOO=1 uv run pytest -x` still do.
- Names and subjects are made safe to draw. A control character in a text node makes Claude Code unmount the whole tree and say so only in the debug log. Escape sequences, control characters, invisible characters (bidi controls, zero width spaces, tag characters, the private-use planes with the Kitty placeholder U+10EEEE) are removed, line breaks become spaces, a subject is cut at 200 characters and a list name at 60. The engine refuses a tree with more than 100000 characters of text.
- A narrow band keeps the row inside the width: the label gives way to a floor of 4 cells, then the note (`npm test failed`, `needs you`) is left out, and the bar stays at its minimum of 10 cells.
- With two lists the line above the question dialog was not drawn at all (one list showed, two did not, whatever the size of the dialog). Above the dialog only the newest list is shown now. Cause (Claude Code's debug log): the tree was refused with `more than 12 rows around the dialog`, and the engine drew its own dialog. The limit is not documented; found by hand, the dialog cannot be mounted in the test kit.
- In the desktop app the bar wrapped into a second line, because a box-drawing character is wider than a cell there (`overflow` and `height` do not clip it). The desktop app draws the bar as two boxes with a width in cells and a background now, the terminal keeps the characters. Found by hand.
- A line that runs several checks (`npm run build && npm test`) named the first of them, whichever failed. It fails as `check failed` now, the failure is kept as the checks joined, and a line that exited with 0 and ran all of them takes it away; one of them passing alone does not. Found in a review.
- Checked end to end in a terminal without claude-mem (Claude Code 2.1.288, Sonnet 5.5, `CLAUDE_CODE_ENABLE_TODO_TOOLS=1`): a list made with `TaskCreate` and `TaskUpdate` shows the task in progress, the red `npm test failed`, the yellow `needs you` above a question and the finished list going away after 20 seconds. The README says that Claude Code does not offer its todo tools to every model without that variable.
- A `TaskUpdate` that the tool answered with `success: false` (the host's type names an `error` for it) still changed the task on the line. Nothing changes now. Found while checking the built-in tools against the host's types.
- `make deploy` and `./gradlew bootRun` counted as checks (`make` and `gradle` matched any target). They count with the target `test`, `build` or `check`, or with none, and the name is the program and its target (`make -j4 test` is `make test`).
- `✅` and `⭐` and the other emoji below the wide blocks counted one cell, not two.
- In the desktop app the line showed twice while a question was open, once above the dialog and once in the band below it, and the bar above was not visible. The desktop app keeps its band below the dialog, so the line is drawn above the dialog in the terminal only. Found by hand.
- A row with the `×` button (desktop app, fullscreen terminal) is two cells wider than the layout counted, so at about 58 columns the line wrapped and the button ended up on its own line. The layout now leaves the two cells, and the note `npm test failed` is shown from 46 columns instead of 44 (`needs you` from 40 instead of 38). Found by hand.
- The `work_state_write` tool is found by how its name ends (`mcp__<plugin>__work_state_write`) and not by one plugin name.
- A command that was blocked by a hook, refused by the person, cut off by an interrupt or by its timeout, or started in the background no longer turns the line red, and none of them clears a red one. Measured through the hook (Claude Code 2.1.288): a call blocked by a hook comes back with the error flag, but its text does not start with `Exit code N`. An interrupt comes back with the error flag and `Exit code 137` followed by `[Request interrupted by user for tool use]`, a timeout (`timeout: 1000`) with the error flag and `Exit code 143` followed by `Command timed out after 1s`, and a command started with `run_in_background` at once, without the error flag and with a `backgroundTaskId`, before it has run. The text of a call refused by the person (`The user doesn't want to proceed with this tool use`) was seen in a session, not measured through the hook. Before, an interrupt and a timeout turned the line red (the code of the signal counted as an exit code), and a background start cleared a red line as if the check had passed. The line turns red only when the text says the command ran and exited with a code other than 0, and the other answers neither set nor clear a failure. An interrupt was also tried in a terminal session (Claude Code 2.1.289): from a line that was not red it stayed as it was.
- A here document is cut by a scan, not by one pattern that backtracks: 64 KB of `<<aaa…` took 2 seconds (32 KB 0.55 s, 16 KB 0.12 s), and the cost grew with the square of the length. The lines that can end a here document are listed once and every delimiter walks its own list forward, so the cost stays in step with the length (20,000 different delimiters without a terminator, 169 KB, took 7 seconds with a search per opener) and there is no limit on the number of here documents or the length of a delimiter. The rest of the line that opens it is kept, so `cat <<EOF > f && npm test` sees the test (before, the line read as no check), and a here-string (`<<<`) is no opener.
- `make -C build install` counted as `make build` (the directory was read as the target), and `make -j 4`, `make -C src` and `make CC=gcc` did not count although they name no target. `make`, `gradle` and `mvn` are read by their words now: options, their values and variables are skipped, and the check is the first goal of `test`, `build` or `check` (`verify` and `package` for `mvn`). `mvn clean verify`, `mvn -pl app test` and `./mvnw test` count, and so do `npm --prefix app test`, `pnpm -r test`, `pnpm --filter web build`, `yarn workspace web test` and `cargo +nightly test`. `mvn` alone and `mvn clean` do not. Found in a review.
- The README says why the line can stay out of sight with everything set up: Claude keeps no list for the work, or writes it in one go.
- A backslash before a line break joins the lines, as in a shell. `cd app && \` followed by `npm test` on the next line was read as no check, and `npm run build && \` followed by `npm test` as a line that runs the build only, so a failing test stayed without red. Found in a review.
- The enclosed ideographs and squares U+1F200 to U+1F265 (East Asian Width W) count as two cells; they counted as one although a terminal draws them two cells wide.
- A `work_state_write` list is closed when Claude closes it (a write with the status `done` and no task): the line lets it go and the next task of that name starts a new list. A finished list that has faded (20 seconds after its last task, or hidden with the button) is over as well, and a task that comes to its name starts a new list; while it is still shown a new task joins it. Found by hand: a name used again and again had grown into one list of 16 tasks, 13 of them done.
- A key kept for a wait that could not be started with a timer no longer keeps the list from being hidden.

### Changed

- The mod is split into modules: `cells` (cell widths, cutting, safe names), `shell` (reading command lines, the checks), `lists` (statuses, putting a change into a list), `layout` (what a row shows and how wide its parts are) and `register` (state, hooks, drawing). The bar is drawn in one place, and the default width is one constant.
- The line's own work in the hooks is guarded: an error there is logged for debugging and never reaches the tool call the hook watches.
- A finished list that has faded is dropped from the state when another list is touched, and the wait to hide a list is scheduled once per list, not at every redraw. A list holds at most 500 tasks and the 20 newest lists are kept, so the state does not grow without end.
- `/task-line` runs while Claude is busy, and is guarded like the other hooks.
- The README says from which version mods are on, names the tested version, shows the screenshots in Markdown syntax and explains how commands are read and what is cleaned.

### Added

- One line per task list above the prompt: the current task, a bar that grows with finished tasks, the count and the percent. A finished list goes away after 20 seconds.
- Lists are filled from `TodoWrite`, `TaskCreate` and `TaskUpdate`, and from `work_state_write` (one list per `list`; the to-do tool of the optional claude-mem plugin). Calls from subagents, refused calls and failed calls are ignored.
- Yellow state with `needs you` while Claude waits for an answer to `AskUserQuestion`, and while a plan waits for approval (`ExitPlanMode`, where nothing is drawn, see below). The line is also drawn above the question dialog, where the band above the prompt is not shown.
- Red state with the name of the check (`npm test failed`) when a test, build, lint or typecheck command fails. It clears when the same check passes or the list changes (a task moves on, is added or is removed). Recognized commands: `npm`, `pnpm`, `yarn`, `bun`, `just`, `task`, `deno`, `pytest`, `jest`, `vitest`, `mocha`, `tsc`, `eslint`, `ruff`, `mypy`, `pyright`, `rspec`, `phpunit`, `make`, `gradle`, `gradlew` and `claude plugin test` or `validate`, and `cargo` (`test`, `build`, `check`, `clippy`), `go` (`test`, `build`, `vet`), `mvn` (`test`, `package`, `verify`) and `dotnet` (`test`, `build`).
- The bar takes 40% of the terminal width (10 to 60 characters), the label slot fits the longest label (at most 35% of the width).
- `/task-line` hides and shows the line. A `×` button hides one list until it changes again, drawn where there is a click (desktop app, fullscreen terminal).
- The band calls `next(e)` first, so other mods that draw above the prompt keep their output.
- Tests for the list sources, width, the finished list going away, the question state, failing checks (a table of commands) and the hide controls.
- The README says that the mod does not watch what you type, and a test keeps the promise: it fails when a hook on another event than tool calls, session start, the command and the drawing is added.
- README sections for three examples to try, troubleshooting and support (issues), and a statement of what the mod does not read, as the directory policy asks.
- Unit tests of the pure functions with their limits (`cellsOf`, `width`, `fit`, `progressOf`, `layout`, `put`, `checkOf`) and tests of the line at its limits (the ends of the bar and the percent, the 20 seconds to the millisecond, the number of lists, odd statuses and task names, `TaskCreate` and `TaskUpdate`, `work_state_write`, concurrent questions, failed checks).
- Type check with TypeScript 5 in strict mode and Prettier formatting, both clean. The code and the tests have no `any`; the tests cast the host's inputs in one place, `hooks/test-support.tsx`.
- Tests for edge cases: cleaning of names (escape sequences, controls, invisible characters, the cut at 200 and 60), how commands are read (words, quotes, separators, here documents, wrappers, look-alikes), the layout at every width from 0 to 300 (the row fits wherever it can), the caps on lists and tasks, and the tool name of `work_state_write`. A hand-made mutation probe (faults built into a copy of the code) found all but two; those two are equivalent in behavior (the hide at exactly 20 seconds, which the timer reaches at the same moment) or cannot be reached from a test (a damaged time stamp in the state).

### Known limits

- The plan approval (`ExitPlanMode`) has no render component of its own, so the line is not drawn there.
- The desktop app was checked by hand for the line, the bar, the `×` button and the colors of a finished and of a failed list; the yellow state above the question dialog was seen in the terminal only.
- The question dialog cannot be mounted in the test kit, so its look is checked in a session only.
