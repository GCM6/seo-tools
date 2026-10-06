import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import '../globals.css'

export const metadata: Metadata = {
  title: 'Veris shared report',
  robots: { index: false, follow: false },
}

export default function ShareLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh">
      <body>{children}</body>
    </html>
  )
}
