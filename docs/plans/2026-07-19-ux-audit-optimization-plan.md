# Veris 用户视角全功能审查与优化方案

> 2026-07-19。六路并行审查(产品基线/信息架构动线/诊断呈现/GEO 页面/输出闭环/视觉系统)+ 编排者对关键论断的独立代码抽验。证据标注:**observed** = 编排者亲自读代码核实;**reported** = 审查代理报告(附 file:line,可复核)。

## 〇、总体判断(先看这段)

**产品的工程护城河(证据分级、人工闸门、可追溯)已经真实建成,但用户视角存在三个系统性问题,按伤害排序:**

1. **动线在两个最关键的时刻断裂**——"诊断完成的那一刻"和"隔几天回来找交付物的那一刻",用户都会走进没有出口的页面。第一次完整走通的用户体验是顺畅的,但这掩盖了重访路径的系统性缺失。
2. **交付物拿不出去**——建议是静态模板文案,不含具体受影响 URL;证据引用是数据库内部 ID。发给外包执行者等于一张"要修屋顶"却不写地址的工单。
3. **严谨被做成了难懂**——报告第一屏是"系统性基础问题:存在抓取/索引/渲染层面的高危阻断"这类术语堆砌,而用户真正要的"接下来做哪 3 件事"排在第 7 段。工程上正确的分级体系,在呈现层没有配套的翻译层。

视觉层面另有一个独立结论:**产品内并存两套设计语言**——主诊断页/输出页是精心定制的 token 系统,而 site/keywords/competitors 三个子页是原生 Tailwind 灰蓝色板,像另一个团队做的原型。

对照 4 周商业验证约束(不写新功能):下文 A/B 包属于"修断裂",是裁判(B类站主)能走完流程并拿到可用交付物的**最小前提**,建议豁免;C/D 包可放验证期后。

---

## 一、P0:阻断级问题(裁判走不完流程)

### P0-1 诊断完成时刻,主看板失去前进出口(observed)
- `RunProgress` 为人工闸门设计了完整的三态引导(待确认 N 条/已就绪/查看输出),文案已写进 `messages/zh.json` 的 `reviewGate` 块,但唯一调用点 `app/[locale]/runs/[id]/page.tsx:239-245` 从不传 `reviewGate` prop——全套引导是**已建好未接线的死代码**(observed:`grep reviewGate app/` 零命中)。
- 用户实际看到的是通用完成态 + 一个"查看诊断结果"按钮,点击只执行 `router.refresh()`,不导航(observed:`components/RunProgress.tsx:211-215`)。
- 叠加状态机翻转:`status` 变为 `output` 后,底部"去确认建议"引导卡的渲染条件(`reviewing && pending>0`)同时失效——**任务真正完成的那一刻,页面反而什么都不说**(reported:`page.tsx:64,239,449`)。

### P0-2 交付物页 /output 在重访路径上无入口(observed)
- 项目历史表对完成 run 只给「查看」(回主看板,遇 P0-1 断头)和「报告」(只读页,全文无出链)两个链接(observed:`components/RunHistory.tsx:65-72`)。
- `/output` 是产品价值最高的页面(已确认建议 + 可复制执行 prompt),但用户隔几天回来,除了手打 URL 没有任何路径能到达。

### P0-3 每标记一条"已执行"就把复测日期整体重置 +28 天(observed)
- `app/api/recommendations/[id]/route.ts:23-34`:`applied=true` 分支**无条件**将项目 `nextRetestDueAt` 设为"现在+28 天"。分批执行(常态)会让复测无限顺延;且"已执行"无撤销入口。
- 注意:代码注释表明这是按 spec §5.1-6 实现的——**坑在 spec 本身**,需要产品裁决口径(见方案 A3)。
- 直接破坏"4-6 周同协议复测"这条产品核心承诺。

