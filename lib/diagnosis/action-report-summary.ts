const MAX_SUMMARY_LENGTH = 5000

interface OpenAiResponsesBody {
  output?: {
    type?: string
    content?: { type?: string; text?: string }[]
  }[]
}

export function buildActionReportSummaryPrompt(sourceReport: string): string {
  return [
    '你是 Veris 的严谨 SEO/GEO 执行编辑。下面是一份“执行决策报告”，它是唯一允许使用的事实来源。',
    '只输出 3–6 条 Markdown 项目符号，作为“决策摘要”。',
    '硬性规则：',
    '1. 每一条都必须引用至少一个现有建议 ID，格式为 `rec_...`。',
    '2. 只能重述报告中的已接受、已编辑、已否决决策、验证方法或证据引用；不得新增动作、事实、数字、指标、来源、优先级或预期结果。',
    '3. 已否决项只能说明其被排除，不得重新写成执行动作。',
    '4. 不要写标题、前言、免责声明、代码块或表格。',
    '',
    '<source_report>',
    sourceReport,
    '</source_report>',
  ].join('\n')
}

export function extractOpenAiSummary(body: OpenAiResponsesBody, allowedRecommendationIds: string[]): string {
  const summary = (body.output ?? [])
    .filter((item) => item.type === 'message')
    .flatMap((item) => item.content ?? [])
    .filter((part) => part.type === 'output_text' && part.text)
    .map((part) => part.text!.trim())
    .filter(Boolean)
    .join('\n')
    .trim()

  if (!summary || summary.length > MAX_SUMMARY_LENGTH) throw new Error('invalid_summary_output')

  const citedIds = summary.match(/rec_[A-Za-z0-9_-]+/g) ?? []
  if (!citedIds.length || citedIds.some((id) => !allowedRecommendationIds.includes(id))) {
    throw new Error('summary_source_validation_failed')
  }

  return summary
}
