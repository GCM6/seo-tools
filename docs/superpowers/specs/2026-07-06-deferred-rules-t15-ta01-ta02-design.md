# 延后规则第 1 组落地设计：T15 / TA01 / TA02

**日期**：2026-07-06
**范围**：v3 诊断方法论中「不依赖时序基线、可立即完整交付」的三条延后规则——T15 低价值语言页泛滥、TA01 主题覆盖浅/话题群割裂、TA02 话题群缺 Hub 页。
**上游 spec**：`docs/superpowers/specs/2026-07-03-diagnosis-v3-methodology-design.md` §4（§101 T15、§126 TA01、§127 TA02）。本文件只细化这三条的判定口径与实现锚点，不改动上游方法论。

## 1. 背景与边界

诊断引擎现有 **55 条规则**（T01–T14、C01–C11、E01–E03、G01–G09、K01–K07、Q01–Q03、A01–A03、T09a-c）。K08/K09/K10/T16 因**需多 run 时序基线或 datePublished** 而阻塞（回测数据未攒够）；本组三条**只需单快照 + 现有证据字段**，是当前唯一可无阻塞完整交付的规则切片。

**不做**（明确边界）：
- 不新建任何采集器；不改 `collect-evidence.ts` / `context.ts` 的采集与解析链（三条规则全部读**已有** RuleContext 字段）。
- 不新建站内内链邻接图（谁链到谁）。TA01/TA02 用**现有聚合字段近似**内链维度——见 §2 决策。
- 不碰 K08/K09/K10/T16（仍待时序基线）。

## 2. 关键决策（已代拍板，可推翻）

**TA01/TA02 的「群内内链」维度用精简版实现——复用现有聚合字段，不新建邻接图。**

- **理由**：① 与本项目既有规则惯例一致（无数据 graceful no-op、复用既有字段）；② 这两条本就是 `notice/inferred` 启发式，spec 明示「主题权威系行业经验框架、非官方排名因子」，精确邻接图属过度工程；③ 当期可完整交付。
- **代价**：TA01 的「群内内链密度」用**群内页 `inboundLinkCount`（站内全站入度）均值**近似，非严格群内邻接。规则描述必须**诚实声明此近似**，不得表述为精确群内密度。
- **可推翻**：若日后要忠实实现群内邻接，从 `lightCheckExtra.internalLinks`（每页出链列表）重建邻接矩阵，届时升级 TA01/TA02（另起切片）。

## 3. 可用证据字段盘点（均为 RuleContext 现有字段）

| 字段 | 来源 | 用途 |
|---|---|---|
| `siteAudit.payload.templates[]` `{pattern, pageCount, representativeUrl}` | 全站轻检（既有 URL 模板聚类） | 语言路径识别（T15）、话题群识别（TA01/TA02） |
| `siteAudit.payload.pages[]` `{url, templateId, inboundLinkCount, isKeyPage, ...}` | 全站轻检 | 群内页归属、入度、hub 判定 |
| `queryPageMetrics[]` `{page, query, impressions, ...}` | GSC page×query 证据 | 零展示交叉（T15）、群 GSC 聚合展示（TA01，可选增强） |
| `lightCheckExtra.hreflangEntries` | 轻检扩展 | 辅助语言站判定（次要，主用 templates） |

## 4. 三条规则详细设计

三条规则的 `claimType` 均遵上游 spec，全部为 `inferred`（T15 `warning`、TA01/TA02 `notice`），阈值全部标注为**启发式、无行业标准**，话术只作机制性推断、绝不作排名断言。

### 4.1 T15 低价值语言页泛滥（P1 · technical.ts · warning · inferred · side=technical）

**证据链**：`siteAudit.templates`（语言路径识别）× `queryPageMetrics`（GSC 零展示交叉）。

**语言路径识别**：从每个 `template.pattern` 取首段 path segment，小写后若 ∈ ISO 639-1 语言码集合（`en/de/fr/es/it/pt/nl/ru/ja/ko/zh/ar/...`，含带地区变体如 `zh-cn`/`en-gb`，复用 technical.ts 已有的语言/地区码知识）→ 判为语言路径模板。

**触发条件（全部满足才命中）**：
1. **GSC 已连接**（`queryPageMetrics` 非空）。否则 **no-op**——「低价值」的核心证据是 GSC 零展示实测，无 GSC 不可验证，遵「不可验证不得当作事实」铁律，宁可不报。
2. 识别到 **≥ 2 种**语言路径模板（多语言站）。
3. 语言路径下页面（`page.templateId` 属语言模板，或 url 前缀匹配语言段）中，**GSC 零展示页**（该页在 `queryPageMetrics` 中 impressions 求和 = 0，或根本未出现）**占比 ≥ 0.7 且绝对数 ≥ 10**。

**产出**：`{title, description, evidenceRefs:[siteAudit.id, gscEvidenceId], scope:'site', detail:{langCodes, langPageCount, zeroImpressionCount, zeroRatio, sampleUrls}}`。

**话术**：「识别到 N 种语言路径下共 M 页在 GSC 近 90 天零展示（占比 X%），疑似翻译插件批量生成、耗抓取预算并稀释权重（推断）。」

**阈值**（启发式，随 RULES_VERSION 固化）：`MIN_LANG_TEMPLATES=2`、`ZERO_IMPRESSION_RATIO=0.7`、`MIN_ZERO_PAGES=10`。

### 4.2 TA01 主题覆盖浅/话题群割裂（P2 · content.ts · notice · inferred · side=seo）

**证据链**：`siteAudit.templates`（话题群）+ 群内页 `inboundLinkCount`（内链密度**近似**）+ `queryPageMetrics`（群 GSC 聚合展示，可选增强）。

