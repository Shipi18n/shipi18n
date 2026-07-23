/**
 * Language code → human-readable name. Ported from the backend so prompts read
 * naturally ("Translate from English to Spanish") rather than using bare codes.
 */
const LANGUAGE_NAMES = {
  en: 'English', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian',
  pt: 'Portuguese', nl: 'Dutch', ru: 'Russian', zh: 'Chinese', 'zh-CN': 'Chinese (Simplified)',
  'zh-TW': 'Chinese (Traditional)', ja: 'Japanese', ko: 'Korean', ar: 'Arabic', hi: 'Hindi',
  tr: 'Turkish', pl: 'Polish', vi: 'Vietnamese', th: 'Thai', id: 'Indonesian', ms: 'Malay',
  sv: 'Swedish', da: 'Danish', no: 'Norwegian', fi: 'Finnish', cs: 'Czech', sk: 'Slovak',
  hu: 'Hungarian', ro: 'Romanian', bg: 'Bulgarian', uk: 'Ukrainian', el: 'Greek',
  he: 'Hebrew', fa: 'Persian',
}

/**
 * @param {string} code e.g. "es" or "pt-BR"
 * @returns {string} the language name, falling back to the base code, then the code
 */
export function getLanguageName(code) {
  if (!code) return code
  if (LANGUAGE_NAMES[code]) return LANGUAGE_NAMES[code]
  const base = code.split('-')[0]
  return LANGUAGE_NAMES[base] || code
}
