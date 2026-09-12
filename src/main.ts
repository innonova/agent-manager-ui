import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { unauthorized } from './api/client'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')

unauthorized.addEventListener('unauthorized', () => {
  if (router.currentRoute.value.name !== 'login')
    void router.push({ name: 'login', query: { next: router.currentRoute.value.fullPath } })
})
