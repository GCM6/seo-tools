# 实现笔记:GEO branded/unbranded 重设计(2026-07-13)

spec:`docs/superpowers/specs/2026-07-13-geo-branded-unbranded-redesign.md`
编排:Fable 主循环拆解/验收,sonnet-executor 执行;Wave 1 契约 → Wave 2 三路并行(A 规则/B UI/C 回填) → Wave 3 收口。

## Wave 1 契约层(已验收:tsc 0 / lint 0 err / vitest 909 绿 / 抽验独立复跑通过)

落地:prompts.branded、ai_probe_results.hedged+unknown_admission、project_settings.brand_aliases(migration 0008);parse v4(hedged/unknownAdmission 词表,限品牌句);prompt-set 生成期 branded 标注;summary 新增 unbranded{present,total,wilsonLow}/branded.perEngine 五态/citationRate,sov 收窄 unbranded;Wilson 抽至 lib/stats/wilson.ts。

偏离项(均已裁决采纳,保守向):
1. hedged/unknownAdmission 限"含品牌句"检测——真数据校准:全文匹配误伤 20/60,限定后 6/60 全真。spec 未写,数据支持,采纳。
2. sovByEngine 与 sov 一并收窄 unbranded(spec 只点名 sov)——同一概念不留不一致。
3. Wilson 抽共享 lib/stats/(避免 probes↔diagnosis 反向依赖),rule-stats.ts re-export 保兼容。
4. 布尔列用 drizzle {mode:'boolean'}(对齐 brandPresent 先例)。
5. 中文词表未经真数据校准(本地库无中文含品牌样本)——fixture 自测,已标注。
6. 已知漏网:自信编造无猜测措辞(idx15)、"If you are referring to MetaDoc..."(idx45)词表抓不住——不为单样本过拟合扩表,与 spec"只标疑似、G10 恒 inferred"边界一致。
7. webSearchEnabled 静态兜底表,未登记 provider 保守按检索型。

## Wave 2(已全部验收)
- A 规则层+回测口径:G05 切 unbranded(带 wilsonLow)、G06 加检索型引擎过滤、新增 G10(inferred,speculative≥0.3 且样本≥3)、retest-metrics brand_presence 切 unbranded、generate-findings 两处 + reeval 调用点接线。偏离:①主动多接了 buildRunMetrics 第二调用点(必要,否则回测口径全错);②webSearchEnabled 未持久化到 ai_probe_results,走静态兜底表(待办:DB 补列);③G06 保守沿用原判定信号只加引擎过滤(spec 字面允许)。
- B UI:PresenceMap 拆两区(上区 unbranded 召回格子+Wilson 注记+D9 机会空间空态;下区 branded 按"回答"粒度五态格子)、run 页头条/检索型记忆型徽标/citationRate、报告页 GEO 补充段(段落编号 4→9 顺延)、别名编辑卡、i18n 双语。偏离:①别名卡落项目详情页而非设置页(设置页 SP-G1b 已定位为全局 BYOK 页,无 projectId——正确裁决);②branded 格子粒度=回答而非问题(五态本就是回答级);③保存走 fetch+route(对齐 GscConnectCard 先例)。
- C 回填:scripts/reparse-probes.ts(默认 dry-run,--apply 写库)。本地 veris.db 已执行:prompts.branded 14/60、hedged 6/60、unknownAdmission 7/60、brandPresent 翻转 0,幂等验证 0 diff;evidence_artifacts 逐行比对未触碰(证据不可变)。偏离:rawText 兜底抽取路径真实数据未触发(payload 都全),仅单测覆盖。

## Wave 3 收口(已验收;主循环独立复跑 tsc 0 错 + vitest 972/972)
- 三份引擎能力/五态判定复制统一到 `lib/probes/engine-capability.ts` 唯一真源(逐行比对无行为差异,纯去重);components/probeEngineCapability.ts 收缩为 re-export。
- 新增跨层一致性测试 branded-classification-consistency.test.ts(聚合层计数 ≡ 展示层逐条归类求和)。
- 真实数据冒烟(run_1994ca55):旧口径 7/30;**unbranded 0/23**;DeepSeek 五态=speculative 4/unknown 2/undetermined 1,无 grounded/unverified(D3 逻辑真数据验证)。0 而非预期"约2"的原因已查明:本地只配了 DEEPSEEK_API_KEY,无联网引擎样本——即截图那轮的 7 个"出现"**全部**是品牌题复述/臆测,真实主动召回为 0。
- 四门:tsc 0 / eslint 0 err / vitest 972 绿 / next build 通过。

