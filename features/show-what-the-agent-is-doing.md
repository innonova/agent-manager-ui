---
title: show what the agent is doing, near the input
status: planned
priority: 50
---

While an agent works the header says "working", far from where the eyes
rest, and nothing says what it is doing. The manager will carry
`status.activity` (feature `activity-in-agent-status` in agent-manager:
thinking / writing / tool with a detail / waiting, with a `since`).
Show it where the composer is:

- One line right above the input, muted, present only while the turn
  runs: "thinking for 12 s", "writing", "running `npm test`", "editing
  `src/x.ts`", "waiting for your answer". The duration ticks locally
  from `since`.
- While it thinks, the last few lines of the current thinking item
  stream in under that line (three or four lines, older text scrolling
  away, monospace, muted), and go away when the thinking ends. The
  transcript keeps the thinking item as today (short ones shown, long
  ones folded), so nothing is lost; this is the live view of it.
- The state badge and the header stay as they are; the activity line
  is additional, not a replacement.
- Nothing new when the agent is idle; the line collapses, the layout
  does not jump (reserve the height only while a turn runs).
- Playwright: the fake agent's `thinking` and `tool` turns show the
  line and the streamed thinking, gone at the turn end.
- Design doc: a paragraph under the composer section.

Depends on the manager feature `activity-in-agent-status`.