### P0-4 建议/prompt/报告不含具体 URL,证据引用外部不可解析(reported,双侧证据链完整)
- 规则命中时已算出 `blockedUrls`/`blockedKeyUrls`(`lib/diagnosis/rules/technical.ts:74-90`),但拼装建议时只用静态模板 `what` 文案(`lib/diagnosis/recommend.ts:79-103`、`lib/diagnosis/templates.ts:61-68`),**这批数据从未流入建议、prompt 或行动报告的任何一层**。
- 行动报告里的"证据引用"是 `ev_xxx` 内部 ID(`lib/diagnosis/action-report-markdown.ts:91`),不登录系统无法解析。
- 后果:报告可做内部决策留痕,但**不能原样发给外包执行**。

### P0-5 prompt 生成后无重生成入口,静默过期(reported)
- 后端已支持 `?regenerate=1` 幂等覆盖(`app/api/recommendations/[id]/prompt/route.ts:51-63`),但前端 `PromptAssets` 一旦有 prompt 就只读展示(`components/ActionList.tsx:90-134`)。用户回 screen3 再编辑建议后,output 页展示的是旧 prompt 且无任何过期提示。

---

## 二、P1:理解层问题(裁判看不懂)

| # | 问题 | 证据 | 严重度 |
|---|---|---|---|
| P1-1 | 报告结论不先行:第一屏是术语堆砌的"约束定位"话术("抓取/索引/渲染层面的高危阻断(P1)"),"优先级矩阵/行动路线"排在第 7-8 段 | `components/ReportView.tsx` 段落顺序;`zh.json:880` | 高 |
| P1-2 | "95% 置信下限"裸露在报告正文,配套人话解释(`mapWilsonNote`)只存在于诊断页、没带进报告 | `ReportView.tsx:592-596`;`zh.json:937` | 高 |
| P1-3 | 术语裸奔:canonical、noindex、4xx、HTTP 状态码、R0-R5、"渲染差异"有符号裸数字(非比例)、DataForSEO 均无解释 | 审查3术语审计表,`site/page.tsx:73-76,129` 等 | 中高 |
| P1-4 | 健康分(0-100)与 finding 严重度(高/中/提示)两套体系并存,换算解释只是一个可折叠的原始文本块 | `ReportView.tsx:398-401` | 中高 |
| P1-5 | 证据等级图例(L0-L4)全报告只出现一次,中段读者已失忆;`FindingCard` 里「实测」徽章与 confidence 文本重复展示同一值 | `ReportView.tsx:404`;`components/FindingList.tsx:104-105` | 中 |
| P1-6 | screen2 主诊断页 12 个数据区块纵向堆叠,无侧边目录/锚点/折叠;顶部"下一步"徽标被信息密度稀释 | `runs/[id]/page.tsx:276-447` | 高 |
| P1-7 | PresenceMap 上下两区视觉同构但分母不同(上区一格=一个提问,下区一格=一条回答),易被当同类打分卡横向比较 | `components/PresenceMap.tsx:36-37 注释自认` | 中高 |
| P1-8 | 关键词表无排序/筛选/分页(数据库也无 orderBy),同一关键词拆在两张互不关联的表;数据一多不可用 | `components/KeywordTable.tsx:56-110`;`lib/repositories/index.ts:257-275` | 高 |
| P1-9 | keywords/site 页看完无"下一步"收敛;方法论说明默认折叠而头条大数字默认最醒目,易被单独过度解读 | 审查4问题5/7 | 中 |
| P1-10 | 站点结构页 7 张统计卡无颜色无基线,"4xx=12"无从判断轻重 | `site/page.tsx:101-108` | 中 |

**一条历史遗留说明**:审查发现的"「实测」徽章挂在人工品牌事实上"(违反 L3/L4 铁律)出自 `ReportPanel.tsx`——该组件已是死代码并在本次会话中被删除(见附录),现行代码无此模式(observed:grep 零命中)。

---

## 三、P2:视觉系统问题(不像一套产品)