**话题群定义**：`templates[]` 排除语言路径模板（复用 §4.1 识别）后的内容模板。

**两类命中**（对每个话题群评估，聚合为**一条 site 级 finding**，detail 内列出问题群）：
- **有话题无深度**：群 `pageCount ≤ 2`（独立话题模板却只 1–2 页）。
- **话题群孤立（群间零内链近似）**：群内页 `inboundLinkCount` 均值 `< 1`（群整体近乎孤岛）。

**GSC 增强（可选）**：若该群有 GSC 聚合展示 `> 0` 却 pageCount 浅/入度低 → 描述升级为「有搜索需求、有话题却无深度」（仍 `notice`）。无 GSC 时仅用结构指标出 notice。

**产出**：`{title, description, evidenceRefs:[siteAudit.id]（+gscEvidenceId 若用）, scope:'site', detail:{shallowClusters:[{pattern,pageCount,avgInbound,gscImpressions}], isolatedClusters:[...]}}`。

**诚实声明**（写进 description）：「群内内链密度以站内入度均值近似，非严格群内邻接。」恒结构性建议、不作排名断言。

**阈值**（启发式）：`SHALLOW_MAX_PAGES=2`、`ISOLATED_AVG_INBOUND=1`。

### 4.3 TA02 话题群缺 Hub 页（P2 · content.ts · notice · inferred · side=seo）

**证据链**：`siteAudit.templates` + 群内页 `inboundLinkCount`。

**触发**：对 `pageCount ≥ 4` 的话题群（足够大才谈得上需要 hub），若群内页的**最大** `inboundLinkCount < 5` → 判为缺 hub 页（无高入度中心页）。

**产出**：`{title, description, evidenceRefs:[siteAudit.id], scope:'site', detail:{clustersWithoutHub:[{pattern,pageCount,maxInbound,representativeUrl}]}}`。

**话术**：「话题群 X（N 页）无高入度中心页（群内最高入度仅 K），缺 Pillar-Cluster 结构。建议建支柱页并从各子页内链指向（结构性建议，非排名断言）。」

**阈值**（启发式）：`HUB_CLUSTER_MIN_PAGES=4`、`HUB_MIN_INBOUND=5`。

## 5. 建议模板（templates.ts）

新增 3 条模板，结构对齐既有 `{what, whyHint, effort, validationMethod, promptType, fixSnippet?}`：

- **T15**：`promptType:'technical'`，`effort:'mid'`。what=「核实语言页价值：对零展示语言路径做 noindex 或合并，翻译插件批量页评估是否保留；释放抓取预算。」validationMethod=「重新采集 + GSC 观察语言页展示是否回升或抓取预算集中到主力页。」
- **TA01**：`promptType:'content'`，`effort:'high'`。what=「补足浅覆盖话题群的内容深度，并在孤立话题群间建立主题内链。」validationMethod=「重新统计群内页数/入度均值；GSC 观察群聚合展示提升。」
- **TA02**：`promptType:'content'`，`effort:'mid'`。what=「为大话题群建 Pillar（Hub）页，从各子页内链指向，形成 Pillar-Cluster 结构。」fixSnippet 可给 pillar 页内链结构示例。validationMethod=「重新统计群内出现 inboundLinkCount 达标的 hub 页。」

## 6. 注册与契约

- **无契约层改动**：不改 `types.ts`（RuleContext 已含所需字段）、不改 `context.ts`、不改 `collect-evidence.ts`、不改 schema。
- T15 加入 `technical.ts` 的 `technicalRules` 数组；TA01/TA02 加入 `content.ts` 的 `contentRules` 数组。`rules/index.ts` 的 `allRules` 自动汇总，无需改。
- **规则总数 55 → 58**。

## 7. 语言路径识别的复用

T15 与 TA01 都需「判断某模板是否语言路径」。抽一个共享纯函数 `isLanguagePathTemplate(pattern): boolean`（放 technical.ts 或共享 util），供两文件调用，避免语言码白名单两处漂移。TA01 在 content.ts 复用该函数（从 technical.ts 导出）。

## 8. 测试

- `technical.test.ts` 加 **T15** 用例：① 多语言模板 + GSC 零展示达标 → 命中；② 无 GSC → no-op；③ 单语言/仅 1 种语言模板 → no-op；④ 零展示占比/绝对数未达阈值 → no-op；⑤ 共享 `isLanguagePathTemplate` 单测。
- `content.test.ts` 加 **TA01** 用例：浅覆盖群、孤立群、GSC 增强、均达标不命中；**TA02** 用例：大群缺 hub 命中、大群有 hub 不命中、小群（<4 页）跳过。
- 可选：集成 e2e——真 allRules 从构造的 siteAudit/gsc 证据触发 T15/TA01/TA02 组。

## 9. 验收门槛

`tsc` 0 error / `eslint` 0 error / `vitest` 全绿（当前 592，预计 +8~12）/ `next build` ✓。

## 10. 已知取舍/局限（写入实现后的记忆）

1. TA01 群内内链密度是**站内入度均值近似**，非严格群内邻接（§2 决策）；忠实版待另起切片。
2. T15 无 GSC 时整条 no-op——「低价值」不可离线验证，宁缺毋滥。
3. 阈值全为启发式、无行业标准，随 RULES_VERSION 固化；主题权威恒作结构性建议、不作排名断言。
4. 语言路径识别按 ISO 639-1 首段白名单；非标准语言目录结构（如 `/lang/de/`）可能漏识别——可后续扩展 pattern 匹配。
