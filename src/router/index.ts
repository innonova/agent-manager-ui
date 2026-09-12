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
  ],
})

router.beforeEach(async (to) => {
  const session = useSessionStore()
  if (!session.checked) await session.restore()
  if (!to.meta.public && !session.user) return { name: 'login', query: { next: to.fullPath } }
  if (to.name === 'login' && session.user) return { name: 'projects' }
  return true
})

export default router
