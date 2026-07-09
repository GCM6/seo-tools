import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // 显式钉死 workspace root：marketing/ 与根应用共享父目录、各自有 pnpm-lock.yaml，
  // Next 会误把父目录当 monorepo root 并"顺手"捡起根应用的 middleware.ts（next-intl locale 路由）
  // 一起打进本次构建（已实测复现：build 产物里出现 ƒ Middleware，matcher 与根 middleware.ts 一致）。
  // 钉死 root=本目录后该问题消失，构建产物不再包含任何 middleware。
  turbopack: {
    root: process.cwd(),
  },
}

export default nextConfig
