'use client'

import { useState } from 'react'

export function FaviconImage({ domain }: { domain: string }) {
  const [src, setSrc] = useState(`https://www.google.com/s2/favicons?sz=32&domain=${domain}`)

  return (
    // 外部 favicon 与 data URL 兜底均无法由 Next Image 优化；维持原始图片元素避免额外远程配置。
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className="project-card-favicon"
      onError={() => {
        // 当 Favicon 加载失败时，使用 SVG 兜底
        setSrc(
          `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="%2386868b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/></svg>`
        )
      }}
    />
  )
}