## 遗留(V1 backlog)
- 中文猜测/承认词表未经真数据校准(本地无中文含品牌样本);"自信编造无猜测措辞"词表抓不住(idx15)——G10 恒 inferred 的既定边界。
- webSearchEnabled 宜持久化到 ai_probe_results 列,替代静态兜底表。
- 多引擎混合下 unbranded 口径未真机验证(需配齐 OpenAI/Perplexity/Gemini key 重跑 scratchpad 冒烟脚本)。
- promptTemplateVersion 死字段未处理;Anthropic 探针适配器不存在(文档提及,未建)。

## Wave 4 审查修复(2026-07-14,multi-agent 审查 → 10 确认缺陷 → 5+1 任务并行修复,已验收)
审查:4 finder + 逐条独立对抗验证,28 候选 0 驳回,按上限报 10 条正确性缺陷(全 CONFIRMED)。修复分 5 个互不相交任务并行 + 1 个续派:
- **A 规则层**:G06 门控切 per-engine unbrandedPresent(品牌题复述不再堵死零引用规则)、分母改去重问题数(引擎×问题配对数改名 enginePromptPairs 入 detail,修正钉死错误语义的 5+5=10 断言)、全 branded 时 G05 产出降级 finding(inferred,evidenceRefs 非空)而非静默 null;**RULES_VERSION → rules_v2**;summary perEngine 加法扩展 unbrandedPresent/unbrandedTotal。
- **B 回测链路**:新增 checkUnbrandedComparability 守卫(基线 branded 计数=0 而对比轮>0,或 parserVersion 集合不一致 → 快照行标"口径不可比+回填指引",不给涨跌结论);spec D4 Wilson 噪声门落地(区间重叠 →"方向性波动未超噪声",不重叠才许"上升/下降";区间上限用 1-wilsonLow(n-k,n) 恒等式反推,手算复核)。续派 B2:守卫接到 computeOutcome,probe 口径不可比短路为既有中性态 'unknown'(rule-stats:76 本就按 outcome!=='unknown' 过滤,F3 不受污染,未扩枚举)。偏离(已裁决接受):SoV 无区间数据,噪声门只盖 brand_presence。
- **C 解析层**:sentiment 品牌句过滤补 aliases(D7 别名负面口碑不再恒 neutral);unknownAdmission 改全文检测(诚实拒答不再误判 unverified),hedged 保持限品牌句校准;**PROBE_PARSER_VERSION → v5**。
- **D 头条统计卡**:deriveAiVisibility 切 unbranded 口径(值="present/total",0 分母兜底"—"),zh/en 标签注明"无品牌提问主动召回",删除失效的 aiVisibilityUnit 键;StatStrip 移除 aiVisibility 单位拼接。偏离(接受):messages/*.json 超任务书列举范围但为验收所需。
- **E 回填脚本**:--apply 写库收窄为 D8 白名单四列(buildProbeUpdatePayload 显式 4 键),不再覆写探针期冻结的 competitorsMentioned/targetDomainCited/sentiment;anyChanged/dry-run 报告同步收窄。偏离(接受):DB select 仍读三列但不参与判断(保持 IO 形状)。
- 直通小修:db/schema.ts hedged 注释去钉死 v4,改指 PROBE_PARSER_VERSION 真源。
- 四门(主循环收口独立复跑):tsc 0 / eslint 0 / **vitest 998 绿**(新基线,较 972 +26 条回归测试) / next build ✓。
- 新遗留:①部署后存量 run 与新 run 回测会命中"口径不可比"提示,属设计行为——生产上线后需跑 pnpm reparse-probes --apply(v5)解除;②UI 渲染层(StatStrip/run 页)无 DOM 级测试,口径文案靠 messages 内容人工确认;③降级 G05 沿用 scope='site',如 UI 要区分降级说明需另设 scope。
