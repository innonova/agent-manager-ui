import fs from 'node:fs'
import path from 'node:path'
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
  await expect(page.locator('[data-item="user"]')).toContainText('use a tool please')
  await expect(page.locator('[data-item="user"]').getByTestId('turn-by')).toHaveText('admin')
  await expect(page.getByTestId('agent-state')).toHaveAttribute('data-state', 'working')
  // a tool call is one collapsed line with its result folded under it
  const call = page.locator('[data-item="tool_use"]').first()
  await expect(call).toContainText('Read')
  await expect(call.getByTestId('tool-status')).toHaveText(/chars/)
  await expect(call.locator('[data-item="tool_result"]')).toHaveCount(0)
  await call.getByTestId('tool-toggle').click()
  await expect(call.getByTestId('tool-input')).toContainText('example.txt')
  await expect(call.locator('[data-item="tool_result"]')).toBeVisible()
  await expect(page.locator('[data-item="turn_end"]')).toHaveCount(1)
  await expect(page.getByTestId('turn-end-time')).toHaveText(/\d{1,2}:\d{2}/)
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
  await expect(page.locator('[data-item="user"]').last()).toContainText('first\nsecond')
  await expect(page.getByTestId('agent-state')).toHaveAttribute('data-state', 'idle')

  await page.reload()
  await expect(input).toHaveAttribute('placeholder', /Ctrl\+Enter/)
  await page.getByTestId('settings').click()
  await page.getByTestId('enter-send').click()
  await page.getByTestId('settings').click()
  await input.click()
  await page.keyboard.type('third')
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-item="user"]').last()).toContainText('third')
  await expect(page.getByTestId('agent-state')).toHaveAttribute('data-state', 'idle')
})

test('desktop notifications: opt in, then a finished turn notifies when the page is not in front', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['notifications'])
  await page.addInitScript(() => {
    const shown: { title: string; tag?: string }[] = []
    class FakeNotification {
      static permission: NotificationPermission = 'granted'
      static requestPermission = async () => 'granted' as NotificationPermission
      onclick: (() => void) | null = null
      constructor(title: string, opts?: NotificationOptions) {
        shown.push({ title, tag: opts?.tag })
      }
      close() {}
    }
    ;(window as unknown as { Notification: unknown }).Notification = FakeNotification
    ;(window as unknown as { __shown: unknown }).__shown = shown
    document.hasFocus = () => false // the user is elsewhere
  })
  await login(page)
  await page.getByTestId('settings').click()
  await page.getByTestId('notify-toggle').check()
  await expect(page.getByTestId('notify-toggle')).toBeChecked()
  await page.getByTestId('settings').click()
  await page.getByTestId('project-row').first().click()
  await page.locator('[data-test=agent-row]').filter({ hasText: 'worker' }).click()
  await page.getByTestId('turn-input').fill('quick one')
  await page.getByTestId('send').click()
  await expect(page.getByTestId('agent-state')).toHaveAttribute('data-state', 'idle')
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __shown: unknown[] }).__shown))
    .toEqual([{ title: 'worker is ready for more', tag: expect.stringMatching(/^agent-/) }])
  await page.reload()
  await page.getByTestId('settings').click()
  await expect(page.getByTestId('notify-toggle')).toBeChecked() // persisted
})

test('a newer build on the server shows an update badge that reloads', async ({ page }) => {
  await login(page)
  await expect(page.getByTestId('update-available')).toHaveCount(0)
  // a UI-only deploy swaps build.json under the manager, which announces it on its ping tick
  fs.writeFileSync(
    path.join('/tmp/agent-manager-ui-e2e/ui', 'build.json'),
    JSON.stringify({ id: `e2e-build-${Date.now()}` }),
  )
  await expect(page.getByTestId('update-available')).toBeVisible({ timeout: 10000 })
  await Promise.all([page.waitForLoadState('load'), page.getByTestId('update-available').click()])
  await expect(page.getByTestId('login-name').or(page.getByTestId('new-project'))).toBeVisible()
})

