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

## Report (2026-09-20, second round)

All four response points done in `src/components/ActivityLine.vue`:

1. The thinking word rotates through a fixed, quiet set (thinking,
   musing, pondering, weighing, considering), one per thinking stretch:
   picked when `activity.since` moves to a new value while
   `kind === 'thinking'`, not on every 1 s tick, and not rerolled by a
   `tokens`-only update to the same stretch (same `since`, per the
   manager's `activity-in-agent-status` second round). Cycles in order
   rather than at random, starting from "thinking" itself, so a fresh
   agent's first thinking stretch reads exactly as before and the
   sequence is deterministic for the e2e test.
2. The elapsed time (still `since()` from `src/time.ts`, "12 s" then
   "3 min") is now shown for `tool` as well as `thinking`, right-aligned
   on the line via a `flex justify-between` row (the word/phrase on the
   left, the time on the right, `tabular-nums` so it doesn't jitter as
   digits change width). `writing` and `waiting` show no time, unchanged
   — they already show themselves (the growing reply, the permission
   card).
3. `ActivityInfo.tokens?: number` added to `src/api/types.ts`, mirroring
   `agent-manager` commit `5e80c43`. Shown only next to the elapsed time
   (so only for `thinking`/`tool`, when present): "musing · 340 tokens ·
   12 s". Not shown for `writing`, where there is no time to sit next to
   and the growing reply already says how much there is.
4. The `tool` line no longer shows the raw `detail` (command or path) at
   all; it says what kind of thing it is instead, from the last
   `tool_use` item's name, exactly the four phrases given plus the
   fallback: "running a command" (Bash/shell), "reading a file" (Read),
   "editing a file" (Write/Edit/NotebookEdit), "searching"
   (Glob/Grep/WebSearch), else "waiting for a tool". `WebFetch` and
   `Task`/`Agent` fall to that last one — none of the four given phrases
   fit fetching a URL or delegating to a sub-agent, and I'd rather say
   something honestly generic than stretch "searching" to cover it; easy
   to add a fifth phrase later if that reads oddly in practice.

Design doc's `## What the agent is doing` paragraph rewritten for all
of the above. `e2e/app.spec.ts`'s activity assertions updated: checks
`activity-duration` is visible during both the thinking and tool
phases, the tool phase reads "reading a file" with no "example.txt" in
it anywhere in the line. Tokens isn't asserted: the fake agent's
`thinking`/`tool_use` records still don't carry a `tokens` hint (only
its `text_start`/`text_delta` do, per the manager's own change), so
there's nothing to observe there without also changing the fixture
again, which wasn't asked for this round and isn't needed to satisfy
the response's four points.

Verified: `npm run type-check`, `npm run lint`, `npm run test:unit`,
and `npm run test:e2e` (23/23) all pass. Gated alone. Left open: tokens
alongside thinking/tool is implemented and correctly hidden when
absent, but not exercised end to end by the fake agent as it stands —
worth a fixture follow-up if that combination needs its own test
someday.

## Response (2026-09-20, agent-claude)

Notes from using it: (1) plain 'thinking' every time is boring; vary the word the way other Claude interfaces do (thinking, musing, pondering, weighing, considering… pick one per thinking stretch, not per tick, and keep it lower-case and quiet). (2) Right-align the elapsed seconds, and show them for tool calls too, not only while thinking. (3) The manager's activity will carry `tokens` (the turn's output tokens so far, feature activity-in-agent-status, second round); show it next to the seconds, so 'musing · 340 tokens · 12 s' says something. (4) The command line or path in the status line is not helpful; say what kind of thing it waits for instead ('running a command', 'reading a file', 'editing a file', 'searching', else 'waiting for a tool'), no argument. The transcript already has the detail. Depends on the manager round landing first; the fake agent's tool turn is the test bed. Gated alone as before.

## Response (2026-09-20, agent-claude)

Looked at it in a browser at 1280x720 with the fake agent mid-turn, measured with getBoundingClientRect. Four problems, with a map: (1) The line is inserted between the transcript and the composer, so the transcript pane shrinks by 29 px (54 px with the thinking box) when a turn starts; a transcript that was scrolled to the bottom is then no longer at the bottom and the reader has to scroll. Do not insert: overlay. The section holding TranscriptView is already position relative and the typing indicator (data-test presence-typing in ProjectView.vue) is an absolute overlay at its bottom; render the activity line the same way, absolute at the bottom of the transcript area with a translucent background (bg-white/90, dark bg-slate-900/90), so the transcript never reflows and the composer never moves. The transcript's floating buttons (the scroll-to-bottom and follow buttons in TranscriptView) must not overlap it: shift them up by the line's height while it shows. (2) Alignment: the line spans the pane's full width, x 252-1280, label at 266 and seconds at 1258, while the transcript column is x 430-1102 (the items' max-width, centred) and the composer box is 263-1132. Align the line with the transcript column: same max-width and centring as the items (see how TranscriptView/TranscriptItem size them), label at the column's left edge, seconds right-aligned at the column's right edge, tabular-nums. (3) The live thinking box duplicates the transcript: for short thinking the transcript already shows the text ('I should look at the file first.' appears twice, one above the other). Show the live box only when the transcript does not show the text, i.e. for thinking longer than what TranscriptItem shows inline (it folds above 600 chars), and cap it at three lines. (4) The label lags the transcript: the status's activity is throttled by the manager, so the line still says 'thinking' while the transcript already shows a running Read. Derive the tool phase from the transcript when the last item is a tool_use without its result yet, and use status.activity for the rest (the manager is being changed to announce a change of kind at once, but the transcript is right there). Keep the Playwright test and add assertions that the transcript's clientHeight and the composer's top are unchanged when the line appears. Gated alone as before.

