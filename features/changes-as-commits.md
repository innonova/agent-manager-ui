---
title: a changes view of its own: the project's commits, with who, when and for what
status: review
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

## Report (2026-09-20)

**What changed.**

*agent-manager.* A commit list and per-commit diffs, read from git, with
run-window attribution.
- `src/changes/git.ts`: `log()` (`git log`, newest first, optional
  `since..HEAD`), `commitsIn()`/`countIn()` (`rev-list base..end`, the
  window sets and the unread count), `commitFiles()` (`diff-tree --root`
  against the first parent; a root commit's files are all added),
  `commitMeta()`; all through the existing `git()` wrapper (timeout,
  no-shell, null-on-failure). The git side needed no more than `git log`,
  `git rev-list`, `git diff-tree` and `git show`, as hoped.
- `src/changes/changes.service.ts`: `commits()` (the merged, newest-first
  list with `working` rows and `sinceCount`), `attribute()` (per repo,
  the innermost run window wins — latest-ancestor base, ties by most
  recent start; agent name and slug from that run, else the git author
  and no feature), `commitCount()` (the tab badge), and `commit()` (a
  commit's file list, or one file's `FileDiff` before/after, 404 for a
  vanished hash). Nothing is cached; every call re-reads git.
- `src/changes/changes.controller.ts`: a second controller
  `CommitsController` at `/api/projects/:id/commits` and
  `/commits/:repo/:hash[?path=]` (`?count=1` returns just the count),
  hub-unaware — the existing `hubProxy` forwards it to spokes by project
  id, and the `:repo`/`:hash` segments pass its safe-segment check
  (verified in the manager's hub-prefix unit test's sibling reasoning
  and the design doc). Wired in `changes.module.ts`.
- Attribution is run-window only, as agreed: `who` and `feature` both
  come from the winning run; a commit in no window is the git author with
  no feature. Docs: the two routes and a prose note in `docs/design.md`.

*agent-manager-ui.* A dedicated changes tab replacing the files view's
changes mode.
- New route `/projects/:id/changes` → `ChangesView.vue`: three columns —
  the commit list (subject, short hash, who, when, repo, feature chip)
  with the per-repo "working tree · \<agent> · in progress" rows above
  and a "you last looked here" divider; the selected commit's (or working
  tree's) files; and the `DiffViewer` for the chosen file. Up/down move
  through the list. Filters (repo/feature/agent) live in the URL, so the
  feature row's "changes" link (`?feature=<slug>`) and a run carry them.
- `stores/changes.ts` rewritten around commits: `commits`/`working`/
  `sinceCount`, filters, `openCommit`/`openWorking`/`openFile` (a commit
  diff via the new route, the working-tree diff via the existing
  `changes`/`changes/file` at `base=<head>`), refresh on `agent.state`
  idle (no polling), and `moveMarker()`.
- The marker is the read cursor; it moves to HEAD on leaving the view
  (`onBeforeRouteLeave` + unmount), not on opening. The changes tab and
  the agent page's "N new since you last looked" link count commits since
  it (`ProjectHeader.vue`, `ProjectView.vue`). The files view lost its
  changes mode (`FilesView.vue` is tree-only now); the feature row's
  "changes" link and the files empty-pane link repoint to the tab.
- `api/client.ts`, `api/types.ts`: `commits`/`commitCount`/`commitFiles`/
  `commitDiff` and the `Commit`/`WorkingChange`/`CommitsResult`/
  `CommitFiles` types. Docs: Changes view, Views, Testing, Milestones in
  `docs/design.md`.

**What was verified, and how.**
- *agent-manager* full gate: `npm run build` clean; `npm test` 116 unit;
  `npm run test:e2e` 126 e2e including a new `test/commits.e2e-spec.ts`
  that builds a real git repo and inserts two overlapping run windows to
  pin the four hard-to-verify cases — interleaved attribution (the
  innermost window wins; a base commit is outside its own window; a
  commit in no window is the git author), filters by feature and agent,
  the commit diff (including a root commit's added files), the
  unread/`sinceCount` after the cursor, the working-tree row, and after
  an amend the list is re-read while a truly gc'd hash 404s; `npm run
  lint` clean (the one warning is pre-existing in `scripts/smoke-agents.mjs`).
- *agent-manager-ui* full gate: `npm run test:unit` 12 (incl. the new
  `stores/changes.spec.ts`: list/working/count load, filters passed,
  refresh-on-idle only while active, marker move on leave); `npm run
  lint` clean; `npm run build` clean; `npm run test:e2e` 25 including two
  new changes-view tests — the commit list, a commit diff, the working
  tree and the marker moving on leave (count clears); and a commit made
  while watching appearing in a second tab without a reload (the fake
  agent only announces commits, so the test makes a real one and an
  agent's turn end is the refresh signal).
- Screenshots (a throwaway Playwright capture, since deleted; a run was
  driven to attribute a commit to a feature and agent), in
  `/tmp/changes-shots/`: `changes-list-{light,dark}.png` (the view with
  the feature filter applied — the commit list with its feature chip, the
  working row, the marker, and the diff) and `changes-diff-{light,dark}.png`
  (the diff close-up, Monaco following the theme).

**What is left open.**
- The commit-to-turn table: nothing ties a commit hash to the turn that
  made it, so attribution is run-window only. Two consequences carried
  forward as the agreed follow-up: a commit an agent makes in a
  *sibling* repository during a run (the run's window is defined only in
  the feature's own repository) is unattributed, and so is any commit
  made outside a run. Fixing both means capturing the hash from the
  `vcs_state_changed`/`committed` signal into a commit→turn record —
  whose worth is unclear while Codex and Copilot commit reporting is
  unverified either way.
- Not pushed, not deployed, per the gate: the delegating agent looks at
  the screen, closes and deploys.

**What I noticed and left alone.**
- A project with more than 1000 runs would not attribute a commit older
  than that window of runs (the list caps at 1000 runs read for
  attribution). Far beyond anything a reader browses; noted, not chased.
- `since=` on the commits route is supported (a per-repo commit lower
  bound) but the UI does not use it — the list is bounded by `limit` and
  the marker is the read cursor. Left in the route because it was a named
  requirement and is cheap.
- Merge commits are shown by their first-parent diff (`diff-tree`
  default); agents commit linearly here, so this was not exercised.
- Unrelated feature files in `agent-manager/features/` had status
  frontmatter changed on disk during the session (the running manager's
  own writes); left untouched and out of my commit.

Gated alone, both repositories.
