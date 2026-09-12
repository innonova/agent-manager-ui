import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { unauthorized } from './api/client'
import { usePreferencesStore } from './stores/preferences'

const app = createApp(App)
app.use(createPinia())
usePreferencesStore() // applies theme and font size to <html> before the first paint
app.use(router)
app.mount('#app')

unauthorized.addEventListener('unauthorized', () => {
  if (router.currentRoute.value.name !== 'login')
    void router.push({ name: 'login', query: { next: router.currentRoute.value.fullPath } })
})
