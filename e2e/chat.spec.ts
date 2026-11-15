import { expect, request, test, type APIRequestContext, type Page } from '@playwright/test'
import { MANAGER_PORT, PROJECT_DIR } from './constants'
import { login, pageOverflow } from './helpers'

/**
 * The chat beside the flow: a person and an agent talk without either
 * stopping for the other. The agent's side is spoken with the token its
 * `am` would use, which the fake agent says when asked for it.
 */
const MANAGER = `http://127.0.0.1:${MANAGER_PORT}`

/** The project these cases share, made by the first to run. */
async function chatProject(page: Page): Promise<string> {
  const all = (await (await page.request.get('/api/projects')).json()) as {
    project: { id: string; name: string }
  }[]
  const found = all.find((p) => p.project.name === 'Chat')
  if (found) return found.project.id
  const made = await page.request.post('/api/projects', {
    data: { name: 'Chat', repos: [{ path: PROJECT_DIR }], defaultProfile: 'fake' },
  })
  return ((await made.json()) as { project: { id: string } }).project.id
}

/** A fake agent, idle, and a way to speak as it. */
async function newAgent(
  page: Page,
  projectId: string,
  name: string,
  more: Record<string, string> = {},
): Promise<{ id: string; own: APIRequestContext }> {
  const made = await page.request.post(`/api/projects/${projectId}/agents`, {
    data: { name, ...more },
  })
  const id = ((await made.json()) as { agent: { id: string } }).agent.id
  await page.request.post(`/api/agents/${id}/turn`, { data: { text: 'token please' } })
  let token = ''
  await expect
    .poll(async () => {
      const { items } = (await (await page.request.get(`/api/agents/${id}/items`)).json()) as {
        items: { item: { kind: string; text?: string } }[]
      }
      const said = items.map((i) => (i.item.kind === 'text' ? i.item.text : '')).join('\n')
      token = /token ([0-9a-f]{64})/.exec(said)?.[1] ?? ''
      return token
    })
    .not.toBe('')
  await expect
    .poll(async () => (await (await page.request.get(`/api/agents/${id}`)).json()).status.state)
    .toBe('idle')
  // its own context: no admin cookie beside the agent's token
  const own = await request.newContext({
    baseURL: MANAGER,
    extraHTTPHeaders: { Authorization: `Bearer ${token}` },
  })
  return { id, own }
}

const say = async (
  a: { id: string; own: APIRequestContext },
  data: { text: string; kind?: string; important?: boolean },
) => {
  const r = await a.own.post(`/api/agents/${a.id}/chat`, { data })
  expect(r.status()).toBe(201)
  return ((await r.json()) as { message: { id: number } }).message
}

const message = (page: Page, text: string) =>
  page.getByTestId('chat-message').filter({ hasText: text })

