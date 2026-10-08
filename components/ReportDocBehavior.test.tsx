import { render, act } from '@testing-library/react'
import { describe, it, expect, afterEach, beforeAll, vi } from 'vitest'
import { ReportDocBehavior } from './ReportDocBehavior'

function Doc() {
  return (
    <article className="ui-doc">
      <ReportDocBehavior />
      <details id="sec-a">
        <summary>A</summary>
        <p id="inside-a">a</p>
      </details>
      <details id="sec-b" open>
        <summary>B</summary>
      </details>
      <details id="sec-c">
        <summary>C</summary>
      </details>
    </article>
  )
}

const isOpen = (id: string) => (document.getElementById(id) as HTMLDetailsElement).open

describe('ReportDocBehavior', () => {
  beforeAll(() => {
    // jsdom 没有实现 scrollIntoView（真实浏览器都有）
    Element.prototype.scrollIntoView = vi.fn()
  })

  afterEach(() => {
    window.location.hash = ''
  })

  it('打印前展开所有折叠章节，打印后只收回它展开的那些（原本展开的保持展开）', () => {
    render(<Doc />)
    act(() => {
      window.dispatchEvent(new Event('beforeprint'))
    })
    expect([isOpen('sec-a'), isOpen('sec-b'), isOpen('sec-c')]).toEqual([true, true, true])
    act(() => {
      window.dispatchEvent(new Event('afterprint'))
    })
    expect([isOpen('sec-a'), isOpen('sec-b'), isOpen('sec-c')]).toEqual([false, true, false])
  })

  it('beforeprint 连续触发两次（浏览器生成 PDF 时会自己再派发一次），打印后仍能全部收回', () => {
    render(<Doc />)
    act(() => {
      window.dispatchEvent(new Event('beforeprint'))
      window.dispatchEvent(new Event('beforeprint'))
      window.dispatchEvent(new Event('afterprint'))
    })
    expect([isOpen('sec-a'), isOpen('sec-b'), isOpen('sec-c')]).toEqual([false, true, false])
  })

  it('锚点指向折叠章节（或其中的元素）时自动展开该章节', () => {
    render(<Doc />)
    act(() => {
      window.location.hash = '#inside-a'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(isOpen('sec-a')).toBe(true)
    expect(isOpen('sec-c')).toBe(false)
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
  })
})
