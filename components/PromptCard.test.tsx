import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PromptCard } from './PromptCard'

// next-intl is the chrome copy source; mock t('common.actions.*) → the labels
// the prototype uses for the copy button (复制提示词 → 已复制 ✓).
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) =>
    ({ copy: '复制提示词', copied: '已复制 ✓' })[key] ?? key,
}))

const PROMPT = '为 https://example.com 执行已确认建议\n- 只使用 verified brand facts'

describe('PromptCard', () => {
  const writeText = vi.fn(() => Promise.resolve())

  beforeEach(() => {
    writeText.mockClear()
    // jsdom has no clipboard API; stub navigator.clipboard.writeText.
    Object.assign(navigator, { clipboard: { writeText } })
  })

  it('copies the prompt text to the clipboard on click', () => {
    render(<PromptCard title="对应建议 · 新增小团队选型对比内容" promptText={PROMPT} />)
    fireEvent.click(screen.getByRole('button'))
    expect(writeText).toHaveBeenCalledTimes(1)
    expect(writeText).toHaveBeenCalledWith(PROMPT)
  })

  it('switches the button label to the copied state after copying', () => {
    render(<PromptCard title="对应建议 · 新增小团队选型对比内容" promptText={PROMPT} />)
    const button = screen.getByRole('button')
    expect(button).toHaveTextContent('复制提示词')
    fireEvent.click(button)
    expect(button).toHaveTextContent('已复制 ✓')
    expect(button).toHaveClass('done')
  })
})
