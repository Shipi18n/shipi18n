'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LOCALES, LOCALE_LABELS } from '../lib/i18n'

/**
 * Swaps the locale segment of the current path, so switching language keeps
 * you on the same page.
 */
export default function LanguageSwitcher({ current }) {
  const pathname = usePathname() || `/${current}`
  const rest = pathname.split('/').slice(2).join('/')

  return (
    <nav className="switcher" aria-label="Language">
      {LOCALES.map((locale) => (
        <Link
          key={locale}
          href={`/${locale}${rest ? `/${rest}` : ''}`}
          aria-current={locale === current ? 'true' : undefined}
          className={locale === current ? 'active' : ''}
        >
          {LOCALE_LABELS[locale]}
        </Link>
      ))}
    </nav>
  )
}
