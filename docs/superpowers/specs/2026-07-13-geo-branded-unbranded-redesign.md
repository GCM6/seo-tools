# GEO 探针方法论修正:branded/unbranded 拆分 + 品牌认知质量三态

日期:2026-07-13 | 状态:已定稿(用户确认盲区扫描结论,决策项按推荐拍板)

## 1. 问题(全部已实证)

- 30 条探针问题中 7~8 条问题文本自带品牌名(品牌类 5 + 对比类 2~3,`lib/probes/prompt-set.ts:100-128`),模型必然复述,甚至对品牌一无所知时顺着名字臆测(实例:DeepSeek "likely a portmanteau of Meta and Documentation"),而 `brandPresent` 是纯词边界匹配(`lib/probes/parse.ts:33-39,67`),这类命中被计入头条指标 "7/30"。
- 聚合层(`lib/probes/summary.ts:67-158`)、规则 G05/G06、UI(PresenceMap)对 branded/unbranded 一视同仁;真实"AI 主动召回"信号(截图实例)只有 2/22。
- `targetDomainCited`(被引用为信息源的硬信号)被计算但从未参与判定/聚合。
- 行业核查:branded/unbranded 二分 + unbranded 为主(≈75/25)是多家工具一致惯例(Profound/Peec/HubSpot);我们现有配额 22-23/30 unbranded 恰好达标,**问题集配额不改**。幻觉审计是行业空白(Ahrefs 明言不过滤幻觉),无先例可抄。

## 2. 设计决策(D1–D7,均已拍板)

**D1 branded 标注**:`prompts` 表加 `branded` 整型布尔列。生成时判定:`branded = mentions(promptText, brand)`(复用 parse 的 mentions 逻辑对问题文本判定),自动覆盖条件分支模板(有无竞品导致同一模板 branded 不同)。问题文本、配额、template_v2 版本号均不变 → 探测协议不变。

**D2 解析器 v4(PROBE_PARSER_VERSION 'v3'→'v4')**:`parseProbeAnswer` 新增两个确定性信号(中英词表,复用 sentiment.ts 启发式先例,零 LLM):
- `hedged`:猜测标记(likely / probably / appears to be / based on the name / 可能是 / 推测 / 顾名思义 …)
- `unknownAdmission`:承认不知道(I'm not aware / no information available / 没有找到 / 不了解 …)
词表在实现前先用本地库已落库的真实探针回答校准(抽样人检)。

**D3 三态判定按引用能力分流(盲区 #1 的裁决)**:branded 问题的每条回答判定"认知质量":
- 联网引擎(OpenAI/Perplexity/Gemini,webSearchEnabled=true):
  - `grounded` 有依据:citedUrls 非空(targetDomainCited 另计更强档)
  - `speculative` 疑似臆测:无引用 且 hedged
  - `unknown` 承认不知道:unknownAdmission
  - `unverified` 无从判定:无引用、无 hedge、无承认(断言式回答无依据)
- 非联网引擎(DeepSeek,结构上 citedUrls 恒空,`deepseek.ts:42`):**不用引用信号**,只有 `speculative`(hedged)/`unknown`/`undetermined(无引用能力,未判定)` 三档,UI 明示"该引擎无引用能力"。禁止把 citedUrls=[] 当"无依据"。

**D4 聚合拆分 + 置信区间(盲区 #3 的裁决)**:`aggregateProbeSummary` 输出:
- unbranded 层(头条):`unbrandedPresent/unbrandedTotal` + **Wilson 95% 下限**(复用 `lib/diagnosis/rule-stats.ts` 现成实现);SoV 只在 unbranded 层计算;Citation Rate 单列(其回测方差远大于 presence,阈值独立,不与 presence 共用)。
- branded 层:grounded/speculative/unknown/unverified/undetermined 分引擎计数。
- 回测 delta 口径:两轮 Wilson 区间不重叠才可表述"变化",否则"方向性波动,未超噪声"(inferred)。

**D5 规则**:G05 改用 unbranded 比例触发(阈值 0.3 暂持,文案改 X/unbrandedTotal 语义);G06 零引用只对联网引擎评估;新增 **G10「AI 疑似在编造品牌事实」**(branded 回答中 speculative 占比≥0.3 触发,warning,claim_type=inferred——词表启发式,非实测),建议动作指向建立权威语料(第三方词条/结构化事实页)。

**D6 分引擎语义标注(盲区 #2 的裁决)**:引擎按 webSearchEnabled 标"检索型/记忆型";UI 与报告明示:记忆型引擎(DeepSeek)反映训练语料记忆,4–6 周回测周期对其大概率无变化,回测 delta 承诺只对检索型引擎有效。

**D7 品牌别名(盲区 #5)**:`project_settings.brand_aliases`(JSON 数组,用户在设置页维护,不走 verified 闸门——是匹配配置不是发布事实);parse 的 mentions 对 brand+aliases 逐一匹配;branded 判定同样吃别名。

**D8 历史回填(盲区 #6)**:rawText/payload 全量在库,写回填脚本用 v4 解析器重算历史 `ai_probe_results`(brandPresent/hedged/unknownAdmission/parserVersion),先 dry-run 出差异报告再执行;回填后全库同为 v4 口径,历史 run 可比,基线不作废。

**D9 空态呈现(盲区 #7)**:unbranded 0/22 是小品牌常态,UI 按"机会空间"框架呈现(竞品 SoV 对照 + 分引擎拆解 + 趋势位),不得呈现为故障态;文案 zh/en。

## 3. 波次与验收

- **Wave 1(契约,单任务先行)**:migration(prompts.branded / ai_probe_results.hedged+unknown_admission / project_settings.brand_aliases)+ prompt-set 生成标注 + parse v4(含词表真数据校准报告)+ run-probes 穿线 + summary 新聚合 + 单测。验收:tsc 0 / 相关 vitest 绿 / 词表校准样例 20 条附报告。
- **Wave 2(并行 3 路,不相交文件集)**:A 规则层(geo.ts G05/G06/G10 + templates + retest-metrics 切 unbranded 口径);B UI 层(PresenceMap 拆两区 + run 页 + report 页 + i18n + D6/D9 文案);C 回填脚本 + 设置页别名编辑。
- **Wave 3(收口)**:全量 tsc/lint/vitest/build + 跨任务集成检查 + 偏离项汇总进实现笔记。

已知边界:Anthropic 探针适配器不存在(文档提及但无实现,本次不建);`promptTemplateVersion` 死字段不处理(backlog);词表查全率未知(确认无先例),v4 只标"疑似",G10 恒 inferred。
