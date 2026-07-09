import { notFound } from 'next/navigation'

// 骨架占位：选词/内容尚未产出（方案红线「先词后页」），故 generateStaticParams 返回空数组，
// 本路由当前不产出任何静态页面；未来首批文章落地时在此接入 content/blog/ 下的 MDX/数据源。
export function generateStaticParams() {
  return []
}

export const dynamicParams = false

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await params
  notFound()
}
