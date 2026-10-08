// 样式守护（design-system §9）：扫描 .tsx 源码里会让设计系统再次失控的写法。
// 纯函数，便于用阳性 / 阴性样例单测扫描器本身；全仓扫描在 style-guard.test.ts。
export type StyleRule =
  | 'hex-color'
  | 'color-function'
  | 'arbitrary-value'
  | 'inline-visual-style'
  | 'animate-class'
  | 'gradient-class'
  | 'palette-class'
  | 'shadow-class'
  | 'motion-class'

export interface StyleViolation {
  rule: StyleRule
  line: number
  snippet: string
}

// className 字面量：className="…" / className={'…'} / className={"…"} / className={`…`}
const CLASSNAME_RE = /className=(?:"([^"]*)"|\{\s*'([^']*)'\s*\}|\{\s*"([^"]*)"\s*\}|\{\s*`([^`]*)`\s*\})/g
// 视觉类的 Tailwind 任意值（布局类如 w-[…]、grid-cols-[…] 允许）
const ARBITRARY_VISUAL_RE = /(?:^|\s)!?(?:[a-z0-9-]+:)*(?:text|bg|border(?:-[trblxy])?|rounded(?:-[a-z]+)?|shadow|font|leading|tracking|from|via|to|p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap(?:-[xy])?|space-[xy])-\[[^\]]+\]/
const ANIMATE_RE = /(?:^|\s)(?:[a-z0-9-]+:)*animate-(?!none\b)[a-z]/
const GRADIENT_RE = /(?:^|\s)(?:[a-z0-9-]+:)*(?:bg-gradient-to-|bg-linear-|bg-radial|bg-conic|from-|via-|to-)[a-z0-9]/
// Tailwind 内置调色板颜色（bg-amber-50、text-neutral-500、text-white…）等同于字面色值，绕过 token
const PALETTE_RE = /(?:^|\s)!?(?:[a-z0-9-]+:)*(?:text|bg|border(?:-[trblxy])?|ring|outline|fill|stroke|decoration|accent|caret|divide|placeholder)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)(?:-\d{2,3})?(?:\/\d+)?(?=\s|$)/
// 页面内元素不用阴影（只有浮层用 --shadow-overlay，在 ui.css 里）
const SHADOW_RE = /(?:^|\s)(?:[a-z0-9-]+:)*shadow(?:-(?:sm|md|lg|xl|2xl|inner|card|card-hover))?(?=\s|$)/
// 悬停 / 按下的缩放、位移、旋转属于装饰动效
const MOTION_RE = /(?:^|\s)(?:hover|active|focus|group-hover):-?(?:scale|translate-[xy]|rotate)-/
const HEX_RE = /['"`]#[0-9a-fA-F]{3,8}['"`]/
const COLOR_FN_RE = /\b(?:rgba?|hsla?)\(/
const STYLE_BLOCK_RE = /style=\{\{([\s\S]*?)\}\}/g
const VISUAL_STYLE_KEY_RE = /\b(?:color|background|backgroundColor|backgroundImage|fontSize|fontWeight|fontFamily|lineHeight|letterSpacing|borderRadius|boxShadow|border|borderColor|borderTop|borderBottom|borderLeft|borderRight|textShadow|filter|backdropFilter|animation)\s*:/

function lineOf(src: string, index: number): number {
  return src.slice(0, index).split('\n').length
}

export function scanSource(src: string): StyleViolation[] {
  const out: StyleViolation[] = []
  const lines = src.split('\n')

  lines.forEach((text, i) => {
    const trimmed = text.trim()
    // 注释行不算（说明文字里会提到被禁止的写法本身）
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return
    if (HEX_RE.test(text)) out.push({ rule: 'hex-color', line: i + 1, snippet: trimmed.slice(0, 120) })
    if (COLOR_FN_RE.test(text)) out.push({ rule: 'color-function', line: i + 1, snippet: trimmed.slice(0, 120) })
  })

  for (const m of src.matchAll(CLASSNAME_RE)) {
    const value = (m[1] ?? m[2] ?? m[3] ?? m[4] ?? '').replace(/\$\{[^}]*\}/g, ' ')
    const line = lineOf(src, m.index ?? 0)
    if (ARBITRARY_VISUAL_RE.test(value)) out.push({ rule: 'arbitrary-value', line, snippet: value.trim().slice(0, 120) })
    if (ANIMATE_RE.test(value)) out.push({ rule: 'animate-class', line, snippet: value.trim().slice(0, 120) })
    if (GRADIENT_RE.test(value)) out.push({ rule: 'gradient-class', line, snippet: value.trim().slice(0, 120) })
    if (PALETTE_RE.test(value)) out.push({ rule: 'palette-class', line, snippet: value.trim().slice(0, 120) })
    if (SHADOW_RE.test(value)) out.push({ rule: 'shadow-class', line, snippet: value.trim().slice(0, 120) })
    if (MOTION_RE.test(value)) out.push({ rule: 'motion-class', line, snippet: value.trim().slice(0, 120) })
  }

  for (const m of src.matchAll(STYLE_BLOCK_RE)) {
    if (VISUAL_STYLE_KEY_RE.test(m[1])) {
      out.push({ rule: 'inline-visual-style', line: lineOf(src, m.index ?? 0), snippet: m[0].replace(/\s+/g, ' ').slice(0, 120) })
    }
  }

  return out
}
