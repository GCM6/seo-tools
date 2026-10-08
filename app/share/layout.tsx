import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { fontVariables } from '../fonts'
import '../globals.css'

export const metadata: Metadata = {
  title: 'Veris shared report',
  robots: { index: false, follow: false },
}

export default function ShareLayout({ children }: { children: ReactNode }) {
  return (
    // 分享报告固定浅色（客户转发、打印需要稳定外观），不挂主题脚本（design-system §7）。
    <html lang="zh" className={fontVariables}>
      <body>{children}</body>
    </html>
  )
}
