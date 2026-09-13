/**
 * react-i18next setup.
 *
 * Every locale file here was produced at build time by `npm run i18n`, which
 * calls @shipi18n/cli with YOUR provider key. At runtime this app has no
 * Shipi18n dependency and no key — it just imports finished JSON.
 */
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import en from './locales/en.json'
import es from './locales/es.json'
import fr from './locales/fr.json'
import de from './locales/de.json'

export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
]

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    es: { translation: es },
    fr: { translation: fr },
    de: { translation: de },
  },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: {
    // React already escapes values, so i18next must not escape them again.
    escapeValue: false,
  },
})

export default i18n