test('a draft survives switching tabs and reloading', async ({ page }) => {
  await login(page)
  await page.getByTestId('project-row').first().click()
  await page.locator('[data-test=agent-row]').filter({ hasText: 'worker' }).click()
  const input = page.getByTestId('turn-input')
  const twoRows = await input.evaluate((el) => el.clientHeight)
  await input.fill('one\ntwo\nthree\nfour\nfive')
  expect(await input.evaluate((el) => el.clientHeight)).toBeGreaterThan(twoRows) // grows with content
  await input.fill('half a thought')
  await page.getByTestId('tab-files').click()
  await expect(page.getByTestId('turn-input')).toHaveCount(0)
  await page.getByTestId('tab-agents').click()
  await expect(page.getByTestId('turn-input')).toHaveValue('half a thought')
  await page.reload()
  await expect(page.getByTestId('turn-input')).toHaveValue('half a thought')
  await page.getByTestId('turn-input').fill('')
  await page.reload()
  await expect(page.getByTestId('turn-input')).toHaveValue('')
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
  const projectDir = page.locator('[data-test=tree-dir][data-path="project"]')
  await expect(projectDir).toHaveAttribute('data-expanded', 'false')
  await projectDir.click()
  await expect(projectDir).toHaveAttribute('data-expanded', 'true')
  // git-ignored entries and .git itself are greyed; tracked ones are not
  await expect(page.locator('[data-test=tree-dir][data-path="project/dist"]')).toHaveAttribute(
    'data-ignored',
    'true',
  )
  await expect(page.locator('[data-path="project/.git"]')).toHaveCount(0) // hidden, as in VS Code
  await expect(page.locator('[data-test=tree-dir][data-path="project/src"]')).not.toHaveAttribute(
    'data-ignored',
    /.*/,
  )
  // git status tints: a modified file and its directory, an untracked file, a clean one
  await expect(page.locator('[data-path="project/src"]')).toHaveAttribute('data-status', 'modified')
  await expect(page.locator('[data-path="project/TODO.md"]')).toHaveAttribute(
    'data-status',
    'untracked',
  )
  await expect(page.locator('[data-path="project/README.md"]')).not.toHaveAttribute(
    'data-status',
    /.*/,
  )
  await page.locator('[data-test=tree-dir][data-path="project/src"]').click()
  await expect(page.locator('[data-path="project/src/index.ts"]')).toHaveAttribute(
    'data-status',
    'modified',
  )
  await page.locator('[data-test=tree-file][data-path="project/src/index.ts"]').click()
  await expect(page.getByTestId('file-path')).toHaveText('project/src/index.ts')
  await expect(page.getByTestId('editor').locator('.view-lines')).toContainText('answer = 42')
  await expect(page).toHaveURL(/path=project(%2F|\/)src(%2F|\/)index\.ts/)
  await page.locator('[data-test=tree-dir][data-path="second"]').click()
  await page.locator('[data-test=tree-dir][data-path="second/lib"]').click()
  await page.locator('[data-test=tree-file][data-path="second/lib/util.ts"]').click()
  await expect(page.getByTestId('editor').locator('.view-lines')).toContainText('twice')
  await page.locator('[data-test=tree-file][data-path="project/src/index.ts"]').click()
  // a reload restores the open file from the URL and the expanded directories
  await page.reload()
  await expect(page.getByTestId('editor').locator('.view-lines')).toContainText('answer = 42')
  await expect(page.locator('[data-test=tree-dir][data-path="project/src"]')).toHaveAttribute(
    'data-expanded',
    'true',
  )
  await expect(page.locator('[data-test=tree-dir][data-path="second/lib"]')).toHaveAttribute(
    'data-expanded',
    'true',
  )
  await page.getByTestId('files-collapse').click()
  await expect(page.locator('[data-test=tree-dir][data-path="project"]')).toHaveAttribute(
    'data-expanded',
    'false',
  )
  await expect(page.locator('[data-path="project/src"]')).toHaveCount(0)

  // filter: loaded entries only, matching directories held open, others hidden
  await page.getByTestId('files-filter').fill('util')
  await expect(page.locator('[data-path="second/lib/util.ts"]')).toBeVisible()
  await expect(page.locator('[data-path="project"]')).toHaveCount(0)
  await page.getByTestId('files-filter').press('Escape')
  await expect(page.locator('[data-path="project"]')).toBeVisible()
  await expect(page.locator('[data-path="second/lib/util.ts"]')).toHaveCount(0)

  // keyboard: down moves, right expands, Enter opens, left steps out
  const tree = page.getByTestId('file-tree')
  await tree.focus()
  await tree.press('ArrowDown')
  await expect(page.locator('[data-path="project"]')).toHaveAttribute('data-focused', 'true')
  await tree.press('ArrowRight')
  await expect(page.locator('[data-path="project"]')).toHaveAttribute('data-expanded', 'true')
  await tree.press('ArrowRight') // into the first child
  await expect(page.locator('[data-path="project/dist"]')).toHaveAttribute('data-focused', 'true')
  await tree.press('ArrowDown')
  await expect(page.locator('[data-path="project/src"]')).toHaveAttribute('data-focused', 'true')
  await tree.press('ArrowRight')
  await tree.press('ArrowRight')
  await expect(page.locator('[data-path="project/src/index.ts"]')).toHaveAttribute(
    'data-focused',
    'true',
  )
  await page.locator('[data-test=tree-dir][data-path="second"]').click()
  await page.locator('[data-test=tree-dir][data-path="second/lib"]').click()
  await page.locator('[data-test=tree-file][data-path="second/lib/util.ts"]').click()
  await tree.focus()
  await expect(page.locator('[data-path="second/lib/util.ts"]')).toHaveAttribute(
    'data-focused',
    'true',
  )
  await tree.press('ArrowLeft')
  await expect(page.locator('[data-path="second/lib"]')).toHaveAttribute('data-focused', 'true')
  await tree.press('End')
  await tree.press('Enter')
  await expect(page.getByTestId('file-path')).toHaveText('second/lib/util.ts')
})

