import { getDictionary, translate, LOCALE_LABELS } from '../../lib/i18n'
import LanguageSwitcher from '../../components/LanguageSwitcher'

export default async function Home({ params }) {
  const { locale } = await params
  const dict = await getDictionary(locale)
  const t = (key, vars) => translate(dict, key, vars)

  return (
    <main className="page">
      <header>
        <h1>{t('home.heading')}</h1>
        <p className="muted">{t('home.tagline', { language: LOCALE_LABELS[locale] })}</p>
        <LanguageSwitcher current={locale} />
      </header>

      <section className="card">
        <h2>{t('home.greeting', { name: 'Ada' })}</h2>
        <p>{t('home.tasks', { count: 3 })}</p>
        <p className="muted">{t('home.tasks', { count: 1 })}</p>
        <p>{t('home.lastSync', { time: '09:24' })}</p>

        <div className="actions">
          <button type="button" className="primary">{t('actions.save')}</button>
          <button type="button">{t('actions.cancel')}</button>
        </div>
      </section>

      <footer className="footer">
        <p>{t('footer.note')}</p>
        <a href="https://github.com/Shipi18n/shipi18n" target="_blank" rel="noopener noreferrer">
          {t('footer.repo')}
        </a>
      </footer>
    </main>
  )
}
