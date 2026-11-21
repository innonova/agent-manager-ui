import { expect, test, type Page } from '@playwright/test'
import { PROJECT_DIR } from './constants'
import { details, login } from './helpers'

/**
 * The statistics dialog, with the numbers of an agent that has run for
 * months (four kinds of starter, long runs, a third of it unattended):
 * the real one behind the fake agent has two turns, which shows nothing
 * of how the dialog holds up. Looked at on a wide screen, a low one and
 * a phone: it never grows past the screen, its body scrolls, and its
 * close button stays in reach.
 */
const H = 3_600_000
const long = {
  since: Date.UTC(2026, 8, 12, 16),
  turns: 3204,
  runtimeMs: 31 * 24 * H + 7 * H,
  tokens: {
    input: 2_156_071,
    cacheWrite: 120_539_612,
    cacheRead: 41_115_506_962,
    output: 23_387_148,
  },
  costUsd: 12_811.19,
  working: true,
  startedBy: {
    person: { turns: 2275, runtimeMs: 14 * 24 * H },
    self: { turns: 850, runtimeMs: 15 * 24 * H },
    manager: { turns: 64, runtimeMs: 2 * 24 * H },
    agent: { turns: 15, runtimeMs: 7 * H },
  },
  sinceLastMessage: {
    at: Date.UTC(2026, 10, 21, 18, 4),
    by: 'aek',
    runtimeMs: 9 * H + 29 * 60_000,
    turns: 12,
    outputTokens: 187_300,
  },
  runs: {
    count: 1284,
    medianMs: 101_758,
    longestMs: 34_169_000,
    longest: [
      { at: Date.UTC(2026, 10, 4, 19, 32), by: 'aek', runtimeMs: 34_169_000 },
      { at: Date.UTC(2026, 9, 31, 21, 36), by: 'djm', runtimeMs: 28_000_000 },
      { at: Date.UTC(2026, 9, 22, 0, 13), by: 'aek', runtimeMs: 21_650_207 },
      { at: Date.UTC(2026, 9, 20, 6, 13), by: 'aek', runtimeMs: 15_064_990 },
      { at: Date.UTC(2026, 9, 18, 17, 53), by: 'aek', runtimeMs: 13_854_270 },
    ],
  },
  unattended: {
    afterMs: 1_800_000,
    runtimeMs: 10 * 24 * H + 11 * H,
    share: 0.334,
    runs: 212,
    longestMs: 32_369_000,
    medianMs: 2_931_451,
  },
}

async function open(page: Page) {
  await page.route('**/api/agents/*/stats', (r) => r.fulfill({ json: long }))
  await login(page)
  // a project and an agent of this file's own: the dialog is about an agent, any agent
  const all = (await (await page.request.get('/api/projects')).json()) as {
    project: { id: string; name: string }
  }[]
  const projectId =
    all.find((p) => p.project.name === 'Stats')?.project.id ??
    (
      (await (
        await page.request.post('/api/projects', {
          data: { name: 'Stats', repos: [{ path: PROJECT_DIR }], defaultProfile: 'fake' },
        })
      ).json()) as { project: { id: string } }
    ).project.id
  const list = (await (await page.request.get(`/api/projects/${projectId}/agents`)).json()) as {
    agent: { id: string }
  }[]
  const agentId =
    list[0]?.agent.id ??
    (
      (await (
        await page.request.post(`/api/projects/${projectId}/agents`, { data: { name: 'counted' } })
      ).json()) as { agent: { id: string } }
    ).agent.id
  await page.goto(`/projects/${projectId}/agents/${agentId}`)
  await details(page)
  await page.getByTestId('stats-link').click()
  await expect(page.getByTestId('stats').locator('[data-stat="runtime"]')).toBeVisible()
}

for (const s of [
  { name: 'wide', width: 1440, height: 900, dark: false },
  { name: 'low', width: 1024, height: 600, dark: true },
  { name: 'small', width: 800, height: 480, dark: false },
  { name: 'phone', width: 390, height: 760, dark: true },
])
  test(`statistics on a ${s.name} screen: laid out in sections, never past the screen, the body scrolling`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: s.dark ? 'dark' : 'light' })
    await page.setViewportSize({ width: s.width, height: s.height })
    await open(page)
    const stats = page.getByTestId('stats')
    await expect(stats.locator('[data-stat="runtime"]')).toContainText('31 d 7 h')
    await expect(stats.locator('[data-stat="cost"]')).toContainText('$12,811')
    await expect(stats.locator('[data-stat="unattended"]')).toContainText('33%')
    await expect(stats.locator('[data-stat="started by"] tbody tr')).toHaveCount(4)
    await page.screenshot({ path: `test-results/stats-${s.name}.png` })
    // within the screen, both ways, with the way out in reach
    const dialog = (await page.getByRole('dialog').boundingBox())!
    expect(dialog.y).toBeGreaterThanOrEqual(0)
    expect(dialog.y + dialog.height).toBeLessThanOrEqual(s.height)
    expect(dialog.x + dialog.width).toBeLessThanOrEqual(s.width)
    await expect(page.getByTestId('stats-close')).toBeInViewport()
    // nothing in it wider than it is: no sideways scrolling inside
    expect(await stats.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1)
    // the last section is reached by scrolling the body, not the page
    await stats.locator('[data-stat="tokens"]').scrollIntoViewIfNeeded()
    await expect(stats.locator('[data-stat="tokens"]')).toBeInViewport()
    await page.screenshot({ path: `test-results/stats-${s.name}-end.png` })
    await page.getByTestId('stats-close').click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })
