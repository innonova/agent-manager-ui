<script setup lang="ts">
import { computed } from 'vue'
import type { AgentStats } from '@/api/types'
import { count, day, moment, span } from '@/stats'

/**
 * How an agent has been run, laid out to be read at a glance: the
 * headline figures as tiles, who started the turns as one bar split in
 * parts with its figures listed under it, the unattended share as a
 * meter, and the rest as small tables. One column on a phone, and the
 * body scrolls: the dialog never grows past the screen.
 *
 * Colour says which part is which and nothing else: the four starters
 * take the first four hues of the chart palette in a fixed order
 * (checked for colour-blind separation on both surfaces), and every
 * part is named beside its figures, so no reading depends on colour.
 */
const props = defineProps<{
  name: string
  stats: AgentStats | null
  error: string | null
}>()
const emit = defineEmits<{ close: [] }>()

const STARTERS = [
  { key: 'person', label: 'A person', dot: 'bg-[#2a78d6] dark:bg-[#3987e5]' },
  { key: 'self', label: 'Itself', dot: 'bg-[#eb6834] dark:bg-[#d95926]' },
  { key: 'manager', label: 'The manager', dot: 'bg-[#1baf7a] dark:bg-[#199e70]' },
  { key: 'agent', label: 'Another agent', dot: 'bg-[#eda100] dark:bg-[#c98500]' },
] as const

const percent = (part: number, whole: number) =>
  whole > 0 ? `${Math.round((100 * part) / whole)}%` : '0%'