test('an agent in ask mode waits for a permission; allow and deny answer it', async ({ page }) => {
  await login(page)
  await page.getByTestId('project-row').first().click()
  await page.getByTestId('new-agent').click()
  await page.getByTestId('agent-name-input').fill('careful')
  await page.getByTestId('agent-permissions').selectOption('ask')
  await page.getByTestId('agent-model').fill('fake-9')
  await page.getByTestId('agent-effort').selectOption('high')
  await page.getByTestId('form-submit').click()
  await expect(page.getByTestId('agent-state')).toHaveAttribute('data-state', 'idle')
  await expect(page.getByTestId('agent-model-chip')).toHaveText('fake-9') // the vendor reports what it runs
  await expect(page.getByTestId('agent-effort-chip')).toHaveText('effort high')
  await page.getByTestId('turn-input').fill('this needs permission')
  await page.getByTestId('send').click()
  await expect(page.getByTestId('agent-state')).toHaveAttribute('data-state', 'waiting-permission')
  const card = page.locator('[data-item="permission"]').last()
  await expect(card).toContainText('Remove the build directory')
  await expect(card).toContainText('rm -rf dist')
  await expect(page.getByTestId('turn-input')).toHaveAttribute(
    'placeholder',
    /waiting for your answer/,
  )
  await expect(page.getByTestId('send')).toBeDisabled()
  await card.getByTestId('permission-allow').click()
  await expect(card).toHaveAttribute('data-decision', 'allow')
  await expect(page.getByTestId('agent-state')).toHaveAttribute('data-state', 'idle')
  await expect(page.locator('[data-item="text"]').last()).toContainText('Removed it (allow)')

  await page.getByTestId('turn-input').fill('permission again')
  await page.getByTestId('send').click()
  const second = page.locator('[data-item="permission"]').last()
  await expect(second).not.toHaveAttribute('data-decision', /.*/)
  await second.getByTestId('permission-deny').click()
  await expect(second).toHaveAttribute('data-decision', 'deny')
  await expect(page.locator('[data-item="text"]').last()).toContainText('not removing it')
})