test('a message beside the work waits unread, and is handed over when the turn ends', async ({
  page,
}) => {
  await login(page)
  const projectId = await chatProject(page)
  const a = await newAgent(page, projectId, 'talker')
  await page.goto(`/projects/${projectId}/agents/${a.id}`)
  await expect(page.getByTestId('agent-state')).toHaveAttribute('data-state', 'idle')
  // two panes: the flow of its work on the left, the chat on the right
  const flow = (await page.getByTestId('flow-pane').boundingBox())!
  const chat = (await page.getByTestId('chat-pane').boundingBox())!
  expect(flow.x + flow.width).toBeLessThanOrEqual(chat.x + 1)
  expect(chat.width).toBeGreaterThan(400)
  await expect(page.getByTestId('pane-tabs')).toBeHidden()
  // the chat holds what was said in it: the turn that asked for the token is in the flow alone
  await expect(page.getByTestId('flow-pane')).toContainText('token please')
  await expect(page.getByTestId('flow-pane')).toContainText('My manager')
  await expect(page.getByTestId('chat-empty')).toBeVisible()
  await expect(page.getByTestId('chat-message')).toHaveCount(0)

  // not working: a message in the chat wakes the agent, as a turn
  await page.getByTestId('chat-input').fill('linger a while')
  await page.getByTestId('chat-input').press('Control+Enter')
  await expect(message(page, 'linger a while')).toHaveAttribute('data-from', 'person')
  await expect(message(page, 'linger a while')).toHaveAttribute('data-via', 'turn')
  await expect(message(page, 'linger a while').getByTestId('chat-read')).toHaveText(
    'sent as a turn',
  )
  await expect(page.getByTestId('agent-state')).toHaveAttribute('data-state', 'working')

  // working: the same button leaves it beside the work
  await expect(page.getByTestId('chat-input')).toHaveAttribute('placeholder', /beside its work/)
  await page.getByTestId('chat-input').fill('use the darker grey there')
  await page.getByTestId('chat-send').click()
  const aside = message(page, 'use the darker grey there')
  await expect(aside).toHaveAttribute('data-via', 'aside')
  await expect(aside.getByTestId('chat-read')).toHaveText('not read yet')
  await expect(aside.getByTestId('chat-locate')).toHaveCount(0) // not in the flow yet
  await expect(page.getByTestId('chat-input')).toHaveValue('')
  // the agent is told that a message waits, not what it says, and carries on
  await expect(page.getByTestId('flow-pane')).toContainText('Chat: 1 unread message')
  await expect(page.getByTestId('flow-pane')).not.toContainText('darker grey')
  await expect(page.getByTestId('agent-state')).toHaveAttribute('data-state', 'working')

  // it did not read it before the turn ended: it gets it as the next turn
  await expect(page.getByTestId('chat-interrupt')).toBeHidden() // one interrupt: the flow's, beside it
  await page.getByTestId('interrupt').click()
  await expect(aside.getByTestId('chat-read')).toHaveText(/^read /)
  await expect(page.locator('[data-item="text"]').last()).toContainText(
    'You said: use the darker grey there',
  )
  await expect(page.getByTestId('agent-state')).toHaveAttribute('data-state', 'idle')
  // the agent's last words of a turn stay in the flow: the chat is what was said in it
  await expect(page.getByTestId('chat-message')).toHaveCount(2)

  // a message's time is its place in the flow: where it was handed over
  const there = page.getByTestId('flow-pane').locator('[data-index].ring-2')
  await message(page, 'linger a while').getByTestId('chat-locate').click()
  await expect(there).toContainText('linger a while')
  await expect(there).toHaveAttribute('data-item', 'user')
  await expect(there).toBeInViewport()
  await aside.getByTestId('chat-locate').click()
  await expect(there.filter({ hasText: 'use the darker grey there' })).toHaveAttribute(
    'data-item',
    'user',
  )
})

