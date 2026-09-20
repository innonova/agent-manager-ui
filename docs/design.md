# agent-manager-ui design

## Purpose

The browser front end for `agent-manager`. It shows projects, the agents
in them and what those agents are doing, lets the user talk to an agent,
browse the project's files and changes, and work its features. It is the layer meant
to be rebuilt most often; nothing of value lives only in it.

See `../agent-manager/docs/design.md` for the system, the API and the
models this UI renders.

## Principles

1. **Thin.** The UI renders manager state and sends manager commands. It
   knows nothing about the daemon and never parses an agent line; the
   manager delivers transcript items and agent states ready to display.
2. **Live.** One websocket delivers every change; REST is for initial
   loads and commands. The UI must recover from a dropped connection by
   refetching, never by assuming.
3. **Project-oriented.** The project list is the home screen and shows, per
   project, how many agents are working, idle, in error or waiting. Agent
   state is visible without opening anything.
4. **Same words as the manager.** Project, agent, session, feature, turn,
   item.

## Stack

Vue 3, Vite, TypeScript, Tailwind 4, vue-router. Added: Pinia for the
stores, Monaco (milestone 2). Vitest for unit tests, Playwright for
end-to-end against a manager running with the fake adapter.

## Views

```
/login                          name + password
/                               project list: name, repositories, agent counts by state; new/edit project form with repo rows
/users                          accounts: create (password shown once), rename yourself, reset, remove
/projects/:id                   project: agents sidebar, no agent selected
/projects/:id/agents/:agentId   the selected agent's transcript and composer
/projects/:id/files?path=       file tree + Monaco, read-only; the open file is in the URL; a changes mode with diffs
/projects/:id/features          features grouped by status; done, block, reopen, edit, respond; new feature form
```

Project view layout: left column lists agents with a state badge; main
column shows the selected agent's transcript with a turn input at the
bottom; header shows project name and a "new agent" action. A project is
an ordered set of repositories (the first is primary, see the manager's
design doc); the project form edits them as rows of name + absolute path,
and the new-agent form picks the working repository when there is more
than one.

## Files view

A lazily loaded tree on the left (the root shows one folder per
repository, directories expand on click, symlinks marked) and a read-only
Monaco editor on the right, language chosen by extension, following the
theme and font size preferences. Monaco is loaded only when the view is
opened. Expanded directories and the open file are re-read whenever an
agent in the project stops working (idle, error or exited), and on a
manual refresh; the open file is replaced only if its mtime changed, so
the scroll position survives. Binary and oversized files show a notice
instead of content.

The tree looks like VS Code's: a chevron that turns when a directory
opens, an inline SVG icon per entry (`FileIcon.vue`: folder open/closed,
and a small set of file kinds by extension or well-known name, with muted
colour accents), indent guides under each open directory, entries the
manager reports as `ignored` (git's verdict) drawn at half opacity, and
`.git` itself hidden as VS Code does. Entries with a git `status` are
tinted with VS Code's decoration colours and carry its letter (M, A, D,
U, C) at the end of the row; a directory shows the most significant
status of its contents. Hovering shows path, size, modification time and
the git flags. Which directories are expanded is remembered per project
in localStorage; opening a file from the URL expands the directories
above it; a "collapse" action folds everything back to the repositories.

A filter box narrows the tree to names containing the text (loaded
entries only, since the tree is lazy); directories with matches are held
open while it is set, Escape clears it. The tree takes keyboard focus:
up/down move a cursor, right expands or steps into a directory, left
collapses or steps out, Enter or Space opens or toggles, Home/End jump.

## Changes view

The files tab has a second mode, "Changes": what differs between a base
and the working tree, per repository, as a list of files with the tree's
status letters and colours, and a Monaco diff editor (side by side or
inline) for the selected file. The base is the user's read cursor by
default ("since you last looked"; "mark as read" moves it to the current
commit, is disabled when nothing is committed since it, and says in a
toast how many uncommitted changes still show), a feature's recorded range ("changes" on a feature row), or a
commit. The manager's `note` for a base that fell back to HEAD (nothing
read yet, history rewritten, no range) shows above the list. The list
reloads when an agent in the project stops working, like the tree. The
agent page shows "N changed since you last looked" linking here, and the
mode switch carries the same count. Uncommitted work always shows; the
view never writes to the tree.

