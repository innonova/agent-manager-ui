import { createRouter, createWebHistory } from 'vue-router'
import { useSessionStore } from '@/stores/session'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { public: true },
    },
    { path: '/', name: 'projects', component: () => import('@/views/ProjectsView.vue') },
    { path: '/users', name: 'users', component: () => import('@/views/UsersView.vue') },
    { path: '/harness', name: 'harness', component: () => import('@/views/HarnessView.vue') },
    {
      path: '/models',
      name: 'models',
      component: () => import('@/views/HarnessView.vue'),
      props: { kind: 'models' },
    },
    {
      path: '/method',
      name: 'method',
      component: () => import('@/views/HarnessView.vue'),
      props: { kind: 'method' },
    },
    { path: '/learnings', name: 'learnings', component: () => import('@/views/LearningsView.vue') },
    {
      path: '/projects/:id',
      name: 'project',
      component: () => import('@/views/ProjectView.vue'),
      props: true,
    },
    {
      path: '/projects/:id/agents/:agentId',
      name: 'agent',
      component: () => import('@/views/ProjectView.vue'),
      props: true,
    },
    {
      path: '/projects/:id/files',
      name: 'files',
      component: () => import('@/views/FilesView.vue'),
      props: true,
    },
    {
      path: '/projects/:id/features',
      name: 'features',
      component: () => import('@/views/FeaturesView.vue'),
      props: true,
    },
  ],
})

router.beforeEach(async (to) => {
  const session = useSessionStore()
  if (!session.checked) await session.restore()
  if (!to.meta.public && !session.user) return { name: 'login', query: { next: to.fullPath } }
  if (to.name === 'login' && session.user) return { name: 'projects' }
  return true
})

/**
 * A deploy replaces the hashed chunk files, so the first lazy route a
 * tab opens after an update fails to load its module. That is not a
 * broken app but a stale one: reload straight into the new build at the
 * requested address. A failure right after such a reload is something
 * else, and is reported instead of looping.
 */
const CHUNK_ERROR = /dynamically imported module|Importing a module script|Loading chunk|preload/i
const RELOAD_MARK = 'chunk-reload'

export function reloadForNewBuild(target: string): boolean {
  const last = Number(sessionStorage.getItem(RELOAD_MARK) ?? 0)
  if (Date.now() - last < 15_000) return false
  sessionStorage.setItem(RELOAD_MARK, String(Date.now()))
  location.assign(target)
  return true
}

router.onError((error, to) => {
  if (!CHUNK_ERROR.test(String(error?.message ?? error))) return
  if (reloadForNewBuild(to.fullPath)) return
  import('@/stores/notifications').then(({ useNotificationsStore }) =>
    useNotificationsStore().push(
      'error',
      'this page could not be loaded; reload the tab to get the current version',
      15_000,
    ),
  )
})
// Vite's own signal for a missing stylesheet or preloaded chunk.
window.addEventListener('vite:preloadError', (e) => {
  e.preventDefault()
  reloadForNewBuild(location.pathname + location.search)
})

export default router
