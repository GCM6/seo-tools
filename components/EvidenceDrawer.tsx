import { getTranslations } from 'next-intl/server'
import { MarkdownPreview } from './MarkdownPreview'

// 原始证据视图（展开后显示在问题行、结果行里）。Server Component：原样展示已存的证据
// （证据 ID · 来源 · 等级 + 关键字段 + AI 回答原文 + 原始 JSON），让每个结论都能追溯到不可变证据。
// AI 回答按 Markdown 渲染（不显示 ** 原文）；原始 JSON 默认收起。作为 children 组合进 client 组件是合法的 RSC 组合。
export interface EvidenceView {
  id: string
  type: string
  claimLevel: string
  source: string
  payload: unknown
}

type SummaryRow = [key: string, value: unknown]

function asRecord(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
}

function text(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (Array.isArray(value)) return value.join(', ')
  return undefined
}

export async function EvidenceDrawer({ evidence }: { evidence: EvidenceView }) {
  const t = await getTranslations('evidence')
  const payload = asRecord(evidence.payload)
  const rows: SummaryRow[] =
    evidence.type === 'render_check'
      ? [
          ['initialHtmlMainTextChars', payload.initialHtmlMainTextChars],
          ['renderedMainTextChars', payload.renderedMainTextChars],
          ['mainContentDelta', payload.mainContentDelta],
        ]
      : evidence.type === 'gsc'
        ? [
            ['query', payload.query],
            ['impressions', payload.impressions],
            ['ctr', payload.ctr],
            ['avgPosition', payload.avgPosition],
          ]
        : evidence.type === 'schema'
          ? [['types', payload.types]]
          : evidence.type === 'serp_snapshot'
            ? [
                ['query', payload.query],
                ['totalResults', payload.totalResults],
                ['resultCount', payload.resultCount],
                ['homePagePresent', payload.homePagePresent],
                ['firstResultUrl', payload.firstResultUrl],
              ]
            : evidence.type === 'page_fetch'
              ? [
                  ['canonicalUrl', payload.canonicalUrl],
                  ['metaRobots', payload.metaRobots],
                  ['robotsAllowed', payload.robotsAllowed],
                ]
              : evidence.type === 'ai_answer'
                ? [
                    ['prompt', payload.prompt],
                    ['provider', payload.provider],
                    ['modelId', payload.modelId],
                    ['runIdx', payload.runIdx],
                    ['brandPresent', payload.brandPresent],
                    ['targetDomainCited', payload.targetDomainCited],
                    ['competitorsMentioned', payload.competitorsMentioned],
                    ['citedUrls', payload.citedUrls],
                  ]
                : []

  const shown = rows.map(([key, value]) => [key, text(value)] as const).filter(([, v]) => Boolean(v))
  const answerText = evidence.type === 'ai_answer' ? text(payload.answerText) : undefined

  return (
    <div className="ui-evv">
      <div className="ui-evv__meta">
        {t('evidenceRef')} · <span className="ui-mono">{evidence.id}</span> · {evidence.source} · {evidence.claimLevel}
      </div>
      {shown.length ? (
        <dl className="ui-evv__kv">
          {shown.map(([key, value]) => (
            <div key={key} className="contents">
              <dt>{t(`summary.${key}`)}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {answerText ? (
        <div className="ui-evv__answer">
          <MarkdownPreview markdown={answerText} />
        </div>
      ) : null}
      <details className="ui-disclosure">
        <summary>{t('rawJson')}</summary>
        <pre className="ui-code mt-2">{JSON.stringify(evidence.payload, null, 2)}</pre>
      </details>
    </div>
  )
}