test('users: create with a shown-once password, rename yourself, reset, remove', async ({
  page,
}) => {
  await login(page)
  await page.getByTestId('settings').click()
  await page.getByTestId('users-link').click()
  await expect(page).toHaveURL(/\/users$/)
  await expect(page.getByTestId('user-row')).toHaveCount(1)
  await page.getByTestId('new-user').click()
  await page.getByTestId('user-name-input').fill('bob')
  await page.getByTestId('form-submit').click()
  const password = (await page.getByTestId('password').textContent())!.trim()
  expect(password).toMatch(/^[a-z2-9]{4}(-[a-z2-9]{4}){3}$/)
  await page.getByTestId('form-submit').click() // done
  await expect(page.getByTestId('user-row')).toHaveCount(2)

  // rename yourself; the header follows
  await page.getByTestId('rename').click()
  await page.getByTestId('rename-input').fill('admin2')
  await page.getByTestId('rename-save').click()
  await expect(page.locator('[data-test=user-row][data-name="admin2"]')).toBeVisible()
  await expect(page.locator('header')).toContainText('admin2')
  await page.getByTestId('rename').click()
  await page.getByTestId('rename-input').fill('admin')
  await page.getByTestId('rename-save').click()
  await expect(page.locator('[data-test=user-row][data-name="admin"]')).toBeVisible()

  // a new password for bob, behind a confirm
  page.once('dialog', (d) => d.accept())
  await page.locator('[data-test=user-row][data-name="bob"]').getByTestId('reset-password').click()
  const fresh = (await page.getByTestId('password').textContent())!.trim()
  expect(fresh).not.toBe(password)
  await page.getByTestId('form-submit').click()

  page.once('dialog', (d) => d.accept())
  await page.locator('[data-test=user-row][data-name="bob"]').getByTestId('remove-user').click()
  await expect(page.getByTestId('user-row')).toHaveCount(1)
  await expect(
    page.locator('[data-test=user-row][data-name="admin"]').getByTestId('remove-user'),
  ).toHaveCount(0)
})

test('presence: another user on the same agent shows as here and as typing', async ({
  page,
  browser,
}) => {
  await login(page)
  const created = await page.request.post('/api/users', { data: { name: 'pat' } })
  const { password } = (await created.json()) as { password: string }
  await page.getByTestId('project-row').first().click()
  await page.locator('[data-test=agent-row]').filter({ hasText: 'worker' }).click()
  await expect(page.getByTestId('presence')).toHaveCount(0)

  const other = await browser.newContext()
  const pat = await other.newPage()
  await pat.goto('/')
  await pat.getByTestId('login-name').fill('pat')
  await pat.getByTestId('login-password').fill(password)
  await pat.getByTestId('login-submit').click()
  await pat.waitForURL(/\/$|\/projects/)
  await pat.getByTestId('project-row').first().click()
  await pat.locator('[data-test=agent-row]').filter({ hasText: 'worker' }).click()
  await expect(page.getByTestId('presence')).toHaveText('pat is here')
  await pat.getByTestId('turn-input').fill('thinking about it')
  await expect(page.getByTestId('presence-typing')).toHaveText('pat is typing…') // above the input
  await expect(page.getByTestId('presence')).toHaveText('pat is here') // the header keeps "here"
  await pat.getByTestId('turn-input').fill('')
  await expect(page.getByTestId('presence-typing')).toHaveCount(0)
  await other.close()
  await expect(page.getByTestId('presence')).toHaveCount(0)
  await page.request.delete(
    `/api/users/${((await created.json()) as { user: { id: string } }).user.id}`,
  )
})