## Report (2026-09-20, third round)

All four mapped problems fixed:

1. **Overlay, not insert.** `ActivityLine.vue` moved inside the `relative
   min-h-0 grow` div that already holds `TranscriptView` and the typing
   indicator, as `position: absolute; inset-x-0 bottom-0`, translucent
   (`bg-white/90`/`dark:bg-slate-900/90`, `backdrop-blur-sm`,
   `pointer-events-none` on the positioning wrapper so it never steals
   scroll/click from the transcript beneath). `ProjectView.vue` no longer
   has it in flow between the transcript and `TurnInput` at all. Its
   height is measured with a `ResizeObserver` (on `getBoundingClientRect`,
   not `contentRect`, so padding counts) and emitted up (`resize` event)
   to a new `activityHeight` ref in `ProjectView`, passed down to
   `TranscriptView` as a prop; its "↓ latest" button's `bottom` gets an
   inline style adding that height on top of its usual `bottom-24` while
   the overlay shows, so it never sits under it.
2. **Alignment.** The overlay's positioning wrapper spans the pane
   (`inset-x-0`) with the same `px-4` as `TranscriptView`'s scroll
   container, and its visible card is `mx-auto max-w-3xl` — the same
   padding/max-width/centring math as the item column
   (`mx-auto flex max-w-3xl flex-col gap-3` in `TranscriptView.vue`), so
   the two align at both edges regardless of pane width, independent of
   the composer's own (different) width. Label and elapsed time are a
   `flex justify-between` row inside that card, `tabular-nums` on the
   time as already done last round.
3. **No duplicate short thinking.** New `src/constants.ts` exports
   `THINKING_FOLD_CHARS = 600`, used by both `TranscriptItem.vue` (was a
   bare `600` inline) and `ActivityLine.vue`'s new `showThinkingBox`
   computed, so the two stay in sync by construction rather than by two
   copies of the same number. The live box now renders only when the
   current thinking text is longer than that cutoff, i.e. exactly when
   the transcript itself has already folded it away; capped at three
   lines (`max-h-12`, was `max-h-20`/four-ish).
4. **No lag entering a tool call.** `ProjectView.vue` gained
   `pendingToolUse` (the last transcript item, when it is a `tool_use`
   with no `tool_result` after it yet — cheap and exact, since a result
   becomes the new last item the moment it arrives) and
   `effectiveActivity`, which reports `tool` (using that item's own `at`
   as `since`) whenever `pendingToolUse` is set and `status.activity.kind`
   is neither already `tool` nor `waiting` (left alone so a stray
   unresolved `tool_use` can never be mistaken for masking an actual
   waiting-on-permission state). `ActivityLine` receives this corrected
   value under its existing `activity` prop and needed no changes of its
   own for it; `activeToolName` now reads the tool's name from the same
   `pendingToolUse`, so the phrase and the kind change together the
   instant the `tool_use` item lands, not up to a second later.

Design doc's `## What the agent is doing` rewritten again to describe
the overlay, the alignment, the fold-length gating and the
transcript-derived tool phase. `e2e/app.spec.ts`: captures the
transcript's `clientHeight` and the composer's `getBoundingClientRect().top`
before sending the turn and asserts both unchanged once the activity
line is confirmed showing during the thinking phase (problem 1); the
thinking-text assertion is now that `activity-thinking` has zero count
and the transcript's own `[data-item="thinking"]` shows the text instead
(problem 3 — the fake agent's canned thinking text is 33 characters, so
this is exactly the "short thinking, box hidden" case; the "long
thinking, box shown and capped" case isn't exercised, same open item as
last round: would need a longer canned string in
`../agent-manager/fixtures/fake-agent.mjs`, not touched this round since
nothing in this response asked for it); the tool-phase assertion
(`reading a file`, no `example.txt`) now passes immediately rather than
depending on the manager's throttle window (problem 4, though the old
version happened to pass too, since the fixture's `tool` turn still
holds each activity for 1500 ms from the second round's timing fix —
the new assertions would have caught a regression either way).

Verified in two ways: `npm run test:e2e` (23/23), and manually — a
throwaway Playwright script driving the real dev build against the e2e
harness (backend.mjs's manager on 4299, correct `AGENT_MANAGER_URL`),
screenshotted mid-turn. Both screenshots matched the intent: the overlay
sits over the transcript's bottom without moving the composer, "thinking
· 0 s" then "reading a file · 0 s" right-aligned, aligned with the
transcript column rather than the pane. (First attempt at that manual
check used a bare `chromium.launch()` script outside Playwright Test,
which does not pick up `playwright.config.ts`'s dev-server env — it
would have hit the real installed dogfood manager on port 4268 instead
of the throwaway one on 4299. It failed at login before anything else
ran, so nothing was written there, but flagging it since it's the kind
of mistake worth not repeating: verify against this project's e2e
harness through `npx playwright test`, not a standalone script.)

`npm run type-check` and `npm run lint` also pass. Gated alone. Left
open: the long-thinking-box path (problem 3's positive case) and
`tokens` alongside thinking/tool are both implemented but still not
exercised by the fake agent as it stands — same fixture follow-up noted
last round, now joined by this one; worth doing together if that's ever
asked for.
