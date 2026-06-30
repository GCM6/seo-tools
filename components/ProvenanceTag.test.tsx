import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { ProvenanceTag } from './ProvenanceTag'

// ProvenanceTag is i18n-free: the caller resolves the label via t() and passes
// the already-translated string. This keeps it usable in Server Components.
describe('ProvenanceTag', () => {
  it('renders the provided label text', () => {
    render(<ProvenanceTag variant="m" label="实测" />)
    expect(screen.getByText('实测')).toBeInTheDocument()
  })

  it('applies the variant class onto the tag element', () => {
    const { container } = render(<ProvenanceTag variant="m" label="实测" />)
    const tag = container.querySelector('span.tag')
    expect(tag).not.toBeNull()
    expect(tag).toHaveClass('m')
    expect(tag?.querySelector('.dot')).not.toBeNull()
  })
})
