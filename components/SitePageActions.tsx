'use client'

import { useTransition } from 'react'
import { Button } from './Button'

// 页面行内操作按钮：client 叶子，action 由 Server Component 以闭包传入。
// 改动下次诊断才生效，说明文字放在按钮 title 和表格下方脚注里。
export function SitePageActions({
  pageId,
  isKeyPage,
  onToggleKeyPage,
  labels,
}: {
  pageId: string
  isKeyPage: boolean
  onToggleKeyPage: (pageId: string, next: boolean) => void | Promise<void>
  labels: { mark: string; unmark: string; notice: string }
}) {
  const [pending, startTransition] = useTransition()
  return (
    <Button
      size="sm"
      variant="quiet"
      loading={pending}
      title={labels.notice}
      onClick={() => startTransition(async () => onToggleKeyPage(pageId, !isKeyPage))}
    >
      {isKeyPage ? labels.unmark : labels.mark}
    </Button>
  )
}
