import { expect, type Page } from '@playwright/test'
import { ADMIN_PASSWORD } from './constants'

/** The agent header's facts fold away under the name; open them when a test needs one. */
export async function details(page: Page) {
  if ((await page.getByTestId('agent-details').count()) === 0)
    await page.getByTestId('agent-details-toggle').click()
}

/** How far the shell's main area overflows, in px: the page never scrolls as a whole. */
export const pageOverflow = (page: Page) =>
  page
    .locator('main')
    .evaluate((m) => Math.max(m.scrollHeight - m.clientHeight, m.scrollWidth - m.clientWidth))

export async function login(page: Page) {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login/)
  await page.getByTestId('login-name').fill('admin')
  await page.getByTestId('login-password').fill(ADMIN_PASSWORD)
  await page.getByTestId('login-submit').click()
  await expect(page).toHaveURL('/')
}