## Features view

Features grouped by status in working order (in progress, review,
blocked, planned, done; done newest first with its date on the row,
the rest by priority), each expandable to its markdown body, which is
the spec followed by the agent's `## Report` sections and the human's
`## Response` sections. Nothing here starts work: the human asks an
agent in its conversation, and the manager's `feature.changed` events,
fed by its poll of the files, show the feature going in progress and
landing in review. Under an expanded feature a response box appends a
dated `## Response` and sends it back to planned; rows offer done,
block (park it: agents leave blocked features alone) and reopen, and an
edit dialog for title, body and priority on anything
not in progress (the agent may be writing the file then). The response text and the new-feature form are kept in the
drafts store (see Display preferences, Drafts), so switching tab or
reloading does not lose them.

A form creates a new feature file from a title and a markdown
description; the slug is derived from the title and the file goes to the
primary repository (which repository a feature "belongs to" is rarely
obvious up front, and the agent works across the project anyway). Slug
and priority can be overridden behind a "more options" toggle. In
multi-repo projects each row shows which repository the feature lives
in, since files can also be written by hand in any of them.

## Presence

Every tab reports which agent it has open and, at most every two
seconds while the text changes, that its user is typing there; the
manager broadcasts the picture; the agent header shows who else is here
and a line directly above the turn input, where the eye is while typing,
shows "bob is typing…". Your own tabs are not shown to you.
Typing stops being reported when the turn is sent or the field is
emptied, and the manager expires it after five seconds regardless. The
point is that two people do not send a turn into the same agent at
once; the manager would refuse the second anyway, so this is courtesy,
not safety.

## Users

A users page (from the settings menu) lists everyone with their last
login. "New user" takes a name; the manager's generated password is
shown once in a dialog with a copy button. You can rename yourself
inline. "New password" on any row, behind a confirm that names the user
and says their logins will end, shows the new one once. "Remove" on any
other row, behind a confirm. Everyone is a trusted admin, so nothing is
hidden by role. `users.changed` events keep the list and your own name
in the header current.

## Agents and permissions

