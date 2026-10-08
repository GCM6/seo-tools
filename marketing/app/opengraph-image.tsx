import { ImageResponse } from 'next/og'
import { SITE_TAGLINE } from '@/lib/site'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'Veris — Evidence-based SEO & GEO diagnostic workbench'

// 分享图：白色纸面、左对齐，和网站首屏同一套气质。颜色取 tokens.css 浅色值（ImageResponse 不认 CSS 变量）：
// --surface #FFFFFF、--ink #14171C、--ink-2 #464C56、--line #D8DCE2、--accent #234A9A。
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '0 96px',
          background: '#FFFFFF',
          borderTop: '12px solid #234A9A',
          color: '#14171C',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          <svg width="112" height="112" viewBox="0 0 32 32">
            <path d="M16 5L27 25H5L16 5Z" fill="none" stroke="#14171C" strokeWidth="2.6" strokeLinejoin="round" />
            <path d="M11.5 16.5L16 12L20.5 16.5" fill="none" stroke="#14171C" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div style={{ fontSize: 120, fontWeight: 700, letterSpacing: -2 }}>Veris</div>
        </div>
        <div style={{ marginTop: 28, paddingTop: 28, borderTop: '2px solid #D8DCE2', fontSize: 40, color: '#464C56' }}>{SITE_TAGLINE}</div>
      </div>
    ),
    { ...size },
  )
}
