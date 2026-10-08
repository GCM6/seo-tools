import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { scanSource, type StyleRule } from './style-guard'

// 改版期间尚未迁移的文件（design-system §9）。只许删、不许加：
// 迁完一个就从这里删掉；某个文件已经干净却还留在名单里，本测试也会失败，逼名单只减不增。
// 第 5 波（清理）结束时必须为空。
const PENDING_MIGRATION = new Set([
  'app/[locale]/page.tsx',
  'app/[locale]/rules/RulesAdminClient.tsx',
  'app/[locale]/settings/SettingsClient.tsx',
  'components/BrandAliasesCard.tsx',
  'components/GscConnectCard.tsx',
  'components/NewAnalysisForm.tsx',
  'components/ProjectList.tsx',
])

const ROOT = process.cwd()

function walkTsx(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walkTsx(p, acc)
    else if (p.endsWith('.tsx') && !p.endsWith('.test.tsx')) acc.push(p)
  }
  return acc
}

function rules(src: string): StyleRule[] {
  return scanSource(src).map((v) => v.rule)
}

describe('scanSource（扫描器本身的阳性 / 阴性对照）', () => {
  it.each([
    ['hex-color', `const c = '#ff3b30'`],
    ['color-function', `const c = 'rgba(0, 0, 0, 0.4)'`],
    ['arbitrary-value', `<p className="text-[13px] mt-2">x</p>`],
    ['arbitrary-value', `<div className={\`p-[13px] \${a}\`} />`],
    ['inline-visual-style', `<span style={{ fontSize: '12px', display: 'flex' }} />`],
    ['animate-class', `<i className="animate-pulse" />`],
    ['gradient-class', `<div className="bg-gradient-to-r from-ink" />`],
    ['palette-class', `<div className="bg-amber-50 text-neutral-500" />`],
    ['palette-class', `<b className="text-white" />`],
    ['shadow-class', `<div className="rounded-lg shadow-sm" />`],
    ['motion-class', `<button className="active:scale-95" />`],
  ] as const)('能抓到 %s', (rule, src) => {
    expect(rules(src)).toContain(rule)
  })

  it.each([
    `<div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 w-[38%]" />`,
    `<span className="rounded-full text-ink-3 bg-surface-2 border-line" />`,
    `<div style={{ width: '42%' }} />`,
    `// 旧写法用过 '#ff3b30'，这里只是注释`,
    `<a className="ui-btn ui-btn--primary">新建分析</a>`,
    `<div className="animate-none" />`,
  ])('不误报：%s', (src) => {
    expect(scanSource(src)).toEqual([])
  })
})

describe('全仓样式守护（app/、components/ 的 .tsx）', () => {
  const files = [...walkTsx(join(ROOT, 'app')), ...walkTsx(join(ROOT, 'components'))]
  const results = files.map((f) => ({
    file: relative(ROOT, f).split(sep).join('/'),
    violations: scanSource(readFileSync(f, 'utf8')),
  }))

  it('扫描到了足够多的文件（防止路径写错导致空扫描）', () => {
    expect(files.length).toBeGreaterThan(50)
  })

  it('名单之外的文件没有违规写法', () => {
    const offenders = results
      .filter((r) => r.violations.length > 0 && !PENDING_MIGRATION.has(r.file))
      .map((r) => `${r.file}: ${r.violations.map((v) => `L${v.line} ${v.rule} «${v.snippet}»`).join(' | ')}`)
    expect(offenders).toEqual([])
  })

  it('名单里的文件仍有违规；已经干净的必须从名单删掉', () => {
    const cleaned = results.filter((r) => PENDING_MIGRATION.has(r.file) && r.violations.length === 0).map((r) => r.file)
    const missing = [...PENDING_MIGRATION].filter((f) => !results.some((r) => r.file === f))
    expect({ cleaned, missing }).toEqual({ cleaned: [], missing: [] })
  })
})
