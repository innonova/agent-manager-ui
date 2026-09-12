# agent-manager-ui

Vue 3 front end for `agent-manager`. `docs/design.md` is the source of
truth for what it shows and how; the API and models it renders are
specified in `../agent-manager/docs/design.md`.

## Rules that follow from the design

- Thin: render manager state, send manager commands. Never talk to the
  daemon, never parse an agent line, never derive agent state client-side.
- All data goes through the manager's `/api` REST and `/api/events`
  websocket; in development Vite proxies `/api` to the manager.
- Every live update flows through the Pinia stores; components read stores
  and call actions.
- Use the same words as the manager: project, agent, session, feature,
  turn, item.

## Stack and commands

Vue 3, Vite, TypeScript, Tailwind 4, vue-router, Pinia; vitest + Playwright.

```
npm run dev          # Vite; expects agent-manager on 4268 (and a daemon behind it)
npm run build        # type-check + vite build -> dist/, which the manager serves
npm run test:unit
npm run test:e2e     # Playwright against a manager running with the fake adapter
npm run lint && npm run format
```

## Working here

- Sibling repositories: `../agent-manager` and `../agent-daemon`.
- Develop against the fake adapter; real agents cost tokens.
- Review loop as in `../agent-daemon/docs/reviewing.md`.

## You may be running inside this system

These three repositories are registered as one project in the installed
agent-manager, and agents started from it work on this very code
(dogfooding). Keep that in mind:

- The installed `agent-daemon` user service holds your own session.
  `npm run install:service` in `agent-daemon`, `systemctl --user restart
  agent-daemon` and a reboot end every session, including yours. Do not
  do that; leave it to a human. Building, unit tests and `test:e2e` are
  fine: they use ephemeral ports and their own state directories.
- Restarting the installed `agent-manager` (`npm run install:service` in
  `agent-manager`) is safe: agents live in the daemon and are re-adopted.
- `agent-manager-ui`'s Playwright suite starts its own daemon and manager
  on the fixed port 4299; only one run at a time on this machine.
- One writing agent per repository. Other repositories of the project are
  reachable at the sibling paths (`../agent-daemon`, `../agent-manager`,
  `../agent-manager-ui`); prefer editing them only when the task needs it,
  and say so in your summary.

## Features

Units of work live in `features/<slug>.md` in each repository
(frontmatter: title, status, priority, dependsOn; body is the spec). The
manager owns the `status` field while it moves a feature through
`queued` and `in-progress`; never edit that field, and do not create or
edit feature files unless asked to. The convention is specified in
`../agent-manager/docs/design.md` (Features).
