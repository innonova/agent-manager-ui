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

## Features view

Features grouped by status in working order (in progress, review,
blocked, planned, done), each expandable to its markdown body, which is
the spec followed by the agent's `## Report` sections and the human's
`## Response` sections. Nothing here starts work: the human asks an
agent in its conversation, and the manager's `feature.changed` events,
fed by its poll of the files, show the feature going in progress and
landing in review. Under an expanded feature a response box appends a
dated `## Response` and sends it back to planned; rows offer done and
reopen, and planned features an edit dialog for title, body and
priority. The response text and the new-feature form are kept in the
drafts store (see Display preferences, Drafts), so switching tab or
reloading does not lose them.

A form creates a new feature file from a title and a markdown
description; the slug is derived from the title and the file goes to the
primary repository (which repository a feature "belongs to" is rarely
obvious up front, and the agent works across the project anyway). Slug
and priority can be overridden behind a "more options" toggle. In
multi-repo projects each row shows which repository the feature lives
in, since files can also be written by hand in any of them.

## Transcript rendering

Items from the manager map onto components:

| item.kind | rendering |
|---|---|
| `user` | right-aligned bubble |
| `text` | markdown, grows while `streaming` |
| `thinking` | collapsed, expandable |
| `tool_use` | one line: tool name and a compact input summary; expandable |
| `tool_result` | collapsed under its tool_use; red when isError |
| `error` | red banner with the vendor message verbatim |
| `system` | grey note (session started, resumed, daemon notice) |
| `turn_end` | thin rule with duration and cost when present |

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

## Notifications

Agent state changes to `error` raise a toast. With the "desktop
notifications" preference on (a per-browser setting; turning it on asks
the browser for permission, from the click), a browser notification is
shown when an agent finishes working, needs input or a permission, or
fails, but only while the page is not focused: someone looking at the
page sees the state badge. One notification per agent at a time;
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