test('what the agent says: a decision stands out, a question is pinned and counted until answered', async ({
  page,
}) => {
  await login(page)
  const projectId = await chatProject(page)
  // an agent nobody has spoken to: the chat says what it is for
  const fresh = await page.request.post(`/api/projects/${projectId}/agents`, {
    data: { name: 'fresh' },
  })
  const freshId = ((await fresh.json()) as { agent: { id: string } }).agent.id
  await page.goto(`/projects/${projectId}/agents/${freshId}`)
  await expect(page.getByTestId('chat-empty')).toBeVisible()
  const a = await newAgent(page, projectId, 'asker')
  await page.getByTestId('agent-row').filter({ hasText: 'asker' }).click()
  await expect(page.getByTestId('agent-name')).toHaveText('asker')

  await say(a, { text: 'The store and the **API** are in; starting on the hook.' })
  await expect(page.getByTestId('chat-message')).toHaveCount(1)
  await expect(page.getByTestId('chat-empty')).toHaveCount(0)
  await say(a, { text: 'Kept the chat in SQLite rather than files.', kind: 'decision' })
  await say(a, {
    text: 'Dropped the old endpoint; nothing reads it.',
    kind: 'decision',
    important: true,
  })
  const plain = message(page, 'The store and the API are in')
  await expect(plain).toHaveAttribute('data-from', 'agent')
  await expect(plain.getByTestId('chat-author')).toHaveText('asker')
  await expect(plain.locator('strong')).toHaveText('API') // an agent's message is Markdown
  await expect(plain.getByTestId('chat-kind')).toHaveCount(0)
  const decision = message(page, 'Kept the chat in SQLite')
  await expect(decision.getByTestId('chat-kind')).toHaveText('decision')
  await expect(decision.getByTestId('chat-important')).toHaveCount(0)
  const important = message(page, 'Dropped the old endpoint')
  await expect(important).toHaveAttribute('data-important', 'true')
  await expect(important.getByTestId('chat-important')).toBeVisible()
  // none of these wants a person
  await expect(page.getByTestId('chat-pinned')).toHaveCount(0)
  await expect(page.getByTestId('agent-questions')).toHaveCount(0)

  // a question: pinned at the top, on the agent in the list and in its header; the agent is not waiting
  await say(a, { text: 'Should a steer be recorded in the chat as well?', kind: 'question' })
  const row = page.getByTestId('agent-row').filter({ hasText: 'asker' })
  await expect(page.getByTestId('chat-question')).toHaveCount(1)
  await expect(page.getByTestId('chat-pinned')).toContainText('Should a steer be recorded')
  await expect(page.getByTestId('agent-questions')).toHaveText('1 open question')
  await expect(row.getByTestId('agent-row-questions')).toHaveText('1 ?')
  await expect(row.locator('[data-state]')).toHaveAttribute('data-state', 'idle')
  const question = message(page, 'Should a steer be recorded')
  await expect(question.getByTestId('chat-question-state')).toHaveText('open, pinned above')
  // more is said; the question stays where it is
  for (let i = 1; i <= 12; i++) await say(a, { text: `Progress note ${i}, with a few words.` })
  await expect(message(page, 'Progress note 12')).toBeInViewport()
  await expect(page.getByTestId('chat-pinned')).toBeInViewport()
  await page.screenshot({ path: 'test-results/chat-question.png' })

  // answered from the chat's input: the answer names what it answers, and the question closes
  await page.getByTestId('chat-answer').click()
  await expect(page.getByTestId('reply-chip')).toContainText('Should a steer be recorded')
  await expect(page.getByTestId('chat-input')).toBeFocused()
  await page.getByTestId('chat-input').fill('yes, as a steer')
  await page.getByTestId('chat-input').press('Control+Enter')
  const answer = message(page, 'yes, as a steer')
  await expect(answer.getByTestId('chat-re')).toContainText('answering: Should a steer be recorded')
  await expect(page.getByTestId('reply-chip')).toHaveCount(0)
  await expect(page.getByTestId('chat-pinned')).toHaveCount(0)
  await expect(question.getByTestId('chat-question-state')).toHaveText(/^answered /)
  await expect(page.getByTestId('agent-questions')).toHaveCount(0)
  await expect(row.getByTestId('agent-row-questions')).toHaveCount(0)
  await expect(page.getByTestId('agent-state')).toHaveAttribute('data-state', 'idle') // the answer was a turn

  // two more: one dismissed by the person, one withdrawn by the agent
  await say(a, { text: 'Is the grey right?', kind: 'question' })
  const second = await say(a, { text: 'Want a changelog entry?', kind: 'question' })
  await expect(page.getByTestId('chat-question')).toHaveCount(2)
  await expect(page.getByTestId('agent-questions')).toHaveText('2 open questions')
  // choosing to answer and thinking better of it
  await page.getByTestId('chat-question').first().getByTestId('chat-answer').click()
  await expect(page.getByTestId('reply-chip')).toBeVisible()
  await page.getByTestId('reply-cancel').click()
  await expect(page.getByTestId('reply-chip')).toHaveCount(0)
  await page.getByTestId('chat-question').first().getByTestId('chat-dismiss').click()
  await expect(page.getByTestId('chat-question')).toHaveCount(1)
  await expect(message(page, 'Is the grey right?').getByTestId('chat-question-state')).toHaveText(
    /^dismissed /,
  )
  expect((await a.own.post(`/api/agents/${a.id}/chat/${second.id}/close`)).ok()).toBeTruthy()
  await expect(page.getByTestId('chat-pinned')).toHaveCount(0)
  await expect(
    message(page, 'Want a changelog entry?').getByTestId('chat-question-state'),
  ).toHaveText(/^no longer needed by the agent /)

  // a question asked while nobody has the agent open still shows on it in the list
  const b = await newAgent(page, projectId, 'quiet')
  await say(b, { text: 'Anyone there?', kind: 'question' })
  const quiet = page.getByTestId('agent-row').filter({ hasText: 'quiet' })
  await expect(quiet.getByTestId('agent-row-questions')).toHaveText('1 ?')
  await page.reload() // and after a reload, from the project's summary rather than a frame
  await expect(quiet.getByTestId('agent-row-questions')).toHaveText('1 ?')
  // from another project, where this one is folded to a line, the line carries the count
  const other = await page.request.post('/api/projects', {
    data: { name: 'Elsewhere', repos: [{ path: PROJECT_DIR }], defaultProfile: 'fake' },
  })
  const otherId = ((await other.json()) as { project: { id: string } }).project.id
  await page.goto(`/projects/${otherId}`)
  const folded = page.getByTestId('tree-project').filter({ hasText: 'Chat' })
  await expect(folded.getByTestId('tree-project-questions')).toHaveText('1 ?')
  await folded.getByTestId('tree-toggle').click()
  await expect(folded.getByTestId('tree-project-questions')).toHaveCount(0) // unfolded: it is on the agent
  await expect(quiet.getByTestId('agent-row-questions')).toHaveText('1 ?')
  await quiet.click()
  await expect(page.getByTestId('chat-pinned')).toContainText('Anyone there?')
  await page.request.delete(`/api/projects/${otherId}`)
  await a.own.dispose()
  await b.own.dispose()
})

