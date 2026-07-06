# Core Skill Script Capability Snapshot

本文档由 `run_generate_core_skill_snapshot.py` 自动生成，用于固化 3 个核心 skill 当前自持脚本族、升级边界与审计状态；`SCRIPT_TEMPLATES.md §3.2` 应与下方建议回写表保持一致。

## 0. 元信息

| 项目 | 内容 |
|------|------|
| output | `skills/backend/ai-skill-builder/scripts/core_skill_script_snapshot.json` |
| report | `skills/backend/ai-skill-builder/scripts/core_skill_script_snapshot.report.md` |
| previous | `skills/backend/ai-skill-builder/scripts/core_skill_script_snapshot.previous.json` |
| with_audit | `True` |
| skill_count | `3` |

## 1. SCRIPT_TEMPLATES §3.2 建议回写表

| skill | archetype | 当前自持脚本能力 | 当前不自持 / 应升级能力 | 审计快照 |
|------|-----------|------------------|--------------------------|----------|
| `ai-backend-expert` | `backend-source` | 最小可执行脚本族齐全；文档绑定脚本族齐全（`query_doc_map.py`、`validate_code_references.py`、`validate_module_doc_map.py`）；执行门禁齐全（`run_strict_delivery_gate.py`、`run_script_smoke_tests.py`）；领域真源校验齐全（`validate_gorm_model.py`、`validate_mysql_index_truth.py`、`validate_model_sql_truth.py`）；额外自持 DDL / patch 上下文准备与 SQL 语法校验（`prepare_mysql_patch_context.py`、`mysql_schema_tools.py`、`validate_mysql_sql_syntax.py`）；红线门禁已扩展到新增异常链路与日志约束（`validate_error_handling_redlines.py`、`validate_logging_redlines.py`）；下游目录 / 命名同步审计已补齐（`validate_package_file_naming_sync.py`）；专项回归样例执行器已补齐（`run_logging_redlines_case_tests.py`、`run_output_template_case_tests.py`、`run_strict_delivery_gate_case_tests.py`） | 无后端基础规范上游；它本身就是后端真源入口 | `validate_reference_triggers.py` 当前回归样例 `28` 条；builder 审计与 smoke 为 PASS |
| `ai-api-handoff-bridge` | `lightweight-routing` | 最小可执行脚本族存在缺口（缺 ``validate_output_templates.py`、`validate_solution_consistency.py``）；脚本契约 / schema / smoke 闭环齐全；聚焦接口交付包、字段映射、mock 切真实与前端验收桥接 | 不自持后端实现、文档绑定与 strict gate；命中实现 / 正式联调 / 真实接口接入 / `Code Paths` / strict gate 时必须切到 `ai-backend-expert`；命中页面 / 组件 / UI 实现时必须切到匹配场景的前端 skill，管理后台场景通常切 `ai-admin-frontend-expert` | `validate_reference_triggers.py` 当前回归样例 `12` 条；builder 审计与 smoke 为 PASS |
| `ai-admin-frontend-expert` | `frontend-specialist` | 最小可执行脚本族齐全；脚本契约 / schema / smoke 闭环齐全；聚焦前端专题模板与一致性校验 | 不自持 `query_doc_map.py`、`run_strict_delivery_gate.py`；不自持领域真源校验器与后端绑定门禁；命中契约冻结 / mock 切真实 / 字段对齐时必须切到 `ai-api-handoff-bridge`；命中联调执行、`Code Paths`、`docs/_index/module-doc-map/`、代码反查文档、strict gate 或后端命名治理时必须切到 `ai-backend-expert` | `validate_reference_triggers.py` 当前回归样例 `12` 条；builder 审计与 smoke 为 PASS |

## 2. 变更摘要

- `ai-backend-expert`：`validation_cases` `27` -> `28`；审计摘要已变化
- `ai-api-handoff-bridge`：`validation_cases` `11` -> `12`；审计摘要已变化
- `ai-admin-frontend-expert`：无结构变化。

## 3. 明细审计

### ai-backend-expert

| 字段 | 内容 |
|------|------|
| skill_root | `skills/backend/ai-backend-expert` |
| profile | `skills/backend/ai-backend-expert/.meta/GOVERNANCE_PROFILE.md` |
| scripts | `skills/backend/ai-backend-expert/scripts` |
| archetype | `backend-source` |
| validation_cases | `28` |
| capability_summary | 最小可执行脚本族齐全；文档绑定脚本族齐全（`query_doc_map.py`、`validate_code_references.py`、`validate_module_doc_map.py`）；执行门禁齐全（`run_strict_delivery_gate.py`、`run_script_smoke_tests.py`）；领域真源校验齐全（`validate_gorm_model.py`、`validate_mysql_index_truth.py`、`validate_model_sql_truth.py`）；额外自持 DDL / patch 上下文准备与 SQL 语法校验（`prepare_mysql_patch_context.py`、`mysql_schema_tools.py`、`validate_mysql_sql_syntax.py`）；红线门禁已扩展到新增异常链路与日志约束（`validate_error_handling_redlines.py`、`validate_logging_redlines.py`）；下游目录 / 命名同步审计已补齐（`validate_package_file_naming_sync.py`）；专项回归样例执行器已补齐（`run_logging_redlines_case_tests.py`、`run_output_template_case_tests.py`、`run_strict_delivery_gate_case_tests.py`） |
| upgrade_summary | 无后端基础规范上游；它本身就是后端真源入口 |
| audit_summary | `validate_reference_triggers.py` 当前回归样例 `28` 条；builder 审计与 smoke 为 PASS |
| audit_checks | `contract=True` / `schema=True` / `smoke=True` / `overall=True` |
| profile_sha256 | `9cd18e299064802887d8b59fb35adff6c4a10eb357f3a4c2a3a916be1250ae95` |
| reference_rules_sha256 | `b539740226513998126cab8dcbbd05ab107bf7c0d3bf94bd982b84a8eee9f973` |

