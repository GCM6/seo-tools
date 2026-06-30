import createMiddleware from 'next-intl/middleware'
import { routing } from './i18n/routing'

export default createMiddleware(routing)

export const config = {
  // Skip API, Next internals, Vercel internals, and any path with a file extension.
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
}
