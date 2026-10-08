// 品牌标志：与应用 components/Logo.tsx 同一个三角形（路径由主仓 lib/design/marketing-tokens.test.ts 校验一致）。
export function Logo() {
  return (
    <>
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path d="M16 5L27 25H5L16 5Z" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round" />
        <path d="M11.5 16.5L16 12L20.5 16.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>Veris</span>
    </>
  )
}
