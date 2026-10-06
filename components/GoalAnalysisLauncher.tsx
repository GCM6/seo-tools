'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RULES_VERSION } from '@/lib/diagnosis/types'

export function GoalAnalysisLauncher({ locale }: { locale: string }) {
  const isZh = locale === 'zh'
  const router = useRouter()
  const [goal, setGoal] = useState('')
  const [domain, setDomain] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!goal.trim()) return
    setPending(true); setError(null)
    try {
      const response = await fetch('/api/analysis-sessions', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ goal: goal.trim(), domain: domain.trim() || undefined }),
      })
      const body = await response.json() as { id?: string; runId?: string; error?: string }
      if (!response.ok || !body.id) throw new Error(body.error || `HTTP ${response.status}`)
      router.push(body.runId ? `/${locale}/runs/${body.runId}` : `/${locale}/sessions/${body.id}`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="goal-launcher">
      <div className="goal-launcher-copy">
        <span>INTELLIGENT INTAKE / W0</span>
        <h1>{isZh ? '先说目标，系统决定从哪里开始' : 'State the goal. The system chooses where to start.'}</h1>
        <p>{isZh ? '无需先选择症状。我们会识别新站建设、问题诊断、增长优化或知识学习，并自动编排检查顺序。' : 'No symptom checklist. We classify build, diagnosis, optimization, or learning and route the workflow automatically.'}</p>
      </div>
      <div className="goal-launcher-form">
        <label>
          {isZh ? '你现在希望解决什么？' : 'What do you want to solve?'}
          <textarea value={goal} onChange={(event) => setGoal(event.target.value)} rows={4} placeholder={isZh ? '例如：最近自然流量突然下降，核心产品页排名也在掉，请帮我找原因。' : 'Example: Organic traffic dropped suddenly and key product pages are losing rankings. Diagnose why.'} />
        </label>
        <div className="goal-domain-row">
          <label>{isZh ? '域名（新站规划或学习可不填）' : 'Domain (optional for planning or learning)'}<input value={domain} onChange={(event) => setDomain(event.target.value)} placeholder="example.com" /></label>
          <button type="button" onClick={submit} disabled={pending || !goal.trim()}>{pending ? (isZh ? '正在分类…' : 'Classifying…') : (isZh ? '生成诊断路线 →' : 'Build route →')}</button>
        </div>
        {error ? <p className="goal-error">{error}</p> : null}
      </div>
      <div className="goal-launcher-foot"><span>知识 {`knowledge_vN`}</span><span>流程 {`workflow_vN`}</span><span>规则 {RULES_VERSION}</span><span>{isZh ? '版本在创建时冻结' : 'Versions freeze at creation'}</span></div>
    </section>
  )
}
