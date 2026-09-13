# agent-manager-ui

Browser front end for `agent-manager`: a project list with live agent
states, per-project agent transcripts with a turn input, a read-only file
browser (Monaco) and a features board that queues `features/*.md` work on
agents. It never talks to the daemon or parses agent output; everything
comes from the manager's REST and websocket API.

- What it shows and how: [docs/design.md](docs/design.md)
- The API and models it renders: `../agent-manager/docs/design.md`
- Agent instructions for this repository: [CLAUDE.md](CLAUDE.md) (`AGENTS.md` is the same file)

Installing the whole setup from scratch: `../agent-daemon/docs/install.md`.

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

The manager serves the built UI from its own install directory, so a UI
change reaches the browser only through the manager's install script.
There is no separate UI service.

```
cd ../agent-manager-ui && npm run build          # type-check + vite build -> dist/
cd ../agent-manager   && npm run install:ui      # swaps ~/.local/lib/agent-manager/ui in place; the manager keeps running
```

When the manager changed too, use `npm run install:service` there
instead: it rebuilds and restarts the manager and copies the UI along.

- Build the UI first. The install script copies whatever is in `dist/`;
  a stale build ships silently.
- `install:ui` never restarts anything; open tabs offer a reload within
  the manager's ping interval (it announces the new build). Restarting the manager (`install:service`) is safe
  at any time too: agents live in the daemon and are re-adopted on
  start. The daemon is never touched.
- The install does not touch the manager's database or its
  `systemd` drop-ins (`admin.conf`, `proxy.conf`); it rewrites only the
  unit file, the code, the UI and the daemon's `fake` profile.
- Check: `curl -s http://127.0.0.1:4268/ | grep -o '/assets/index-[^"]*\.css'`
  should name a new hash, and `journalctl --user -u agent-manager -n 5`
  should show it connected to the daemon and resynced its agents. Browsers
  pick the new build up on the next page load.
