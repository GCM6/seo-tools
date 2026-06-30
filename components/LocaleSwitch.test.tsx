import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LocaleSwitch } from './LocaleSwitch'

const push = vi.fn()
let currentLocale = 'zh'
let currentPathname = '/zh'

vi.mock('next-intl', () => ({
  useLocale: () => currentLocale,
}))

vi.mock('next/navigation', () => ({
  usePathname: () => currentPathname,
  useRouter: () => ({ push }),
}))

describe('LocaleSwitch', () => {
  beforeEach(() => {
    push.mockReset()
  })

  it('shows the other locale as the toggle label', () => {
    currentLocale = 'zh'
    currentPathname = '/zh'
    render(<LocaleSwitch />)
    expect(screen.getByRole('button')).toHaveTextContent('EN')
  })

  it('swaps only the leading locale segment on a nested path', () => {
    currentLocale = 'zh'
    currentPathname = '/zh/diagnosis/zh-report'
    render(<LocaleSwitch />)
    fireEvent.click(screen.getByRole('button'))
    expect(push).toHaveBeenCalledWith('/en/diagnosis/zh-report')
  })

  it('swaps en back to zh at the root path', () => {
    currentLocale = 'en'
    currentPathname = '/en'
    render(<LocaleSwitch />)
    expect(screen.getByRole('button')).toHaveTextContent('ZH')
    fireEvent.click(screen.getByRole('button'))
    expect(push).toHaveBeenCalledWith('/zh')
  })
})
