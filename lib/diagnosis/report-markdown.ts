import type { ReportModel, ConstraintKind, ReportRecommendation } from './report'
import type { Pillar } from './types'
import type { RoadmapHorizon, Quadrant } from './report'

// 综合报告 → Markdown 序列化（spec §7.2 八板块）——纯字符串，无 I/O，可单测。
// 恒守铁律：健康分 / 约束定位 / 流量价值均标「推断」，绝不冒用「实测」。
// 关键词 / 竞品 / 回测的实时明细不在 ReportModel 内（由页面从 DB 直渲），此处仅在对应板块
// 给出板块标题与「详见在线报告实时数据」占位，保证导出件的八板块结构完整。

export interface ReportMarkdownMeta {
  domain: string
  runId: string
  // 采集时间（run.finishedAt/startedAt）；无则传空串。
  capturedAt: string
}

// 五支柱人读名（Markdown 内固定中文，主 UI 语言）。
const PILLAR_LABEL: Record<Pillar, string> = {
  P1: 'P1 技术健康（抓取·索引·渲染）',
  P2: 'P2 结构化数据与可解析性',
  P3: 'P3 关键词与内容覆盖',
  P4: 'P4 SERP 竞争格局',
  P5: 'P5 品牌权威与 GEO 可见性',
}

// 约束定位卡分诊语（决策树，标「推断」）。
const CONSTRAINT_PHRASE: Record<ConstraintKind, string> = {
  systemic_basics:
    '系统性基础问题：存在抓取 / 索引 / 渲染层面的高危阻断，请优先修复技术地基（P1）。',
  visibility_data_missing:
    '可见性数据不足：尚未接入 GSC 或未配置 DataForSEO，关键词现状缺乏数据，建议先接入数据源再定位约束。',
  authority_content:
    '权威与内容竞争力不足：关键词缺口较多且权威 / 语料信号偏弱，建议聚焦内容覆盖（P3）与品牌权威（P5）。',
  fine_tuning: '精细优化阶段：无系统性阻断，可按影响 × 成本优先级逐项打磨。',
}

const SEVERITY_LABEL: Record<string, string> = { high: '高', mid: '中', ok: '提示' }

const QUADRANT_LABEL: Record<Quadrant, string> = {
  quick_win: '速赢（高影响 · 低成本）',
  strategic: '战略（高影响 · 高成本）',
  fill_in: '填充（低影响 · 低成本）',
  low: '低优先（低影响 · 高成本）',
}

const HORIZON_LABEL: Record<RoadmapHorizon, string> = {
  quick: '近期（0–2 周）',
  mid: '中期（2–6 周）',
  long: '长期（6 周+）',
}

const scoreText = (s: number | null): string => (s === null ? '未评分' : String(s))

function recLine(r: ReportRecommendation): string {
  return `- ${r.what}${r.expectedImpact ? `（预期影响：${r.expectedImpact}）` : ''}`
}

