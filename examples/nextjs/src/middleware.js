import { NextResponse } from 'next/server'
import { LOCALES, DEFAULT_LOCALE } from './lib/i18n'

/**
 * Every page lives under /[locale], so a request without one gets redirected.
 * The visitor's Accept-Language header picks the target when we support it.
 */
export function middleware(request) {
  const { pathname } = request.nextUrl

  if (LOCALES.some((l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`))) {
    return NextResponse.next()
  }

  const preferred = request.headers.get('accept-language')?.split(',')[0]?.split('-')[0]
  const locale = LOCALES.includes(preferred) ? preferred : DEFAULT_LOCALE

  return NextResponse.redirect(new URL(`/${locale}${pathname === '/' ? '' : pathname}`, request.url))
}

export const config = {
  // Skip Next internals, API routes and anything with a file extension.
  matcher: ['/((?!_next|api|favicon.ico|.*\\..*).*)'],
}
