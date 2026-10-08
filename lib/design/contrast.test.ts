import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// 对比度守护（design-system §2.1 / §6）：解析 app/tokens.css 的浅色与暗色 token，按 WCAG 2.x
// 相对亮度公式逐对计算。改 token 后若有一对不达标，本测试失败、不能合入。
// 配对与 docs/design/2026-10-07-redesign/check-contrast.py 保持一致。
const PAIRS: [fg: string, bg: string, min: number, use: string][] = [
  ['ink', 'bg', 4.5, '正文 / 画布'],
  ['ink', 'surface', 4.5, '正文 / 面板'],
  ['ink', 'surface-2', 4.5, '正文 / 浅底'],
  ['ink-2', 'bg', 4.5, '次要文字 / 画布'],
  ['ink-2', 'surface', 4.5, '次要文字 / 面板'],
  ['ink-2', 'surface-2', 4.5, '次要文字 / 浅底'],
  ['ink-3', 'bg', 4.5, '辅助小字 / 画布'],
  ['ink-3', 'surface', 4.5, '辅助小字 / 面板'],
  ['ink-3', 'surface-2', 4.5, '表头小字 / 浅底'],
  ['accent', 'surface', 4.5, '链接 / 面板'],
  ['accent', 'bg', 4.5, '链接 / 画布'],
  ['accent', 'accent-soft', 4.5, '当前导航文字 / 选中底'],
  ['accent-ink', 'accent', 4.5, '主按钮文字'],
  ['on-ink', 'ink', 4.5, '「实测」徽章文字'],
  ['on-ink', 'ink-2', 4.5, '「抽样实测」徽章文字'],
  ['ink', 'accent-soft', 4.5, '正文 / 选中底'],
  ['sev-high', 'surface', 4.5, '错误文字'],
  ['sev-mid', 'surface', 4.5, '警告文字'],
  ['ok', 'surface', 4.5, '已接受 / 达标文字'],
  ['ink', 'sev-high-soft', 4.5, '错误提示条正文'],
  ['ink', 'sev-mid-soft', 4.5, '警告提示条正文'],
  ['ink', 'ok-soft', 4.5, '成功提示条正文'],
  ['ok', 'ok-soft', 4.5, '「已接受」按下态文字 / 成功浅底'],
  ['sev-high', 'sev-high-soft', 3, '错误提示条图标'],
  ['sev-mid', 'sev-mid-soft', 3, '警告提示条图标'],
  ['sev-low', 'surface', 3, '提示级严重度方块（图形）'],
  ['ctl-border', 'surface', 3, '输入框边框 / 面板（WCAG 1.4.11）'],
  ['ctl-border', 'surface-2', 3, '输入框边框 / 浅底'],
  ['accent', 'surface', 3, '焦点环 / 面板（WCAG 1.4.11）'],
]

function parseBlock(css: string, selector: string): Record<string, string> {
  const i = css.indexOf(`${selector} {`)
  if (i < 0) throw new Error(`tokens.css 缺少 ${selector} 块`)
  const block = css.slice(i, css.indexOf('}', i))
  return Object.fromEntries([...block.matchAll(/--([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})/g)].map((m) => [m[1], m[2]]))
}

function luminance(hex: string): number {
  const ch = (i: number) => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * ch(0) + 0.7152 * ch(1) + 0.0722 * ch(2)
}

function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const css = readFileSync(join(process.cwd(), 'app/tokens.css'), 'utf8')
const light = parseBlock(css, ':root')
const dark = { ...light, ...parseBlock(css, ':root.dark') }

describe('contrastRatio（公式阳性对照）', () => {
  it('黑白对比为 21:1，同色为 1:1', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5)
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5)
  })
})

describe.each([
  ['浅色', light],
  ['暗色', dark],
])('%s主题 token 对比度', (_name, tokens) => {
  it.each(PAIRS)('%s 在 %s 上 ≥ %s（%s）', (fg, bg, min) => {
    expect(tokens[fg], `缺少 token --${fg}`).toMatch(/^#/)
    expect(tokens[bg], `缺少 token --${bg}`).toMatch(/^#/)
    expect(contrastRatio(tokens[fg], tokens[bg])).toBeGreaterThanOrEqual(min)
  })
})
