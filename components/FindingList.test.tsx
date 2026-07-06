import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { FindingCard } from './FindingList'

describe('FindingCard', () => {
  it('toggles evidence drawer on click', () => {
    render(
      <FindingCard
        id="f1"
        title="t"
        provVariant="m"
        provLabel="实测"
        confidence=""
        severity="hi"
        labels={{ dismiss: '忽略此发现', dismissed: '已忽略' }}
      >
        <div>evidence-body</div>
      </FindingCard>,
    )
    expect(screen.queryByText('evidence-body')).not.toBeVisible()
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('evidence-body')).toBeVisible()
  })
})
