# Where and how the line draws

The [README](../README.md#behavior-and-limits) lists what a user sees. This page holds the mechanics behind it.

## The band above the prompt

The line sits in the band above the prompt. It calls `next(e)` first, so every other mod that draws there keeps its output and the line sits below it.

Another mod that draws in that band without calling `next(e)` hides the other mods' output, this one included, and the other way round. The documentation names the tiers of the chain (managed mods, installed mods, then built-in ones), not the order of two installed mods that do not depend on each other. Mods that call `next(e)` (like this one) coexist.

## Above the question dialog

In the terminal the line is drawn above the question dialog (`AskUserQuestion`). A question replaces the prompt area there, so the band is not drawn then. The desktop app keeps the band below its dialog, so nothing is added above it.

Only the newest list is shown above the dialog: Claude Code refuses a tree with more than 12 rows around the dialog (its debug log says so), and two lists are over that.

## Terminal and desktop app

The desktop app draws the bar as two filled areas, the terminal as characters.
