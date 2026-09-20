---
title: a changes view of its own: the project's commits, with who, when and for what
status: planned
priority: 35
---

**Purpose.** A person should be able to keep up with what agents change
in a project. Today "changes" is a mode of the files view showing one
diff since a per-person marker that moves only when the view is
opened; agents commit every few minutes, so it is always a large diff
from an arbitrary moment and the only thing to do with it is mark it
read. The unit a person can follow is the commit, with its context:
who made it, in which turn, for which feature. Seen as a list, at the
reader's pace, with the diff one click away, and filtered to a feature
or a run when that is the question.

**Requirements.**
- A `changes` tab of its own, between files and features, in the
  project's top bar, with a count on it: commits since the person's
  marker.
- The view: left, the list of commits across the project's
  repositories, newest first, each row with the repository, the short
  hash, the subject, who (the agent's name when an agent made it in a
  turn, else the git author), when, and the feature slug when the
  commit fell in a run's window (the run log's base and end commits,
  or the feature's own range); a marker row "you last looked here",
  which moves to the top when the person leaves the view, not when
  they open it. At the top, above the commits, one row per repository
  with uncommitted work: "working tree · <agent> · in progress" with
  the changed file count. Right: the selected commit's diff (or the
  working tree's), file by file, in the diff viewer the files view
  already has. Keyboard: up and down move through the list.
- Filters at the top of the list: by feature (a select of the
  project's features; also reached from a feature row's "what changed"
  and from a run in the run log), by agent, by repository. A filter
  shows the same rows and diffs, narrowed.
- The files view loses its changes mode; the "N changed since you last
  looked" link in the agent header and the files tab's badge point at
  the changes tab and count commits since the marker.
- Nothing polls the vendors. The list is git, read by the manager:
  `GET /api/projects/:id/commits?since=&repo=&feature=&agent=&limit=`
  returns commits with the context joined in from the run log and the
  turn authors; `GET /api/projects/:id/commits/:repo/:hash` returns the
  diff; the working tree diff route exists. A commit made outside any
  agent, by a person in a shell, appears with its git author and no
  turn.
- The marker is per person and per project, as the read cursor is
  today, and moves on leaving the view.

**Facts.** The manager records a base commit when a feature first goes
in progress and an end when it is done (`feature_ranges`, "A feature's
work spans a range" in `agent-manager/docs/design.md`), and the run log
records base and end per run with the agent and the feature
(`src/runs/`); `src/changes/git.ts` has `head()` and the diff plumbing
the files view's changes mode uses (`GET /api/projects/:id/changes`);
`turn_authors` says who sent each turn. Claude's stream reports a
commit as `vcs_state_changed` and the adapter turns it into a
`committed` ingest and a "committed on main" transcript item (design
doc, Adapters); whether Codex and Copilot report commits is not
known, so the list is read from git rather than from events, and an
event only refreshes it. The UI's diff viewer is `DiffViewer.vue`; the
files view's changes mode is the `mode === 'changes'` branch of
`FilesView.vue` and the `changes` store; the read cursor is in the
manager's `read_cursors` (see the design doc's Files and changes).
The commits list is a new manager route and a new UI view; the
top-bar component is `ProjectHeader.vue`.

**Hard to verify.** That a commit is attributed to the right feature
when two features' rounds interleave in one repository (the run's
window decides; a commit in no window carries no feature); that the
marker moves on leaving and not on opening, across a reload; that the
list stays right after a rebase or an amend (a hash that vanished
shows as gone, the list is re-read from git, nothing is cached beyond
a request); and the two-tab case: a commit made by an agent appears in
another tab's list without a reload (the commit event, or the turn
end, refreshes it).

**Worth.** A day's round for one agent across the two repositories,
with the person looking at the screen before the gate. If the git
side turns out to need more than `git log` and `git show`, say so.

**Gate.** Worked alone: each repository's full gate, one commit per
repository, no push, no deploy; a screenshot of the view with a
filter applied and one of the diff, in both colour modes, in the
report; the delegating agent looks at the screen, closes the gate and
deploys.
