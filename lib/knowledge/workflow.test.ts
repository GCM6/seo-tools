import { describe, expect, it } from 'vitest'
import { WORKFLOW_V1, routeWorkflow, validateWorkflow } from './workflow'
import { classifyAnalysis } from './classifier'

describe('knowledge workflow v1', () => {
  it('is structurally valid', () => expect(validateWorkflow(WORKFLOW_V1)).toEqual([]))
  it('prioritizes symptom steps before the full diagnostic background pass', () => {
    const route = routeWorkflow('diagnose', ['traffic_drop'])
    expect(route.slice(0, 4)).toEqual(['W0', 'S8', 'S7', 'S3'])
    expect(route.at(-1)).toBe('S9')
  })
  it('classifies natural-language goals and required context', () => {
    expect(classifyAnalysis({ goal: '网站流量突然暴跌，请帮我诊断', domain: 'example.com' })).toMatchObject({
      scenario: 'diagnose', detectedSymptoms: ['traffic_drop'], missingFields: [],
    })
    expect(classifyAnalysis({ goal: '诊断为什么不收录' }).missingFields).toContain('domain')
    expect(classifyAnalysis({ goal: '学习 canonical 应该怎么做' }).scenario).toBe('learn')
  })
  it('starts a launched new site at cold-start and monitoring stages', () => {
    expect(routeWorkflow('new_build', [], WORKFLOW_V1, 'new').slice(0, 4)).toEqual(['W0', 'S5', 'S6', 'S2'])
  })
})
