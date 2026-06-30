import { createHash } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db } from './client'
import {
  projects,
  runs,
  prompts,
  evidenceArtifacts,
  findings,
  recommendations,
  brandFacts,
} from './schema'
import { assertFindingClaimEvidence } from '@/lib/repositories/validators'
import type { ClaimType, EvidenceLevel } from '@/lib/types'
import { DEMO_PROJECT_ID, DEMO_RUN_ID, DEMO_DOMAIN, DEMO_PROMPTS } from '@/lib/fixtures'

const hash = (s: string): string => createHash('sha256').update(s).digest('hex')

// 证据 artifact id（finding.evidenceRefs 引用这些）
const EV_RENDER = 'ev_render_features'
const EV_PROBE_SELECT = 'ev_probe_select_absent'
const EV_GSC_CTR = 'ev_gsc_low_ctr'
const EV_PROBE_BRAND = 'ev_probe_brand_positive'

// finding id（recommendation.findingId 引用）
const F_JS_RENDER = 'find_js_render'
const F_SELECT_ABSENT = 'find_select_absent'
const F_LOW_CTR = 'find_low_ctr'
const F_BRAND_POSITIVE = 'find_brand_positive'

async function seed() {
  // ---- 幂等：先删 demo project，FK cascade 清掉 runs/prompts/evidence/findings/recommendations/brand_facts ----
  await db.delete(projects).where(eq(projects.id, DEMO_PROJECT_ID))

  // ---- 1) project ----
  await db.insert(projects).values({
    id: DEMO_PROJECT_ID,
    domain: DEMO_DOMAIN,
    industry: '团队协作 / 项目管理 SaaS',
    market: 'CN',
    language: 'zh',
    ownerId: 'local',
  })

  // ---- 2) baseline run ----
  await db.insert(runs).values({
    id: DEMO_RUN_ID,
    projectId: DEMO_PROJECT_ID,
    runType: 'baseline',
    status: 'reviewing',
    protocolVersion: 'v2',
    startedAt: '2026-06-29T00:00:00Z',
    finishedAt: '2026-06-29T01:30:00Z',
  })

  // ---- 3) 20 prompts ----
  await db.insert(prompts).values(
    DEMO_PROMPTS.map((p, i) => ({
      id: `prompt_${String(i + 1).padStart(2, '0')}`,
      runId: DEMO_RUN_ID,
      text: p.text,
      intent: 'commercial',
      source: 'fixed_set_v0',
      market: 'CN',
      language: 'zh',
      // 中性排序值（数组序），不复用探针 present 结果；UI 出现态读 DEMO_PROMPTS.present
      priority: i,
    })),
  )

  // ---- 4) evidence artifacts（finding 落库前必须先有证据） ----
  const renderPayload = { url: 'https://teamflow.cn/features', rawHtmlMainTextChars: 0, renderedMainTextChars: 1840 }
  const probeSelectPayload = {
    prompt: '适合小团队的项目管理工具推荐',
    n: 5,
    brandPresentCount: 0,
    competitors: ['Asana', 'Notion', 'Monday.com'],
  }
  const gscPayload = { query: '团队任务管理软件', impressions: 8420, ctr: 0.008, avgPosition: 6.3, lowCtrQueryCount: 12 }
  const probeBrandPayload = {
    prompt: 'teamflow 怎么样 好用吗',
    n: 5,
    brandPresentCount: 5,
    sentiment: 'positive',
    accuracy: 'accurate',
  }

  const evidenceRows: (typeof evidenceArtifacts.$inferInsert)[] = [
    {
      id: EV_RENDER,
      projectId: DEMO_PROJECT_ID,
      runId: DEMO_RUN_ID,
      type: 'render_check',
      claimLevel: 'L4',
      source: 'hosted_browser',
      request: { url: 'https://teamflow.cn/features', jsEnabled: [false, true] },
      payload: renderPayload,
      rawText: JSON.stringify(renderPayload),
      rawHash: hash(JSON.stringify(renderPayload)),
      parserVersion: 'v0',
    },
    {
      id: EV_PROBE_SELECT,
      projectId: DEMO_PROJECT_ID,
      runId: DEMO_RUN_ID,
      type: 'ai_answer',
      claimLevel: 'L3',
      source: 'chatgpt|perplexity|gemini',
      request: { prompt: '适合小团队的项目管理工具推荐', n: 5 },
      payload: probeSelectPayload,
      rawText: JSON.stringify(probeSelectPayload),
      rawHash: hash(JSON.stringify(probeSelectPayload)),
      parserVersion: 'v0',
    },
    {
      id: EV_GSC_CTR,
      projectId: DEMO_PROJECT_ID,
      runId: DEMO_RUN_ID,
      type: 'gsc',
      claimLevel: 'L2',
      source: 'gsc_search_analytics',
      request: { dimensions: ['query'], dateRange: '2026-05-29..2026-06-28' },
      payload: gscPayload,
      rawText: JSON.stringify(gscPayload),
      rawHash: hash(JSON.stringify(gscPayload)),
      parserVersion: 'v0',
    },
    {
      id: EV_PROBE_BRAND,
      projectId: DEMO_PROJECT_ID,
      runId: DEMO_RUN_ID,
      type: 'ai_answer',
      claimLevel: 'L3',
      source: 'chatgpt|perplexity|gemini',
      request: { prompt: 'teamflow 怎么样 好用吗', n: 5 },
      payload: probeBrandPayload,
      rawText: JSON.stringify(probeBrandPayload),
      rawHash: hash(JSON.stringify(probeBrandPayload)),
      parserVersion: 'v0',
    },
  ]

  await db.insert(evidenceArtifacts).values(evidenceRows)

  // 从实际插入的证据行派生 { artifactId: claimLevel }，不另抄一份硬编码常量。
  const evidenceLevelById = Object.fromEntries(
    evidenceRows.map((e) => [e.id, e.claimLevel]),
  ) as Record<string, EvidenceLevel>

  // ---- 5) findings（measured 入库前过 assertFindingClaimEvidence，证据等级来自真实证据行） ----
  const findingRows: (typeof findings.$inferInsert)[] = [
    {
      id: F_JS_RENDER,
      runId: DEMO_RUN_ID,
      side: 'technical',
      title: '核心落地页 /features 内容靠 JS 渲染，非渲染抓取链路读不到初始正文',
      description: '关闭 JS 抓取 /features → 初始 HTML 正文 0 字；渲染后 1,840 字。属机制确定的硬实测问题。',
      severity: 'high',
      claimType: 'measured_hard',
      confidence: '硬 · 机制确定',
      evidenceRefs: [EV_RENDER],
      status: 'open',
    },
    {
      id: F_SELECT_ABSENT,
      runId: DEMO_RUN_ID,
      side: 'geo',
      title: '选型类提问全缺席：你未被提及，竞品 Asana / Notion 多次出现',
      description:
        '在「适合小团队的项目管理工具推荐」等选型类样本探针（n=5）中，品牌出现次数 0，竞品反复出现。方向性样本。',
      severity: 'high',
      claimType: 'measured_sample',
      confidence: '方向性 · 样本实测',
      evidenceRefs: [EV_PROBE_SELECT],
      status: 'open',
    },
    {
      id: F_LOW_CTR,
      runId: DEMO_RUN_ID,
      side: 'seo',
      title: '12 个词已有曝光但 CTR 异常低，疑似受 SERP 特性 / AIO 影响',
      description:
        '示例：团队任务管理软件 展示 8,420 / CTR 0.8% / 排名 6.3。已有真实曝光但点击率不足 1%，疑似受 SERP 特性影响，需回测验证，不作硬性因果断言。',
      severity: 'mid',
      claimType: 'inferred',
      confidence: '推断 · 样本',
      evidenceRefs: [EV_GSC_CTR],
      status: 'open',
    },
    {
      id: F_BRAND_POSITIVE,
      runId: DEMO_RUN_ID,
      side: 'geo',
      title: '品牌词下 AI 描述准确、情绪正面（已具备，维持即可）',
      description:
        '「teamflow 怎么样 好用吗」类品牌词样本探针（n=5）中，AI 描述准确、情绪正面。现状良好，维持即可。',
      severity: 'ok',
      claimType: 'measured_sample',
      confidence: '方向性 · 样本实测',
      evidenceRefs: [EV_PROBE_BRAND],
      status: 'open',
    },
  ]

  // 证据守卫：measured_* finding 的证据等级从其 evidenceRefs 解析真实证据行得到。
  // 若某 ref 解析不到（证据缺失），暴露为真实 bug；若证据等级被降级而 claimType 不变，断言会抛。
  for (const f of findingRows) {
    const claimType = f.claimType as ClaimType
    if (claimType !== 'measured_hard' && claimType !== 'measured_sample') continue
    const refs = f.evidenceRefs ?? []
    const missing = refs.filter((ref) => evidenceLevelById[ref] === undefined)
    if (missing.length > 0)
      throw new Error(`finding ${f.id} 引用了不存在的证据 artifact: ${missing.join(', ')}`)
    const evidenceLevels = refs.map((ref) => evidenceLevelById[ref])
    assertFindingClaimEvidence({ claimType, evidenceLevels })
  }

  await db.insert(findings).values(findingRows)

  // ---- 6) recommendations（人在环内：accepted/edited/draft） ----
  await db.insert(recommendations).values([
    {
      id: 'rec_ssr',
      runId: DEMO_RUN_ID,
      findingId: F_JS_RENDER,
      what: '把 /features 改为服务端渲染，降低非渲染抓取链路的可读性风险',
      why: '部分搜索和 AI 抓取链路不会执行完整客户端 JS。内容完全依赖前端渲染时，初始 HTML 缺少核心正文，可能降低被读取、理解和引用的机会。',
      expectedImpact: '使核心卖点内容进入初始 HTML，提高搜索与 AI 抓取链路读取概率；属高影响、可验证的技术问题。',
      effort: 'M',
      risk: '低',
      validationMethod: '改造后再次关闭 JS 抓取 /features，比对初始 HTML 正文字数。',
      priority: 'P1',
      confidence: '硬 · 机制确定',
      status: 'accepted',
      evidenceRefs: [EV_RENDER],
    },
    {
      id: 'rec_content',
      runId: DEMO_RUN_ID,
      findingId: F_SELECT_ABSENT,
      what: '新增一篇「小团队项目管理工具选型」对比内容，争取被 AI 引用',
      why: '选型类提问下品牌全缺席，竞品反复出现。一篇答案前置 + FAQ 结构的对比内容有机会被 AI 引用。',
      expectedImpact: '提升选型类提问下的可见度与被引用概率；需回测 SoV 验证。',
      effort: 'M',
      risk: '低',
      validationMethod: '4–6 周后重跑同 20 提问，量选型类提问的出现率与 SoV delta。',
      priority: 'P1',
      confidence: '方向性 · GEO 概率性',
      status: 'edited',
      editedPayload: {
        angle:
          '答案前置 + FAQ 结构；正面对比 Asana/Notion/teamflow 在「小团队、预算有限、需要甘特图」场景下的取舍；用真实功能与定价，不贬低竞品。',
        injectedFacts: 'teamflow：免费档支持 10 人；看板+甘特双视图；中文文档与本地化客服；定价 ¥29/人/月起。',
      },
      evidenceRefs: [EV_PROBE_SELECT],
    },
    {
      id: 'rec_faq',
      runId: DEMO_RUN_ID,
      findingId: F_LOW_CTR,
      what: '给高曝光低 CTR 的 12 个词，补 FAQ schema 与答案前置段落',
      why: '这些词已有真实曝光，排名 6–8 位但 CTR 不足 1%，疑似受 SERP 特性影响。补答案前置 + FAQ 有机会改善可读性、摘要匹配与点击表现，需回测验证。',
      expectedImpact: '中影响、低工作量的快赢。',
      effort: 'S',
      risk: '低',
      validationMethod: '上线后回测 GSC：对比这 12 个词的 CTR / 平均排名变化。',
      priority: 'P2',
      confidence: '方向性 · GEO 概率性',
      status: 'draft',
      evidenceRefs: [EV_GSC_CTR],
    },
  ])

  // ---- 7) brand_facts（verified 真实事实，供后续注入提示词） ----
  await db.insert(brandFacts).values([
    {
      id: 'fact_free_tier',
      projectId: DEMO_PROJECT_ID,
      factType: 'pricing',
      factText: '免费档支持 10 人',
      sourceUrl: 'https://teamflow.cn/pricing',
      sourceNote: '官网定价页',
      status: 'verified',
    },
    {
      id: 'fact_views',
      projectId: DEMO_PROJECT_ID,
      factType: 'feature',
      factText: '看板 + 甘特双视图',
      sourceUrl: 'https://teamflow.cn/features',
      sourceNote: '官网功能页',
      status: 'verified',
    },
    {
      id: 'fact_price_from',
      projectId: DEMO_PROJECT_ID,
      factType: 'pricing',
      factText: '定价 ¥29/人/月起',
      sourceUrl: 'https://teamflow.cn/pricing',
      sourceNote: '官网定价页',
      status: 'verified',
    },
  ])

  console.log('[seed] done:')
  console.log(`  project=${DEMO_PROJECT_ID} (${DEMO_DOMAIN})`)
  console.log(`  run=${DEMO_RUN_ID}  prompts=${DEMO_PROMPTS.length}`)
  console.log('  evidence=4  findings=4  recommendations=3  brand_facts=3')
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[seed] failed:', err)
    process.exit(1)
  })
