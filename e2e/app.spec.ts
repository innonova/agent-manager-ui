import { expect, test, type Page } from '@playwright/test'
import { ADMIN_PASSWORD, PROJECT_DIR } from './constants'

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
  await page.getByTestId('project-path').fill(PROJECT_DIR)
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
