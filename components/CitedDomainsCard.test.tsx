import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { CitedDomainsCard } from './CitedDomainsCard'

// i18n-free by design (same convention as ProvenanceTag): caller resolves labels via t().
const platformLabels = {
  reddit: 'Reddit',
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
  quora: 'Quora',
  wikipedia: '维基百科',
  github: 'GitHub',
} as const

describe('CitedDomainsCard', () => {
  it('renders nothing when there are no cited domains', () => {
    const { container } = render(
      <CitedDomainsCard rows={[]} ownedLabel="自有" thirdPartyLabel="第三方" platformLabels={platformLabels} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders each domain with its count and origin tag', () => {
    render(
      <CitedDomainsCard
        rows={[
          { domain: 'metadocu.com', count: 3, origin: 'owned', platform: 'other' },
          { domain: 'notion.so', count: 2, origin: 'third_party', platform: 'other' },
        ]}
        ownedLabel="自有"
        thirdPartyLabel="第三方"
        platformLabels={platformLabels}
      />,
    )
    expect(screen.getByText('metadocu.com')).toBeInTheDocument()
    expect(screen.getByText('notion.so')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('自有')).toBeInTheDocument()
    expect(screen.getByText('第三方')).toBeInTheDocument()
  })

  it('renders a platform badge when the platform is recognized', () => {
    render(
      <CitedDomainsCard
        rows={[{ domain: 'reddit.com', count: 5, origin: 'third_party', platform: 'reddit' }]}
        ownedLabel="自有"
        thirdPartyLabel="第三方"
        platformLabels={platformLabels}
      />,
    )
    expect(screen.getByText('Reddit')).toBeInTheDocument()
  })

  it('does not render a badge when platform is "other" (avoids noise)', () => {
    render(
      <CitedDomainsCard
        rows={[{ domain: 'metadocu.com', count: 3, origin: 'owned', platform: 'other' }]}
        ownedLabel="自有"
        thirdPartyLabel="第三方"
        platformLabels={platformLabels}
      />,
    )
    for (const label of Object.values(platformLabels)) {
      expect(screen.queryByText(label)).not.toBeInTheDocument()
    }
  })
})
