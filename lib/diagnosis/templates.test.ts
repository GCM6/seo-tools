import { describe, it, expect } from 'vitest'
import { templates, genericTemplate, GLOBAL_CONTENT_BLOCKERS, TEMPLATE_COUNT } from './templates'

describe('recommendation templates', () => {
  it('covers the Phase A rule set', () => {
    for (const id of ['T01', 'T03', 'T04', 'T05', 'T07', 'T10', 'T11', 'T12', 'C01', 'C02', 'C03', 'C04', 'C05a', 'C05b', 'C05c', 'C05d', 'C06', 'C09', 'C10', 'C11', 'E01', 'G01', 'G03']) {
      expect(templates[id], `missing template ${id}`).toBeDefined()
    }
    expect(TEMPLATE_COUNT).toBeGreaterThanOrEqual(20)
  })

  it('gives technical fix rules a static fixSnippet', () => {
    for (const id of ['T01', 'T03', 'T04', 'T10', 'T13', 'T14', 'G01']) {
      expect(templates[id].promptType).toBe('technical')
      expect(templates[id].fixSnippet, `no fixSnippet on ${id}`).toBeTruthy()
    }
    // canonical 示例是同域自指、绝对路径
    expect(templates.T04.fixSnippet).toContain('rel="canonical"')
    expect(templates.T01.fixSnippet).toContain('User-agent')
  })

  it('routes T*/G01-G03 to technical and C*/authority to content', () => {
    expect(templates.T04.promptType).toBe('technical')
    expect(templates.G03.promptType).toBe('technical')
    expect(templates.C01.promptType).toBe('content')
    expect(templates.E01.promptType).toBe('content')
  })

  it('C05a does NOT recommend adding FAQ/HowTo for rich results (official correction)', () => {
    // 明确「不要为富摘要而新增 FAQ/HowTo」，且不出现「添加/推荐 FAQ」这类正向推荐
    expect(templates.C05a.what).toMatch(/不要.*新增\s*FAQ/)
    expect(templates.C05a.what).not.toMatch(/(添加|推荐|建议).{0,4}FAQ/)
    expect(templates.C05a.negativeConstraints?.join(' ')).toMatch(/FAQ/)
    // 推荐的是仍产出富摘要的类型
    expect(templates.C05a.what).toMatch(/Product|Article|Organization|Breadcrumb/)
  })

  it('exposes google-seo-expert BLOCKERS as global content constraints', () => {
    const joined = GLOBAL_CONTENT_BLOCKERS.join(' ')
    expect(joined).toMatch(/堆砌/)
    expect(joined).toMatch(/精准关键词锚文本/)
    expect(joined).toMatch(/人工终审/)
    expect(joined).toMatch(/FAQ/)
    expect(joined).toMatch(/跨域名/)
    expect(joined).toMatch(/不得编造/)
  })

  it('falls back by side', () => {
    expect(genericTemplate('technical').promptType).toBe('technical')
    expect(genericTemplate('geo').promptType).toBe('content')
    expect(genericTemplate('seo').promptType).toBe('technical')
  })
})
