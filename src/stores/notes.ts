import { defineStore } from 'pinia'
import { reactive } from 'vue'
import { api } from '@/api/client'
import { events } from '@/api/events'
import type { Notes } from '@/api/types'

/**
 * A project's notes, kept current from `notes.changed`: an agent ticking
 * one, a person adding one in another tab, a file edited by hand all land
 * here within seconds.
 */
export const useNotesStore = defineStore('notes', () => {
  const byProject = reactive(new Map<string, Notes>())
  events.on((f) => {
    if (f.type === 'notes.changed') byProject.set(f.projectId, f.notes)
  })
  async function load(projectId: string) {
    byProject.set(projectId, await api.notes(projectId))
  }
  async function add(projectId: string, text: string) {
    byProject.set(projectId, await api.addNote(projectId, text))
  }
  async function update(projectId: string, id: string, patch: { done?: boolean; text?: string }) {
    byProject.set(projectId, await api.updateNote(projectId, id, patch))
  }
  async function remove(projectId: string, id: string) {
    byProject.set(projectId, await api.removeNote(projectId, id))
  }
  return { byProject, load, add, update, remove }
})
