# SP-A「可信地基」最终报告

> 日期：2026-10-06 · 规则版本：rules_v10 · 全部改动**未提交**（HEAD 仍为 76a767e）· 账本：`.superpowers/sdd/2026-10-04-sp-a-trustworthy-foundation/progress.md`

## 结论

SP-A 的 22 个任务全部完成，最终独立审查发现的 5 个重要问题也已修复。全量测试 209 个文件 / 1979 条通过，lint 0 错误，构建成功。在 metadocu 上真实跑了一轮：12 条发现逐条独立复核，**误报 0**（只对这一轮的 12 条成立，不能外推为"规则层已无误报"）。所有采集失败都如实记为失败，没有一条被写成测量值：
- GSC：invalid_grant；
- PSI：429；
- Reddit：403；
- AIO：12 次 40101。

## 改了什么（按领域）

- **失败不再变成测量值**：
  - PSI、维基、Reddit、CSE / 社媒、DataForSEO 五个子阶段、AIO、UA 探测，全部区分"测到了"与"没测到"；
  - 非 2xx、非 JSON、错误信封、`result:null`、**200 但缺关键字段**、网络错误，一律记 failed 加原因码，不写证据；
  - 失败矩阵测试在整条流水线上钉住了这些形态。
- **原始响应存档**：新表 `evidence_raw`，gzip，单行上限 4MB，在发请求的同一个 Inngest step 内落库；子阶段的原文归属有测试保证。
- **数据源状态**：
  - 子阶段注册表 `SUB_SOURCES`，父级状态按子阶段汇总；
  - DataForSEO 父级失败时会写明各子阶段的原因；
  - 报告按"父 · 子"展示，并带失败原因。
- **健康分只认可用证据**：
  - PSI 全 null、UA 探测全失败、第三方两路都失败、GSC 0 行，都不让对应支柱入分；
  - P4 只认"有结果的种子词 SERP"。
- **规则口径**：
  - C05b / C05c：按 Google 2026-09 文档分必填 / 推荐；同页 `@id` 引用按被引用节点判断。
  - T14：改用 ISO 代码表。
  - T01：只禁抓非重点 URL 时降为 notice；入口与禁抓页按 **Googlebot** 判定。
  - **robots 解析按 RFC 9309 重写**：分组、通配、注释。
  - T08：只计会加载资源的元素。
  - G01 / G02：Google-Extended 归为训练 / 使用控制令牌，不再用它的 UA 名发 HTTP 探测；5xx 不算封禁。
  - C10：按可见正文哈希判重复。
  - C03：H1 与 title 相同只算说明。
  - K03：域名归一。
  - G05 / G06 / G09 / G11 / Q02：文案写实际采样数 n。
  - G07：只用采集成功的子结果。
  - G08：只记录，不出建议。
- **输入与同协议回测**：
  - 市场表单一真源；品类必填，建 run 前过闸门；
  - 种子词带来源标签，不再使用探针问句；
  - 回测复用基线问句集，以及基线 AIO 的关键词与地区；
  - 回测 run 不能直接重试（避免悄悄变成不同协议）。
- **预检**：建 run 前逐项检查品类、GSC、DataForSEO（含余额）、PSI、渲染、探针引擎，给出可操作的修复入口。
- **运维**：
  - 本地库已迁移，备份为 `veris.2026-10-06-pre-sp-a.db`；
  - 迁移脚本 `scripts/apply-local-migrations.mjs`，执行记录与回滚方法见 `docs/runbooks/local-env.md`。

## 验证数据

| 项 | 结果 |
|---|---|
| 全量测试 | 209 文件 / 1979 通过（修复轮后） |
| lint / build | 0 错误 4 警告（都在未改动的行上，HEAD 已有）/ 成功 |
| 实跑 run_188896f4（metadocu） | 12 条发现：真且可操作 4、真但价值低 8、误报 0 |
| 实跑成本 | DataForSEO 约 0.18 美元（余额 0.637 → 0.453） |
| 子阶段状态 ↔ 原文存档 | 抽查 5 条全部一致 |
| 最终独立审查 | 0 严重；5 重要（已全部修复，每条先写失败测试再修）；12 小问题（附录 B）；只读合规经快照比对确认 |

## 需要你拍板的新发现（实跑与终审中发现，超出 SP-A 计划）

