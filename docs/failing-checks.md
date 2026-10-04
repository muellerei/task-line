# How a command is read

The [README](../README.md#failing-checks) lists which programs count as a check and what turns the line red. This page holds the rules behind it: how task-line reads the command line that Claude ran.

## One shell line, read like a shell

A check has to be the command that starts. The line reads a command as a shell does: quotes group a word, `;`, `&&`, `||`, `|` and a line break end a command, a backslash before a line break joins two lines, and a here document is skipped. The rest of the line that opens a here document is read, so `cat <<EOF > f && npm test` runs the test.

## Two things the line does not understand

- A `#` comment: `echo hi # && pytest` still counts as a pytest run.
- A `<<` inside quotes: `echo "<<A"` is read as the start of a here document.

Both only change what the line shows. The output of the command is in front of you anyway.

## Options before the subcommand

Options between the program and its subcommand are skipped: `npm --prefix app test`, `pnpm -r test`, `pnpm --filter web build`, `yarn workspace web test` and `cargo +nightly test` count. A word that an option takes as its value is no subcommand or target (`make -C build install` is no check). Only the options the line knows take a value; an unknown option followed by a word is read as a flag.

## What comes before the program

`FOO=1`, `sudo`, `time`, `env`, `uv run`, `poetry run`, `bundle exec` and `pnpm exec` are skipped. So `cd app && npm test` and `FOO=1 uv run pytest -x` count.

## The name has to end there

`npm run test:unit` counts, while `cat pytest.ini`, `ls tsc/`, `make-dist`, `echo "run cargo test"` and `grep -r pytest .` never do.

## Interrupt, timeout, background

A command that you interrupted, that ran into its timeout or that was started in the background does not count, and neither turns the line red nor clears it. What the tool reports (measured):

- an interrupt: `Exit code 137` and a line that says so
- a timeout: `Exit code 143` and a line that says so
- a background start: an answer at once, before the command has run

## Several checks in one line, pipes

A line that runs several checks (`npm run build && npm test`) fails as `check failed`: the exit code is one for the whole line, so the line cannot tell which of them failed.

The same holds for a check in front of a pipe or `|| true` (`npm test | tail -5`). The line gets the exit code the shell reports for the whole line (the last command of a pipe, unless `pipefail` is set), so a failing check there is not seen, and a line that exits with 0 takes a red one away.
