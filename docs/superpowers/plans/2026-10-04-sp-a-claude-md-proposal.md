# CLAUDE.md 更新建议（SP-A spec §11，待用户批准后再改）

> 本文件只是建议稿。CLAUDE.md 是项目级指令文件，改动需要用户明确批准；批准前保持原样。

## 为什么要改

现有 CLAUDE.md 有三处和现状矛盾，会让后续会话按过时信息工作：

1. 写着 "This repo is **pre-implementation**"，实际已实现并在迭代：
   - 截至 2026-10-04，vitest 全量 205 个文件、1881 个测试；
   - SP-A 可信地基已落地，尚未提交。
2. "Scope discipline" 写着 V0 不做 DataForSEO。实际上 DataForSEO（BYOK）已是关键词、竞品、外链、AIO 的主要数据源，并且在 SP-A 范围内。
3. 没有写明 2026-10-04 用户拍板的范围决策：
   - 只做英文 Google 市场；
   - 排名只做快照与对比，不做每日追踪；
   - 诊断暂不使用 LLM；
   - 报告分站主正文与从业者附录两层。

## 建议改动（逐段）

### 1. `## Project status` 整段替换为

```markdown
## Project status

已实现、正在迭代（2026-10）。vitest 全量约 1900 个测试；能力审计与路线见
`docs/plans/2026-10-03-seo-capability-audit-optimization-plan.md`，子项目 A–G：
A 可信地基（`docs/superpowers/specs/2026-10-04-sp-a-trustworthy-foundation-design.md`）已落地，
B 及以后按审计报告 §8 的顺序推进。`docs/plan-ux.md` 仍是产品原则与数据模型的权威来源，
但其中 V0/V1 的范围划分以本文件「范围」一节为准。
```

### 2. 新增 `## 范围（2026-10-04 用户拍板）`

```markdown
## 范围（2026-10-04 用户拍板）

- 只做英文 Google 市场：每个项目一个主市场，取值见 `lib/markets.ts`（单一真源）；数据模型为多市场预留。
- 品类（`projects.industry`）必须是英文品类描述；建 run 闸门在 5 个入口统一拦截无效品类/市场。
- DataForSEO 在范围内（BYOK，凭据统一经 `resolveDataforseoCredentials` DB>env 解析）。
- 排名只做快照与回测对比，不做每日追踪。
- 诊断规则不使用 LLM（纯确定性规则 + 证据）。
- 报告两层：正文给站主，附录给从业者。
```

### 3. `## Scope discipline` 中删除与现状矛盾的表述

- 删除："**Do not** build ... DataForSEO ..." 中的 DataForSEO。
- 保留：不做多租户计费、Redis、自动发布 CMS、自动外联、确定性 AIO 归因。

### 4. `### Data-model invariants` 补充 SP-A 新增的约定

```markdown
- 采集失败不写证据、不记成 0：失败只体现在 `data_source_statuses`（status=failed + 原因短码）。
- 子阶段状态的 source_key 用「父:子」（冒号，next-intl 会把点号当嵌套路径），清单真源 `lib/runs/source-status.ts` 的 `SUB_SOURCES`。
- 原始响应存 `evidence_raw`（gzip，单条上限 4MB），必须在取数的同一个 Inngest step 内落库，证据写好后再挂 evidence_id。
- 用户填写的目标关键词存 `project_settings.target_keywords`，不写 `keywords` 测量表（测量表有唯一索引与级联外键）。
- 回测原样复用基线 run 的问句集（探针与 AIO），保证同协议对比。
```

### 5. 新增 `## 常用命令`

```markdown
## 常用命令（pnpm）

- `pnpm test` / `pnpm lint` / `pnpm build`
- `pnpm dev`（固定 3000 端口；`GOOGLE_OAUTH_REDIRECT_URI` 必须与之一致）
- Inngest 本地：`pnpm dlx inngest-cli@latest dev --no-discovery -u http://localhost:3000/api/inngest`
- 本地库迁移与重建：见 `docs/runbooks/local-env.md`
```

## 不建议改的部分

- "The core principle that constrains all design" 整段保持不变；SP-A 正是在落实它。
- "语言规范"保持不变。
