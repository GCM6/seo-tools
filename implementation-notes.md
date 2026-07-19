# 实现笔记

## 2026-07-15 · 社媒/第三方谈论面诊断嵌入(A+B 档)

**背景**:经调研确认"社媒对 SEO/GEO 的真实作用路径 = 第三方谈论面(引用/口碑/实体),而非互动指标"。据此把两类信号嵌入诊断:①AI 引用的平台构成(已有数据换维度切,L3);②品牌社媒/评价站前台存在性(CSE 通道新证据源,L2)。

**落地清单**(4 个并行任务,1141 测试绿,tsc 零错误):
- `lib/probes/citation-platform.ts`:域名→平台精确分类(reddit/youtube/linkedin/quora/wikipedia/github/other),UGC 口径 = reddit/quora/youtube/linkedin。
- `lib/probes/summary.ts`:`CitedDomainEntry.platform` + `ugcCitationShare`(unbranded 子集口径,分母 0 → null)。零迁移零 parser 升版(聚合期纯计算,同 origin 先例)。
- `lib/collection/social-presence.ts` + collect-evidence Phase D 新段:CSE 查 `site:youtube.com/g2/trustpilot/capterra "<brand>"`,evidence type `social_presence`,**L2**(前台可见性口径,对齐 serp_snapshot 判例)。迁移 0011(evidence_type CHECK 枚举整表重建,0010 模式)。
- 规则(RULES_VERSION v3→**v4**):
  - **G11**(geo.ts,measured_sample,warning):unbranded UGC 引用占比 ≥ 0.25 且无 owned 引用。阈值依据:行业追踪 AI 回答社媒来源 20%+ 为普遍水位。
  - **SP01/SP02**(新 reputation.ts,**inferred**——L2 证据不得越级 measured_sample):YouTube 前台零结果(warning)/三评价站全零(notice)。"没查"≠"查了没有":对应平台条目缺失时 no-op。
  - templates:G11/SP01/SP02 建议模板,negativeConstraints 含禁刷量/禁伪造评价;SP01 建议含关键词时间戳(Google key moments 官方机制)。
- UI:CitedDomainsCard 平台徽标(中性灰 `.platform-badge`,不占用 m/i/g/ok 语义色;other 不渲染);ReportView GEO 段 UGC 占比行(null 显示"未能计算"而非 0%);zh/en i18n 同步。

**各任务偏离项汇总**:
1. T1:无(ugcCitationShare 按优先项落在 unbranded 子集)。
2. T2:①`lib/inngest/channels.ts` evidenceType 联合类型是任务书未点名的第三处手动同步枚举,编译期暴露后按同款模式补齐;②`SearchVisibilityProvider` 原来只有 `checkSite(domain)`,抽取 `performSearch` 后新增通用 `search(query)`(行为不变);③collect-evidence 测试基线 mock 里 `checkSocialPresence` 默认抛错(与 ua_probe 先例同款),避免破坏既有调用次数断言。
3. T3:`RuleContext` 新增必填字段 `socialPresence` 连带补了 6 个规则测试文件的 ctx 字面量(`socialPresence: null`),仍在 lib/diagnosis 范围内。
4. T4:①`platformLabels` 用精确类型 `Record<Exclude<CitationPlatform,'other'>, string>`(编译期强制补全 6 个平台名)而非示例的宽松 Record;②新增 `.platform-badge` class(参照 `.report-source-chip` 风格但不复用,避免语义耦合)。

**已知边界/后续**:
- G11 阈值 0.25 为经验值,随 RULES_VERSION 固化,复测数据积累后可调。
- social_presence 是 CSE 前台检索口径(非平台 API 全量),永远 L2/inferred;若 V1 接 YouTube Data API/评价站 API 才可升级。
- C 档(社媒提及量/情感真实采集)未做,与 DataForSEO AIO 接入一起 V1 立项。
- retest-metrics 未纳入 ugcCitationShare(本轮范围外,复测口径要加时需注意 D4 噪声纪律)。
- 未提交:本轮改动叠在前序未提交的引用口径修复轮之上,由用户决定提交时机。
