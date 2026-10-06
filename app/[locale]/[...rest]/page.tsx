import { notFound } from 'next/navigation'

// 未匹配的 /<locale>/* 路径落到本地化的 [locale]/not-found.tsx（next-intl 推荐做法），
// 否则 Next 只会渲染脱离站点布局的默认 404。
export default function CatchAllNotFound() {
  notFound()
}