test('the flow folds to a line and the divider drags, both remembered; nothing overflows at awkward sizes', async ({
  page,
}) => {
  await login(page)
  const projectId = await chatProject(page)
  const a = await newAgent(page, projectId, 'wide', { permissions: 'ask' })
  await page.goto(`/projects/${projectId}/agents/${a.id}`)
  // a message wider than any pane: a table, a line without a break, a block of code
  const cells = (word: string) => `| ${Array.from({ length: 14 }, () => word).join(' | ')} |`
  await say(a, {
    text: [
      'What changed, per file:',
      '',
      cells('column'),
      cells('---'),
      cells('a-fairly-long-value'),
      '',
      `https://example.test/${'a-very-long-path-segment/'.repeat(12)}`,
      '',
      '```',
      'const answer = '.padEnd(400, 'x'),
      '```',
    ].join('\n'),
    kind: 'decision',
  })
  await say(a, { text: 'Which of these do you want kept?', kind: 'question' })
  const table = message(page, 'What changed, per file')
  await expect(table.locator('table')).toBeVisible()
  // the table scrolls inside the message rather than folding its words to fit
  expect(
    await table.locator('table').evaluate((t) => t.scrollWidth - t.clientWidth),
  ).toBeGreaterThan(100)
  expect((await table.locator('th').first().boundingBox())!.height).toBeLessThan(40)
  // and the flow, narrower than it used to be, breaks a word longer than itself
  const flowWide = await page
    .getByTestId('transcript')
    .evaluate((t) => t.scrollWidth - t.clientWidth)
  expect(flowWide).toBeLessThanOrEqual(1)
  const chatPane = page.getByTestId('chat-pane')
  const flowPane = page.getByTestId('flow-pane')
  /** Nothing is wider than the page, and the chat's own content no wider than its pane. */
  const fits = async () => {
    expect(await pageOverflow(page)).toBeLessThanOrEqual(1)
    const wide = await chatPane.evaluate((pane) =>
      Math.max(
        ...[pane, ...pane.querySelectorAll('[data-test=chat-message]')].map(
          (e) => e.getBoundingClientRect().right - pane.getBoundingClientRect().right,
        ),
      ),
    )
    expect(wide).toBeLessThanOrEqual(1)
    // the inputs in sight (the flow's, the chat's, or both side by side) are on the page whole
    const view = page.viewportSize()!
    const boxes = [
      await page.getByTestId('turn-input').boundingBox(),
      await page.getByTestId('chat-input').boundingBox(),
    ].filter((b) => b !== null)
    expect(boxes.length).toBeGreaterThan(0)
    expect(Math.max(...boxes.map((b) => b.x + b.width))).toBeLessThanOrEqual(view.width)
    expect(Math.max(...boxes.map((b) => b.y + b.height))).toBeLessThanOrEqual(view.height)
    expect(Math.min(...boxes.map((b) => b.width))).toBeGreaterThan(150)
  }
  await fits()
  await page.screenshot({ path: 'test-results/chat-split.png' })

  // the divider: the chat widens as it is dragged left, and stays so
  const before = (await chatPane.boundingBox())!.width
  const grip = page.getByTestId('agent-panes').getByTestId('resize-handle').locator('div')
  const box = (await grip.boundingBox())!
  const x = box.x + box.width / 2
  await grip.dispatchEvent('pointerdown', { clientX: x, clientY: box.y + 100, bubbles: true })
  await page.evaluate(
    ([x, y]) => {
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: x - 60, clientY: y }))
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: x - 120, clientY: y }))
      window.dispatchEvent(new PointerEvent('pointerup', { clientX: x - 120, clientY: y }))
    },
    [x, box.y + 100],
  )
  await expect.poll(async () => (await chatPane.boundingBox())!.width).toBeGreaterThan(before + 100)
  const after = (await chatPane.boundingBox())!.width
  await fits()
  await page.reload()
  await expect(table).toBeVisible()
  expect((await chatPane.boundingBox())!.width).toBeCloseTo(after, 0)

  // sizes between a wide desk and a phone: two panes while both fit, then tabs
  for (const width of [1600, 1280, 1120, 1000, 900, 640]) {
    await page.setViewportSize({ width, height: 720 })
    await expect(table).toBeVisible()
    await fits()
    // 18rem of flow beside the chat needs 48rem of view: with the tree, a window of about 960px
    const two = width >= 1000
    await expect(flowPane).toBeVisible({ visible: two })
    await expect(page.getByTestId('turn-input')).toBeVisible({ visible: two }) // as tabs, the chat is in front
    await expect(page.getByTestId('chat-input')).toBeVisible()
    await expect(page.getByTestId('pane-tabs')).toBeVisible({ visible: !two })
    // the flow keeps a readable width however far the chat was dragged
    await expect
      .poll(async () => (await flowPane.boundingBox())?.width ?? 250)
      .toBeGreaterThanOrEqual(250)
    await page.screenshot({ path: `test-results/chat-${width}.png` })
  }
  await page.setViewportSize({ width: 1280, height: 720 })

  // the flow folded: one line of what the agent is doing, the chat takes the width
  await page.getByTestId('panes-chat').click()
  await expect(flowPane).toBeHidden()
  await expect(page.getByTestId('flow-strip')).toBeVisible()
  await expect(page.getByTestId('agent-panes').getByTestId('resize-handle')).toHaveCount(0)
  expect((await chatPane.boundingBox())!.width).toBeGreaterThan(after + 200)
  await fits()
  await page.reload()
  await expect(page.getByTestId('flow-strip')).toBeVisible() // remembered
  await expect(flowPane).toBeHidden()
  // a permission asked while the flow is folded: answered from the bar, since its card is out of sight
  await expect(page.getByTestId('turn-input')).toBeHidden() // the flow's input went with the flow
  await page.getByTestId('chat-input').fill('this needs permission')
  await page.getByTestId('chat-input').press('Control+Enter')
  await expect(page.getByTestId('permission-bar')).toBeVisible()
  await expect(page.getByTestId('flow-strip-activity')).toHaveText('waiting for your answer')
  await fits()
  await page.screenshot({ path: 'test-results/chat-flow-folded.png' })
  await page.getByTestId('permission-bar-allow').click()
  await expect(page.getByTestId('permission-bar')).toHaveCount(0)
  await expect(page.getByTestId('agent-state')).toHaveAttribute('data-state', 'idle')
  // a message's place in the flow opens the flow again
  await message(page, 'this needs permission').getByTestId('chat-locate').click()
  await expect(flowPane).toBeVisible()
  await expect(flowPane.locator('[data-index].ring-2')).toContainText('this needs permission')
  await page.getByTestId('panes-chat').click()
  await page.getByTestId('flow-strip').click() // and so does the line itself
  await expect(flowPane).toBeVisible()
  await expect(page.getByTestId('flow-strip')).toHaveCount(0)
  await a.own.dispose()
})

