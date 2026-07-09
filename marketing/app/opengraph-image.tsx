import { ImageResponse } from 'next/og'
import { SITE_TAGLINE } from '@/lib/site'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'Veris — Evidence-based SEO & GEO diagnostic workbench'

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0f0e14',
          color: '#ffffff',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ fontSize: 128, fontWeight: 700, letterSpacing: -2 }}>Veris</div>
        <div style={{ fontSize: 36, color: '#a1a1a6', marginTop: 16 }}>{SITE_TAGLINE}</div>
      </div>
    ),
    { ...size }
  )
}
