import { notFound } from 'next/navigation'
import { LOCALES, isLocale, getDictionary, translate } from '../../lib/i18n'
import '../globals.css'

// Pre-render every locale at build time — the whole point of translating early.
export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export async function generateMetadata({ params }) {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  const dict = await getDictionary(locale)
  return {
    title: translate(dict, 'meta.title'),
    description: translate(dict, 'meta.description'),
  }
}

export default async function LocaleLayout({ children, params }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()

  return (
    <html lang={locale}>
      <body>{children}</body>
    </html>
  )
}
