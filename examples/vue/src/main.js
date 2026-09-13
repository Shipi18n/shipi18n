import { createApp } from 'vue'
import App from './App.vue'
import i18n, { loadLocale } from './i18n'
import './style.css'

// Load the initial locale before mounting so the first paint is already
// translated — no flash of untranslated keys.
const initial = localStorage.getItem('locale') || navigator.language?.split('-')[0] || 'en'

loadLocale(initial)
  .then((locale) => {
    localStorage.setItem('locale', locale)
    createApp(App).use(i18n).mount('#app')
  })
  .catch(() => {
    // Never leave the page blank because a locale file failed to load.
    loadLocale('en').finally(() => createApp(App).use(i18n).mount('#app'))
  })
