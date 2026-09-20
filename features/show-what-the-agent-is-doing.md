---
title: show what the agent is doing, near the input
status: review
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

## Report (2026-09-20)

Implemented as written, all bullets done:

- `AgentStatus.activity` (`ActivityKind`, `ActivityInfo`, `Activity`)
  added to `src/api/types.ts`, mirroring `agent-manager`'s
  `docs/design.md` and `src/agents/agents.service.ts`. The agents store
  needed no change: it already replaces the whole `status` object on
  `agent.state`, so `activity` rides along once the type carries it.
- `src/components/ActivityLine.vue`: the muted line above the composer
  ("thinking for Ns", "writing", a verb guessed from the last `tool_use`
  item's name plus the activity's `detail` in backticks — "reading",
  "editing", "running", "searching", "fetching", falling back to
  "running" — or "waiting for your answer"), and, only while
  `activity.kind === 'thinking'`, the live tail of the transcript's last
  item when it is itself a `thinking` item: a fixed-height, scrolled-to-
  bottom monospace box so older text scrolls away as it grows. A local
  1 s ticker drives the "for Ns" duration from `since`. Wired into
  `ProjectView.vue` between the transcript and `TurnInput`, in normal
  flow (not floating like the "is typing…" note), so it only exists —
  and only then reserves height — while `activity` is non-null;
  disappears the instant a turn ends.
- The tool verb is a small name → verb map, the same shape as
  `ToolCallItem.vue`'s existing per-tool summary (also derived from an
  item's `name`, not from parsing a daemon line), since the manager's
  `activity.detail` alone (a bare command or path string) can't tell a
  read from an edit.
- Design doc: a new `## What the agent is doing` section after
  `## Steering a working agent` (there being no single "composer"
  section to slot under), and the `## Testing` bullet list mentions the
  new e2e coverage.
- Playwright: extended the existing "streamed turn" case in
  `e2e/app.spec.ts` (the `use a tool please` turn) to assert the
  activity line shows "thinking" with the live thinking text, then
  "reading" with the tool's detail once the tool call starts and the
  thinking text is gone, then that the line disappears once the turn is
  idle.

One thing not in the spec, needed to make that test non-flaky: the
manager coalesces `activity`-only announcements over the socket to at
most one a second (by design, so a burst of tool calls doesn't flood
it), and a state transition (a turn starting or ending) both resets that
throttle window and cancels any pending coalesced announcement. The fake
agent's `tool` turn used to hold `thinking` and the tool call for only
tens of milliseconds each, well under that window — with the real
timing, the whole turn finished, and its `idle` transition cancelled the
still-pending flush, before either activity had a chance to reach the
socket at all; only `null` before and after was ever visible live (a
poll of `GET /api/agents/:id`, which agent-manager's own e2e test for
this uses, sidesteps the throttle and doesn't show the gap). I lengthened
`../agent-manager/fixtures/fake-agent.mjs`'s `tool` turn (two
`sleep(50)`-ish gaps to `sleep(1500)`) so each activity outlasts the 1 s
throttle on its own and is reliably announced; also reworded the one
comment in `../agent-manager/test/manager.e2e-spec.ts` that cited the
old 50 ms figure. Neither file needed a rebuild (the fixture is a plain
script the daemon spawns directly; the test file is source vitest reads
directly), so `../agent-manager/dist` did not need touching. Ran that
repo's `derives an activity from the stream` e2e test after the change
to confirm it still passes. This is a test-fixture timing change in a
sibling repository, not a manager behavior change; flagging it here
since it goes a little beyond this feature's own repo.

Verified: `npm run type-check`, `npm run lint`, `npm run test:unit`, and
`npm run test:e2e` (23/23, including the extended case) all pass. Gated
alone, as instructed. Left open: nothing from the spec; the only
judgement call is the tool-verb guess above, which is presentation-only
and falls back to "running" for any tool name it doesn't recognise.
