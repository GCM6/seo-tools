'use client'

import { Button } from '@/components/Button'

// 打印 / 存 PDF：唯一需要浏览器 API 的叶子，下沉为 client 组件调 window.print()。
// 折叠的章节由 ReportDocBehavior 在 beforeprint 时展开。文案由 props 传入，组件不碰 i18n。
export function PrintButton({ label }: { label: string }) {
  return (
    <Button size="sm" onClick={() => window.print()}>
      {label}
    </Button>
  )
}
