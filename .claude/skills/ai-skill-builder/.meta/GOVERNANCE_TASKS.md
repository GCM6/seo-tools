# 跨 Skill 治理任务单

> 创建时间：2026-04-06
> 最后更新：2026-04-06（backend 台账瘦身后，收口为“当前对齐状态 + 剩余差异”）
> 维护目标：避免三个 skill 在“本地持有能力 / 上游复用能力 / 必须升级切换场景”上再次漂移。

---

## 0. 当前结论

- `ai-backend-expert`、`ai-admin-frontend-expert`、`ai-admin-fullstack-expert` 当前都已形成 `GOVERNANCE_PROFILE.md + CHECKLIST.md + CATALOG.md + MIGRATION.md + REVIEW.md + ISSUES.md` 六件套。
- frontend / fullstack 的首轮治理任务已基本完成，backend 的维护侧入口链与历史台账瘦身也已收口。
- 当前剩余工作重点，不再是补入口文件，而是：
  - 统一三个 profile 的表达密度，避免边界说明再次散开
  - 补强 frontend / fullstack 的 `validation_cases` 与路由回归覆盖面

---

## 1. 已对齐的基础口径

| 维度 | 当前状态 |
|------|------|
| 六件套维护入口 | ✅ 三个 skill 均已补齐 |
| `skill://` 资源路径协议 | ✅ 三个 profile 均已显式声明 |
| builder 读取顺序 | ✅ 已统一为 `GOVERNANCE_PROFILE -> CHECKLIST -> CATALOG -> MIGRATION -> ISSUES -> REVIEW -> ...` |
| 真源规范优先 | ✅ 三个 skill 均已纳入治理口径 |
| 渐进式收口优先 | ✅ 三个 skill 均已显式纳入 |
| 个人系统目录绝对路径禁写 | ✅ 已进入 builder 全局规则与下游治理入口 |

---

## 2. 三个 Skill 的有意差异

| skill | archetype | 本地持有能力 | 上游复用能力 | 必须升级 / 切换场景 |
|------|-----------|--------------|--------------|--------------------|
| `ai-backend-expert` | `backend-source` | 后端基础规范真源、文档绑定校验链、strict gate、领域真源校验、DB 测试 / TDD 主链路 | 无业务规范上游；builder 仅提供元规则与审计方法 | 纯前端专题切 `ai-admin-frontend-expert` / `react-best-practices`；管理后台联调与一体编排切 `ai-admin-fullstack-expert`；skill 治理切 `ai-skill-builder` |
| `ai-admin-frontend-expert` | `frontend-specialist` | 前端专题、UX Packet、页面模型、视觉继承、高密度 / 宽屏布局、测试锚点、前端 code review | `STYLE_GUIDE.md`、`react-best-practices` | 联调、契约冻结、mock 切真实、`Code Paths`、`docs/_index/module-doc-map/`、strict gate 一律切 `ai-admin-fullstack-expert` |
| `ai-admin-fullstack-expert` | `fullstack-orchestrator` | 全栈交付编排、联调 runbook、文档 / 任务模板、`query_doc_map.py`、strict gate、全栈 code review | `ai-backend-expert`、`ai-admin-frontend-expert`、`STYLE_GUIDE.md`、`react-best-practices` | 目录真源一致性、代码绑定完整性、旧异常链路差异门禁、领域真源校验升级到 `ai-backend-expert`；纯前端专题细化继续复用 `ai-admin-frontend-expert` |

---

## 3. 已完成任务回写

| 任务 | 状态 | 备注 |
|------|------|------|
| `T-FE-01` 升级边界矩阵执行化 | ✅ 已完成 | frontend 已把 `integration_redirect` 做成硬触发 |
| `T-FE-02` 测试复盘回写规则补齐 | ✅ 已完成 | REVIEW / ISSUES / code-review 已承接专题复盘 |
| `T-FE-03` 渐进式收口的前端化表达增强 | ✅ 已完成 | 旧锚点 / 页面壳 / mock / 视觉继承已具备退出条件表达 |
| `T-FE-04` 轻量迁移看板评估 | ✅ 已完成 | frontend 已引入 `.meta/MIGRATION.md` |
| `T-FS-01` 文档绑定校验闭环增强 | ✅ 已完成 | fullstack 已明确何时升级到 backend 校验链 |
| `T-FS-02` 旧异常链路差异门禁引入 | ✅ 已完成 | fullstack 已显式升级到 `validate_error_handling_redlines.py` |
| `T-FS-03` DB 测试分级策略显式化 | ✅ 已完成 | fullstack 已显式承接 DB 分级验证口径 |
| `T-FS-04` 全栈迁移看板评估 | ✅ 已完成 | fullstack 已引入 `.meta/MIGRATION.md` |
| backend 维护侧入口链对齐 | ✅ 已完成 | `.meta/CHECKLIST.md`、builder 读取顺序、当前维护视角已对齐 |
| backend 历史台账瘦身 | ✅ 已完成 | 历史记录已下沉到 `.meta/archive/` |

---

## 4. 剩余差异收尾项

### P1：治理画像表达密度继续对齐

| 任务 | 目标文件 | 说明 |
|------|----------|------|
| `T-ALIGN-01` | 三个 skill 的 `.meta/GOVERNANCE_PROFILE.md` | 持续保持“本地持有 / 上游复用 / 必须切换”同构表达；本轮已补齐第一版速览表，后续新增能力时必须同步更新 |

### P1：路由与 `validation_cases` 丰富度复核

| 任务 | 目标文件 | 说明 |
|------|----------|------|
| `T-ROUTE-01` | `ai-admin-frontend-expert/scripts/reference_rules.source.md` | 补足 `assets/`、视觉继承、宽屏 / 紧凑布局、硬切 fullstack 等场景的回归样例 |
| `T-ROUTE-02` | `ai-admin-fullstack-expert/scripts/reference_rules.source.md` | 补足文档绑定、strict gate、runtime safety、gate invariant 等场景的回归样例 |

### P2：维护侧持续轻量化

| 任务 | 目标文件 | 说明 |
|------|----------|------|
| `T-META-01` | `ai-backend-expert/.meta/archive/*` | 后续新增历史记录继续下沉归档，避免主账本再次膨胀 |

---

## 5. 明确不下沉的能力

以下能力继续只保留在 `ai-backend-expert`，不向下游 skill 复制第二套：

| 能力 | 说明 |
|------|------|
| `validate_gorm_model.py` | 属于后端底层领域真源校验，不下沉到 fullstack / frontend |
| `validate_mysql_index_truth.py` | 属于 MySQL 索引真源校验，不下沉到 fullstack / frontend |
| `validate_model_sql_truth.py` | 属于 Model / SQL 真源一致性校验，不下沉到 fullstack / frontend |
| `validate_mysql_sql_syntax.py` | 属于 DDL / SQL 真源预检能力，不下沉到 frontend；fullstack 如需使用，优先升级回 backend-source |
| 第二套后端 API / 响应 / 错误码正文 | 坚持只在 `ai-backend-expert` 维护单一真源 |

---

## 6. 下一步执行顺序

1. 先完成 `T-ROUTE-01`，补强 `ai-admin-frontend-expert` 的回归样例覆盖
2. 再完成 `T-ROUTE-02`，补强 `ai-admin-fullstack-expert` 的回归样例覆盖
3. 后续新增治理能力时，按 `T-ALIGN-01` 的同构表达要求回写三个 profile