export function renderReportMarkdown(model: ReportModel, meta: ReportMarkdownMeta): string {
  const L: string[] = []
  const { execSummary, pillarGroups, priorityMatrix, roadmap, freshness, counts } = model

  // —— 报告头 ——
  L.push(`# 综合诊断报告 · ${meta.domain || '（未命名站点）'}`)
  L.push('')
  L.push(`- 运行 ID：\`${meta.runId}\``)
  L.push(`- 采集时间：${meta.capturedAt || '—'}`)
  L.push(
    `- 计数：发现 ${counts.findings} 条 / 已忽略 ${counts.dismissed} / 建议 ${counts.recommendations}（其中人工采纳 ${counts.gated}）`,
  )
  L.push('')
  L.push(
    '> 说明：健康分、约束定位与流量价值均为**推断**，非实测。「实测」仅用于 L3/L4 证据支撑的结论。',
  )
  L.push('')

  // —— 板块 1：执行摘要 ——
  L.push('## 1. 执行摘要')
  L.push('')
  L.push('### 约束定位（推断）')
  L.push('')
  L.push(CONSTRAINT_PHRASE[execSummary.constraint.kind])
  if (execSummary.constraint.focusPillars.length) {
    L.push('')
    L.push(`建议优先支柱：${execSummary.constraint.focusPillars.map((p) => PILLAR_LABEL[p]).join('、')}`)
  }
  L.push('')
  L.push('### 健康分（推断）')
  L.push('')
  L.push(`- 总健康分：${scoreText(execSummary.health.overall)}`)
  for (const p of ['P1', 'P2', 'P3', 'P4', 'P5'] as Pillar[]) {
    const cell = execSummary.health.pillars[p]
    L.push(`- ${PILLAR_LABEL[p]}：${scoreText(cell.score)}（命中 ${cell.issueCount} 条）`)
  }
  L.push('')
  L.push('<details><summary>分数怎么算的</summary>')
  L.push('')
  L.push('```')
  L.push(execSummary.health.breakdown)
  L.push('```')
  L.push('')
  L.push('</details>')
  L.push('')
  L.push('### 最高影响发现')
  L.push('')
  if (execSummary.topFindings.length) {
    for (const f of execSummary.topFindings) {
      L.push(`- [${SEVERITY_LABEL[f.severity] ?? f.severity}] ${f.title}`)
    }
  } else {
    L.push('暂无发现。')
  }
  L.push('')

  // —— 板块 2：方法与范围 ——
  L.push('## 2. 方法与范围')
  L.push('')
  L.push(`- 采集时间：${meta.capturedAt || '—'}`)
  L.push('')
  if (freshness.stale.length) {
    const date = freshness.oldestVerifiedAt ?? '尚未校验'
    L.push('### 规则保鲜告警')
    L.push('')
    L.push(`规则库最后校验于 ${date}，以下检查可能滞后：`)
    L.push('')
    for (const s of freshness.stale) {
      L.push(`- ${s.label}（来源：${s.sourceUrl}）`)
    }
    L.push('')
  } else {
    L.push('规则库均在保鲜期内。')
    L.push('')
  }

  // —— 板块 3：五支柱明细 ——
  L.push('## 3. 五支柱明细')
  L.push('')
  for (const g of pillarGroups) {
    L.push(`### ${PILLAR_LABEL[g.pillar]} — ${g.scored ? `得分 ${scoreText(g.score)}` : '未评分'}`)
    L.push('')
    if (!g.findings.length) {
      L.push('无命中，暂无问题。')
      L.push('')
      continue
    }
    for (const f of g.findings) {
      L.push(`- **[${SEVERITY_LABEL[f.severity] ?? f.severity}] ${f.title}**`)
      if (f.description) L.push(`  - ${f.description}`)
      if (f.evidenceRefs.length) L.push(`  - 证据：${f.evidenceRefs.join(' · ')}`)
    }
    L.push('')
  }

  // —— 板块 4：关键词现状与缺口（实时明细见在线报告）——
  L.push('## 4. 关键词现状与缺口')
  L.push('')
  L.push('关键词表现与缺口为实时数据，详见在线报告。搜索量 / 难度恒为第三方估算（L3），非实测。')
  L.push('')

  // —— 板块 5：竞品对比（实时明细见在线报告）——
  L.push('## 5. 竞品对比')
  L.push('')
  L.push('已确认竞品矩阵为实时数据，详见在线报告。')
  L.push('')

  // —— 板块 6：优先级矩阵 ——
  L.push('## 6. 优先级矩阵')
  L.push('')
  for (const q of ['quick_win', 'strategic', 'fill_in', 'low'] as Quadrant[]) {
    const items = priorityMatrix[q]
    L.push(`### ${QUADRANT_LABEL[q]} · ${items.length} 项`)
    L.push('')
    if (items.length) {
      for (const r of items) L.push(recLine(r))
    } else {
      L.push('暂无建议。')
    }
    L.push('')
  }

  // —— 板块 7：行动路线图 ——
  L.push('## 7. 行动路线图')
  L.push('')
  if (roadmap.length) {
    for (const h of ['quick', 'mid', 'long'] as RoadmapHorizon[]) {
      const items = roadmap.filter((i) => i.horizon === h)
      if (!items.length) continue
      L.push(`### ${HORIZON_LABEL[h]}`)
      L.push('')
      for (const i of items) {
        L.push(`- ${i.recommendation.what}`)
        if (i.recommendation.validationMethod) L.push(`  - 验证方式：${i.recommendation.validationMethod}`)
      }
      L.push('')
    }
  } else {
    L.push('尚无已采纳建议进入路线图。')
    L.push('')
  }

  // —— 板块 8：回测计划与闭环结果 ——
  L.push('## 8. 回测计划与闭环结果')
  L.push('')
  L.push(
    '同协议锁定：回测须复用相同的 prompt 版本、关键词集、竞品集与规则库版本（RULES_VERSION），方可前后可比。',
  )
  L.push('')
  L.push('回测四态与建议 outcome 为实时数据，详见在线报告。复合变更不归因单项建议（推断）。')
  L.push('')

  return L.join('\n')
}
