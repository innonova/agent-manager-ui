import { defineStore } from 'pinia'
import { reactive } from 'vue'
import { api } from '@/api/client'
import { events } from '@/api/events'
import type { Feature, FeatureStatus } from '@/api/types'

/** Features per project, kept current by feature.changed events. */
export const useFeaturesStore = defineStore('features', () => {
  const byProject = reactive(new Map<string, Feature[]>())

  events.on((f) => {
    if (f.type !== 'feature.changed') return
    const list = byProject.get(f.projectId)
    if (!list) return
    const i = list.findIndex((x) => x.slug === f.feature.slug)
    if (i >= 0) list[i] = f.feature
    else list.push(f.feature)
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
    input: { slug: string; title: string; body?: string; priority?: number },
  ): Promise<Feature> {
    const { feature } = await api.createFeature(projectId, input)
    await load(projectId)
    return feature
  }

  const queue = (projectId: string, slug: string, agentId: string) =>
    api.queueFeature(projectId, slug, agentId)
  const dequeue = (projectId: string, slug: string) => api.dequeueFeature(projectId, slug)
  const setStatus = (projectId: string, slug: string, status: FeatureStatus) =>
    api.setFeatureStatus(projectId, slug, status)

  return { byProject, load, create, queue, dequeue, setStatus }
})
