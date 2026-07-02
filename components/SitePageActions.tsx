'use client'

import { useTransition } from 'react'

// 页面行内操作按钮：client 叶子，action 由 Server Component 以闭包传入。
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
    <button
      type="button"
      disabled={pending}
      title={labels.notice}
      className="text-xs underline underline-offset-2 disabled:opacity-50"
      onClick={() => startTransition(async () => onToggleKeyPage(pageId, !isKeyPage))}
    >
      {isKeyPage ? labels.unmark : labels.mark}
    </button>
  )
}
