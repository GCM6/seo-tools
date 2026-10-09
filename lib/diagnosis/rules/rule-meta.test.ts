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

  // 版本守卫（spec §9 风险 2）：规则自己的 evaluate 函数体变了必须升版本。快照按版本只追加：
  // UPDATE_RULE_SNAPSHOT=1 pnpm vitest run lib/diagnosis/rules/rule-meta.test.ts 只会为「新版本号」写入哈希，
  // 已有版本号的哈希不同则直接失败——改了函数体却没升版本，重新生成快照也过不了。
  // 覆盖范围：哈希的只是 String(rule.evaluate)，即 evaluate 函数体转译后的文本。
  // 只改这段文本之外的东西，守卫看不见，必须手工在 rule-meta.ts 把受影响规则升版本：
  //   1. 模块级常量/阈值（如 authority.ts 的 G04_LOW_INDEX、technical.ts 的 HTTP_ERROR_WARN_RATIO）；
  //   2. 同文件里的辅助函数；
  //   3. 被 evaluate 调用的导入分析器（如 G03 调用的 technical.ts 的 isRenderDependent）；
  //   4. 工厂函数生成的规则的参数（AR01–AR05 的 evaluate 文本完全相同，闭包参数变了哈希不变）。
  // 反过来也有误报：哈希是 vitest 转译后的文本，含 __vite_ssr_import_N__ 这类按 import 顺序编号的引用，
  // 升级 vite / esbuild 或调整该文件的 import 顺序，可能让没改逻辑的规则也报「判定代码变了」。
  // 遇到这种情况先确认逻辑确实没动（git diff 看源码），再手工删掉该规则在快照里的旧条目后重生成；别直接升版本，
  // 按问题台账的设计，规则版本一升，该规则的旧问题会以 rule_changed 关闭，不会再被判「已修复」。
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
