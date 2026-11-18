# Where and how the line draws

The [README](../README.md#behavior-and-limits) lists what a user sees. This page holds the mechanics behind it.

## The band above the prompt

The line sits in the band above the prompt. It calls `next(e)` first, so every other mod that draws there keeps its output and the line sits below it.

Another mod that draws in that band without calling `next(e)` hides the other mods' output, this one included, and the other way round. The documentation names the tiers of the chain (managed mods, installed mods, then built-in ones), not the order of two installed mods that do not depend on each other. Mods that call `next(e)` (like this one) coexist.

## The rows of background tasks

Under the lists, or alone, the band can show up to two more rows, one per running background task: `↻`, what Claude called the task, its kind, and on the second row `+N` when more tasks run than are shown. The first two entries of the host's list are shown. The host sends the list in the order the tasks started (measured once, with four tasks), so these are the ones that have run longest; the types of the host promise no order. A task that comes without a description shows its kind in its place. The command of a task is never read. Its source is the `Stop` event of the host, which carries the list of what runs in the background. The rows are drawn from what the last `Stop` said, so they are brought up to date when an answer ends. A task that ends by itself wakes the session, the answer that follows ends with a new `Stop`, and the row follows. This was measured with Claude Code 2.1.327, headless and interactive, also after an answer interrupted with Esc. The mod adds no hooks on `Bash`, `TaskStop` or the agent tool to keep a second count: a count kept by hand could disagree with the host's.

Two cases stay behind until the next answer. A task you end with `/tasks` still stands in the rows. A task Claude started in an answer you interrupted with Esc is missing, since Esc raises no `Stop`. A task of the `Monitor` tool is reported as `shell`, so the row says `shell` for it; a monitor of an MCP server was not checked. After `/clear` the rows are empty until the first answer ends, then a task that kept running shows again (checked by hand, 2.1.327). The hook for `SubagentStop` is not used either: it carried the same list as the `Stop` before it, and it also fired for the host's own helper agents.

The `Stop` hook passes the event on and answers what the hooks beneath it answer. If writing the rows fails, the old rows stay.

How a row is laid out: the glyph, the description, the kind and `+N` are separate texts in one row. The band does the sum itself instead of leaving the cut to the host, because the host's `truncate` has no lower limit. The room of a row is the width of the band less its padding of two. The description gets what is left after the glyph, the kind, `+N` and the gaps between them. When that is under 4 cells the description goes whole, since an ellipsis alone says nothing. When even the kind and `+N` do not fit, the kind is cut to the rest, one cell at least, and `+N` stays whole. Below about 6 columns the host cuts the row; the list rows have the same limit.

## Above the question dialog

In the terminal the line is drawn above the question dialog (`AskUserQuestion`). A question replaces the prompt area there, so the band is not drawn then. The desktop app keeps the band below its dialog, so nothing is added above it.

Only one row is shown above the dialog: Claude Code refuses a tree with more than 12 rows around the dialog (its debug log says so), and two lists are over that. The row is the newest list. Without a list it is one row of background tasks: the first task with its kind, and `+N` for all others, at most 40 cells wide, because the host counts the tree at 40 columns there. The description gives way, with the same lower limit of 4 cells. A list and the background rows are never drawn together above the dialog.

## Terminal and desktop app

The desktop app draws the bar as two filled areas, the terminal as characters.
