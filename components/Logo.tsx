export function Logo({
  className = '',
  showText = true,
}: {
  className?: string
  showText?: boolean
}) {
  return (
    <div className={`brand-logo ${className}`}>
      {/* 品牌精美 SVG 图标：棱镜折射几何图案 */}
      <svg
        className="brand-logo-icon"
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* 更加粗壮醒目的三角折射棱镜 */}
        <path
          d="M16 5L27 25H5L16 5Z"
          fill="currentColor"
          fillOpacity="0.12"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        {/* 穿过折射出的几何折光体 */}
        <path
          d="M16 5V25"
          stroke="currentColor"
          strokeWidth="2"
          className="opacity-60"
        />
        <path
          d="M11.5 15L16 10.5L20.5 15"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className="opacity-80"
        />
      </svg>
      {showText && (
        <span className="brand-logo-text">
          Ver<span className="brand-logo-text-highlight">is</span>
        </span>
      )}
    </div>
  )
}