test('changes view: unread files since the cursor, a diff, mark as read', async ({ page }) => {
  await login(page)
  await page.getByTestId('project-row').filter({ hasText: 'Files demo' }).click()
  await page.getByTestId('new-agent').click()
  await page.getByTestId('agent-name-input').fill('reviewer')
  await page.getByTestId('form-submit').click()
  await expect(page.getByTestId('agent-state')).toHaveAttribute('data-state', 'idle')
  // the agent page links to the changes since the cursor (the fixture has a modified and an untracked file)
  await expect(page.getByTestId('unread-link')).toContainText('changed since you last looked')
  await page.getByTestId('unread-link').click()
  await expect(page).toHaveURL(/mode=changes/)
  const notes = page.getByTestId('changes-note')
  await expect(notes.filter({ hasText: 'nothing marked read yet' })).toHaveCount(1)
  await expect(notes.filter({ hasText: 'not a git repository' })).toHaveCount(1) // the second repo
  const files = page.getByTestId('changed-file')
  await expect(files.filter({ hasText: 'src/index.ts' })).toHaveAttribute('data-status', 'modified')
  await expect(files.filter({ hasText: 'TODO.md' })).toHaveAttribute('data-status', 'untracked')
  await files.filter({ hasText: 'src/index.ts' }).click()
  await expect(page.getByTestId('diff-path')).toHaveText('project/src/index.ts')
  await expect(page.getByTestId('diff-editor')).toBeVisible()
  await expect(page.getByTestId('diff-editor')).toContainText('touched')
  // no cursor yet: marking read sets one; afterwards nothing is committed since it, so the button rests
  await expect(page.getByTestId('mark-read')).toBeEnabled()
  await page.getByTestId('mark-read').click()
  await expect(page.getByTestId('mark-read')).toBeDisabled()
  // uncommitted work still shows after marking read; nothing is lost
  await expect(files.filter({ hasText: 'src/index.ts' })).toHaveAttribute('data-status', 'modified')
  await expect(notes.filter({ hasText: 'nothing marked read yet' })).toHaveCount(0)
  await page.getByTestId('mode-tree').click()
  await expect(page.getByTestId('file-tree')).toBeVisible()
})

test('features view: create, watch the agent work the file, respond, done', async ({ page }) => {
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
  // the form draft survives closing the dialog and switching tabs
  await page.getByRole('button', { name: 'cancel' }).click()
  await page.getByTestId('tab-files').click()
  await page.getByTestId('tab-features').click()
  await page.getByTestId('new-feature').click()
  await expect(page.getByTestId('feature-title-input')).toHaveValue('Hello feature')
  await expect(page.getByTestId('feature-body-input')).toHaveValue('Say hello, then use a tool.')
  await page.getByTestId('form-submit').click()
  const row = page.locator('[data-test=feature-row][data-slug="hello-feature"]')
  await expect(row.getByTestId('feature-status')).toHaveAttribute('data-status', 'planned')
  await expect(row.getByTestId('feature-repo')).toHaveText('project')

  // a planned feature can be edited
  await row.getByTestId('feature-edit').click()
  await page.getByTestId('feature-edit-title').fill('Hello feature!')
  await page.getByTestId('feature-edit-body').fill('Say hello, then use a tool.')
  await page.getByTestId('form-submit').click()
  await expect(row.getByTestId('feature-title')).toHaveText('Hello feature!')

  // An agent, asked in its conversation, edits the file itself; the manager's poll shows it.
  const file = path.join(PROJECT_DIR, 'features', 'hello-feature.md')
  const front = (status: string) =>
    `---\ntitle: Hello feature!\nstatus: ${status}\npriority: 100\n---\n\nSay hello, then use a tool.\n`
  fs.writeFileSync(file, front('in-progress'))
  await expect(row.getByTestId('feature-status')).toHaveAttribute('data-status', 'in-progress', {
    timeout: 10000,
  })
  fs.writeFileSync(
    file,
    front('review') + '\n## Report (2026-09-12)\n\nSaid hello. Left open: nothing.\n',
  )
  await expect(row.getByTestId('feature-status')).toHaveAttribute('data-status', 'review', {
    timeout: 10000,
  })
  await row.getByTestId('feature-title').click()
  await expect(row.getByTestId('feature-body')).toContainText('Said hello')

  // The human answers; the draft survives a tab switch; the answer lands in the file
  // and the feature goes back to planned.
  await row.getByTestId('feature-response-input').fill('Also wave.')
  await page.getByTestId('tab-files').click()
  await page.getByTestId('tab-features').click()
  await row.getByTestId('feature-title').click()
  await expect(row.getByTestId('feature-response-input')).toHaveValue('Also wave.')
  await row.getByTestId('feature-respond').click()
  await expect(row.getByTestId('feature-status')).toHaveAttribute('data-status', 'planned')
  await expect(row.getByTestId('feature-body')).toContainText('Also wave.')
  expect(fs.readFileSync(file, 'utf8')).toMatch(
    /## Response \(\d{4}-\d{2}-\d{2}, admin\)\n\nAlso wave\./,
  )
  await row.getByTestId('feature-block').click()
  await expect(row.getByTestId('feature-status')).toHaveAttribute('data-status', 'blocked')
  await row.getByTestId('feature-reopen').click()
  await expect(row.getByTestId('feature-status')).toHaveAttribute('data-status', 'planned')
  await row.getByTestId('feature-done').click()
  await expect(row.getByTestId('feature-status')).toHaveAttribute('data-status', 'done')
})

