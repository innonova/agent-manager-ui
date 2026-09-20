---
title: "the UI as a reading app: hierarchy, one header line, projects first"
status: done
priority: 30
---

**Purpose.** A person here reads far more than they type: what an agent
did, what is happening across projects, what a feature came to. The
screens were built one feature at a time and read like it: small pale
text carries the work and the settings alike, the transcript is a chat
layout, the projects page opens with configuration, the header mixes
facts and actions at one weight. The result should read as one quiet
working tool where the work is the largest thing on every screen and
the person can tell a fact from a button.

Two readings precede this, in `agent-manager/docs/curation/`
(`2026-09-20-ui-rethink-fable.md`, `2026-09-20-ui-rethink-astra.md`).
They agree on the direction; this feature is their overlap plus
Astra's additions on relationships.

**Requirements.**
- A text scale: conversation and reports about 15 px, navigation and
  lists 14 px, metadata 12 px, nothing smaller; monospace only for
  code, paths and identifiers.
- The agent header on one line: name, state, model, and one grouped
  place for the lifecycle actions (stop, restart, archive, delete);
  the facts (usage, profile, directory, harness, effort) behind a
  disclosure; "changed since you last looked" kept and the only
  coloured thing on the line; interrupt stays beside the composer.
  Where an agent was started by another, the header says so.
- The transcript as one left-aligned column: author and time in a
  gutter once per message, the person's messages distinct by a tint or
  a border rather than a bubble, less space between short related
  items; the turn rule, folded tool rows, thinking summaries, the
  activity line and its reservation kept as they are; the composer
  and the activity line aligned to the reading column.
- The projects page leads with the projects: each row its name, then
  attention signals (agents working, waiting for a person, features
  awaiting review), repository names with paths on demand; the whole
  row a link, edit secondary; account usage one quiet line. The
  machine's configuration (harness, models, method, framing,
  learnings) moves to an installation page reached from the gear
  menu, its explanations on the destination pages.
- Blue for what can be clicked and for selection only; states with
  their own colours; waiting-for-a-person more visible than working
  or idle; selection unmistakable.
- The sidebar as it is, with the state badges lighter than the names
  and "+ new" reachable.
- Files: "into project" replaced by a target that names the
  repository as such; the empty reader offers "select a file" and the
  changed files; labels on the file actions.
- Features: one short explanation with the create action in the
  empty state; the list ordered review first, then in progress, then
  planned; rows lead with the title.
- Both colour modes and two widths (1280 and about 900) looked at
  before the gate; a screenshot of each screen in each mode in the
  report.

**Facts.** The layout lives in `ProjectView.vue` (header, transcript
mount, composer), `TranscriptItem.vue` and `TranscriptView.vue`
(items, the rule, the floating buttons), `ProjectTree.vue` (sidebar),
`ProjectsView.vue` (the blocks and the list), `FilesView.vue`,
`FeaturesView.vue`, `AppShell.vue` (top bar, gear menu). Tailwind
throughout; `text-xs` is 10.5 px here and is the default almost
everywhere. Playwright asserts on `data-test` ids, not on classes, so a
visual change breaks few tests; the geometry assertions on the
activity line must keep holding. The floating toolbar in dev
screenshots is Vue devtools, not the UI.

**Worth.** A day in the session, since it is decided by taste. Not
delegated.

**Gate.** Worked alone, in stages if it helps (type scale and header;
transcript; projects page; files and features), each looked at in both
modes; the full suite and lint at the end; deployed together.

## Report (2026-09-20)

Done on the branch `ui-rethink`, four commits (eef52ae, f885e58,
f03fb60 and the branch's opening one), the branch build installed on
the hub for looking; `main` is untouched, so the way back is a checkout
of `main` and `npm run build` plus `install:ui`.

**What changed.**
- The type scale: `text-xs` and `text-sm` each moved up one step
  across every component, the transcript's prose is the base size, so
  at the default preference lists and navigation are 14 px, metadata
  12 px, the conversation 14 px and larger with the preference.
- The agent header is one line: the name with a disclosure, the state,
  the model, "started by <agent>" for a helper, the error or the
  background wait, the changed-files link as the line's one coloured
  thing, and the four lifecycle actions as one grouped control with
  borders. Profile, directory, effort, permissions, usage and the
  harness note ("what it was told") sit under the disclosure.
- The transcript: the person's messages are left-aligned blocks with
  a thin blue left border and a light tint, author and time in a
  gutter line, no bubbles; the composer and its buttons align with
  the reading column; "steer the agent…" is the working placeholder
  and the explanation moved to the button's tooltip.
- The projects page leads with its list; each row carries attention
  signals (waiting for you, to review, working, in error) and the agent
  total; one quiet usage line above links to the machine page. The
  four blocks (account usage, harness note, models, method and framing
  with learnings) moved to `/machine`, reached from the gear menu.
- State badges lost their bold weight; features list review first,
  with one short empty state; the files toolbar says "uploads go to
  <dir>" and the empty reader offers the tree or the changes view.

**What was verified.** Playwright, 24 tests, green after the tests
that read the header's facts open the disclosure and the tests of the
machine's blocks visit `/machine`; type-check and lint clean. Looked
at, by screenshot: the agent view idle, with details, working, and in
dark mode; the projects and machine pages; the features and files
views; at 1280 and 900 wide. The dark-mode screenshots at 900 came
out light because the preference store reapplies the saved theme on
navigation; the agent view's dark mode was checked at 1280.

**Left open.** The features list with reports and reviews on the row
is the next feature once the run log has a few weeks in it. The
sidebar's "+ new" is larger by the scale change only. The machine
page is the old blocks moved, not redesigned. The `AgentCountBadges`
component is no longer used on the projects page and stays for the
tree. A `data-count` assertion became an attention-signal assertion.

**Noticed and left alone.** The screenshots showed each new agent
twice in the sidebar, the creating tab hearing its own `agent.created`
frame before the reply; fixed on `main` first (5575883), since it was
live. The dev server's Vue devtools toolbar floats over every
screenshot and is easy to mistake for the UI.

## Report (2026-09-20, second round)

The top bar, on the person's note that "edit agents files features"
was a random row and the tree's selection dictated what the other two
views showed without saying so. The project is now the anchor: its
name is a switcher (the other projects with what needs attention, edit
this one, all projects), and agents, files and features are its tabs,
each saying what it holds: the agents waiting for you or the total,
the files changed since you last looked, the features to review. One
component (`ProjectHeader.vue`) serves the three views; the host chip
and warning moved into it. Verified by the suite (24) and screenshots
of the bar closed, open and on the files view; the edit test opens the
switcher first. Directly on `main`, commit f228bf5.
