import { createI18n } from 'vue-i18n'

/**
 * vue-i18n setup.
 *
 * Every locale — English included — is loaded through the same dynamic import,
 * so each language is its own chunk and a visitor downloads only what they use.
 * Loading English the same way as the rest also keeps Vite from warning that a
 * file is both statically and dynamically imported.
 *
 * The non-English files are generated during the build by vite-plugin-shipi18n.
 */

export const LOCALES = [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
]

export const isSupported = (code) => LOCALES.some((l) => l.code === code)

// Vite can statically analyse this glob and split each locale into its own chunk.
const localeFiles = import.meta.glob('./locales/*/translation.json')

const i18n = createI18n({
  legacy: false, // Composition API
  locale: 'en',
  fallbackLocale: 'en',
  messages: {},
})

export async function loadLocale(locale) {
  if (!isSupported(locale)) {
    console.warn(`Unsupported locale "${locale}", staying on ${i18n.global.locale.value}`)
    return i18n.global.locale.value
  }

  if (!i18n.global.availableLocales.includes(locale)) {
    const load = localeFiles[`./locales/${locale}/translation.json`]
    if (!load) {
      console.warn(`No message file for "${locale}" — run the build to generate it`)
      return i18n.global.locale.value
    }
    const messages = await load()
    i18n.global.setLocaleMessage(locale, messages.default)
  }

  i18n.global.locale.value = locale
  if (typeof document !== 'undefined') document.documentElement.lang = locale
  return locale
}

export default i18n
