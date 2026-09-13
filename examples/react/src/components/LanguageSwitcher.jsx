import { useTranslation } from 'react-i18next'
import { LANGUAGES } from '../i18n'

export default function LanguageSwitcher() {
  const { i18n } = useTranslation()

  return (
    <div className="switcher" role="group" aria-label="Language">
      {LANGUAGES.map(({ code, label }) => (
        <button
          key={code}
          type="button"
          onClick={() => i18n.changeLanguage(code)}
          aria-pressed={i18n.language === code}
          className={i18n.language === code ? 'active' : ''}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
