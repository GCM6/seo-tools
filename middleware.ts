import createMiddleware from 'next-intl/middleware'
import { routing } from './i18n/routing'

export default createMiddleware(routing)

export const config = {
  // Skip API, Next internals, Vercel internals, the public /share route (无 locale 前缀),
  // and any path with a file extension.
  matcher: ['/((?!api|_next|_vercel|share|.*\\..*).*)'],
}
