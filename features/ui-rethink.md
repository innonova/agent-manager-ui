---
title: the UI as a reading app: hierarchy, one header line, projects first
status: in-progress
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
