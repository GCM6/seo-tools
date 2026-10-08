// 单色品牌标志（design-system §4 Logo）：三角外形 + 内部折线，字标单色，不做双色。
// 只输出内容；外层由调用方决定是否包成链接（链接上加 .ui-logo 类）。
export function Logo({ showText = true }: { showText?: boolean }) {
  return (
    <>
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path d="M16 5L27 25H5L16 5Z" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round" />
        <path d="M11.5 16.5L16 12L20.5 16.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {showText ? <span>Veris</span> : null}
    </>
  )
}
