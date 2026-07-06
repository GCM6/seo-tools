import { describe, it, expect } from 'vitest'
import { assemblePrompt, assembleContentBrief, type AssemblerRec } from './prompt-assembler'

const baseRec = (over: Partial<AssemblerRec> = {}): AssemblerRec => ({
  what: '修正 canonical 指向自身。',
  why: 'canonical 指向站外导致排名信号错配。',
  expectedImpact: '高（error 级）',
  validationMethod: '重新抓取确认 canonical 指向自身。',
  promptType: 'technical',
  evidenceRefs: ['ev_1', 'ev_2'],
  ...over,
})

describe('assemblePrompt', () => {
  it('technical prompt needs no facts; inputFactRefs empty even if facts provided', () => {
    const out = assemblePrompt({
      rec: baseRec(),
      verifiedFacts: [{ id: 'bf_1', factText: '成立于 2010', status: 'verified' }],
      domain: 'https://example.com/',
    })
    expect(out.promptType).toBe('technical')
    expect(out.inputFactRefs).toEqual([])
    expect(out.evidenceRefs).toEqual(['ev_1', 'ev_2'])
    expect(out.promptText).toContain('example.com')
    expect(out.promptText).toContain('修正 canonical')
    expect(out.promptText).not.toBe('<stub>')
  })

  it('content prompt injects verified facts + negative constraints + data discipline', () => {
    const out = assemblePrompt({
      rec: baseRec({ promptType: 'content', what: '扩充薄内容。' }),
      verifiedFacts: [
        { id: 'bf_1', factText: '总部位于深圳', status: 'verified' },
        { id: 'bf_2', factText: '服务 500+ 客户', status: 'verified' },
      ],
      domain: 'https://x.com/',
      negativeConstraints: ['禁止关键词堆砌'],
    })
    expect(out.inputFactRefs).toEqual(['bf_1', 'bf_2'])
    expect(out.promptText).toContain('总部位于深圳')
    expect(out.promptText).toContain('禁止关键词堆砌')
    expect(out.promptText).toContain('不得编造')
  })

  it('content prompt with zero verified facts assembles with a note, does not block', () => {
    const out = assemblePrompt({
      rec: baseRec({ promptType: 'content' }),
      verifiedFacts: [],
      domain: 'https://x.com/',
      negativeConstraints: ['禁止关键词堆砌'],
    })
    expect(out.inputFactRefs).toEqual([])
    expect(out.promptText).toContain('缺 verified 品牌事实')
  })

  it('rejects non-verified facts (assertInputFactsVerified)', () => {
    expect(() =>
      assemblePrompt({
        rec: baseRec({ promptType: 'content' }),
        verifiedFacts: [{ id: 'bf_1', factText: 'x', status: 'draft' }],
        domain: 'x',
      }),
    ).toThrow()
  })

  it('editedPayload overrides what/why and appends a revision note', () => {
    const out = assemblePrompt({
      rec: baseRec({ editedPayload: { what: '人工改写的动作', note: '按客户口径调整' } }),
      verifiedFacts: [],
      domain: 'x',
    })
    expect(out.promptText).toContain('人工改写的动作')
    expect(out.promptText).toContain('按客户口径调整')
    expect(out.promptText).not.toContain('修正 canonical')
  })
})

describe('assembleContentBrief', () => {
  it('产出 brief 类型、七段结构，注入 verified 事实与否定约束', () => {
    const brief = assembleContentBrief({
      rec: { what: '为缺口词新建承接页。', why: '竞品占位而本站缺席。', expectedImpact: '中', validationMethod: '4-6 周复测排名。', evidenceRefs: ['ev_9'] },
      verifiedFacts: [{ id: 'bf_1', factText: '品牌成立于 2015 年。', status: 'verified' }],
      domain: 'example.com',
      targetKeyword: 'best crm',
      intent: 'commercial',
      negativeConstraints: ['禁止关键词堆砌'],
    })
    expect(brief.promptType).toBe('brief')
    expect(brief.inputFactRefs).toEqual(['bf_1'])
    expect(brief.evidenceRefs).toEqual(['ev_9'])
    expect(brief.promptText).toContain('best crm')
    expect(brief.promptText).toContain('E-E-A-T')
    expect(brief.promptText).toContain('答案前置')
    expect(brief.promptText).toContain('人工终审')
    expect(brief.promptText).toContain('品牌成立于 2015 年')
    expect(brief.promptText).toContain('禁止关键词堆砌')
  })

  it('无目标词/竞品形态时标「待补」，不编造', () => {
    const brief = assembleContentBrief({
      rec: { what: 'x', why: 'y', expectedImpact: 'z', validationMethod: 'v', evidenceRefs: ['ev_1'] },
      verifiedFacts: [],
      domain: 'example.com',
    })
    expect(brief.promptText).toContain('待补')
    expect(brief.inputFactRefs).toEqual([])
  })

  it('拒绝未 verified 的品牌事实', () => {
    expect(() =>
      assembleContentBrief({
        rec: { what: 'x', why: 'y', expectedImpact: 'z', validationMethod: 'v', evidenceRefs: ['ev_1'] },
        verifiedFacts: [{ id: 'bf_x', factText: '草稿事实', status: 'draft' }],
        domain: 'example.com',
      }),
    ).toThrow()
  })
})
