import { describe, it, expect } from 'vitest'
import robots from './robots'

describe('robots', () => {
  it('allows /share and disallows everything else for all user agents', () => {
    const result = robots()
    const rules = Array.isArray(result.rules) ? result.rules : [result.rules]

    expect(rules).toContainEqual(
      expect.objectContaining({
        userAgent: '*',
        allow: '/share',
        disallow: '/',
      }),
    )
  })
})
