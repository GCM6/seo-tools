'use client'

import { useState } from 'react'

// 站点小图标（ux-blueprint §2.1：16px）。取不到时换成中性的空心圆，不用表情图案。
export function FaviconImage({ domain }: { domain: string }) {
  const [src, setSrc] = useState(`https://www.google.com/s2/favicons?sz=32&domain=${domain}`)

  return (
    // 外部 favicon 与 data URL 兜底均无法由 Next Image 优化；维持原始图片元素避免额外远程配置。
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={16}
      height={16}
      className="ui-favicon"
      onError={() => {
        setSrc(
          `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="%23858C98" stroke-width="1.5"><circle cx="8" cy="8" r="6"/></svg>`,
        )
      }}
    />
  )
}
