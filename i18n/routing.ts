import { defineRouting } from 'next-intl/routing'

// Minimal stub — Task 3 will flesh out locale prefix strategy / pathnames.
export const routing = defineRouting({
  locales: ['zh', 'en'],
  defaultLocale: 'zh',
})
