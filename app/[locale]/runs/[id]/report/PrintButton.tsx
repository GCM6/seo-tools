'use client'

// 打印 / PDF：唯一需要浏览器 API 的叶子，下沉为 client 组件调 window.print()。
// 文案由 props 传入，组件本身不碰 i18n。
export function PrintButton({ label }: { label: string }) {
  return (
    <button type="button" className="ghost" onClick={() => window.print()}>
      {label}
    </button>
  )
}