The new-agent form takes an optional model name and effort level,
vendor names passed as is at session start (the vendor rejects a bad
one), and the agent header shows the model the vendor reports as active
as a chip on its second line, with an "effort <level>" chip after it
when one was set, an "asks" chip in ask mode, and the profile and
working directory on the right: everything the agent was created with
is on that line, since there is no editing. A "harness" link before
the profile opens what the agent was told about running here at its
last session start (the manager's harness note, see its design doc);
it is absent when the operator turned the note off. The new-agent form also has a permissions choice: `bypass` (default, the agent
acts without asking) or `ask` (the vendor's gated tools wait for the
human). It is fixed at creation and applied when the agent's session
starts.

## Transcript rendering

Items from the manager map onto components:

| item.kind                      | rendering                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `user`                         | right-aligned bubble, with the sender's name above it when the manager knows it (`by`)                                                                                                                                                                                                                                                                                            |
| `text`                         | markdown, grows while `streaming`                                                                                                                                                                                                                                                                                                                                                 |
| `thinking`                     | shown inline as plain text, meant to be read: with summarised thinking these are short, curated remarks the CLI would show anyway; only a long one (over ~600 characters) is folded                                                                                                                                                                                               |
| `permission`                   | an amber card while undecided: tool, what the agent wants, the command or input, and a button per option the vendor offers (Allow, Always allow, Deny); once decided, a plain card noting the choice. The turn input is disabled meanwhile. Only agents created with `permissions: ask` produce these                                                                             |
| `tool_use` + its `tool_result` | one collapsed line: tool name, what the call is for (Claude's Bash `description`, a file tool's path, a search's pattern, else the command or a compact input), and the result's size or "error" or "running…"; unfolding shows the command (or the input as JSON) and the result. The pairing is by tool id, done in the view; a result whose call is missing renders on its own |
| `error`                        | red banner with the vendor message verbatim                                                                                                                                                                                                                                                                                                                                       |
| `system`                       | grey note (session started, resumed, daemon notice)                                                                                                                                                                                                                                                                                                                               |
| `turn_end`                     | thin rule with the time it ended, duration and cost when present                                                                                                                                                                                                                                                                                                                  |

Every item carries the time of its daemon record: system notes show it
inline, a permission card says since when it waits, a user bubble shows
it on hover. The agent header says how long the agent has been waiting
on background jobs when it is idle with some pending.

The transcript auto-follows while the user is at the bottom and stops
following when they scroll up.

## State

Pinia stores: `session` (current user), `projects` (list with counts),
`agents` (per project with state, and per agent the transcript as an
index-keyed array), `presence`, `features`, `files`, `changes`, `drafts`,
`preferences`, `notifications`, `attention`, `update`. The websocket
client updates the stores; components only read.

Websocket client: connects to `/api/events` after login, reconnects with
backoff, and on reconnect refetches projects and the open agent's items
from the last known index so nothing is missed. The header's
"reconnecting…" badge appears only after two seconds without a
connection: proxies and manager restarts drop the socket and it is back
within a second, which is not worth a flash.

## Display preferences

A settings menu in the header holds per-browser preferences, persisted in
localStorage and applied to `<html>` before the first paint:

- **Theme**: system, light or dark. Dark is a manual choice (a `dark`
  class on the root, Tailwind's `dark:` variants follow it), not only the
  OS setting, because some people want it for some apps only. The dark
  palette is VS Code's Dark+ rather than Tailwind's blue-tinted slate:
  `src/assets/main.css` remaps the `slate-*` and `blue-*` colour
  variables inside `.dark`, so components keep using the same utility
  classes in both modes and one table restyles everything. Monaco's
  `vs-dark` theme is the same palette.
- **Font size**: a stepped base size from 12 to 20 px on the root element;
  everything is sized in rem, so the whole page scales.
- **Drafts**: unsent turn text is kept per agent in a store and persisted
  in localStorage, so switching tab, agent or project, or reloading, does
  not lose it. Sending or clearing the field drops the draft.
- **Enter key**: what a bare Enter does in the turn input. `send` (with
  Shift+Enter for a newline), `newline` (the button or Ctrl+Enter sends),
  or `auto`, the default, which is `send` unless the primary pointer is
  coarse (`(pointer: coarse)`, tracked live): on-screen keyboards have no
  usable Shift+Enter, so a tablet or a Surface without its keyboard gets
  newline on Enter. Ctrl+Enter and Cmd+Enter always send.

## Icon

A bespoke favicon in `public/`: a rounded dark square with a blue prompt
chevron driving a column of three dots, the agents. Palette is the Dark+
one the dark theme uses, so it sits well in either theme's tab strip.
`favicon.svg` is the source and the icon modern browsers use;
`favicon.ico` (16, 32 and 48 px) and `apple-touch-icon.png` (180 px) are
rendered from it with `scripts/favicon.mjs` and must be regenerated when
the SVG changes.

## Updates

Each build carries an id (`__BUILD_ID__`, also written as `build.json`
next to the bundle). The manager reports the id of the build it serves
in `hello` and announces a change with a `ui.build` event, which it
notices on its ping tick after a UI-only deploy swaps the directory. A
different id from the one running shows an "update available · reload"
button in the header. Nothing reloads by itself, since a draft or a
scroll position may be in play, and the page never polls for this.

One exception: a deploy replaces the hashed chunk files, so the first
lazy route a stale tab opens fails to load its module. That is caught
in the router (and Vite's `vite:preloadError`) and the tab reloads
straight into the new build at the requested address; drafts survive
since they are persisted. If the same failure recurs within fifteen
seconds of such a reload it is not staleness, and a toast says the page
could not be loaded instead of looping.

## Method and learnings

`/method` is the note-file page with kind `method`: how work is run
under this manager (features, the gate, helpers, reviews, debriefs),
per install, shipped and seeded like the models file, edited in the
same editor; agents read it with `am method`. `/learnings` lists the
install's learnings log newest first (the file is oldest first) with a
form to add an entry: text and an optional pointer; the manager stamps
time and author, and nothing edits or deletes an entry. Both get a row
in a "Method" block on the projects page. A hub shows and writes per
host.

## Harness note

The models file (`/models`, the same page and editor with `kind`
`models`, a second block on the projects page) is the house view of
which model suits which work; the manager renders it into every note
under a "Models" heading. Same shipped-or-custom-or-off states, at
most 8 KB, and the page's footer says so instead of listing
placeholders.

The projects page has a "Harness note" block: per machine, whether
agents there get the shipped note (no file, or one equal to the shipped
text), a custom one or none, with a link
to `/harness`, a page that is the template in the files view's Monaco
editor (editable, wrapped, no bracket auto-closing since it is prose)
with a host picker when there are several machines. Its toolbar:
"save" (enabled once the text differs from what is in force), "load
the shipped text" (into the editor only), "use the shipped note"
(writes the shipped text back into the file, after a confirm), "turn
off" (saves an empty file, after a confirm); the placeholders are listed under the editor. It
reads and writes `/api/harness`, which a hub forwards to its spokes by
host name, so each machine's file is edited from the one UI. A change
reaches an agent at its next restart, and the toast says so; what a
given agent was actually told is behind "harness" in its header.

## Account usage

The agent header has two lines: the name, state and error with the
presence, unread and actions on the first; the model, usage, permission
mode and the background-wait note on the left of the second, the usage
centred, the profile and working directory on the right. The usage is
plain text in the line's own grey, tinted lightly amber near a limit
and red at one, so it can be found without drawing the eye. An agent whose vendor reports the account's limits
gets a chip on that second line, "5h 33% · 7d 41% · fable 66%" with
every window the vendor names (Claude's "overage included" window is
the Fable one, as Claude Desktop labels it) (Copilot: "ctx N%", its context window; with no windows, as on
Bedrock or Vertex, the agent's cost or tokens instead), amber from
80% and red when the vendor refuses, with the reset times, the spend,
the provider and the plan in the tooltip. The vendors' spend counters
start over when an agent is restarted, so the spend shown is the
manager's `total` across the agent's sessions when it has one, and the
tooltip gives both that and the part since the last restart. The projects page shows an "Account usage"
block with the latest report per machine and vendor from `/api/usage`,
refreshed half a second after any agent reports new usage. Only what
agents report while working: nothing polls the vendors.

## Uploads and new folders

The files tree can take files. Its toolbar, a row under the mode tabs
like VS Code's explorer header, holds the actions as icons with
tooltips: upload (a picker; a drop on the tree does the same), new
folder, collapse all, refresh. Both land in the
target directory: the focused directory, else the directory of the
focused or open file, else the first repository; the header says "into
<dir>" so the target is never a guess, and the selected row stays
marked while the tree is not the focused element. A name already in use asks before replacing; a name with a slash or a
dot entry, and a dropped folder, are refused with a toast. After an
upload the toast offers "mention to agent": it appends `See <path>` to
the draft of the agent last opened in this project (else its first
agent) and goes there, so the
next thing you type tells the agent what to do with the file. Uploads
are raw bytes, at most 25 MB each; the file is then simply in the
working tree, untracked, as the changes view shows.

## Images with a turn

Paste an image into the composer, or drop one on it, and it shows as a
thumbnail above the box with a remove button; it goes with the next
send, as base64 in the turn's `images`, and the thumbnails clear once
the manager accepted the turn. A message may be images alone (sent as
"(image)"). The same limits as the manager's apply in the box (four
images, three megabytes each; png, jpeg, gif, webp), said inline when
exceeded. A user item shows its images as thumbnails that open full
size in a new tab (through a blob URL, since browsers refuse to open a
data URL from a page). The composer is keyed on the agent, so pasted
images belong to the agent they were pasted for and are dropped on
leaving it; sending waits for a paste still being read. Pasted images
are not part of the draft: they are lost on navigation, unlike the
text.

## Steering a working agent

While an agent works, the composer stays open and its button reads
"steer": the message goes to the manager with `steer: true`, which
delivers it into the running turn where the vendor can take one
(Claude, Codex) and otherwise holds it for the next turn; a held
message shows as "N queued" beside the button and a toast says so.
Starting and waiting on a permission still block sending. Interrupt is
unchanged.

The header's actions are stop, restart, archive and delete. Archive
ends the session and takes the agent off the list; its transcript
stays and it is reachable under the project's "archived" row in the
sidebar tree, which loads the archived agents when opened, each with
a link and a delete. Delete forgets the agent for good on the manager
(process, the daemon's logs of its sessions, the cached transcript;
the vendor's own store stays), after a confirm; an `agent.removed`
frame drops it from every tab. Restart stops and
resumes that one agent with the current settings (a repository added
to the project, a changed harness note), conversation intact; the
manager refuses it while the agent works, waits on a permission or has
background jobs, and the refusal shows as a toast, so interrupt first
when that is meant. An exited agent is simply started. A session frame
makes the store refetch the agent's record, since a new session changes
it (the session id, the harness note it was given).

## What the agent is doing

The manager's `status.activity` (`{ kind: 'thinking' | 'writing' | 'tool' |
'waiting', detail?, tokens?, since } | null`) says what the last thing on
the stream was doing; a line shows it, muted, while it is not null.
It overlays the bottom of the transcript pane (`ActivityLine.vue`,
translucent, the same technique as the "is typing…" note) rather than
being inserted between the transcript and the composer: reflowing either
one on every turn start and end would move a reader's scroll position and
the composer itself. Sized and centred like the transcript's own item
column (same max width, same edges), not the pane's full width, so its
label and elapsed time line up with what is above them; the transcript's
own "↓ latest" button shifts up to clear it while it shows (its measured
height, via a `ResizeObserver`, reaches `TranscriptView` as a prop), and
the scroller reserves that height below the items, so the newest item
(the running tool call, typically) scrolls up clear of the overlay
instead of sitting under it, and a view that was at the end stays there.
`writing` just says "writing" and `waiting` says "waiting for your
answer" — both already show themselves elsewhere (the growing reply, the
permission card). `thinking` and `tool` are open-ended, so they get more:
a left-aligned word and, right-aligned on the same line, the elapsed time
ticking locally from `since` ("12 s", then "3 min", `src/time.ts`'s
`since`). `thinking`'s word is not always "thinking": one of a small set
of quiet synonyms (thinking, musing, pondering, weighing, considering) is
picked once per thinking stretch — keyed on `since`, so a `tokens`-only
update to the same stretch does not reroll it — not per tick, so it
holds still while the seconds advance. `tool` says what kind of thing
the last `tool_use` item's name is ("running a command", "reading a
file", "editing a file", "searching", else "waiting for a tool"), never
the raw command or path: the transcript already has that (`Transcript
rendering`). That `tool` phase is read from the transcript itself, not
`status.activity.kind`, whenever the last item is a `tool_use` without
its result yet: the manager throttles `activity`-only announcements to
at most one a second, which can otherwise leave the line saying
"thinking" for a moment after the transcript already shows the call
running. When `tokens` (the turn's output so far, absent until a vendor
has said anything usable) is present, it sits between the word and the
elapsed time: "musing · 340 tokens · 12 s". While `activity.kind` is
`thinking`, the tail of the current transcript's last item streams in
under the line — but only when that item is longer than what the
transcript already shows inline (`THINKING_FOLD_CHARS`, `src/constants.ts`,
also `TranscriptItem`'s own fold cutoff): a short thinking item is on
screen twice otherwise, once in the transcript and once in the live box.
Capped at three lines, monospace, muted, pinned to the bottom as it grows
so older text scrolls away; it is the live view of the same item the
transcript already shows, nothing new is kept. The line and the streamed
text disappear together the moment `activity` goes back to `null` (a
turn ending, or any other state change). The state badge and header stay
as they are; this is additional, not a replacement.

## The sidebar is a tree of projects

Inside a project, the sidebar lists every project (with a host badge
when there are several), the current one expanded with its agents and
their states and attention marks, the others collapsed to their agent
counts. A collapsed project expands in place with a chevron, loading its
agents then; a project you leave stays open, so several can be unfolded
at once, and the set is kept in local storage across reloads. Clicking a
project or an agent opens it, so switching context is one click from
anywhere. "+ new" sits on each expanded
project. The projects page is for creating and editing projects, reached
by "manage".

An agent created elsewhere — by a person in another tab or by an agent
with `am new` — appears here without a refresh: the manager's
`agent.created` frame carries the new agent's record and status, and the
agents store adds it to the project's list (only where that project's
list is already loaded in this tab; opening the project later fetches
the whole list, so an unloaded project is never left a partial list of
one). The counts move with it via `project.counts`, as they already do.
The reverse too: `agent.archived` (off the active list, still readable
under the "archived" row) and `agent.removed` (forgotten for good) each
drop the agent from every tab's list; if the archived row is open, it
reloads to show the newcomer or its absence. A tab that has the agent's
own page open when it is archived elsewhere is left as it is: the
transcript stays valid and readable, as for a remove today.

## Several machines (a hub)

When the manager is a hub, `hello` and `hosts` frames list the machines
(`hosts` store). Projects carry `host`; with more than one host the
project list and the project header show it as a badge, struck through
when the hub cannot reach that machine, and the project header warns
when the host is unreachable or its daemon is down. The new-project form
offers the machine to create on. Profiles for a new agent come from
`/api/projects/:id/profiles`, the machine the project is on. The hosts
store is created at startup and also asks `/api/health`, so it has the
picture even when `hello` passed before a view mounted. On
`host.reconnected` the agents and projects stores refetch what they hold
of that machine, as after their own reconnect. When a spoke's projects
are missing from the list (the spoke is down), the project view derives
the host from the id's prefix so the warning still names it. Nothing
else changes: ids are opaque, and every route works the same for a
remote project.

## Editing a project

The projects list's "edit" and the "edit" link in a project's header
open the same form as creation: name, repositories (add, remove,
reorder; the first is primary) and default profile. Running agents keep
the repositories they were started with, so the form offers "save and
restart agents" beside "save": it saves, then asks the manager to stop
and resume every idle agent of the project; agents working, waiting on
a permission or with background jobs are left alone and named in the
toast.

## Attention badge

The tab title gets a count and the favicon a red badge with it, for the
tab that is open but not looked at: agents in error or waiting for input
or a permission across all projects (from the project counts the manager
broadcasts), plus agents that finished a turn while this tab was hidden,
which clear when the tab is looked at again. The badge is drawn on a
canvas over the SVG favicon; nothing else changes.

## Notifications

Agent state changes to `error` raise a toast. With the "desktop
notifications" preference on (a per-browser setting; turning it on asks
the browser for permission, from the click), a browser notification is
shown when an agent finishes working, needs input or a permission, or
fails, but only while the page is not focused: someone looking at the
page sees the state badge. An agent that goes idle with background jobs
pending (the badge shows "idle · 1 bg") is not "ready". When the jobs
finish, Claude starts a turn by itself and the "ready" notification
comes at its end; Codex and Copilot just deliver the output, so a
"finished its background work" notification is sent instead, a few
seconds after the count drops to zero and only if no turn started
meanwhile. One notification per agent at a time;
clicking it brings the window up on that agent.

## Testing

- Unit: the agents store's transcript paging, and its live handling of an
  agent created (added only where the project's list is loaded, idempotent
  for the creating tab's own frame) and archived (dropped from the list)
  (`src/stores/agents.spec.ts`).
- End-to-end: Playwright against a real daemon (fake profile) and
  manager: login, project and agent creation, a streamed turn, an error
  turn and counts, reload, stop and resume, display and Enter-key
  preferences, desktop notifications, the update badge, drafts, the files
  and changes views, permissions, users, presence, features, editing a
  project with a restart, steering, the activity line (thinking then
  a tool call, streamed and gone at the turn's end), and a second tab
  seeing an agent created and then archived elsewhere without a reload.
  There is no test for
  a dropped socket; the store's reconnect refetch is covered by the unit
  test.

## Milestones

Matches the manager's: 1 login, project list, agent view; 2 files with
Monaco; 3 features; 4 the changes view (what changed since you last
looked, as a diff), which settled the earlier "diff view" question.
