# agent-manager-ui

Browser front end for `agent-manager`: a project list with live agent
states, per-project agent transcripts with a turn input, a read-only file
browser (Monaco) and a features board that queues `features/*.md` work on
agents. It never talks to the daemon or parses agent output; everything
comes from the manager's REST and websocket API.

- What it shows and how: [docs/design.md](docs/design.md)
- The API and models it renders: `../agent-manager/docs/design.md`
- Agent instructions for this repository: [CLAUDE.md](CLAUDE.md) (`AGENTS.md` is the same file)

## Development

```
npm install
npm run dev            # Vite on :5173, proxies /api to agent-manager on :4268
npm run build          # type-check + vite build -> dist/ (the manager's install script picks it up)
npm run test:unit
npm run test:e2e       # Playwright; starts its own daemon + manager with the fake profile on :4299
npm run lint && npm run format
```

The e2e suite needs `../agent-daemon` and `../agent-manager` built
(`npm run build` in each) and Playwright's Chromium (`npx playwright
install chromium` once). It costs no tokens: every agent is the fake one.

## Deploying

The manager serves the built UI. Build here, then run
`npm run install:service` in `../agent-manager`; it copies `dist/` and
restarts the manager, which does not affect running agents.
