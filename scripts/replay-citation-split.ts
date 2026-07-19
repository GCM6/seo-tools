// 引用口径拆分修复 —— 量化虚高回放脚本（只读，不写库）。
//
// 背景：Perplexity provider 修复前把 citations[]（正文引用）与 search_results[].url
// （仅被检索到）压平合并进同一个 citedUrls，导致 targetDomainCited / grounded 判定虚高。
// 本脚本对本地 DB 已有的 Perplexity ai_answer 证据原始响应（evidence_artifacts.raw_text），
// 分别按「旧口径（压平合并）」与「新口径（只认 citations[]）」重算 targetDomainCited，
// 统计有多少条从 cited 降为 retrieved-only（旧 true → 新 false）。
//
// 用法：pnpm tsx scripts/replay-citation-split.ts
// 铁律：纯只读——不 UPDATE 任何表，不修改 evidence_artifacts（不可变证据）或 ai_probe_results。

import { eq, and } from 'drizzle-orm'
import { db } from '@/db/client'
import { evidenceArtifacts, runs, projects } from '@/db/schema'
import { hostMatchesDomain } from '@/lib/probes/parse'

interface PerplexityRaw {
  choices?: { message?: { content?: string } }[]
  citations?: string[]
  search_results?: { url?: string }[]
}

function citesDomain(urls: string[], domain: string): boolean {
  return urls.some((u) => {
    try {
      return hostMatchesDomain(new URL(u).hostname, domain)
    } catch {
      return false
    }
  })
}

function normalizeDomain(rawDomain: string): string {
  try {
    return new URL(rawDomain).hostname.replace(/^www\./, '')
  } catch {
    return rawDomain
  }
}

async function main(): Promise<void> {
  const rows = await db
    .select({
      id: evidenceArtifacts.id,
      rawText: evidenceArtifacts.rawText,
      projectId: evidenceArtifacts.projectId,
      domain: projects.domain,
    })
    .from(evidenceArtifacts)
    .innerJoin(runs, eq(evidenceArtifacts.runId, runs.id))
    .innerJoin(projects, eq(runs.projectId, projects.id))
    .where(and(eq(evidenceArtifacts.type, 'ai_answer'), eq(evidenceArtifacts.source, 'perplexity')))

  console.log('\n== replay-citation-split (dry-run, 只读) ==')

  if (rows.length === 0) {
    console.log('无历史数据可回放（本地 DB 没有 source=perplexity 的 ai_answer 证据）。')
    return
  }

  let parsedCount = 0
  let downgraded = 0 // 旧口径 cited=true → 新口径 cited=false（虚高被修正的条数）
  let oldCitedTrue = 0
  let newCitedTrue = 0
  let newRetrievedOnlyTrue = 0 // 新口径下 retrievedUrls 命中目标域（弱信号，此前完全不可见）

  for (const row of rows) {
    if (!row.rawText) continue
    let raw: PerplexityRaw
    try {
      raw = JSON.parse(row.rawText) as PerplexityRaw
    } catch {
      continue
    }
    parsedCount++
    const domain = normalizeDomain(row.domain)
    const citations = raw.citations ?? []
    const searchResultUrls = (raw.search_results ?? []).map((r) => r.url).filter((u): u is string => Boolean(u))

    // 旧口径（修复前的实现）：citations 与 search_results 压平合并。
    const oldCitedUrls = [...citations, ...searchResultUrls]
    // 新口径（修复后）：只认 citations[]；search_results 独立成 retrievedUrls（去重）。
    const citedSet = new Set(citations)
    const newRetrievedUrls = [...new Set(searchResultUrls)].filter((u) => !citedSet.has(u))

    const oldTargetDomainCited = citesDomain(oldCitedUrls, domain)
    const newTargetDomainCited = citesDomain(citations, domain)
    const newTargetDomainRetrieved = citesDomain(newRetrievedUrls, domain)

    if (oldTargetDomainCited) oldCitedTrue++
    if (newTargetDomainCited) newCitedTrue++
    if (newTargetDomainRetrieved) newRetrievedOnlyTrue++
    if (oldTargetDomainCited && !newTargetDomainCited) downgraded++
  }

  console.log(`Perplexity ai_answer 证据总行数: ${rows.length}`)
  console.log(`可解析原始响应行数: ${parsedCount}`)
  console.log(`旧口径 targetDomainCited=true 行数: ${oldCitedTrue}`)
  console.log(`新口径 targetDomainCited=true 行数: ${newCitedTrue}`)
  console.log(`从 cited 降为 retrieved-only 的行数（虚高被修正）: ${downgraded}`)
  console.log(`新口径下 targetDomainRetrieved=true 行数（此前完全不可见的弱信号）: ${newRetrievedOnlyTrue}`)
  if (oldCitedTrue > 0) {
    console.log(`虚高比例: ${((downgraded / oldCitedTrue) * 100).toFixed(1)}%（旧口径判为 cited 的行中，有多少其实只是 retrieved-only）`)
  }
  console.log('\n（纯只读回放，未写库。）')
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
