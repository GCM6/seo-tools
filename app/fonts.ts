import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google'

// 拉丁字形用 IBM Plex（next/font 构建期自托管，注入 --font-plex-*，由 app/tokens.css 的
// --font-sans / --font-mono 引用）；中文走系统字体栈，不加载中文 webfont（design-system §2.2）。
export const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-sans',
  display: 'swap',
})

export const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-plex-mono',
  display: 'swap',
})

// 挂在 <html> 上，让 :root 层的 token 能解析到字体变量。
export const fontVariables = `${plexSans.variable} ${plexMono.variable}`