test('edit a project from inside it; save and restart resumes its idle agents', async ({
  page,
}) => {
  await login(page)
  await page.getByTestId('project-row').filter({ hasText: 'Demo' }).first().click()
  await expect(page.getByTestId('project-title')).toHaveText('Demo')
  await page.getByTestId('edit-project-link').click()
  await expect(page.getByRole('heading', { name: 'Edit project' })).toBeVisible()
  await expect(page.getByTestId('project-name')).toHaveValue('Demo')
  await page.getByTestId('add-repo').click()
  await expect(page.getByTestId('repo-row')).toHaveCount(2)
  await page.getByTestId('repo-row').nth(1).getByTestId('repo-path').fill('') // left empty: ignored
  await page.getByTestId('form-secondary').click()
  await expect(page.getByRole('status')).toContainText(/restarted \d+ agent/)
})

test('a message while the agent works steers the turn instead of being refused', async ({
  page,
}) => {
  await login(page)
  await page.getByTestId('project-row').filter({ hasText: 'Demo' }).first().click()
  await page.getByTestId('agent-row').filter({ hasText: 'worker' }).first().click()
  await expect(page.getByTestId('agent-state')).toHaveAttribute('data-state', /idle|exited/)
  await page.getByTestId('turn-input').fill('slow please')
  await page.getByTestId('turn-input').press('Enter')
  await expect(page.getByTestId('agent-state')).toHaveAttribute('data-state', 'working')
  await expect(page.getByTestId('send')).toHaveText('steer')
  await page.getByTestId('turn-input').fill('and this')
  await page.getByTestId('send').click()
  await expect(page.locator('[data-item="text"]').last()).toContainText('Also noted: and this', {
    timeout: 20000,
  })
  await expect(page.getByTestId('agent-state')).toHaveAttribute('data-state', 'idle')
  await expect(page.getByTestId('send')).toHaveText('send')
})

