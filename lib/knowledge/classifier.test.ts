import { describe, expect, it } from 'vitest'
import { classifyAnalysis } from './classifier'

describe('classifyAnalysis', () => {
  it('routes a traffic drop to diagnosis and the penalized stage', () => {
    expect(classifyAnalysis({ goal: '网站流量暴跌并且疑似降权', domain: 'example.com' })).toMatchObject({
      scenario: 'diagnose', siteStage: 'penalized', detectedSymptoms: ['traffic_drop'], missingFields: [],
    })
  })

  it('asks for minimum planning context before a new-site playbook', () => {
    expect(classifyAnalysis({ goal: '我要从零规划一个新的外贸网站' })).toMatchObject({
      scenario: 'new_build', siteStage: 'none', missingFields: ['product', 'market'],
    })
  })

  it('keeps learning domain-free', () => {
    expect(classifyAnalysis({ goal: '学习 canonical 应该怎么做' })).toMatchObject({ scenario: 'learn', missingFields: [] })
  })
})
