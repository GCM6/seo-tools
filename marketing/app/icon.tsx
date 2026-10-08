import { ImageResponse } from 'next/og'

export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

// 站点图标：墨水蓝底 + 白色三角标志（与应用 Logo 同一个路径）。ImageResponse 不认 CSS 变量，
// 颜色取 tokens.css 浅色值：--accent #234A9A、--accent-ink #FFFFFF。
export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#234A9A' }}>
        <svg width="26" height="26" viewBox="0 0 32 32">
          <path d="M16 5L27 25H5L16 5Z" fill="none" stroke="#FFFFFF" strokeWidth="2.6" strokeLinejoin="round" />
          <path d="M11.5 16.5L16 12L20.5 16.5" fill="none" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    ),
    { ...size },
  )
}
