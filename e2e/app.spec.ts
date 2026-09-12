import { expect, test, type Page } from '@playwright/test'
import { ADMIN_PASSWORD, PROJECT_DIR, SECOND_DIR } from './constants'

async function login(page: Page) {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login/)
  await page.getByTestId('login-name').fill('admin')
  await page.getByTestId('login-password').fill(ADMIN_PASSWORD)
  await page.getByTestId('login-submit').click()
  await expect(page).toHaveURL('/')
}

test('wrong password shows an error', async ({ page }) => {
  await page.goto('/login')
  await page.getByTestId('login-name').fill('admin')
  await page.getByTestId('login-password').fill('nope')
  await page.getByTestId('login-submit').click()
  await expect(page.getByTestId('login-error')).toHaveText(/Wrong name or password/)
})

test('project, agent, streamed turn, error state, counts', async ({ page }) => {
  await login(page)

  // new project
  await page.getByTestId('new-project').click()
  await page.getByTestId('project-name').fill('Demo')
  await page.getByTestId('repo-path').first().fill(PROJECT_DIR)
  await page.getByTestId('project-profile').selectOption('fake')
  await page.getByTestId('form-submit').click()
  await expect(page.getByTestId('project-row')).toHaveCount(1)
  await expect(page.getByTestId('project-row')).toContainText('Demo')
  await page.getByTestId('project-row').click()
  await expect(page.getByTestId('project-title')).toHaveText('Demo')

  // new agent: session starts, state idle
  await page.getByTestId('new-agent').click()
  await page.getByTestId('agent-name-input').fill('worker')
  await page.getByTestId('form-submit').click()
  await expect(page.getByTestId('agent-name')).toHaveText('worker')
  await expect(page.getByTestId('agent-state')).toHaveAttribute('data-state', 'idle')
  await expect(page.locator('[data-item="system"]')).toContainText('session started')

  // a turn streams and finishes
  await page.getByTestId('turn-input').fill('use a tool please')
  await page.getByTestId('send').click()
  await expect(page.locator('[data-item="user"]')).toHaveText('use a tool please')
  await expect(page.getByTestId('agent-state')).toHaveAttribute('data-state', 'working')
  await expect(page.locator('[data-item="tool_use"]')).toContainText('Read')
  await expect(page.locator('[data-item="turn_end"]')).toHaveCount(1)
  await expect(page.locator('[data-item="text"]')).toContainText('You said: use a tool please')
  await expect(page.getByTestId('agent-state')).toHaveAttribute('data-state', 'idle')

  // an error turn: state, banner, toast
  await page.getByTestId('turn-input').fill('please error')
  await page.getByTestId('turn-input').press('Enter')
  await expect(page.getByTestId('agent-state')).toHaveAttribute('data-state', 'error')
  await expect(page.getByTestId('agent-error')).toContainText('usage limit')
  await expect(page.locator('[data-item="error"]')).toContainText('usage limit')
  await expect(page.getByRole('status')).toContainText('worker')

  // counts on the project list reflect it
  await page.getByRole('link', { name: 'agent-manager' }).click()
  await expect(page.locator('[data-count="error"]')).toContainText('1')

  // a reload rebuilds the transcript from the manager
  await page.goBack()
  await expect(page.getByTestId('agent-name')).toHaveText('worker')
  await page.reload()
  await expect(page.locator('[data-item="user"]')).toHaveCount(2)
  await expect(page.locator('[data-item="error"]')).toHaveCount(1)

  // stop ends the session; the next turn resumes it
  await page.getByTestId('stop').click()
  await expect(page.getByTestId('agent-state')).toHaveAttribute('data-state', 'exited')
  await page.getByTestId('turn-input').fill('back')
  await page.getByTestId('send').click()
  await expect(
    page.locator('[data-item="system"]').filter({ hasText: 'session resumed' }),
  ).toHaveCount(1)
  await expect(page.locator('[data-item="turn_end"]')).toHaveCount(3)
  await expect(page.getByTestId('agent-state')).toHaveAttribute('data-state', 'idle')
})

