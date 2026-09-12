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
repository, directories expand on click, symlinks marked) and a read-only Monaco editor on the right, language chosen by
extension, following the theme and font size preferences. Monaco is
loaded only when the view is opened. Expanded directories and the open
file are re-read whenever an agent in the project stops working (idle,
error or exited), and on a manual refresh; the open file is replaced only
if its mtime changed, so the scroll position survives. Binary and
oversized files show a notice instead of content.

## Features view

Features grouped by status in working order (in progress, queued, review,
blocked, planned, done), each expandable to its markdown body and last
run. A "run on" selector picks the agent; queue, dequeue, done and reopen
act through the manager, and `feature.changed` events keep the list
current. A form creates a new feature file with a slug derived from the
title, in the primary repository or a chosen one; in multi-repo projects
each row shows which repository the feature lives in.

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
from the last known index so nothing is missed.

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

## Notifications

Agent state changes to `error`, and later to `waiting-permission`, raise a
toast and update the document title with a count, so a user on another tab
notices.

## Testing

- Unit: item components, stores, the reconnect logic.
- End-to-end: Playwright against a manager with the fake profile: login,
  create project, create agent, send a turn, see items stream, see counts
  change on the project list, reconnect after the socket drops.

## Milestones

Matches the manager's: 1 login, project list, agent view; 2 files with
Monaco; 3 features. Git and diff views are a later feature needing its own
discussion.