test('the sidebar is a tree of every project: switch projects and agents without going back', async ({
  page,
}) => {
  await login(page)
  await page.getByTestId('project-row').filter({ hasText: 'Demo' }).first().click()
  await expect(page.getByTestId('project-title')).toHaveText('Demo')
  const tree = page.getByTestId('project-tree')
  await expect(tree.getByTestId('tree-project')).toHaveCount(2)
  const demo = tree.getByTestId('tree-project').filter({ hasText: 'Demo' }).first()
  const files = tree.getByTestId('tree-project').filter({ hasText: 'Files demo' })
  await expect(demo).toHaveAttribute('data-open', 'true')
  await expect(files).not.toHaveAttribute('data-open', 'true')
  await expect(demo.getByTestId('agent-row').filter({ hasText: 'worker' })).toBeVisible()
  // expand another project in place: its agents load, the view stays
  await files.getByTestId('tree-toggle').click()
  await expect(files).toHaveAttribute('data-open', 'true')
  await expect(files.getByTestId('agent-row').first()).toBeVisible()
  await expect(page.getByTestId('project-title')).toHaveText('Demo')
  // open an agent of the other project straight from the tree
  await files.getByTestId('agent-row').first().click()
  await expect(page.getByTestId('project-title')).toHaveText('Files demo')
  await expect(page).toHaveURL(/\/projects\/[^/]+\/agents\//)
  // the previous project stays open: several can be unfolded at once, and it survives a reload
  await expect(demo).toHaveAttribute('data-open', 'true')
  await expect(demo.getByTestId('agent-row').filter({ hasText: 'worker' })).toBeVisible()
  await demo.getByTestId('tree-toggle').click()
  await expect(demo).not.toHaveAttribute('data-open', 'true')
  await expect(demo.locator('[data-count]').first()).toBeVisible()
  await page.reload()
  await expect(
    page
      .getByTestId('project-tree')
      .getByTestId('tree-project')
      .filter({ hasText: 'Demo' })
      .first(),
  ).not.toHaveAttribute('data-open', 'true')
})

test('an image pasted into the composer goes with the turn and shows in the transcript', async ({
  page,
}) => {
  await login(page)
  await page.getByTestId('project-row').filter({ hasText: 'Demo' }).first().click()
  await page.getByTestId('agent-row').filter({ hasText: 'worker' }).first().click()
  await expect(page.getByTestId('agent-state')).toHaveAttribute('data-state', /idle|exited/)
  // a 1x1 PNG pasted from the clipboard
  await page.getByTestId('turn-input').focus()
  await page.evaluate(() => {
    const bytes = Uint8Array.from(
      atob(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      ),
      (c) => c.charCodeAt(0),
    )
    const file = new File([bytes], 'dot.png', { type: 'image/png' })
    const dt = new DataTransfer()
    dt.items.add(file)
    const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })
    document.querySelector('[data-test=turn-input]')!.dispatchEvent(ev)
  })
  await expect(page.getByTestId('attachment')).toHaveCount(1)
  await page.getByTestId('turn-input').fill('look at this')
  await page.getByTestId('send').click()
  await expect(page.getByTestId('attachment')).toHaveCount(0)
  await expect(
    page.locator('[data-item="user"]').last().locator('[data-test=user-images] img'),
  ).toHaveCount(1)
  await expect(page.locator('[data-item="text"]').last()).toContainText('with 1 image', {
    timeout: 20000,
  })
})

test('files view: a new folder and an uploaded file land in the tree and can be mentioned to the agent', async ({
  page,
}) => {
  await login(page)
  await page.getByTestId('project-row').filter({ hasText: 'Demo' }).first().click()
  await page.getByTestId('agent-row').filter({ hasText: 'worker' }).first().click()
  await page.getByTestId('tab-files').click()
  await expect(page.getByTestId('file-tree')).toBeVisible()
  // a folder in the first repository
  await page.getByTestId('files-new-folder').click()
  await page.getByTestId('new-folder-name').fill('logs')
  await page.getByTestId('new-folder-name').press('Enter')
  await expect(page.getByTestId('file-tree')).toContainText('logs')
  // an upload into it (the new folder is focused)
  await page.getByTestId('files-upload-input').setInputFiles({
    name: 'app.log',
    mimeType: 'text/plain',
    buffer: Buffer.from('error: something happened\n'),
  })
  await expect(page.getByTestId('file-tree')).toContainText('app.log')
  await expect(page.getByRole('status')).toContainText('uploaded')
  await page.getByTestId('toast-action').click()
  await expect(page).toHaveURL(/\/agents\//)
  await expect(page.getByTestId('turn-input')).toHaveValue(/See .*logs\/app\.log/)
})

test('an agent reporting its account usage shows a chip in its header and a block on the projects page', async ({
  page,
}) => {
  await login(page)
  await page.getByTestId('project-row').filter({ hasText: 'Demo' }).first().click()
  await page.getByTestId('agent-row').filter({ hasText: 'worker' }).first().click()
  await expect(page.getByTestId('agent-state')).toHaveAttribute('data-state', /idle|exited/)
  await page.getByTestId('turn-input').fill('usage 85')
  await page.getByTestId('turn-input').press('Enter')
  await expect(page.getByTestId('usage-chip').first()).toContainText('5h 85%', { timeout: 20000 })
  await expect(page.getByTestId('usage-chip').first()).toContainText('7d 43%')
  await page.getByRole('link', { name: 'agent-manager' }).click()
  await expect(page.getByTestId('usage')).toContainText('fake')
  await expect(page.getByTestId('usage').getByTestId('usage-chip').first()).toContainText('5h 85%')
})
