import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SeverityMark, severityLevel } from './SeverityMark'

describe('severityLevel', () => {
  it('high / mid 原样映射', () => {
    expect(severityLevel('high')).toBe('high')
    expect(severityLevel('mid')).toBe('mid')
  })

  it("'ok' 是提示级缺口，映射为 low，不能映射成达标 pass", () => {
    expect(severityLevel('ok')).toBe('low')
  })

  it('未知值按提示处理', () => {
    expect(severityLevel('whatever')).toBe('low')
  })
})

describe('SeverityMark', () => {
  it('渲染文案并带级别类', () => {
    render(<SeverityMark level="high" label="高" />)
    expect(screen.getByText('高')).toHaveClass('ui-sev', 'ui-sev--high')
  })
})
