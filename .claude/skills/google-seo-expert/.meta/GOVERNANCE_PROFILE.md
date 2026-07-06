# google-seo-expert 治理画像

## 0. 元信息

| 项目 | 内容 |
|------|------|
| skill | `google-seo-expert` |
| archetype | `lightweight-routing` |
| 治理定位 | 外贸 B2B 独立站谷歌 SEO 全生命周期专家：单线流程承载指导/诊断/优化，知识真源沉淀在 `docs/` 与 `references/` |
| 当前状态 | 生效中 |
| 最后更新 | `2026-07-03`（新增官方勘误层 `references/10-official-corrections.md`） |

## 1. 正文真源入口

- 必读入口：`SKILL.md`
- 本地索引与路由真源：`references/reference-index.md` + `references/trigger-matrix.md`（共同构成默认启动集）
- 执行真源：`references/00-glossary.md` + `references/01..09-*.md`（按主线八站 + 横切 S9）
- 官方勘误真源：`references/10-official-corrections.md`（横切；docs 与谷歌官方冲突处的修正口径 + 三级证据标注，优先级高于 docs 蒸馏内容）
- 领域真源（上游）：仓库 `docs/seo.md` + `docs/seo1.md`～`docs/seo5.md` + `docs/seo06.md`
- 可执行真源：`N/A`（lightweight-routing，不维护 reference_rules.json / 选择器脚本）
- 脚本配置真源：`N/A`
- 资源路径协议：本 skill 用仓库相对路径引用 `docs/` 与 `references/`，不使用 `skill://`

## 2. `.meta` 治理入口

- 本地治理资产：`.meta/GOVERNANCE_PROFILE.md`、`.meta/CHECKLIST.md`、`.meta/debug-output.md`
- builder 读取顺序：`GOVERNANCE_PROFILE -> CHECKLIST -> (CATALOG/ISSUES/REVIEW 暂未建立)`
- 启动资源：`SKILL.md` + `references/reference-index.md` + `references/trigger-matrix.md`

## 3. 默认脚本族

| 脚本族 | 结论 | 说明 |
|--------|------|------|
| 最小可执行脚本族 | N/A | 知识型 skill，无运行时脚本 |
| 文档绑定型脚本族 | N/A | 路由用 `trigger-matrix.md`（人读 + LLM 消费），未脚本化 |
| 执行门禁型脚本族 | N/A | 无构建/测试/交付门禁 |
| 领域真源校验型脚本族 | N/A | 真源是 `docs/` 文档，无代码校验 |
| 治理审计型脚本族 | N/A | 由 builder 侧治理 |

## 3.1 启动期脚本摘要

| 场景 | 首选脚本 | 必用时机 | 备注 |
|------|----------|----------|------|
| reference 路由选择 | `N/A` | 每次进入任务 | 改用人读路由：`reference-index.md` + `trigger-matrix.md` |
| 路由规则生成/回归 | `N/A` | — | 不维护 reference_rules 体系 |
| machine-generated 快照 | `N/A` | — | 无 |

## 4. 强制联动文件

| 变更类型 | 必须同步 |
|----------|----------|
| `docs/` 领域真源更新 | 对应 `references/0X-*.md` + `references/reference-index.md` 的来源对照 + `SKILL.md` BLOCKERS 尾注 |
| 新增主线站/reference | `reference-index.md`、`trigger-matrix.md`、`SKILL.md §6.1` 主线八站清单 |
| 术语新增/改名 | `references/00-glossary.md`（唯一术语真源），其他文件只引用 |
| BLOCKERS 红线变更 | `SKILL.md §7`、对应 reference 的「红线」节、`.meta/CHECKLIST.md` |
| 谷歌官方政策更新 | `references/10-official-corrections.md` 条目（附核实日期与官方原文）+ 受影响 reference 行内标注 + 涉红线时 `SKILL.md §7` |

## 5. 真源复用与边界

- 上游真源：`docs/`（瑜东谷歌SEO 视频/笔记总结）。本 skill 不发明 docs 之外的 SEO 主张。
- 本地持有能力：把 docs 蒸馏为可路由、可执行的 SEO 指导/诊断/优化规范。
- 真源规范优先：与谷歌官方最新政策冲突时以官方为准，并向用户提示「docs 内容反映其撰写时点」。官方勘误统一沉淀在 `references/10-official-corrections.md`，不改写 docs 原文（历史笔记记录）。
- 渐进式收口：docs 迭代时增量刷新对应 reference，不做大爆炸重写。

## 6. 允许例外

| 项目 | 例外说明 | 留档位置 |
|------|----------|----------|
| 时效性结论 | 工具名/算法状态/价格等会过时（如 KWFinder 停用、CPC 均价、某词 KD 案例） | 各 reference 行内标注来源章节，便于追溯原文时点 |

## 7. 暂不治理项

- `.meta/CATALOG.md` / `REVIEW.md` / `ISSUES.md` / `MIGRATION.md`：首版未建立，按需补。
- `scripts/`、`templates/`：保留空目录占位，当前无脚本/模板资产。

## 8. 迁移状态

- 当前阶段：首版创建完成（SKILL + 12 个 references + .meta 三件套）。
- 下一步：随 `docs/` 更新增量刷新 references；如需脚本化路由再升级脚本族。
