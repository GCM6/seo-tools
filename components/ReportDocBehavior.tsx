'use client'

import { useEffect } from 'react'

// 报告文档的两件浏览器行为（ux-blueprint §3.5 / §5）。不渲染任何内容，文案无关，分享页也能用。
// 1) 打开带 #锚点 的链接（如「查看详情 →」指向 #sec-priority）时，目标在折叠章节里就先展开再滚过去；
// 2) 打印 / 存 PDF 前把所有折叠章节展开——浏览器不会打印 closed <details> 的内容——打印完恢复原状。
export function ReportDocBehavior() {
  useEffect(() => {
    const openForHash = () => {
      const id = decodeURIComponent(window.location.hash.slice(1))
      if (!id) return
      const target = document.getElementById(id)
      const details = target?.closest('details')
      if (target && details && !details.open) {
        details.open = true
        target.scrollIntoView()
      }
    }

    // 累加而不是覆盖：beforeprint 可能连续触发两次（例如浏览器生成 PDF 时自己也会派发一次），
    // 覆盖会丢掉第一批记录，打印完收不回去。
    let openedForPrint: HTMLDetailsElement[] = []
    const beforePrint = () => {
      for (const d of document.querySelectorAll<HTMLDetailsElement>('.ui-doc details:not([open])')) {
        d.open = true
        openedForPrint.push(d)
      }
    }
    const afterPrint = () => {
      for (const d of openedForPrint) d.open = false
      openedForPrint = []
    }

    openForHash()
    window.addEventListener('hashchange', openForHash)
    window.addEventListener('beforeprint', beforePrint)
    window.addEventListener('afterprint', afterPrint)
    return () => {
      window.removeEventListener('hashchange', openForHash)
      window.removeEventListener('beforeprint', beforePrint)
      window.removeEventListener('afterprint', afterPrint)
    }
  }, [])

  return null
}