test('each pane has its own input: under the flow the direct conversation, under the chat what is said beside it', async ({
  page,
}) => {
  await login(page)
  const projectId = await chatProject(page)
  const a = await newAgent(page, projectId, 'direct')
  await page.goto(`/projects/${projectId}/agents/${a.id}`)
  const chatPane = page.getByTestId('chat-pane')
  const flowPane = page.getByTestId('flow-pane')
  const flowInput = page.getByTestId('turn-input')
  const chatInput = page.getByTestId('chat-input')
  const news = page.getByTestId('panes-chat').locator('span')
  /** The input is under its pane, within its width. */
  const under = async (input: typeof flowInput, pane: typeof flowPane) => {
    const i = (await input.boundingBox())!
    const p = (await pane.boundingBox())!
    expect(i.x).toBeGreaterThanOrEqual(p.x)
    expect(i.x + i.width).toBeLessThanOrEqual(p.x + p.width)
    expect(i.y).toBeGreaterThanOrEqual(p.y + p.height)
  }
  await expect(page.getByTestId('panes-both')).toHaveAttribute('aria-pressed', 'true')
  await expect(chatPane).toBeVisible()
  await under(flowInput, flowPane)
  await under(chatInput, chatPane)
  // a turn is a conversation in the flow: asked under it, answered in it, and not copied into the chat
  await flowInput.fill('hello there')
  await flowInput.press('Control+Enter')
  await expect(flowPane).toContainText('You said: hello there')
  await expect(flowInput).toHaveValue('')
  await expect(page.getByTestId('chat-empty')).toBeVisible()
  // what is being written in one is not in the other, and both are kept
  await flowInput.fill('for the flow')
  await chatInput.fill('for the chat')
  await page.screenshot({ path: 'test-results/chat-two-inputs.png' })
  await page.reload()
  await expect(flowInput).toHaveValue('for the flow')
  await expect(chatInput).toHaveValue('for the chat')
  await chatInput.fill('')

  // the flow alone: the chat and its input are put away, and the view is the one there was before it
  await page.getByTestId('panes-flow').click()
  await expect(chatPane).toBeHidden()
  await expect(chatInput).toBeHidden()
  await expect(page.getByTestId('pane-tabs')).toBeHidden()
  await expect(page.getByTestId('agent-panes').getByTestId('resize-handle')).toHaveCount(0)
  await under(flowInput, flowPane)
  await flowInput.fill('and again')
  await flowInput.press('Control+Enter')
  await expect(flowPane).toContainText('You said: and again')
  expect(await pageOverflow(page)).toBeLessThanOrEqual(1)
  await page.reload() // remembered
  await expect(flowPane).toContainText('You said: and again')
  await expect(chatPane).toBeHidden()
  await expect(page.getByTestId('panes-flow')).toHaveAttribute('aria-pressed', 'true')

  // what the agent says meanwhile is not missed: counted on the way back to the chat
  await expect(news).toHaveCount(0)
  await say(a, { text: 'Chose the smaller change.', kind: 'decision' })
  await expect(news).toHaveText('1 new')
  await say(a, { text: 'Keep the old name?', kind: 'question' })
  await expect(news).toHaveText(['1 ?', '1 new'])
  await page.screenshot({ path: 'test-results/chat-put-away.png' })
  // the question in the header brings the chat back, beside the flow
  await page.getByTestId('agent-questions').click()
  await expect(page.getByTestId('chat-question')).toContainText('Keep the old name?')
  await expect(flowPane).toBeVisible()
  await expect(page.getByTestId('panes-both')).toHaveAttribute('aria-pressed', 'true')
  await expect(news).toHaveCount(0)
  await page.getByTestId('chat-dismiss').click()

  // while it works: the flow's input steers, the chat's leaves a message beside the work
  await flowInput.fill('linger')
  await flowInput.press('Control+Enter')
  await expect(page.getByTestId('agent-state')).toHaveAttribute('data-state', 'working')
  await expect(page.getByTestId('send')).toHaveText('steer')
  await expect(page.getByTestId('chat-send')).toHaveText('send')
  await chatInput.fill('a thought meanwhile')
  await chatInput.press('Control+Enter')
  await expect(message(page, 'a thought meanwhile').getByTestId('chat-read')).toHaveText(
    'not read yet',
  )
  // with the chat put away, the switch says that it waits
  await page.getByTestId('panes-flow').click()
  await expect(page.getByTestId('panes-chat-waiting')).toHaveText('1 waiting')
  // the chat alone: its input is the only one, and carries the interrupt
  await page.getByTestId('panes-chat').click()
  await expect(flowInput).toBeHidden()
  await page.getByTestId('chat-interrupt').click()
  await expect(message(page, 'a thought meanwhile').getByTestId('chat-read')).toHaveText(/^read /)
  await page.getByTestId('panes-both').click()
  await expect(flowPane).toContainText('You said: a thought meanwhile') // handed over when the turn ended
  await expect(page.getByTestId('agent-state')).toHaveAttribute('data-state', 'idle')
  await expect(page.getByTestId('send')).toHaveText('send')
  await a.own.dispose()
})