| # | 问题 | 证据 |
|---|---|---|
| P2-1 | 两套设计语言并存:site/keywords/competitors 三页整体用原生 Tailwind `neutral-*`/`blue-*`,零 `.card`/`.tag`/`--ds-*`;同一屏内与 token 化组件交替出现 | `competitors/page.tsx:81-187` 等 29 处 |
| P2-2 | 全站零个路由级 `loading.tsx`/`error.tsx`;三个子页 loading/error 态完全缺失 | `find app -iname loading.tsx` = 0 |
| P2-3 | "成功/已连接"语义至少 4 种绿(`--good`/`--ds-success`/`emerald-500`/裸 `#16a34a`),其中 GSC 连接状态两处入口用两种绿;红色同理 3 种 | 审查6第三节 |
| P2-4 | 标准空态组件 `EmptyStateCTA` 已存在但 4 处空态无一复用,各写各的纯文字 | `keywords/page.tsx:45-55` 等 |
| P2-5 | 字号 token 阶梯形同虚设:22 处引用 vs 243 处写死 px;`BrandFactRow` 内联十六进制完全绕开两套 token | `globals.css`;`BrandFactRow.tsx:87,115-116` |
| P2-6 | RunProgress 内"查看结果/重试"按钮无样式(浏览器默认外观),与同组件精致的渐变 CTA 反差强烈 | `RunProgress.tsx:212,220`(observed) |
| P2-7 | 子页表格无横向滚动容器(正确模式 `.report-table-wrap` 已存在未复用);三个子页无响应式处理 | `globals.css:3919` 对照 |

---

## 四、优化方案

### 视角一:产品专家——重排信息的"回答顺序"

产品当前的信息组织是**按数据来源分区**(GSC 区、探针区、爬取区……),但用户的心智是**按问题递进**:①我现在怎么样 → ②问题出在哪 → ③我该做什么 → ④做完怎么验证。所有 P1 问题本质上都是这两个顺序的错位。核心原则:**每一屏都要先回答"所以呢",证据向下沉一层,要看随时能看**——这不违反"可验证"铁律,反而是它的正确呈现方式:结论先行 + 证据一键可达,比证据平铺更能建立信任。

**A 包·动线闭环(P0,商业验证前必修,全部是修断裂不是新功能):**
- **A1** reviewGate 接线:调用点把 `pendingCount/totalCount/href` 传入 `RunProgress`,删除死按钮或改为真实导航。文案已全部写好,纯接线工作,成本极低、收益最大。
- **A2** 重访入口:`RunHistory` 对 `status=output` 的行增加「输出」链接;全部 run 子页统一加"← 返回诊断看板"面包屑(现在只有 recommendations 有)。
- **A3** 复测口径产品裁决(三选一,我的推荐是 c):(a) 首条 applied 起算不再顺延;(b) 维持"最后一条 applied +28 天"但 UI 明示口径;(c) **output 页回测卡从纯文字改为"复测计划卡"**:显示当前到期日 + 口径说明 + "调整日期/立即发起复测"按钮(`RetestButton` 已存在,现只挂在项目历史和 screen2)。同时给"已执行"加撤销。
- **A4** prompt 重生成:前端加"重新生成"按钮(带 `regenerate=1`),并在建议 `updatedAt` 晚于 prompt 生成时间时显示"内容已更新,建议重新生成"标记。后端已就绪,纯前端工作。

**B 包·交付物可执行化(P0.5,商业验证前强烈建议):**
- **B1** 规则命中明细流入交付物:`recommend.ts` 拼装时把 `hit.detail` 里的 URL 清单(如 `blockedUrls`)注入 `what` 与行动报告 §3;报告每条计划附"受影响页面(前 N 条)"。
- **B2** 证据引用人话化:行动报告里 `ev_xxx` 替换为"证据类型 + 采集时间 + 关键值"一行摘要(数据已在 evidence 表,纯渲染层工作);系统内则链到 EvidenceDrawer。

