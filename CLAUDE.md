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

Deploying: `npm run build` here, then `npm run install:service` in
`../agent-manager` (it copies `dist/` and restarts the manager; agents
are unaffected). Details in `README.md` (Deploying).

## Working here

- Sibling repositories: `../agent-manager` and `../agent-daemon`.
- Develop against the fake adapter; real agents cost tokens.
- Review loop as in `../agent-daemon/docs/reviewing.md`.

## Finishing work

Completed work is committed, pushed and deployed without asking first.
None of those needs approval; they need judgement. A change is complete
when it does what was asked, tests and lint pass, and the docs that
describe the behaviour are updated (`docs/design.md` for a behaviour
change, `README.md` for an operator-facing one). Then:

- commit on the branch you are on (these repositories work on `main`)
  with a message that says what changed and why;
- push;
- deploy: `npm run build` here, then `npm run install:service` in
  `../agent-manager` (`README.md`, Deploying). Safe at any time.
- say in the summary what was committed, pushed and deployed.

Still ask first for force-pushes, history rewrites, deleting branches,
anything that ends daemon sessions, and work beyond what was asked. When
the work is a feature from `features/`, its report and status change are
part of the work: commit and push them with it (see Features).

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
(frontmatter: title, status, priority, dependsOn; body is the spec,
followed by the conversation about it). Nothing queues them: a human
asks you, in the conversation, to work on one or more of them, possibly
with caveats. When asked:

- read the whole file first; earlier `## Report` and `## Response`
  sections are the feature's history and the human's answers to it;
- set `status: in-progress` when you start;
- when finished, append `## Report (YYYY-MM-DD)` with what you changed,
  what you verified and what you left open, and set `status: review`;
  if you cannot or should not continue, say why in the report and set
  `status: blocked`;
- commit the file with the work; never edit the other frontmatter
  fields, and do not create or edit feature files otherwise unless asked.

The human reads the report in the manager, answers under `## Response`
and sets the status back to `planned`, or marks it `done`. The
convention is specified in
`../agent-manager/docs/design.md` (Features).