test('logging out returns to login and protects routes', async ({ page }) => {
  await login(page)
  await page.getByRole('button', { name: 'log out' }).click()
  await expect(page).toHaveURL(/\/login/)
  await page.goto('/')
  await expect(page).toHaveURL(/\/login\?next=/)
})

test('display preferences: manual dark mode and font size persist', async ({ page }) => {
  await login(page)
  const html = page.locator('html')
  await expect(html).not.toHaveClass(/dark/)
  await page.getByTestId('settings').click()
  await page.getByTestId('theme-dark').click()
  await expect(html).toHaveClass(/dark/)
  await page.getByTestId('font-larger').click()
  await page.getByTestId('font-larger').click()
  await expect(page.getByTestId('font-size')).toHaveText('16px')
  await expect(html).toHaveCSS('font-size', '16px')
  await page.reload()
  await expect(html).toHaveClass(/dark/)
  await expect(html).toHaveCSS('font-size', '16px')
  await page.getByTestId('settings').click()
  await page.getByTestId('theme-light').click()
  await expect(html).not.toHaveClass(/dark/)
  await page.getByTestId('font-smaller').click()
  await expect(page.getByTestId('font-size')).toHaveText('15px')
})

test('enter key preference: newline mode, Ctrl+Enter sends, send mode', async ({ page }) => {
  await login(page)
  await page.getByTestId('project-row').first().click()
  await page.locator('[data-test=agent-row]').filter({ hasText: 'worker' }).click()
  const input = page.getByTestId('turn-input')
  await expect(input).toHaveAttribute('placeholder', /Enter to send/)

  await page.getByTestId('settings').click()
  await page.getByTestId('enter-newline').click()
  await page.getByTestId('settings').click()
  await expect(input).toHaveAttribute('placeholder', /Ctrl\+Enter/)
  await input.click()
  await page.keyboard.type('first')
  await page.keyboard.press('Enter')
  await page.keyboard.type('second')
  await expect(input).toHaveValue('first\nsecond')
  await page.keyboard.press('Control+Enter')
  await expect(page.locator('[data-item="user"]').last()).toHaveText('first\nsecond')
  await expect(page.getByTestId('agent-state')).toHaveAttribute('data-state', 'idle')

  await page.reload()
  await expect(input).toHaveAttribute('placeholder', /Ctrl\+Enter/)
  await page.getByTestId('settings').click()
  await page.getByTestId('enter-send').click()
  await page.getByTestId('settings').click()
  await input.click()
  await page.keyboard.type('third')
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-item="user"]').last()).toHaveText('third')
  await expect(page.getByTestId('agent-state')).toHaveAttribute('data-state', 'idle')
})

test.describe('touch-first device', () => {
  test.use({ hasTouch: true, viewport: { width: 900, height: 1200 } })

  test('auto mode makes Enter a newline', async ({ page }) => {
    await login(page)
    await page.getByTestId('project-row').first().click()
    await page.locator('[data-test=agent-row]').filter({ hasText: 'worker' }).click()
    await expect(page.getByTestId('turn-input')).toHaveAttribute('placeholder', /Ctrl\+Enter/)
  })
})