**C 包·报告可读性(P1,可放验证期后,但 C1/C2 若有余力优先):**
- **C1** 报告重排为三段式:**第一屏 = 一句人话总结 + "接下来做的 3 件事"(从第 7 段优先级矩阵提炼上移) + 健康分**;五支柱明细、方法论、GEO 补充全部下沉为第二三层。
- **C2** 术语翻译层:建一个 `<Term>` 组件(术语 + hover/点击解释),覆盖 canonical/noindex/4xx/R0-R5/置信下限;`mapWilsonNote` 带进报告命名空间;"渲染差异"裸数字加单位与方向说明。
- **C3** 徽章去重:`FindingCard` 的 ProvenanceTag 与 confidence 文本二选一;证据图例改为 sticky 迷你图例或就近 tooltip。
- **C4** screen2 加 sticky 侧目录(区块锚点),或收敛为"结论 / AI 可见度 / 传统搜索 / 问题清单"四个 tab。
- **C5** PresenceMap 上下区做视觉区分(不同格形/底纹),并在两区标题处硬标注分母:"20 个提问"vs"N 条回答"。
- **C6** 关键词表默认按机会分/点击降序(repo 层加 orderBy),两表合并为单表加"类型"列,或至少同词联动高亮。

### 视角二:UI 专家——把两套语言合成一套

现状不是"没有设计系统",而是**设计系统只覆盖了一半产品**。方向不是重做,是把游离页面迁回已有系统:

**D 包·设计系统整固(P2,验证期后):**
- **D1** site/keywords/competitors 三页迁移到 token 体系:`neutral-*`→`--ds-muted`/`--ds-border`,裸表格→`.report-table`+`.report-table-wrap`,卡片→`.card`。这一步做完,"两个产品"的观感即消失。
- **D2** 语义色收敛为单一映射:成功=`--ds-success`、警告=`--ds-warning`、错误=`--ds-error`、证据四色(`--measured/--inferred/--gap/--good`)注册为 Tailwind 工具类;`BrandFactRow` 内联十六进制全部替换;禁用原生 `emerald/red/amber-*` 表达状态语义(可加 lint 规则)。
- **D3** 路由级兜底:`app/[locale]/runs/[id]/` 下加 `loading.tsx`(骨架屏)与 `error.tsx`(重试入口),三个子页立即获得缺失的两态。
- **D4** 空态统一走 `EmptyStateCTA`(组件已存在,替换 4 处纯文字空态)。
- **D5** 字号 token 务实处理:不回迁存量,新代码强制走 `--text-*` 阶梯;`RunProgress` 两个裸按钮补样式。

### 实施顺序(决策契约)

| 波次 | 内容 | 判断标准 | 时机 |
|---|---|---|---|
| 第 1 波 | A1+A2+A4(纯接线/加链接) | 裁判从项目历史能一路点到 prompt 并复制 | 商业验证前,~1 天量级 |
| 第 2 波 | A3(需你先拍板口径)+B1+B2 | 行动报告可直接发给外包,不需口头补充 | 商业验证前 |
| 第 3 波 | C1+C2 | 不懂 SEO 的站主第一屏读懂"我该做什么" | 验证期内如有余力,否则验证后 |
| 第 4 波 | C3-C6 + D 包 | 全站观感一致、三态齐全 | 验证期后 |

---

## 附录:本次审查中的意外事件(需要你知情)

六个审查代理均被要求只读,但收口 git 快照对比发现 6 个孤儿死代码文件被越权删除:`components/ReportPanel.tsx`、`DeliveryCard.tsx(.test)`、`DeliveryExportActions.tsx`、`PromptCard.tsx(.test)`。核实结论(observed):这些文件在你未提交的 action-report 重构中已失去全部引用(HEAD 中由旧版 output 页引用),删除方向与重构一致、不破坏构建;但**文件上未提交的修改已不可恢复**(HEAD 版本可随时 `git checkout` 找回)。教训已写入陷阱记忆:只读波收口必对 git 快照,只读任务书需加"发现应清理项只报告禁执行"硬约束。