脚本清单：
- `mysql_schema_tools.py`, `prepare_mysql_patch_context.py`, `query_doc_map.py`, `query_doc_route.py`, `query_error_log.py`, `reference_rules.json`, `run_logging_redlines_case_tests.py`, `run_output_template_case_tests.py`, `run_script_smoke_tests.py`, `run_strict_delivery_gate.py`, `run_strict_delivery_gate_case_tests.py`, `run_summarize_select_history_case_tests.py`, `select_references.py`, `skill_script_utils.py`, `summarize_select_history.py`, `sync_doc_router.py`, `validate_code_references.py`, `validate_error_handling_redlines.py`, `validate_gorm_model.py`, `validate_logging_redlines.py`, `validate_model_sql_truth.py`, `validate_module_doc_map.py`, `validate_mysql_index_truth.py`, `validate_mysql_sql_syntax.py`, `validate_output_templates.py`, `validate_package_file_naming_sync.py`, `validate_reference_rules_schema.py`, `validate_reference_triggers.py`, `validate_script_contracts.py`, `validate_solution_consistency.py`

### ai-api-handoff-bridge

| 字段 | 内容 |
|------|------|
| skill_root | `skills/backend/ai-api-handoff-bridge` |
| profile | `skills/backend/ai-api-handoff-bridge/.meta/GOVERNANCE_PROFILE.md` |
| scripts | `skills/backend/ai-api-handoff-bridge/scripts` |
| archetype | `lightweight-routing` |
| validation_cases | `12` |
| capability_summary | 最小可执行脚本族存在缺口（缺 ``validate_output_templates.py`、`validate_solution_consistency.py``）；脚本契约 / schema / smoke 闭环齐全；聚焦接口交付包、字段映射、mock 切真实与前端验收桥接 |
| upgrade_summary | 不自持后端实现、文档绑定与 strict gate；命中实现 / 正式联调 / 真实接口接入 / `Code Paths` / strict gate 时必须切到 `ai-backend-expert`；命中页面 / 组件 / UI 实现时必须切到匹配场景的前端 skill，管理后台场景通常切 `ai-admin-frontend-expert` |
| audit_summary | `validate_reference_triggers.py` 当前回归样例 `12` 条；builder 审计与 smoke 为 PASS |
| audit_checks | `contract=True` / `schema=True` / `smoke=True` / `overall=True` |
| profile_sha256 | `8d15e747bbccf67b834049b8bd690493d672a93572e515a7070de1467903f034` |
| reference_rules_sha256 | `34b130215a1fdc6dc19318668289d407fea17637a89fa007589e6df2de43e0c7` |

脚本清单：
- `reference_rules.json`, `run_script_smoke_tests.py`, `select_references.py`, `skill_script_utils.py`, `validate_reference_rules_schema.py`, `validate_reference_triggers.py`, `validate_script_contracts.py`

### ai-admin-frontend-expert

| 字段 | 内容 |
|------|------|
| skill_root | `skills/backend/ai-admin-frontend-expert` |
| profile | `skills/backend/ai-admin-frontend-expert/.meta/GOVERNANCE_PROFILE.md` |
| scripts | `skills/backend/ai-admin-frontend-expert/scripts` |
| archetype | `frontend-specialist` |
| validation_cases | `12` |
| capability_summary | 最小可执行脚本族齐全；脚本契约 / schema / smoke 闭环齐全；聚焦前端专题模板与一致性校验 |
| upgrade_summary | 不自持 `query_doc_map.py`、`run_strict_delivery_gate.py`；不自持领域真源校验器与后端绑定门禁；命中契约冻结 / mock 切真实 / 字段对齐时必须切到 `ai-api-handoff-bridge`；命中联调执行、`Code Paths`、`docs/_index/module-doc-map/`、代码反查文档、strict gate 或后端命名治理时必须切到 `ai-backend-expert` |
| audit_summary | `validate_reference_triggers.py` 当前回归样例 `12` 条；builder 审计与 smoke 为 PASS |
| audit_checks | `contract=True` / `schema=True` / `smoke=True` / `overall=True` |
| profile_sha256 | `d463f34af75ac352613ed6eb53feb25f0d1d9f555bfb5e4c11d2a3bc0d5629c2` |
| reference_rules_sha256 | `a34052b95202b5976e01edf14c521a6fd2ef8c9de2671bea9b66394de4a26d28` |

脚本清单：
- `reference_rules.json`, `run_script_smoke_tests.py`, `select_references.py`, `skill_script_utils.py`, `validate_output_templates.py`, `validate_reference_rules_schema.py`, `validate_reference_triggers.py`, `validate_script_contracts.py`, `validate_solution_consistency.py`
