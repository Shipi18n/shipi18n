import { useTranslation, Trans } from 'react-i18next'

/**
 * A plain UI that happens to exercise every tricky part of a locale file:
 * interpolation, pluralisation, printf tokens and markup inside a string.
 * Switch language and watch all of it hold.
 */
export default function Dashboard() {
  const { t } = useTranslation()
  const openTasks = 3

  return (
    <section className="card">
      <h2>{t('dashboard.greeting', { name: 'Ada' })}</h2>

      {/* Pluralisation: i18next picks items_one / items_other per language */}
      <p>{t('dashboard.items', { count: openTasks })}</p>
      <p className="muted">{t('dashboard.items', { count: 1 })}</p>

      <p>{t('dashboard.lastLogin', { date: '2026-08-13' })}</p>

      {/* printf-style tokens survive translation as literal text */}
      <p className="mono">{t('dashboard.progress').replace('%d', '7').replace('%s', '12')}</p>

      {/* Markup inside a translated string, via Trans */}
      <p>
        <Trans i18nKey="legal.terms">
          I agree to the <a href="https://example.com/terms">Terms of Service</a>
        </Trans>
      </p>

      <div className="actions">
        <button type="button" className="primary">{t('actions.save')}</button>
        <button type="button">{t('actions.cancel')}</button>
        <button type="button" className="danger" title={t('actions.confirmDelete')}>
          {t('actions.delete')}
        </button>
      </div>
    </section>
  )
}
