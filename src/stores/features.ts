import { defineStore } from 'pinia'
import { reactive } from 'vue'
import { api } from '@/api/client'
import { events } from '@/api/events'
import type { Feature, FeatureStatus } from '@/api/types'

const ORDER: Record<FeatureStatus, number> = {
  'in-progress': 0,
  review: 1,
  blocked: 2,
  planned: 3,
  done: 4,
}
function compare(a: Feature, b: Feature): number {
  return (
    ORDER[a.status] - ORDER[b.status] ||
    (a.status === 'done'
      ? b.mtime - a.mtime
      : a.priority - b.priority || a.slug.localeCompare(b.slug))
  )
}

/** Features per project, kept current by feature.changed events (the manager polls the files, so an agent's own edits arrive too). */
export const useFeaturesStore = defineStore('features', () => {
  const byProject = reactive(new Map<string, Feature[]>())

  events.on((f) => {
    if (f.type !== 'feature.changed') return
    const list = byProject.get(f.projectId)
    if (!list) return
    const i = list.findIndex((x) => x.slug === f.feature.slug)
    if (i >= 0) list[i] = f.feature
    else list.push(f.feature)
    list.sort(compare) // the manager's order: status, then priority, done newest first
  })
  events.onReconnect = ((prev) => () => {
    prev?.()
    for (const id of byProject.keys()) void load(id)
  })(events.onReconnect)

  async function load(projectId: string): Promise<void> {
    byProject.set(projectId, (await api.features(projectId)).features)
  }

  async function create(
    projectId: string,
    input: { slug: string; title: string; body?: string; priority?: number; repo?: string },
  ): Promise<Feature> {
    const { feature } = await api.createFeature(projectId, input)
    await load(projectId)
    return feature
  }

  const setStatus = (projectId: string, slug: string, status: FeatureStatus) =>
    api.setFeatureStatus(projectId, slug, status)
  const respond = (projectId: string, slug: string, text: string) =>
    api.respondFeature(projectId, slug, text)
  const update = (
    projectId: string,
    slug: string,
    patch: { title?: string; body?: string; priority?: number },
  ) => api.updateFeature(projectId, slug, patch)

  return { byProject, load, create, setStatus, respond, update }
})