/** Who started the turns, the ones that started none left out; shares are of the runtime. */
const starters = computed(() => {
  const s = props.stats
  if (!s) return []
  return STARTERS.map((k) => ({ ...k, ...s.startedBy[k.key] }))
    .filter((k) => k.turns > 0)
    .map((k) => ({ ...k, share: percent(k.runtimeMs, s.runtimeMs) }))
})
const cost = computed(() =>
  props.stats && props.stats.costUsd > 0
    ? `$${props.stats.costUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    : '–',
)
const unattendedPercent = computed(() =>
  props.stats ? Math.round(props.stats.unattended.share * 100) : 0,
)
</script>

<template>
  <div
    class="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-3"
    data-test="stats-dialog"
    tabindex="-1"
    @click.self="emit('close')"
    @keydown.esc="emit('close')"
  >
    <div
      class="flex max-h-full w-full max-w-2xl flex-col rounded-lg bg-white shadow-xl dark:bg-slate-900"
      role="dialog"
      :aria-label="`How ${name} has been run`"
    >
      <header
        class="flex items-baseline justify-between gap-3 border-b border-slate-200 px-5 py-3 dark:border-slate-800"
      >
        <h2 class="text-lg font-semibold">How {{ name }} has been run</h2>
        <span
          v-if="stats?.working"
          class="rounded bg-blue-100 px-1.5 py-0.5 text-sm text-blue-900 dark:bg-blue-950 dark:text-blue-200"
          >working now</span
        >
      </header>

      <div class="flex flex-col gap-5 overflow-y-auto px-5 py-4" data-test="stats">
        <p v-if="error" class="text-base text-red-700 dark:text-red-300">{{ error }}</p>
        <p v-else-if="!stats" class="text-base text-slate-500 dark:text-slate-400">
          reading the transcript…
        </p>
        <p
          v-else-if="stats.since === null"
          class="text-base text-slate-500 dark:text-slate-400"
          data-stat="runtime"
        >
          This agent has not run yet.
        </p>
        <template v-else>
          <!-- the headline figures -->
          <dl class="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div
              v-for="t in [
                {
                  key: 'runtime',
                  label: 'Runtime',
                  value: span(stats.runtimeMs),
                  sub: `since ${day(stats.since)}`,
                },
                {
                  key: 'turns',
                  label: 'Turns',
                  value: stats.turns.toLocaleString(),
                  sub: `${stats.runs.count.toLocaleString()} runs`,
                },
                {
                  key: 'output',
                  label: 'Tokens out',
                  value: count(stats.tokens.output),
                  sub: 'written by the agent',
                },
                { key: 'cost', label: 'Cost', value: cost, sub: 'at list prices' },
              ]"
              :key="t.key"
              class="rounded-md border border-slate-200 px-3 py-2 dark:border-slate-800"
              :data-stat="t.key"
            >
              <dt class="text-sm text-slate-500 dark:text-slate-400">{{ t.label }}</dt>
              <dd class="text-2xl leading-tight font-semibold">{{ t.value }}</dd>
              <dd class="text-sm text-slate-500 dark:text-slate-400">{{ t.sub }}</dd>
            </div>
          </dl>

          <!-- since a person last wrote -->
          <section v-if="stats.sinceLastMessage" data-stat="since">
            <h3 class="text-base font-medium">
              Since {{ stats.sinceLastMessage.by }}'s last direct message
              <span class="font-normal text-slate-500 dark:text-slate-400"
                >· {{ moment(stats.sinceLastMessage.at) }}</span
              >
            </h3>
            <dl class="mt-1 grid grid-cols-3 gap-2">
              <div>
                <dd class="text-xl font-semibold">{{ span(stats.sinceLastMessage.runtimeMs) }}</dd>
                <dt class="text-sm text-slate-500 dark:text-slate-400">of work</dt>
              </div>
              <div>
                <dd class="text-xl font-semibold">{{ stats.sinceLastMessage.turns }}</dd>
                <dt class="text-sm text-slate-500 dark:text-slate-400">
                  turn{{ stats.sinceLastMessage.turns === 1 ? '' : 's' }} begun
                </dt>
              </div>
              <div>
                <dd class="text-xl font-semibold">
                  {{ count(stats.sinceLastMessage.outputTokens) }}
                </dd>
                <dt class="text-sm text-slate-500 dark:text-slate-400">
                  tokens out{{ stats.working ? ', turns ended' : '' }}
                </dt>
              </div>
            </dl>
          </section>

          <!-- unattended: one share of the whole, as a meter with its figures -->
          <section data-stat="unattended">
            <h3 class="text-base font-medium">Unattended</h3>
            <div class="mt-1 flex items-center gap-3">
              <span class="w-14 shrink-0 text-xl font-semibold">{{ unattendedPercent }}%</span>
              <div
                class="h-2 grow overflow-hidden rounded-full bg-[#cde2fb] dark:bg-[#104281]"
                role="meter"
                aria-valuemin="0"
                aria-valuemax="100"
                :aria-valuenow="unattendedPercent"
                :aria-label="`${unattendedPercent}% of the runtime was unattended`"
                :title="`${span(stats.unattended.runtimeMs)} of ${span(stats.runtimeMs)}`"
              >
                <div
                  class="h-full rounded-full bg-[#2a78d6] dark:bg-[#3987e5]"
                  :style="{ width: `${Math.min(100, stats.unattended.share * 100)}%` }"
                />
              </div>
            </div>
            <dl class="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-4">
              <div
                v-for="f in [
                  { label: 'unattended work', value: span(stats.unattended.runtimeMs) },
                  { label: 'runs that went on', value: stats.unattended.runs.toLocaleString() },
                  { label: 'median', value: span(stats.unattended.medianMs) },
                  { label: 'longest', value: span(stats.unattended.longestMs) },
                ]"
                :key="f.label"
              >
                <dd class="font-semibold">{{ f.value }}</dd>
                <dt class="text-sm text-slate-500 dark:text-slate-400">{{ f.label }}</dt>
              </div>
            </dl>
            <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Work done more than {{ span(stats.unattended.afterMs) }} after a person last wrote
              anything, in the flow or the chat. An estimate from the messages: nobody records who
              was looking.
            </p>
          </section>

          <!-- who started the turns: one whole split in parts, the figures listed under it -->
          <section data-stat="started by">
            <h3 class="text-base font-medium">Who started the turns</h3>
            <div
              class="mt-2 flex h-2 gap-0.5"
              role="img"
              :aria-label="starters.map((k) => `${k.label} ${k.share} of the runtime`).join(', ')"
            >
              <div
                v-for="k in starters"
                :key="k.key"
                class="min-w-1 rounded-full"
                :class="k.dot"
                :style="{ flex: `${Math.max(1, k.runtimeMs)} 0 0` }"
                :title="`${k.label}: ${span(k.runtimeMs)}, ${k.share} of the runtime`"
              />
            </div>
            <table class="mt-2 w-full text-base">
              <thead class="text-left text-sm text-slate-500 dark:text-slate-400">
                <tr>
                  <th class="font-normal">started by</th>
                  <th class="text-right font-normal">turns</th>
                  <th class="text-right font-normal">runtime</th>
                  <th class="text-right font-normal">share</th>
                </tr>
              </thead>
              <tbody class="tabular-nums">
                <tr v-for="k in starters" :key="k.key">
                  <td>
                    <span class="mr-2 inline-block size-2.5 rounded-sm" :class="k.dot" />{{
                      k.label
                    }}
                  </td>
                  <td class="text-right">{{ k.turns.toLocaleString() }}</td>
                  <td class="text-right">{{ span(k.runtimeMs) }}</td>
                  <td class="text-right">{{ k.share }}</td>
                </tr>
              </tbody>
            </table>
            <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Itself: a background job finished and the agent took the work up again.
            </p>
          </section>

          <!-- the runs between messages -->
          <section v-if="stats.runs.count" data-stat="runs">
            <h3 class="text-base font-medium">Runs between direct messages</h3>
            <dl class="mt-1 grid grid-cols-3 gap-2">
              <div>
                <dd class="text-xl font-semibold">{{ stats.runs.count.toLocaleString() }}</dd>
                <dt class="text-sm text-slate-500 dark:text-slate-400">runs</dt>
              </div>
              <div>
                <dd class="text-xl font-semibold">{{ span(stats.runs.medianMs) }}</dd>
                <dt class="text-sm text-slate-500 dark:text-slate-400">median</dt>
              </div>
              <div>
                <dd class="text-xl font-semibold">{{ span(stats.runs.longestMs) }}</dd>
                <dt class="text-sm text-slate-500 dark:text-slate-400">longest</dt>
              </div>
            </dl>
            <table class="mt-2 w-full text-base">
              <thead class="text-left text-sm text-slate-500 dark:text-slate-400">
                <tr>
                  <th class="font-normal">the longest, after a message of</th>
                  <th class="font-normal">by</th>
                  <th class="text-right font-normal">work</th>
                </tr>
              </thead>
              <tbody class="tabular-nums">
                <tr v-for="r in stats.runs.longest" :key="r.at">
                  <td>{{ moment(r.at) }}</td>
                  <td>{{ r.by }}</td>
                  <td class="text-right">{{ span(r.runtimeMs) }}</td>
                </tr>
              </tbody>
            </table>
            <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
              A run is the agent's work between one direct message and the next. What is said in the
              chat is beside the work and ends no run.
            </p>
          </section>

          <!-- tokens: four figures of very different size, so a table and not a chart -->
          <section data-stat="tokens">
            <h3 class="text-base font-medium">Tokens</h3>
            <table class="mt-1 w-full text-base">
              <tbody class="tabular-nums">
                <tr
                  v-for="t in [
                    { label: 'Written by the agent', value: stats.tokens.output },
                    { label: 'Read fresh', value: stats.tokens.input },
                    { label: 'Written to the cache', value: stats.tokens.cacheWrite },
                    { label: 'Read from the cache', value: stats.tokens.cacheRead },
                  ]"
                  :key="t.label"
                >
                  <td>{{ t.label }}</td>
                  <td class="text-right font-semibold" :title="t.value.toLocaleString()">
                    {{ count(t.value) }}
                  </td>
                </tr>
              </tbody>
            </table>
            <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Every request of a turn reads the whole context again, from the cache: that last
              figure is requests times context, not text. Runtime is the turns' lengths added up:
              waiting on a tool counts, sitting idle between turns does not.
            </p>
          </section>
        </template>
      </div>

      <footer class="flex justify-end border-t border-slate-200 px-5 py-3 dark:border-slate-800">
        <button
          type="button"
          class="rounded bg-blue-600 px-4 py-1.5 text-base text-white hover:bg-blue-700"
          data-test="stats-close"
          @click="emit('close')"
        >
          close
        </button>
      </footer>
    </div>
  </div>
</template>
