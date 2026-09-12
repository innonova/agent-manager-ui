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
