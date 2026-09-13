/**
 * Minimal App Router i18n — no library required.
 *
 * The message files are produced at build time by `npm run i18n`. Dictionaries
 * are imported dynamically so each locale lands in its own chunk and only the
 * requested one is sent to the client.
 */

export const LOCALES = ['en', 'es', 'fr', 'de']
export const DEFAULT_LOCALE = 'en'

export const LOCALE_LABELS = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
}

const dictionaries = {
  en: () => import('../../messages/en.json').then((m) => m.default),
  es: () => import('../../messages/es.json').then((m) => m.default),
  fr: () => import('../../messages/fr.json').then((m) => m.default),
  de: () => import('../../messages/de.json').then((m) => m.default),
}

export const isLocale = (value) => LOCALES.includes(value)

export async function getDictionary(locale) {
  const load = dictionaries[locale] ?? dictionaries[DEFAULT_LOCALE]
  return load()
}

/**
 * Resolve a dotted key and substitute {{placeholders}}.
 *
 * Plurals follow the i18next convention (`key_one` / `key_other`) so the same
 * message files work if you later swap in i18next or next-intl. Pass `count`
 * to select the form.
 */
export function translate(dict, key, vars = {}) {
  const lookup = (k) => k.split('.').reduce((o, part) => (o == null ? o : o[part]), dict)

  let template = lookup(key)
  if (template == null && typeof vars.count === 'number') {
    template = lookup(`${key}_${vars.count === 1 ? 'one' : 'other'}`)
  }
  if (typeof template !== 'string') return key // render the key, so misses are obvious

  return template.replace(/\{\{(\w+)\}\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match
  )
}
