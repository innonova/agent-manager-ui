# agent-manager-ui design

Status: draft, 2026-09-12, written before implementation.

## Purpose

The browser front end for `agent-manager`. It shows projects, the agents
in them and what those agents are doing, lets the user talk to an agent,
and later browse the project's files and features. It is the layer meant
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
/projects/:id                   project: agents sidebar + selected agent transcript   (milestone 1)
/projects/:id/files?path=       file tree + Monaco, read-only; the open file is in the URL (milestone 2, done)
/projects/:id/features          features grouped by status, queue/dequeue/done/reopen, new feature form (milestone 3, done)
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
as a chip next to the state. The new-agent form also has a permissions choice: `bypass` (default, the agent
acts without asking) or `ask` (the vendor's gated tools wait for the
human). It is fixed at creation and applied when the agent's session
starts.

## Transcript rendering

Items from the manager map onto components:

| item.kind | rendering |
|---|---|
| `user` | right-aligned bubble, with the sender's name above it when the manager knows it (`by`) |
| `text` | markdown, grows while `streaming` |
| `thinking` | shown inline as plain text, meant to be read: with summarised thinking these are short, curated remarks the CLI would show anyway; only a long one (over ~600 characters) is folded |
| `permission` | an amber card while undecided: tool, what the agent wants, the command or input, and a button per option the vendor offers (Allow, Always allow, Deny); once decided, a plain card noting the choice. The turn input is disabled meanwhile. Only agents created with `permissions: ask` produce these |
| `tool_use` + its `tool_result` | one collapsed line: tool name, what the call is for (Claude's Bash `description`, a file tool's path, a search's pattern, else the command or a compact input), and the result's size or "error" or "running…"; unfolding shows the command (or the input as JSON) and the result. The pairing is by tool id, done in the view; a result whose call is missing renders on its own |
| `error` | red banner with the vendor message verbatim |
| `system` | grey note (session started, resumed, daemon notice) |
| `turn_end` | thin rule with the time it ended, duration and cost when present |

Every item carries the time of its daemon record: system notes show it
inline, a permission card says since when it waits, a user bubble shows
it on hover. The agent header says how long the agent has been waiting
on background jobs when it is idle with some pending.

The transcript auto-follows while the user is at the bottom and stops
following when they scroll up.

## State

Pinia stores: `session` (current user), `projects` (list with counts),
`agents` (per project, with state), `transcript` (per agent, items by
index). The websocket client updates the stores; components only read.

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

## Steering a working agent

While an agent works, the composer stays open and its button reads
"steer": the message goes to the manager with `steer: true`, which
delivers it into the running turn where the vendor can take one
(Claude, Codex) and otherwise holds it for the next turn; a held
message shows as "N queued" beside the button and a toast says so.
Starting and waiting on a permission still block sending. Interrupt is
unchanged.

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

- Unit: item components, stores, the reconnect logic.
- End-to-end: Playwright against a manager with the fake profile: login,
  create project, create agent, send a turn, see items stream, see counts
  change on the project list, reconnect after the socket drops.

## Milestones

Matches the manager's: 1 login, project list, agent view; 2 files with
Monaco; 3 features. A diff view is a later feature needing its own
discussion; "what did the last turn change" (highlighting entries whose
mtime moved since the tree's previous refresh) belongs to that
discussion rather than to the tree, see the manager's milestones.