> 2026-10-07 更新：第 2、3、4 项已按用户指示修复（GSC 授权失效不再重试；竞品候选的平台子域过滤与旧候选换代，本地库已清理 13 行旧候选；渲染未配置记 not_configured），全量测试 210 文件 / 1988 通过。仍待拍板：第 1 项（SERP 位置口径）与第 5 项（回测基线持久化）。

1. **SERP 位置口径**：
   - 现状：关键词缺口（K03）和竞品位次用的是 `rank_absolute`，它把 AI Overview / PAA / 视频等模块也算作名次。
   - 实测：本轮 23 个真实 SERP 里，99% 的自然结果被多算了 1～3 位（中位数 2）。
   - 后果："是否进首页前 10"会系统性判严。
   - 建议：同时保存 `rank_group`，用自然排名判断首页。
2. **GSC 授权失效时的重试**：invalid_grant 被 Inngest 当成可重试错误重试 3 次，每轮白等约 2.5 分钟。建议对它抛 `NonRetriableError`（Inngest 文档支持该做法，需要在 dev 服务上实测一次）。
3. **竞品候选的噪音**：
   - 平台域名过滤只做精确匹配，`learn.microsoft.com` 等子域都漏过；
   - 10-03 用错误品类跑出的候选（项目管理工具）仍以 candidate 留在表里。
4. **渲染未配置时状态记 partial**：报告显示"部分采集"而不是"未配置"。
5. **回测 run 持久化基线**：现在的处理是拒绝重试；如果希望能一键重试，需要给 `runs` 加 `baseline_run_id` 列并做迁移。

## 需要你操作的事

- 重新授权 GSC：当前 refresh token 返回 invalid_grant。授权后注意：GSC 国家过滤用的是小写三字母代码，至今未经真实 GSC 验证，只影响非 global-en 市场。
- 在 Google Cloud 控制台同步 OAuth 回调地址（见 runbook）。
- 配置 `PAGESPEED_API_KEY`：匿名调用两次实测都是 429，配额上限为 0。
- 在 Bing Webmaster Tools 确认 metadocu 的收录情况（G04）。
- 决定是否批准 CLAUDE.md 更新提案（`docs/superpowers/plans/2026-10-04-sp-a-claude-md-proposal.md`）。
- "富摘要类型支持状态"今天满 90 天：由你在规则管理页走"提案 → 批准 → 发版"。注意发版会派生库内规则版本号。
- 决定何时提交，以及如何把 SP-A 与工作区里更早的未提交改动分开。

## 附录 A：全部裁定（66 行，按时间顺序，原样摘自账本）

每行末尾的 "cost if wrong" 是这项裁定若判断错误的代价。

