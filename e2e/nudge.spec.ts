import { expect, test, type Page } from '@playwright/test'
import { PROJECT_DIR } from './constants'
import { login } from './helpers'

/**
 * Asking an agent that stopped whether it can go on: the setting in
 * the edit form, and the notice that lies over the flow's input while
 * the manager is about to ask. To type there the person calls the
 * question off with the notice's button, so their message and the
 * manager's cannot cross.
 */
async function agent(page: Page): Promise<void> {
  await login(page)
  const all = (await (await page.request.get('/api/projects')).json()) as {
    project: { id: string; name: string }
  }[]
  const projectId =
    all.find((p) => p.project.name === 'Nudge')?.project.id ??
    (
      (await (
        await page.request.post('/api/projects', {
          data: { name: 'Nudge', repos: [{ path: PROJECT_DIR }], defaultProfile: 'fake' },
        })
      ).json()) as { project: { id: string } }
    ).project.id
  const made = (await (
    await page.request.post(`/api/projects/${projectId}/agents`, {
      data: { name: `tireless-${Date.now()}` },
    })
  ).json()) as { agent: { id: string } }
  await page.goto(`/projects/${projectId}/agents/${made.agent.id}`)
}

test('an agent set to be asked when it stops: the notice over the input says what is coming, and its button calls it off', async ({
  page,
}) => {
  await agent(page)
  // the setting, in the edit form, in words that say what it does
  await page.locator('[title^="edit the agent"]').click()
  await expect(page.getByTestId('edit-agent-nudge')).not.toBeChecked()
  await page.getByTestId('edit-agent-nudge').check()
  await page.getByTestId('form-submit').click()
  await expect(page.getByTestId('modal-form')).toHaveCount(0)

  // a turn, and its end: the manager reads the last message and then waits, saying so over the input
  const input = page.getByTestId('turn-input')
  await input.fill('convert the first map')
  await input.press('Control+Enter')
  await expect(page.getByTestId('transcript')).toContainText('You said: convert the first map', {
    timeout: 20000,
  })
  const notice = page.getByTestId('nudge-notice')
  await expect(notice).toContainText('The manager asks it', { timeout: 20000 })
  await expect(page.getByTestId('nudge-when')).toHaveText(/^in \d+ s$/)
  await expect(input).toBeDisabled()
  await expect(page.getByTestId('transcript')).toContainText(
    /stopped with work left \(the next part is still to do\); the manager asks it at \d\d:\d\d/,
  )
  // the notice covers the input, in the pane and no wider
  const [n, i] = await Promise.all([notice.boundingBox(), input.boundingBox()])
  expect(n!.x).toBeLessThanOrEqual(i!.x)
  expect(n!.x + n!.width).toBeGreaterThanOrEqual(i!.x + i!.width)
  await page.screenshot({ path: 'test-results/nudge-notice.png' })
  // on a phone the panes are tabs: under the flow's, the notice still says all of it, button included
  await page.setViewportSize({ width: 390, height: 760 })
  await page.getByTestId('pane-tab-flow').click()
  await expect(notice).toBeInViewport()
  await expect(page.getByTestId('nudge-hold')).toBeInViewport()
  expect(await notice.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1)
  expect(await notice.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1)
  await page.screenshot({ path: 'test-results/nudge-notice-phone.png' })
  await page.setViewportSize({ width: 1280, height: 720 })

  // the person steps in: the question is off, said in the flow, and the input is theirs
  await page.getByTestId('nudge-hold').click()
  await expect(notice).toHaveCount(0)
  await expect(page.getByTestId('transcript')).toContainText(
    'not asked whether it can go on: admin called it off',
  )
  await expect(input).toBeEnabled()
  await input.fill('and now the second')
  await input.press('Control+Enter')
  await expect(page.getByTestId('transcript')).toContainText('You said: and now the second', {
    timeout: 20000,
  })
  // nothing from the manager went in between
  await expect(page.getByTestId('transcript')).not.toContainText('The manager, not a person')
})
