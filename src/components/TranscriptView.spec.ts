import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it } from 'vitest'
import type { StoredItem } from '@/api/types'
import TranscriptView from './TranscriptView.vue'

/**
 * The item array is sparse below the fetched tail (earlier history is a
 * hole until paged in), and twice a loop over it assumed otherwise and
 * blanked the page. A transcript opened mid-history, with a withdrawal
 * marker in the tail, must render and fold the right rows.
 */
const stored = (index: number, item: StoredItem['item']): StoredItem => ({
  index,
  sessionId: 's',
  at: 1000 + index,
  seqFrom: index,
  seqTo: index,
  item,
})

describe('TranscriptView', () => {
  it('renders a sparse item array and hides the withdrawn range until asked', async () => {
    setActivePinia(createPinia())
    const items: StoredItem[] = []
    items.length = 10 // holes 0..6: earlier history not loaded
    items[7] = stored(7, { kind: 'user', text: 'wrong window', by: 'aek' })
    items[8] = stored(8, {
      kind: 'text',
      text: 'that seems meant for someone else',
      streaming: false,
    })
    items[9] = stored(9, { kind: 'system', text: 'withdrawn: …', withdrawnFrom: 7 })
    const w = mount(TranscriptView, {
      props: { items, agentId: 'a', working: false, withdrawIndex: 7, withdrawReason: null },
      global: { stubs: { RouterLink: true } },
    })
    // hidden by default, shown on request from the marker line
    expect(w.findAll('[data-withdrawn="true"]')).toHaveLength(0)
    expect(w.text()).toContain('withdrawn')
    await w.find('[data-test="withdrawn-toggle"]').trigger('click')
    expect(w.findAll('[data-withdrawn="true"]')).toHaveLength(2)
    // the withdraw action sits on the message it is about, and emits
    await w.find('[data-test="withdraw"]').trigger('click')
    expect(w.emitted('withdraw')).toHaveLength(1)
  })
})