test('files view: multi-repo tree, Monaco, refresh after an agent turn', async ({ page }) => {
  await login(page)
  await page.getByTestId('new-project').click()
  await page.getByTestId('project-name').fill('Files demo')
  await page.getByTestId('repo-path').first().fill(PROJECT_DIR)
  await page.getByTestId('project-profile').selectOption('fake')
  await page.getByTestId('form-submit').click()
  const row = page.getByTestId('project-row').filter({ hasText: 'Files demo' })
  await expect(row.getByTestId('project-repo')).toHaveCount(1)
  // edit: add a second repository with an explicit name
  await row.getByTestId('edit-project').click()
  await page.getByTestId('add-repo').click()
  await page.getByTestId('repo-name').nth(1).fill('second')
  await page.getByTestId('repo-path').nth(1).fill(SECOND_DIR)
  await page.getByTestId('form-submit').click()
  await expect(row.getByTestId('project-repo')).toHaveCount(2)
  await expect(row.getByTestId('project-repo').nth(1)).toContainText('second:')
  await row.click()
  await page.getByTestId('tab-files').click()
  await expect(page).toHaveURL(/\/files$/)
  // the root shows one folder per repository
  await expect(page.locator('[data-test=tree-dir][data-path="project"]')).toBeVisible()
  await expect(page.locator('[data-test=tree-dir][data-path="second"]')).toBeVisible()
  await page.locator('[data-test=tree-dir][data-path="project"]').click()
  await page.locator('[data-test=tree-dir][data-path="project/src"]').click()
  await page.locator('[data-test=tree-file][data-path="project/src/index.ts"]').click()
  await expect(page.getByTestId('file-path')).toHaveText('project/src/index.ts')
  await expect(page.getByTestId('editor').locator('.view-lines')).toContainText('answer = 42')
  await expect(page).toHaveURL(/path=project(%2F|\/)src(%2F|\/)index\.ts/)
  await page.locator('[data-test=tree-dir][data-path="second"]').click()
  await page.locator('[data-test=tree-dir][data-path="second/lib"]').click()
  await page.locator('[data-test=tree-file][data-path="second/lib/util.ts"]').click()
  await expect(page.getByTestId('editor').locator('.view-lines')).toContainText('twice')
  await page.locator('[data-test=tree-file][data-path="project/src/index.ts"]').click()
  // a reload restores the open file from the URL
  await page.reload()
  await expect(page.getByTestId('editor').locator('.view-lines')).toContainText('answer = 42')
})

test('features view: create, queue on an agent, review, done', async ({ page }) => {
  await login(page)
  await page.getByTestId('project-row').filter({ hasText: 'Files demo' }).click()
  await page.getByTestId('new-agent').click()
  await page.getByTestId('agent-name-input').fill('builder')
  await expect(page.getByTestId('agent-cwd')).toHaveValue('project')
  await page.getByTestId('agent-cwd').selectOption('second')
  await page.getByTestId('form-submit').click()
  await expect(page.getByTestId('agent-state')).toHaveAttribute('data-state', 'idle')
  await expect(page.getByTestId('agent-cwd-label')).toContainText(SECOND_DIR)
  await page.getByTestId('tab-features').click()
  await expect(page).toHaveURL(/\/features$/)
  await page.getByTestId('new-feature').click()
  await page.getByTestId('feature-title-input').fill('Hello feature')
  await page.getByTestId('feature-body-input').fill('Say hello, then use a tool.')
  await page.getByTestId('form-submit').click()
  const row = page.locator('[data-test=feature-row][data-slug="hello-feature"]')
  await expect(row.getByTestId('feature-status')).toHaveAttribute('data-status', 'planned')
  await expect(row.getByTestId('feature-repo')).toHaveText('project')
  const builderOption = page.getByTestId('feature-agent').locator('option', { hasText: 'builder' })
  await page.getByTestId('feature-agent').selectOption(await builderOption.getAttribute('value'))
  await row.getByTestId('feature-queue').click()
  await expect(row.getByTestId('feature-status')).toHaveAttribute('data-status', 'review', {
    timeout: 15000,
  })
  await row.getByTestId('feature-done').click()
  await expect(row.getByTestId('feature-status')).toHaveAttribute('data-status', 'done')
  // the agent's transcript shows the spec was sent
  await page.getByTestId('tab-agents').click()
  await page.locator('[data-test=agent-row]').filter({ hasText: 'builder' }).click()
  await expect(page.locator('[data-item=user]').first()).toContainText(
    'Implement the feature "Hello feature"',
  )
})
