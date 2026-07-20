import { describe, expect, it } from 'vitest'
import { buildActionReportSummaryPrompt, extractOpenAiSummary } from './action-report-summary'

describe('action report AI summary guard', () => {
  it('makes the decision report the model’s only source', () => {
    const prompt = buildActionReportSummaryPrompt('# report\n- `rec_1` fix canonical')
    expect(prompt).toContain('<source_report>')
    expect(prompt).toContain('不得新增动作、事实、数字、指标、来源')
    expect(prompt).toContain('`rec_...`')
  })

  it('accepts only an output that cites existing recommendation ids', () => {
    const summary = extractOpenAiSummary({
      output: [{ type: 'message', content: [{ type: 'output_text', text: '- 先完成 `rec_1`，再按其原验证方式复测。' }] }],
    }, ['rec_1'])
    expect(summary).toContain('`rec_1`')
  })

  it('rejects an AI summary that cites a made-up recommendation', () => {
    expect(() => extractOpenAiSummary({
      output: [{ type: 'message', content: [{ type: 'output_text', text: '- 执行 `rec_made_up`。' }] }],
    }, ['rec_1'])).toThrow('summary_source_validation_failed')
  })
})
