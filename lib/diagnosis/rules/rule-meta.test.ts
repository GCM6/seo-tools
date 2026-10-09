import { describe, it, expect } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { allRules } from './index'
import { RULE_META } from './rule-meta'
import { protocolBoundRuleIds } from '../sources'

const SNAPSHOT = 'lib/diagnosis/rules/rule-versions.snapshot.json'
type Snapshot = Record<string, Record<string, string>> // 规则 id → { 版本号 → 判定代码哈希 }
const codeHash = (fn: unknown) => createHash('sha256').update(String(fn)).digest('hex').slice(0, 16)

describe('规则元数据（spec 2026-10-09 §6.4）', () => {
  it('87 条注册规则都有元数据，且没有多余的元数据', () => {
    const ids = allRules.map((r) => r.id).sort()
    expect(ids).toHaveLength(87)
    expect(Object.keys(RULE_META).sort()).toEqual(ids)
  })

  it('allRules 上的 version 与 requiredSources 来自元数据', () => {
    for (const r of allRules) {
      expect(r.version).toBe(RULE_META[r.id].version)
      expect(r.requiredSources).toEqual(RULE_META[r.id].requiredSources)
      expect(r.requiredSources.length).toBeGreaterThan(0)
    }
  })

  it('受协议约束的规则正好是依赖 AI 探针 / 已确认竞品 / 种子词数据的那些', () => {
    expect([...protocolBoundRuleIds(allRules)].sort()).toEqual(
      ['E03', 'G05', 'G06', 'G09', 'G10', 'G11', 'K03', 'K04', 'K07', 'Q01', 'Q02', 'Q03'].sort(),
    )
  })

  // 版本守卫：判定代码变了必须升版本（spec §9 风险 2）。快照按版本只追加：
  // UPDATE_RULE_SNAPSHOT=1 pnpm vitest run lib/diagnosis/rules/rule-meta.test.ts 只会为「新版本号」写入哈希，
  // 已有版本号的哈希不同则直接失败——改了代码却没升版本，重新生成快照也过不了。
  // 局限：工厂函数生成的规则（AR01–AR05 等）闭包里的参数变化看不出来，改这类参数要人工升版本。
  it('判定代码与版本快照一致', () => {
    const snap = JSON.parse(readFileSync(SNAPSHOT, 'utf8')) as Snapshot
    const update = process.env.UPDATE_RULE_SNAPSHOT === '1'
    const problems: string[] = []
    for (const r of allRules) {
      const h = codeHash(r.evaluate)
      const byVersion = (snap[r.id] ??= {})
      const recorded = byVersion[String(r.version)]
      if (recorded === undefined) {
        if (update) byVersion[String(r.version)] = h
        else problems.push(`${r.id} v${r.version} 没有快照：运行 UPDATE_RULE_SNAPSHOT=1 pnpm vitest run ${SNAPSHOT.replace('.snapshot.json', '').replace('rule-versions', 'rule-meta.test.ts')}`)
      } else if (recorded !== h) {
        problems.push(`${r.id} 的判定代码变了，但版本仍是 v${r.version}：在 rule-meta.ts 把它升到 v${r.version + 1}，再按上面的命令更新快照`)
      }
    }
    if (update) writeFileSync(SNAPSHOT, `${JSON.stringify(snap, null, 2)}\n`)
    expect(problems).toEqual([])
  })
})
