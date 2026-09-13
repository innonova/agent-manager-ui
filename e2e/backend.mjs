#!/usr/bin/env node
// Starts a real agent-daemon (fake profile only) and a real agent-manager on
// a fixed port for the Playwright suite. Run by playwright.config.ts as the
// first webServer; Vite's /api proxy targets the fixed port. No tokens.
import { execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DAEMON_MAIN =
  process.env.AGENT_DAEMON_MAIN ?? path.resolve(ROOT, '..', 'agent-daemon', 'dist', 'main.js')
const MANAGER_MAIN =
  process.env.AGENT_MANAGER_MAIN ?? path.resolve(ROOT, '..', 'agent-manager', 'dist', 'main.js')
const FAKE_AGENT = path.resolve(ROOT, '..', 'agent-manager', 'fixtures', 'fake-agent.mjs')
const E2E_ROOT = '/tmp/agent-manager-ui-e2e'
const MANAGER_PORT = 4299
const ADMIN_PASSWORD = 'e2e-password'

for (const f of [DAEMON_MAIN, MANAGER_MAIN]) {
  if (!fs.existsSync(f)) {
    console.error(`build first: ${f} is missing`)
    process.exit(1)
  }
}
fs.rmSync(E2E_ROOT, { recursive: true, force: true })
const daemonConfig = path.join(E2E_ROOT, 'daemon-config')
fs.mkdirSync(path.join(daemonConfig, 'profiles'), { recursive: true })
fs.mkdirSync(path.join(E2E_ROOT, 'project', 'src'), { recursive: true })
fs.writeFileSync(path.join(E2E_ROOT, 'project', 'README.md'), '# demo project\n')
fs.mkdirSync(path.join(E2E_ROOT, 'second', 'lib'), { recursive: true })
fs.writeFileSync(
  path.join(E2E_ROOT, 'second', 'lib', 'util.ts'),
  'export const twice = (n: number) => n * 2\n',
)
fs.writeFileSync(path.join(E2E_ROOT, 'project', 'src', 'index.ts'), 'export const answer = 42\n')
// A git repository with an ignored directory, for the tree's greying.
const PROJECT = path.join(E2E_ROOT, 'project')
const git = (...args) =>
  execFileSync('git', ['-c', 'user.name=e2e', '-c', 'user.email=e2e@test', ...args], { cwd: PROJECT })
git('init', '-q')
fs.writeFileSync(path.join(PROJECT, '.gitignore'), 'dist/\n')
fs.mkdirSync(path.join(PROJECT, 'dist'))
fs.writeFileSync(path.join(PROJECT, 'dist', 'bundle.js'), '')
git('add', '-A')
git('commit', '-q', '-m', 'init')
// then a modification and an untracked file, for the status tints
fs.appendFileSync(path.join(PROJECT, 'src', 'index.ts'), '// touched\n')
fs.writeFileSync(path.join(PROJECT, 'TODO.md'), '- nothing\n')
fs.writeFileSync(
  path.join(daemonConfig, 'profiles', 'fake.json'),
  JSON.stringify({ command: process.execPath, args: [FAKE_AGENT], description: 'fake agent' }),
)
fs.mkdirSync(path.join(E2E_ROOT, 'ui'), { recursive: true })
fs.writeFileSync(path.join(E2E_ROOT, 'ui', 'index.html'), '<html></html>')
fs.writeFileSync(path.join(E2E_ROOT, 'ui', 'build.json'), JSON.stringify({ id: 'e2e-build-1' }))
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const procs = []
const waitForPort = (proc, re, what) =>
  new Promise((resolve, reject) => {
    let log = ''
    const onData = (d) => {
      log += d
      // forwarded for the whole run, tagged so a stray line can be placed
      process.stdout.write(String(d).replace(/^(?=.)/gm, `[${what}] `))
      const m = log.match(re)
      if (m) resolve(Number(m[1]))
    }
    proc.stdout.on('data', onData)
    proc.stderr.on('data', onData)
    proc.on('exit', (code) => reject(new Error(`${what} exited early (${code})`)))
    setTimeout(() => reject(new Error(`${what} did not start`)), 20000)
  })

const daemon = spawn(process.execPath, [DAEMON_MAIN], {
  env: {
    ...env,
    AGENT_DAEMON_LISTEN: '127.0.0.1:0',
    AGENT_DAEMON_CONFIG_DIR: daemonConfig,
    AGENT_DAEMON_STATE_DIR: path.join(E2E_ROOT, 'daemon-state'),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})
procs.push(daemon)
const daemonPort = await waitForPort(daemon, /listening on ws:\/\/127\.0\.0\.1:(\d+)\//, 'daemon')

const manager = spawn(process.execPath, [MANAGER_MAIN], {
  env: {
    ...env,
    AGENT_MANAGER_LISTEN: `127.0.0.1:${MANAGER_PORT}`,
    AGENT_MANAGER_DAEMON_URL: `ws://127.0.0.1:${daemonPort}/`,
    AGENT_MANAGER_DATA_DIR: path.join(E2E_ROOT, 'manager-data'),
    AGENT_MANAGER_ADMIN_PASSWORD: ADMIN_PASSWORD,
    AGENT_MANAGER_LOGIN_ATTEMPTS_PER_MINUTE: '1000', // every test logs in; the throttle is for the real thing
    AGENT_MANAGER_UI_DIR: path.join(E2E_ROOT, 'ui'), // pages come from Vite; this is only for build.json
    AGENT_MANAGER_EVENTS_PING_MS: '500',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})
procs.push(manager)
await waitForPort(manager, /listening on http:\/\/127\.0\.0\.1:(\d+)\//, 'manager')

const shutdown = () => {
  for (const p of procs.reverse()) p.kill('SIGTERM')
  setTimeout(() => process.exit(0), 3000).unref()
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