- Setup: Ruling: work in-place on main working tree, NO commits — 139 prior uncommitted changes (S1–S4 etc.) are the required baseline; a worktree from HEAD would lack them (trap: worktree-from-HEAD lacks uncommitted baseline); user instructed "现在开始实施"; no commit/stash/checkout/reset per plan Global Constraints — cost if wrong: user must separate SP-A diff from prior WIP manually before committing (mitigated by per-task file lists in implementation notes).
- T8→T10..T13 CollectResult/readRaw/reasonOf/aggregateParentStatus: CONFLICT — result.ts importing DataforseoTaskError from dataforseo/client while T13 makes client import readRaw from result.ts → import cycle. Ruling: reasonOf duck-types task errors (err.name==='DataforseoTaskError' && typeof statusCode==='number'); result.ts imports nothing from dataforseo — cost if wrong: none functional.
- T6 deletes screen1.industryOptions before T7 reads en variants: CONFLICT. Ruling: read now — zh=['B2B SaaS · 项目协作','跨境电商','本地服务','其他…'] en=['B2B SaaS · Team collaboration','Cross-border e-commerce','Local services','Other…']; markets zh=['中文 · 中国大陆','English · Global','东南亚'] en=['Chinese · Mainland China','English · Global','Southeast Asia']. Migration 0015 clears ALL 8 legacy industry dropdown strings (not only defaults: 'Cross-border e-commerce'/'Local services' pass the ASCII validator but are site types, not category descriptions) — cost if wrong: users re-enter category once.
- Task 1: Ruling: defer deleting lib/analysis/locale-guess.ts to Task 6 — its only caller (NewAnalysisForm) changes in Task 6; deleting now breaks the build — cost if wrong: none.
- Task 1: Ruling: keep AIO skip reason 'market_not_mapped' (plan said 'market_unmapped') — existing code/tests use it; less churn — cost if wrong: one string.
- Task 1: Ruling: DataForSEO stage with unknown market returns early (no requests) until Task 13 records sub-stage failures — avoids throwing out of collect pipeline — cost if wrong: silent skip for legacy runs until T13 (gate in T5 prevents new ones).
- Task 1: Ruling: GSC country filter uses lowercase alpha-3 (docs silent on case) — matches GSC response values — cost if wrong: filtered GSC returns 0 rows; detect on first real GSC run.
- Task 5: Ruling: gate extracted to lib/runs/gate.ts and applied to ALL 5 run-creating/dispatching entries (POST /runs, /runs/[id]/retest, /runs/[id]/retry, POST /analysis-sessions, PATCH /analysis-sessions/[id]) — spec §3.5 wrongly said sessions don't create runs; spec corrected in place — cost if wrong: none (stricter).
- Task 5: Ruling: session entries on gate failure → session back to waiting_input with missingFields ['industry'|'market'] (reuses existing intake UI) instead of 422; valid intake values patch invalid project values — cost if wrong: sessions UI must render the new field names (Task 6).
- Task 5: Ruling: PATCH /projects always sets language='en' (normalizes legacy zh projects on any edit) — English-only scope — cost if wrong: none.
- Task 6: Ruling: category input never auto-filled (candidates are chips; Next disabled until valid) — spec §3.2 "用户必须点选或编辑确认" — cost if wrong: one extra click.
- Task 6: Ruling: retest/retry 422 bodies carry projectId so buttons can deep-link to /new?projectId= — precedent run_in_progress carries runId — cost if wrong: none.
- Task 6: Ruling: SessionInputForm keeps file-local isZh copy style (not next-intl) — consistency with the existing file; scope — cost if wrong: later i18n refactor.
- Task 7: Ruling: drift probe (generate into scratch copy) showed "No schema changes" at 0014 → generated 0015 custom contains only SP-A SQL — cost if wrong: n/a (verified).
- Task 9: Ruling: evidence-level raw endpoint returns a LIST (one evidence ← many requests, e.g. seed SERP per keyword); body served per raw via /api/runs/[id]/raw/[rawId] (run-scoped) — cost if wrong: one extra click to view body.
- Order: Ruling: run Task 16 (rules, files outside wave-1 scope) while the wave-1 read-only review is still reading collect-evidence.ts/messages; Tasks 10–15 resume after review — avoids mutating files under review — cost if wrong: none (T16 independent of T10–15).
- Task 16: Ruling: JobPosting 至少一项 = [jobLocation, applicantLocationRequirements]（spec 表写 jobLocationType=TELECOMMUTE；Google 原文是有 applicantLocationRequirements 时 jobLocation 可省）— spec 明说以文档为准 — cost if wrong: 远程岗位误报/漏报一条 warning。
- Task 16: Ruling: 新增 MobileApplication/WebApplication → SoftwareApplication 规则（Google 原文支持）；VideoGame 不映射 — cost if wrong: 这两个子类型漏检/误检。
- Task 16: Ruling: recommended 只节选多数站点适用项（Product 去掉 gtin；Organization 去掉 contactPoint）— 减少 notice 噪音 — cost if wrong: 少提示几个推荐字段。
- Task 16: Ruling: C05c url 复用 schema 证据已有的 source（就是页面 URL），不新增 url 字段 — cost if wrong: none（source 由 collect-evidence 写入页面 URL，已核对两处生产者）。
- Task 16: Ruling: C05b 描述删"整体失效"、改为"坏块被 Google 忽略、同页其他有效块不受影响"并列页面 URL（真实站 Allbirds 冒烟发现夸大）；模板 whyHint 同步 — 超出 brief，测试先行 — cost if wrong: 文案级。
- Task 16: Ruling: reference_artifacts.google_rich_result_status 的 last_verified 不用 db:seed 刷（seed 会把另外 4 项未核实的资产也盖成"今天已核实"），推迟到 Task 22 走 update_artifact 提案→批准→发版的保鲜机制 — cost if wrong: 本地报告的"规则库最后校验"在 Task 22 前仍显示旧日期。
- Task 20: Ruling: 采用计划的 pillarsWithData({type,payload}[], n) + evidenceUsable，而非 spec 的 {type, usable(子阶段 collected 且非空)} — 历史 PSI 的子阶段状态本身就被错记成 collected（10-03 metadocu 实测 psi=collected 而载荷全 null），按状态判可用挡不住；新代码失败不写证据 — cost if wrong: 某类"状态 failed 但载荷非空"的历史证据仍会入分。
- Review1: Ruling: 目标关键词改存 project_settings.target_keywords（迁移 0017），不按 spec §3.3 存 keywords 表 source='manual' — keywords 是测量面：(project,text,market) 唯一索引 + 指标/缺口级联外键 + GSC upsert 冲突不改 source，整组删再建会撞唯一索引（I1）并级联删掉合并进来的历史指标（C1），两者均在真库测试中复现 — cost if wrong: 目标词不再以 manual 行出现在关键词表（此前也没有界面单独展示）。
- Review1: Ruling: POST /projects 复用同域名项目时写入用户本次填写的品类/竞品/目标词（非空才写），市场只补缺失或旧值，空值一律不清空 — 空白向导没展示过已存值，不能让未经确认的默认值或空值覆盖 — cost if wrong: 在空白向导里给已有项目改市场需要走项目编辑入口。
- Review1: Ruling: I4 跨协议回测 → 回测原样复用基线 run 的问句集（文本/意图/市场/语言/优先级/branded），基线无问句才按当前项目新建；引擎集合与 n 仍取当前设置（残余风险） — spec "同协议回测" 的直接实现，无需新增界面状态 — cost if wrong: 旧项目回测继续用旧问句（可能是中文），要换成新英文品类问句需发起新诊断作为新基线。
- Task 19: Ruling: samplesPerPromptPerEngine 取"各引擎、有样本问题上的样本数众数（并列取小）再取各引擎最小值"，不用计划的 floor(结果数/问题数) — floor 会把部分问题采集失败（30 条里 28 条有样本）算成 n=0，文案变成"采样 n=0"；众数如实反映每条问题实际采样次数 — cost if wrong: 大面积失败且剩余问题样本数不一时众数可能偏高。字段设为必填，12 个手写 ProbeSummary 测试字面量补字段。
- Task 19: Ruling: 写死的 n=5 一并改掉 Q02 描述与回测解读文案（超出 brief 的 G05/G06/G09/G11）——同类虚报；回测取两轮实际 n 的较小值 — cost if wrong: 文案级。
- Task 19: Ruling: 统计卡改名"首页结构化数据类型"后，取数改为优先入口页（sitePageId 为空）的 schema 证据，原来按数据库返回顺序取第一条 — 卡名写首页就必须是首页 — cost if wrong: none（旧调用方不传 sitePageId 时回落第一条）。
- Task 10: Ruling: PSI 段保留外层 try/catch，意外异常（存档/落库抛错）记 failed + unexpected_error，不让整轮失败 — 保持原有"PSI 只降级"契约（原测试 does not fail the run when PSI fetch throws 仍在）；brief 代码无 try/catch — cost if wrong: 意外异常不会触发 Inngest step 重试。
- Task 11: Ruling: buildThirdParty 遇 v1 旧载荷不映射为 ok（计划写 ok）——维基一律 failed/legacy_unverified（v1 是全文搜索判存在），Reddit 仅 mentions>0 记 ok、0 记 failed/legacy_unverified — 本地唯一真实 v1 载荷 mentions:0 对应当时的 403（今日复现），映射成 ok 会在回放时把"失败记 0"再当测得值 — cost if wrong: 历史 run 回放时 G07 不再出现（旧的 G07 本就建立在不可核实的 0 上）。
- Task 11: Ruling: 第三方两路都失败时父级 failed 的 failureReason 写成 "wikipedia=<原因>, reddit=<原因>"，子阶段各记自己的原因；意外异常记 unexpected_error — cost if wrong: 文案级。
- Task 12: Ruling: checkSocialPresence 返回 {payload, raws}（brief 只要求加 status/reason/raw 字段）——与 Task 11 采集器同构，原文（含 HTTP 失败时 CseSearchError 携带的原文）按平台存档到 social_presence:<平台> — cost if wrong: 调用方签名变化，仅 collect-evidence 一处。
- Task 12: Ruling: 旧社媒载荷（无 status）→ resultCount>0 记 ok、0 记 failed/legacy_unverified（brief 写"旧数据视为 ok"）——与 Task 11 同一原则：当年失败也记 0 条；本地库 social_presence 证据为 0 条（CSE 从未配置），无实际影响 — cost if wrong: none locally。
- Task 13: Ruling: client 信封级错误（HTTP 200 + status_code≥40000）带原因码 api_<code>（brief 写"其余逻辑不变"）——否则额度/鉴权类信封错误的子阶段原因会是 network_error — cost if wrong: 原因码文案。
- Task 13: Ruling: seedSerp 的 failedKeywords 增加 statusCode（类型 + serp.ts），子阶段 partial/failed 原因取首个失败词 task_<code> — cost if wrong: none（向后兼容的可选字段）。
- Task 13: Ruling: provider 未配置 → 5 个子阶段记 not_configured（防御，调用方只在有凭据时调用）；品牌词为空 → brand_serp not_attempted/no_brand — cost if wrong: none。
- Task 13: Ruling: 子阶段原因落库位置：failed/partial → failureReason；not_attempted 与"成功但无数据（labs no_data）"→ protocolSnapshot.reason — 不把非失败写进 failureReason — cost if wrong: 报告读取位置（Task 15 按此读取）。
- Task 13: Ruling: 删除已无调用方的 isDataforseoConfigured / createDataforseoProviderFromEnv（brief 允许"改异步或标注废弃"）——留着只会让人再写出只读 env 的链路 — cost if wrong: none。
- Task 13: 并入：审查 I5（种子为空 no_seeds，backlinks/bing/品牌照常）；spec §3.3 深检页 H1 进站点短语（变异测试确认：去掉 deepH1s 用例即失败）；审查 T1（AIO 测试市场改 gb，断言 2826）；I4 的 AIO 部分——回测时 AIO 查询复用基线问句文本（Ruling：与探针同一同协议原则 — cost if wrong: 旧项目回测的 AIO 查询保持旧问句）。全量 200 文件 / 1849 通过。
- Task 14: Ruling（brief 指定的 spec 偏离，已在 spec §4.5 补一行）：建 run 只做品类/市场闸门，不重复网络预检、不预写 not_attempted — 采集流水线本就如实写失败原因 — cost if wrong: 建 run 后到采集前，状态表里暂时没有"预检不可用"的行。
- Task 14: Ruling: GSC 刷新遇非 invalid_grant 的错误（网络等）→ tokenOk null + tokenError → degraded/gsc_unreachable（brief 的 buildPreflight 会把 null 当就绪）— 连不上 Google 时不能宣称 GSC 就绪 — cost if wrong: 多一条"受限"提示。
- Task 14: Ruling: 面板顶部"无法评估"（unavailable）与"评估受限"（degraded）分两行（brief 写两者都显示"本次无法评估"）— 降级项（如无 PSI key，匿名调用仍可能成功）说"无法评估"过度 — cost if wrong: 文案级。
- Task 14: Ruling: DataForSEO 账户接口 401/403 → authOk false（凭据问题），其余失败 → authOk null（degraded）；PSI key 只读 env（不在 BYOK 清单，与 psi.ts 一致）；预检逻辑探测放 lib/runs/preflight-probe.ts（Next 16 route 文件只能导出 HTTP 方法），路由只组装 — cost if wrong: none。
- Task 15: Ruling: 新增子阶段清单真源 SUB_SOURCES（lib/runs/source-status.ts）+ 覆盖测试（与 DFS_SUB_STAGES / SOCIAL_PLATFORMS / 第三方两路一致，zh/en subSourceLabel 无缺无多）——原覆盖测试只扫源码字面量 sourceKey，看不到 subSourceKey() 动态拼出的子阶段 — cost if wrong: none。
- Task 15: Ruling: 未覆盖项里的子阶段显示为「父 · 子」中文名（brief 只要求走 subSourceLabel）——单列子阶段名看不出属于哪个数据源 — cost if wrong: 文案级。
- Task 15: Ruling（超出 brief，与 Task 19 同类）：界面文案的写死 n=5 一并修——screen2.sentimentMeta 改 {n}（运行页传 samplesPerPromptPerEngine），report.geo.meta 删去 n=5（无探针数据时也显示，取不到 n）；先改代码后补测试的顺序错误已补救：临时恢复旧文案确认守卫测试 RED，再恢复 GREEN — cost if wrong: 文案级。
- Task 17: Ruling: 混合内容把 object[data]、picture/source[srcset] 一并计入（spec 写 object 的 src——object 实际加载资源的属性是 data）— cost if wrong: 计数口径。
- Task 22: Ruling: 新增运维脚本 scripts/apply-local-migrations.mjs（spec §4.7 写"只写手册不改代码"）——验证过的迁移步骤需要一个可重复执行的工具，sqlite3 命令行会丢表；脚本不是应用代码，已在两个新副本上验证（证据 155→155、约束含 social_presence、补记后 drizzle-kit migrate 为空操作）— cost if wrong: 仓库多一个开发脚本。手册 docs/runbooks/local-env.md 与 CLAUDE.md 建议稿 docs/superpowers/plans/2026-10-04-sp-a-claude-md-proposal.md 已写（建议稿未应用，待用户批准）。
- Review2: Ruling: 旧测试「returns pillars in canonical P1..P5 order」里 ev('ua_probe') / ev('gsc') 的占位载荷 {any:1} 改成真实形状——新语义下占位载荷不可用，测试本意（顺序）不变 — cost if wrong: none。
- Review2: Ruling: 回测 AIO 复用的是基线 serp_aio_results 里的去重关键词（只含基线成功的查询）与首行地区——基线失败的查询没有可比的基线值，复测它也比不出变化 — cost if wrong: 回测少查基线失败的那几个词。
- Review2: Ruling: 回测 AIO 的数据源状态 protocolSnapshot.market 仍写当前项目市场，locationCode 写实际使用的基线地区（两者可能不一致）；地区码才是协议本身，市场名无法从地区码反推（global-en 与 us 同为 2840）— cost if wrong: 审计时看到的市场名与地区码对不上。
- Review2: Ruling: 解析同页 {"@id"} 引用（spec §5.1 只说 offers.price 下钻一层、完整嵌套校验留 E，代码注释曾写"@id 不解析"）——被引用节点语义上就是那一层的值，不解析会对价格齐全的站报"缺必填"假结论；悬空引用仍按缺失报 — cost if wrong: 多 30 行代码，E 重做嵌套校验时可能替换。
- Task 17: Ruling: Google-Extended 并入训练类，但说明文案单独加一句"它管 Gemini 训练与 Grounding、不影响 Google 搜索收录与排名"，通用句改成"不影响 ChatGPT / Perplexity / Claude 的检索型引用资格"——原文"不影响检索型引用资格"对 Google-Extended 不成立（它管 Gemini 应用的 grounding）— cost if wrong: 文案级。
- Task 17: Ruling（超出 brief 文件清单）：UA 探针（lib/collection/ua-probe.ts）不再用 "Google-Extended" 发 HTTP 请求，G02 忽略旧证据里的 Google-Extended——官方文档写明它没有独立 HTTP UA，以它为 UA 被 WAF 拦截不说明任何事，原实现会报"CDN/WAF 误封搜索型 AI 爬虫 Google-Extended"的假结论；修复片段模板里"仅影响语料收录"同步改写 — cost if wrong: 少一路无意义探测。
- Task 18: Ruling: C03 修复模板 whyHint 同步改口径（原"与 title 完全重复会弱化主题表达"是无依据的断言）→"H1 缺失或多个会弱化主题表达；H1 与 title 完全相同不是错误，差异化表达可覆盖更多相关说法" — cost if wrong: 文案级。
- Task 21: Ruling: 变更记录沿用 types.ts 注释链，不另写实现笔记"规则变更"节——brief 的兜底条件是"找不到既有 changelog"，而注释链就是既有 changelog — cost if wrong: 文档位置。
- Task 21: Ruling: PSI 成功样本拿不到真实响应——匿名调用 10-04、10-06 两次实测都是 429 且 quota_limit_value "0"，本地未配 PAGESPEED_API_KEY [observed]；沿用 psi.test.ts 的手写成功样本，失败矩阵的正向对照也按同形态构造 — cost if wrong: PSI 成功路径的真实形态未经核对（字段名按 PSI v5 文档）。
- Task 22: Ruling: 备份文件名改为 veris.2026-10-06-pre-sp-a.db（brief 写 veris.db.bak-2026-10-04）——.gitignore 只忽略 *.db / *.db-* / *.db.bak，原命名不被忽略、带用户数据的库可能被误提交；runbook 的备份命令同步改正 — cost if wrong: none。
- Task 22: Ruling: 不代为盖 google_rich_result_status 的复核日期（10-06 满 90 天）——update_artifact 需'提案→人工批准→发版'，自批即绕过人工闸门；发版会派生库内规则版本（rules_v11），与代码常量 rules_v10 不一致，且 lastVerifiedAt 记为发版时刻而非 10-04 实际核对日期；留给用户在规则管理页决定 — cost if wrong: 报告在用户处理前会显示'富摘要类型支持状态可能滞后'。
- Final: Ruling: F1-2 只做最小修（5xx 不算封禁，G02 忽略旧证据里的 5xx），不加审查建议的"普通浏览器 UA 对照请求"——对照请求会改变探测协议、增加对目标站的请求量，属新设计；4xx 对所有 UA 都返回（如入口 404）时仍会误报，记为延后 — cost if wrong: 入口 URL 本身 4xx 时 G02 仍可能把"全体 UA 都 4xx"报成封禁。
- Final: Ruling: 本工具爬虫仍按 * 组守 robots（RFC：无同名组时用 *）；T01 入口与禁抓页改按 Googlebot 判定（有 robots 原文时重新判定，兼容旧证据）— cost if wrong: 项目域名不是完整 URL 的旧项目，入口仍沿用旧证据口径。
- Final: Ruling: F5-1 采用"回测 run 不支持直接重试、引导从基线重新发起"，不做审查建议的 runs.baseline_run_id 列——加列要新迁移并再迁一次本地库；拒绝重试已能杜绝"静默变成不同协议的回测" — cost if wrong: 回测失败后用户要多点一步，从项目页重新发起。
- Final: Ruling: F6-1 证据行的 raw_hash 保持"落库 rawText（解析后 JSON）的 sha256"，不改为原文 sha256（spec §4.3 要求、计划第 1035 行已偏离且未记裁定，此处补记）——原文 sha256 已在 evidence_raw.sha256、经 evidence_id 关联可核；改语义会让既有证据前后口径不一 — cost if wrong: 做完整性核对的人需知道原文哈希在 evidence_raw 表。
- Final: Ruling: F4-1 google_cse（site: 可见性）响应原文暂不存档（spec §4.3 列了 CSE；社媒 CSE 原文已存档）——该来源只出 L2 信号、本地未配置 CSE 无法实测 — cost if wrong: site: 可见性结论无法回看原文。
- Final: Ruling: F4-2 AIO 仍只存解析结果（spec §4.3 "AIO 已存原文"的前提不成立）——F1-1 已让缺字段的 AIO 响应记失败而非"无 AIO"，误判风险已堵；原文存档留作后续 — cost if wrong: AIO 结论无法回看原文。