test('a question, and an important decision, notify the page that is open and not looked at', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['notifications'])
  await page.addInitScript(() => {
    const shown: { title: string; body?: string }[] = []
    class FakeNotification {
      static permission: NotificationPermission = 'granted'
      static requestPermission = async () => 'granted' as NotificationPermission
      onclick: (() => void) | null = null
      constructor(title: string, opts?: NotificationOptions) {
        shown.push({ title, body: opts?.body })
      }
      close() {}
    }
    ;(window as unknown as { Notification: unknown }).Notification = FakeNotification
    ;(window as unknown as { __shown: unknown }).__shown = shown
    document.hasFocus = () => false // the user is elsewhere
  })
  await login(page)
  const projectId = await chatProject(page)
  const a = await newAgent(page, projectId, 'caller')
  await page.getByTestId('settings').click()
  await page.getByTestId('notify-toggle').check()
  await page.getByTestId('settings').click()
  await page.goto(`/projects/${projectId}/agents/${a.id}`)
  await expect(page.getByTestId('chat-empty')).toBeVisible()
  await say(a, { text: 'Halfway through the list.' }) // there when someone looks: no notification
  await say(a, { text: 'Tabs or spaces in the generated file?', kind: 'question' })
  await say(a, { text: 'Rewrote the importer.', kind: 'decision', important: true })
  const q = await say(a, { text: 'One more?', kind: 'question' })
  await a.own.post(`/api/agents/${a.id}/chat/${q.id}/close`) // closing says nothing new
  await expect(message(page, 'One more?').getByTestId('chat-question-state')).toHaveText(
    /^no longer needed/,
  )
  expect(await page.evaluate(() => (window as unknown as { __shown: unknown[] }).__shown)).toEqual([
    { title: 'caller asks', body: 'Tabs or spaces in the generated file?' },
    { title: 'caller decided', body: 'Rewrote the importer.' },
    { title: 'caller asks', body: 'One more?' },
  ])
  await a.own.dispose()
})

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('the panes are tabs, the chat first, and a question shows on its tab', async ({ page }) => {
    await login(page)
    const projectId = await chatProject(page)
    const a = await newAgent(page, projectId, 'pocket')
    await say(a, {
      text: 'Going with the smaller of the two layouts.',
      kind: 'decision',
      important: true,
    })
    await say(a, { text: 'Is the smaller layout fine on your phone?', kind: 'question' })
    // where a notification about the agent lands: its page, which opens on the chat
    await page.goto(`/projects/${projectId}/agents/${a.id}`)
    await expect(page.getByTestId('pane-tab-chat')).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('pane-tab-chat')).toContainText('1 ?')
    await expect(page.getByTestId('chat-pinned')).toBeInViewport()
    await expect(page.getByTestId('chat-pinned')).toContainText('Is the smaller layout fine')
    await expect(page.getByTestId('flow-pane')).toBeHidden()
    await expect(page.getByTestId('panes')).toBeHidden() // choosing panes is for where two fit
    expect(await pageOverflow(page)).toBeLessThanOrEqual(1)
    await page.screenshot({ path: 'test-results/chat-phone.png' })
    // answered where it is
    await expect(page.getByTestId('turn-input')).toBeHidden() // each tab has its own input
    await page.getByTestId('chat-answer').click()
    await page.getByTestId('chat-input').fill('good as it is')
    await page.getByTestId('chat-send').click()
    await expect(page.getByTestId('chat-pinned')).toHaveCount(0)
    await expect(page.getByTestId('pane-tab-chat')).not.toContainText('?')
    // the flow is the other tab; a message's time goes to its place there
    await expect(message(page, 'good as it is').getByTestId('chat-read')).toHaveText(
      'sent as a turn',
    )
    await expect(page.getByTestId('agent-state')).toHaveAttribute('data-state', 'idle')
    await message(page, 'good as it is').getByTestId('chat-locate').click()
    await expect(page.getByTestId('pane-tab-flow')).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('chat-pane')).toBeHidden()
    await expect(page.getByTestId('flow-pane').locator('[data-index].ring-2')).toContainText(
      'good as it is',
    )
    await expect(page.getByTestId('turn-input')).toBeVisible()
    await expect(page.getByTestId('chat-input')).toBeHidden()
    expect(await pageOverflow(page)).toBeLessThanOrEqual(1)
    await page.getByTestId('pane-tab-chat').click()
    await expect(message(page, 'Going with the smaller')).toBeVisible()
    // someone who put the chat away gets the flow in front here too
    await page.evaluate(() => localStorage.setItem('agent-panes', 'flow'))
    await page.reload()
    await expect(page.getByTestId('pane-tab-flow')).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('flow-pane')).toContainText('good as it is')
    await a.own.dispose()
  })
})
