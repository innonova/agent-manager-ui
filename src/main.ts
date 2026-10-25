import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { useHostsStore } from '@/stores/hosts'
import App from './App.vue'
import router from './router'
import { unauthorized } from './api/client'
import { usePreferencesStore } from './stores/preferences'

const app = createApp(App)
app.use(createPinia())
useHostsStore() // before the socket opens, so hello is not missed
usePreferencesStore() // applies theme and font size to <html> before the first paint
app.use(router)
app.mount('#app')

// The shell is as tall as what is visible: on iOS the layout viewport does
// not shrink for the keyboard but the visual one does, and this is what
// brings the composer up with it. iOS also scrolls the page itself to show
// a focused field; with the page never meant to scroll, that is undone.
const vv = window.visualViewport
if (vv) {
  const fit = () => {
    document.documentElement.style.setProperty('--app-h', `${Math.round(vv.height)}px`)
    if (window.scrollY) window.scrollTo(0, 0)
  }
  vv.addEventListener('resize', fit)
  vv.addEventListener('scroll', fit)
  fit()
}

unauthorized.addEventListener('unauthorized', () => {
  if (router.currentRoute.value.name !== 'login')
    void router.push({ name: 'login', query: { next: router.currentRoute.value.fullPath } })
})