## 附录 B：延后处理的小问题（26 行，原样摘自账本）

- Review1: minor (deferred): M1 RetestBanner（回测到期横幅）未接 422+projectId 的补充引导；会话页"请补充"显示裸字段名 industry、market。
- Review1: minor (deferred): M2 品牌去重先去符号再子串匹配会误删种子（别名 AT&T/.NET/C++，跨词 pdfsam↔"pdf sample generator"）。
- Review1: minor (deferred): M3 site-preview 跳转到内网返回 fetch_failed 而非 blocked；请求体 domain 非字符串 → 500。
- Review1: minor (deferred): M4 报告"目标市场"显示裸 code（global-en）——Task 15 动报告契约时顺带评估。
- Review1: minor (deferred): M5 getGscKeywordHistory 的 max() 在转 ISO 前比较混合格式字符串（目前无 SQLite 格式写入 runs 时间列，潜在）。
- Review1: minor (deferred): M6 DOMAIN_REGEX 嵌套量词回溯（HEAD 已有，本波预读 effect 多求值一次）。
- Review1: minor (deferred): T4 site-preview 单测整体打桩 safeFetch，未走真实跳转路径；T5 retry 测试 getProject mock 忽略 id、POST /runs market_required 用例未断言未派发。
- Task 15: minor (deferred): 报告数据源列表里失败原因显示原始短码（task_40101 / http_403），面向站主的友好文案留给子项目 B。
- Task 15: minor (deferred): deriveReportLevel 要求 dataforseo 父项 collected 才算有市场数据——只有 bing 失败（父项 partial）时即使关键词与竞品都采到也到不了 R3。
- Review2: minor (deferred): C05c 同一实体 @type 数组里多个类型映射到同一规则（如 LocalBusiness+Restaurant）→ 同一 URL 列两次、计数翻倍。
- Review2: minor (deferred): C05b 对合法的非 schema.org 词汇 JSON-LD 块（如 ActivityStreams）报 error"@context 无效"（少见）。
- Review2: minor (deferred, 主循环自查): 回测健康分 delta（lib/inngest/generate-findings.ts ③）仍按两轮"发现所属支柱"并集算分，与报告页"按可用证据"口径不一致；spec §5.4 只点名报告路由与 ReportView 两个调用方。
- Review2: minor (deferred, 主循环自查): llms.txt 请求网络异常 / 非 200 一律记 exists:false（G08 recordOnly，只记录不出建议）；载荷契约钉在 context.ts，改动需连带 G08。
- Task 22: minor (deferred, 实跑中发现，SP-A 之前的设计 3b7135f): 未配置渲染服务时 render 数据源记 partial + attempted:true（实际没尝试渲染，报告会显示'部分'而非'未配置'），protocolSnapshot.evidence 无条件列 psi（本轮 PSI 失败）。
- Task 22: 验收①：本轮 30 条探针问句含旧默认品类（项目协作 / B2B SaaS）的为 0 [observed]。minor (deferred): 问句模板把品类原样填槽，品类以 tool 结尾时出现 'document metadata removal tool tools'、'best products or services for document metadata removal tool' 等不通顺句子（模板措辞，非 SP-A 范围）。
- Task 22: 验收②：种子 23 个全带来源标签（gsc_history 11 / site_phrase 12），无探针问句（4 条 "how to…" 是 GSC 真实查询词）[observed]。minor (deferred): 站点短语混入 "no upload"、"free, no upload"、"privacy protection & editing tips" 等卖点 / 导航短语，被当种子查 SERP（花钱、引入不相关结果）。
- minor (deferred): G05 文案只说"AI 主动召回品牌"，未写明本次仅 DeepSeek 且不联网（仅模型记忆口径）；E01 与 C05c 推荐对同一缺失（Organization sameAs）各出一条；SO01 文案列举"微博、知乎、公众号"，与英文市场不对题。
- Final: minor (deferred): F1-3 GSC searchAnalytics 200 + 非 JSON 记 collected、写 0 行证据（SP-A 前；规则不误判，状态失真）。
- Final: minor (deferred): F1-4 AIO 失败仍写 payload:null 的 serp_aio 证据行（规则/支柱不读）；UA 探测 7 个 UA 里 6 个失败仍记 collected（应为 partial）。
- Final: minor (deferred): F2-2 no_seeds / no_brand / market_not_mapped 等"未尝试"原因存在 protocolSnapshot.reason，报告只渲染 failureReason，看不到原因（Task 13 裁定承诺由 Task 15 读取，实际没读）。
- Final: minor (deferred): F3-2 C05c 对 @graph 里被 Product 以 @id 引用的 AggregateRating 节点报"缺 itemReviewed"（野外频率未核实）；F3-3 C05c 不按 @id 合并同一实体的多处定义。
- Final: minor (deferred): F3-4 证据等级图例文案仍写"如 n=5 AI 探针"（messages 第 952 行附近）。
- Final: minor (deferred): F3-5 K03 把本站子域名（如 help.metadocu.com）的排名当成"本站缺失"。
- Final: minor (deferred): F4-3 raw 下钻接口按第三方原始 Content-Type 回传（如 Reddit text/html），未加 nosniff / sandbox（推断，未复现）。
- Final: minor (deferred): F5-2 回测时探针解析用的品牌别名、竞品列表取当前项目值；可比性检查不看这两项（推断）。
- Final: minor (deferred): F1-2 余项——入口 URL 对所有 UA（含普通浏览器）都返回 4xx 时，G02 仍会把"全体 4xx"报成封禁（需加对照请求，属探测协议新设计）。
