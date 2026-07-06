#!/usr/bin/env python3
"""
Shared builders for the core skill script capability snapshot.
"""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

from skill_script_utils import infer_archetype, load_json, normalize_relative_path, python_command, run_command, workspace_root


CORE_SKILLS: tuple[dict[str, str], ...] = (
    {
        "skill": "ai-backend-expert",
        "relative_root": "skills/backend/ai-backend-expert",
    },
    {
        "skill": "ai-api-handoff-bridge",
        "relative_root": "skills/backend/ai-api-handoff-bridge",
    },
    {
        "skill": "ai-admin-frontend-expert",
        "relative_root": "skills/backend/ai-admin-frontend-expert",
    },
)

MINIMAL_SCRIPT_SET = {
    "reference_rules.json",
    "select_references.py",
    "validate_reference_triggers.py",
    "validate_output_templates.py",
    "validate_solution_consistency.py",
}

SCHEMA_CONTRACT_SMOKE_SET = {
    "validate_reference_rules_schema.py",
    "validate_script_contracts.py",
    "run_script_smoke_tests.py",
}

BACKEND_DOC_BINDING_SET = {
    "query_doc_map.py",
    "validate_code_references.py",
    "validate_module_doc_map.py",
}

BACKEND_TRUTH_SET = {
    "validate_gorm_model.py",
    "validate_mysql_index_truth.py",
    "validate_model_sql_truth.py",
}

BACKEND_SQL_PRECHECK_SET = {
    "prepare_mysql_patch_context.py",
    "mysql_schema_tools.py",
    "validate_mysql_sql_syntax.py",
}

BACKEND_REDLINE_SET = {
    "validate_error_handling_redlines.py",
    "validate_logging_redlines.py",
}

BACKEND_SYNC_AUDIT_SET = {
    "validate_package_file_naming_sync.py",
}

BACKEND_CASE_RUNNER_SET = {
    "run_logging_redlines_case_tests.py",
    "run_output_template_case_tests.py",
    "run_strict_delivery_gate_case_tests.py",
}

FRONTEND_FULLSTACK_UPGRADE_SET = {
    "query_doc_map.py",
    "run_strict_delivery_gate.py",
}


def ordered_unique(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result


def repo_relative(path: Path) -> str:
    return normalize_relative_path(workspace_root(), path)


def render_code_list(file_names: list[str]) -> str:
    return "、".join(f"`{name}`" for name in file_names)


def file_digest(path: Path) -> str:
    return hashlib.sha256(path.read_text(encoding="utf-8").encode("utf-8")).hexdigest()


def skill_root_from_relative(relative_root: str) -> Path:
    return workspace_root() / relative_root


def load_script_names(skill_root: Path) -> set[str]:
    scripts_dir = skill_root / "scripts"
    names: set[str] = set()
    if not scripts_dir.exists():
        return names
    for path in scripts_dir.iterdir():
        if path.is_file() and path.suffix in {".py", ".json"}:
            names.add(path.name)
    return names


def load_validation_cases_count(skill_root: Path) -> int:
    rules_path = skill_root / "scripts" / "reference_rules.json"
    if not rules_path.exists():
        return 0
    raw = load_json(rules_path)
    if not isinstance(raw, dict):
        return 0
    cases = raw.get("validation_cases", [])
    return len(cases) if isinstance(cases, list) else 0


def collect_trigger_case_count(skill_root: Path) -> int:
    scripts_dir = skill_root / "scripts"
    validator_path = scripts_dir / "validate_reference_triggers.py"
    fallback = load_validation_cases_count(skill_root)
    if not validator_path.exists():
        return fallback

    success, output = run_command(python_command(validator_path), scripts_dir)
    if not success:
        return fallback

    patterns = (
        r"Reference trigger validation passed:\s*(\d+)\s*cases",
        r"已回归样例数量:\s*(\d+)",
        r"validation passed:\s*(\d+)\s*cases",
    )
    for pattern in patterns:
        match = re.search(pattern, output, flags=re.IGNORECASE)
        if match:
            return int(match.group(1))
    return fallback


def summarize_backend_capabilities(script_names: set[str]) -> str:
    parts: list[str] = []
    if MINIMAL_SCRIPT_SET.issubset(script_names):
        parts.append("最小可执行脚本族齐全")
    else:
        missing = sorted(MINIMAL_SCRIPT_SET - script_names)
        parts.append(f"最小可执行脚本族存在缺口（缺 `{render_code_list(missing)}`）")

    if BACKEND_DOC_BINDING_SET.issubset(script_names):
        parts.append(
            "文档绑定脚本族齐全（`query_doc_map.py`、`validate_code_references.py`、`validate_module_doc_map.py`）"
        )
    else:
        existing = sorted(BACKEND_DOC_BINDING_SET & script_names)
        if existing:
            parts.append(f"文档绑定脚本族部分自持（{render_code_list(existing)}）")

    if {"run_strict_delivery_gate.py", "run_script_smoke_tests.py"}.issubset(script_names):
        parts.append("执行门禁齐全（`run_strict_delivery_gate.py`、`run_script_smoke_tests.py`）")

    if BACKEND_TRUTH_SET.issubset(script_names):
        parts.append(
            "领域真源校验齐全（`validate_gorm_model.py`、`validate_mysql_index_truth.py`、`validate_model_sql_truth.py`）"
        )
    else:
        existing_truth = sorted(BACKEND_TRUTH_SET & script_names)
        if existing_truth:
            parts.append(f"领域真源校验部分自持（{render_code_list(existing_truth)}）")

    if BACKEND_SQL_PRECHECK_SET.issubset(script_names):
        parts.append(
            "额外自持 DDL / patch 上下文准备与 SQL 语法校验（`prepare_mysql_patch_context.py`、`mysql_schema_tools.py`、`validate_mysql_sql_syntax.py`）"
        )

    if BACKEND_REDLINE_SET.issubset(script_names):
        parts.append(
            "红线门禁已扩展到新增异常链路与日志约束（`validate_error_handling_redlines.py`、`validate_logging_redlines.py`）"
        )

    if BACKEND_SYNC_AUDIT_SET.issubset(script_names):
        parts.append("下游目录 / 命名同步审计已补齐（`validate_package_file_naming_sync.py`）")
    else:
        existing_sync = sorted(BACKEND_SYNC_AUDIT_SET & script_names)
        if existing_sync:
            parts.append(f"下游目录 / 命名同步审计部分自持（{render_code_list(existing_sync)}）")

    if BACKEND_CASE_RUNNER_SET.issubset(script_names):
        parts.append(
            "专项回归样例执行器已补齐（`run_logging_redlines_case_tests.py`、`run_output_template_case_tests.py`、`run_strict_delivery_gate_case_tests.py`）"
        )
    else:
        existing_case_runners = sorted(BACKEND_CASE_RUNNER_SET & script_names)
        if existing_case_runners:
            parts.append(f"专项回归样例执行器部分自持（{render_code_list(existing_case_runners)}）")

    return "；".join(parts)


def summarize_bridge_capabilities(script_names: set[str]) -> str:
    parts: list[str] = []
    if MINIMAL_SCRIPT_SET.issubset(script_names):
        parts.append("最小可执行脚本族齐全")
    else:
        missing = sorted(MINIMAL_SCRIPT_SET - script_names)
        parts.append(f"最小可执行脚本族存在缺口（缺 `{render_code_list(missing)}`）")

    if SCHEMA_CONTRACT_SMOKE_SET.issubset(script_names):
        parts.append("脚本契约 / schema / smoke 闭环齐全")
    else:
        existing = sorted(SCHEMA_CONTRACT_SMOKE_SET & script_names)
        if existing:
            parts.append(f"脚本契约 / schema / smoke 闭环部分自持（{render_code_list(existing)}）")

    parts.append("聚焦接口交付包、字段映射、mock 切真实与前端验收桥接")
    return "；".join(parts)


def summarize_frontend_capabilities(script_names: set[str]) -> str:
    parts: list[str] = []
    if MINIMAL_SCRIPT_SET.issubset(script_names):
        parts.append("最小可执行脚本族齐全")
    else:
        missing = sorted(MINIMAL_SCRIPT_SET - script_names)
        parts.append(f"最小可执行脚本族存在缺口（缺 `{render_code_list(missing)}`）")

    if SCHEMA_CONTRACT_SMOKE_SET.issubset(script_names):
        parts.append("脚本契约 / schema / smoke 闭环齐全")
    else:
        existing = sorted(SCHEMA_CONTRACT_SMOKE_SET & script_names)
        if existing:
            parts.append(f"脚本契约 / schema / smoke 闭环部分自持（{render_code_list(existing)}）")

    parts.append("聚焦前端专题模板与一致性校验")
    return "；".join(parts)


def summarize_backend_upgrade(_: set[str]) -> str:
    return "无后端基础规范上游；它本身就是后端真源入口"


def summarize_bridge_upgrade(_: set[str]) -> str:
    parts: list[str] = [
        "不自持后端实现、文档绑定与 strict gate",
        "命中实现 / 正式联调 / 真实接口接入 / `Code Paths` / strict gate 时必须切到 `ai-backend-expert`",
        "命中页面 / 组件 / UI 实现时必须切到匹配场景的前端 skill，管理后台场景通常切 `ai-admin-frontend-expert`",
    ]
    return "；".join(parts)


def summarize_frontend_upgrade(script_names: set[str]) -> str:
    missing = sorted(FRONTEND_FULLSTACK_UPGRADE_SET - script_names)
    parts: list[str] = []
    if missing:
        parts.append(f"不自持 {render_code_list(missing)}")
    else:
        parts.append("不自持 fullstack 级联调 / strict gate 编排")
    parts.append("不自持领域真源校验器与后端绑定门禁")
    parts.append("命中契约冻结 / mock 切真实 / 字段对齐时必须切到 `ai-api-handoff-bridge`")
    parts.append("命中联调执行、`Code Paths`、`docs/_index/module-doc-map/`、代码反查文档、strict gate 或后端命名治理时必须切到 `ai-backend-expert`")
    return "；".join(parts)


def collect_audit_summary(skill_root: Path, archetype: str) -> dict[str, object]:
    from run_script_template_audit import run_smoke_tests
    from validate_reference_rules_schema import run_validation as validate_reference_rules_schema
    from validate_script_contracts import run_validation as validate_script_contracts

    scripts_dir = skill_root / "scripts"
    contract_ok, _ = validate_script_contracts(skill_root, archetype, True)
    rules_path = scripts_dir / "reference_rules.json"
    if rules_path.exists():
        schema_ok, _ = validate_reference_rules_schema(rules_path, None if archetype == "builder-audit" else archetype, True)
    else:
        schema_ok = True
    smoke_ok, _ = run_smoke_tests(skill_root)
    overall = contract_ok and schema_ok and smoke_ok
    return {
        "contract": contract_ok,
        "schema": schema_ok,
        "smoke": smoke_ok,
        "overall": overall,
        "trigger_case_count": collect_trigger_case_count(skill_root),
    }


def build_skill_snapshot(skill_spec: dict[str, str], with_audit: bool = True) -> dict[str, object]:
    skill_root = skill_root_from_relative(skill_spec["relative_root"])
    profile_path = skill_root / ".meta" / "GOVERNANCE_PROFILE.md"
    scripts_dir = skill_root / "scripts"
    script_names = load_script_names(skill_root)
    archetype = infer_archetype(skill_root)
    validation_cases_count = load_validation_cases_count(skill_root)

    if skill_spec["skill"] == "ai-backend-expert":
        capability_summary = summarize_backend_capabilities(script_names)
        upgrade_summary = summarize_backend_upgrade(script_names)
    elif skill_spec["skill"] == "ai-api-handoff-bridge":
        capability_summary = summarize_bridge_capabilities(script_names)
        upgrade_summary = summarize_bridge_upgrade(script_names)
    else:
        capability_summary = summarize_frontend_capabilities(script_names)
        upgrade_summary = summarize_frontend_upgrade(script_names)

    audit_checks: dict[str, object]
    if with_audit:
        audit_checks = collect_audit_summary(skill_root, archetype)
        trigger_case_count = audit_checks.get("trigger_case_count")
        if isinstance(trigger_case_count, int) and trigger_case_count > 0:
            validation_cases_count = trigger_case_count
        audit_status = "PASS" if audit_checks["overall"] else "FAIL"
        audit_summary = (
            f"`validate_reference_triggers.py` 当前回归样例 `{validation_cases_count}` 条；"
            f"builder 审计与 smoke 为 {audit_status}"
        )
    else:
        audit_checks = {
            "contract": None,
            "schema": None,
            "smoke": None,
            "overall": None,
        }
        audit_summary = f"`validate_reference_triggers.py` 当前回归样例 `{validation_cases_count}` 条；未执行 builder 审计"

    return {
        "skill": skill_spec["skill"],
        "skill_root": repo_relative(skill_root),
        "profile_path": repo_relative(profile_path),
        "scripts_dir": repo_relative(scripts_dir),
        "archetype": archetype,
        "script_names": sorted(script_names),
        "validation_cases_count": validation_cases_count,
        "capability_summary": capability_summary,
        "upgrade_summary": upgrade_summary,
        "audit_summary": audit_summary,
        "audit_checks": audit_checks,
        "profile_sha256": file_digest(profile_path),
        "reference_rules_sha256": file_digest(scripts_dir / "reference_rules.json"),
    }


def build_core_skill_snapshot(with_audit: bool = True) -> dict[str, object]:
    skills = [build_skill_snapshot(skill_spec, with_audit=with_audit) for skill_spec in CORE_SKILLS]
    return {
        "snapshot_kind": "core-skill-script-capability",
        "generator": "skills/backend/ai-skill-builder/scripts/run_generate_core_skill_snapshot.py",
        "with_audit": with_audit,
        "skills": skills,
    }


def render_snapshot_table(skills: list[dict[str, object]]) -> list[str]:
    lines = [
        "| skill | archetype | 当前自持脚本能力 | 当前不自持 / 应升级能力 | 审计快照 |",
        "|------|-----------|------------------|--------------------------|----------|",
    ]
    for item in skills:
        lines.append(
            f"| `{item['skill']}` | `{item['archetype']}` | {item['capability_summary']} | "
            f"{item['upgrade_summary']} | {item['audit_summary']} |"
        )
    return lines


def render_snapshot_json(snapshot: dict[str, object]) -> str:
    return json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n"


def load_snapshot_file(path: Path) -> dict[str, object] | None:
    if not path.exists():
        return None
    raw = load_json(path)
    return raw if isinstance(raw, dict) else None


def snapshot_skill_map(snapshot: dict[str, object] | None) -> dict[str, dict[str, object]]:
    if not snapshot:
        return {}
    skills = snapshot.get("skills")
    if not isinstance(skills, list):
        return {}
    result: dict[str, dict[str, object]] = {}
    for item in skills:
        if not isinstance(item, dict):
            continue
        skill_name = item.get("skill")
        if isinstance(skill_name, str) and skill_name.strip():
            result[skill_name.strip()] = item
    return result


def render_change_summary(snapshot: dict[str, object], previous_snapshot: dict[str, object] | None) -> list[str]:
    current_skills = snapshot_skill_map(snapshot)
    previous_skills = snapshot_skill_map(previous_snapshot)
    lines = ["## 2. 变更摘要", ""]

    if not previous_skills:
        lines.append("- 当前缺少 `previous snapshot` 基线；本次视为首次生成或尚未建立上一版对照。")
        return lines

    changed = False
    for skill_name in ordered_unique([*current_skills.keys(), *previous_skills.keys()]):
        current = current_skills.get(skill_name)
        previous = previous_skills.get(skill_name)
        if current is None:
            changed = True
            lines.append(f"- `{skill_name}`：已从当前快照移除。")
            continue
        if previous is None:
            changed = True
            lines.append(f"- `{skill_name}`：新纳入当前快照。")
            continue

        skill_changes: list[str] = []
        current_archetype = str(current.get("archetype", "")).strip()
        previous_archetype = str(previous.get("archetype", "")).strip()
        if current_archetype != previous_archetype:
            skill_changes.append(f"archetype `{previous_archetype}` -> `{current_archetype}`")

        current_cases = int(current.get("validation_cases_count", 0))
        previous_cases = int(previous.get("validation_cases_count", 0))
        if current_cases != previous_cases:
            skill_changes.append(f"`validation_cases` `{previous_cases}` -> `{current_cases}`")

        current_scripts = set(current.get("script_names", [])) if isinstance(current.get("script_names"), list) else set()
        previous_scripts = set(previous.get("script_names", [])) if isinstance(previous.get("script_names"), list) else set()
        added_scripts = sorted(current_scripts - previous_scripts)
        removed_scripts = sorted(previous_scripts - current_scripts)
        if added_scripts:
            skill_changes.append(f"新增脚本 {render_code_list(added_scripts)}")
        if removed_scripts:
            skill_changes.append(f"移除脚本 {render_code_list(removed_scripts)}")

        for field_name, label in (
            ("capability_summary", "能力摘要"),
            ("upgrade_summary", "升级边界"),
            ("audit_summary", "审计摘要"),
        ):
            if str(current.get(field_name, "")).strip() != str(previous.get(field_name, "")).strip():
                skill_changes.append(f"{label}已变化")

        if skill_changes:
            changed = True
            lines.append(f"- `{skill_name}`：{'；'.join(skill_changes)}")
        else:
            lines.append(f"- `{skill_name}`：无结构变化。")

    if not changed:
        lines.append("- 所有核心 skill 相对上一版快照均无结构变化。")
    return lines


def render_snapshot_report(
    snapshot: dict[str, object],
    output_path: Path,
    report_path: Path,
    previous_path: Path | None = None,
    previous_snapshot: dict[str, object] | None = None,
) -> str:
    skills = snapshot["skills"]
    assert isinstance(skills, list)
    lines: list[str] = [
        "# Core Skill Script Capability Snapshot",
        "",
        "本文档由 `run_generate_core_skill_snapshot.py` 自动生成，用于固化 3 个核心 skill 当前自持脚本族、升级边界与审计状态；`SCRIPT_TEMPLATES.md §3.2` 应与下方建议回写表保持一致。",
        "",
        "## 0. 元信息",
        "",
        "| 项目 | 内容 |",
        "|------|------|",
        f"| output | `{repo_relative(output_path)}` |",
        f"| report | `{repo_relative(report_path)}` |",
        f"| previous | `{repo_relative(previous_path)}` |" if previous_path else "| previous | `N/A` |",
        f"| with_audit | `{snapshot['with_audit']}` |",
        f"| skill_count | `{len(skills)}` |",
        "",
        "## 1. SCRIPT_TEMPLATES §3.2 建议回写表",
        "",
    ]
    lines.extend(render_snapshot_table(skills))
    lines.extend(["", *render_change_summary(snapshot, previous_snapshot), ""])
    lines.extend(
        [
            "## 3. 明细审计",
            "",
        ]
    )

    for item in skills:
        lines.extend(
            [
                f"### {item['skill']}",
                "",
                "| 字段 | 内容 |",
                "|------|------|",
                f"| skill_root | `{item['skill_root']}` |",
                f"| profile | `{item['profile_path']}` |",
                f"| scripts | `{item['scripts_dir']}` |",
                f"| archetype | `{item['archetype']}` |",
                f"| validation_cases | `{item['validation_cases_count']}` |",
                f"| capability_summary | {item['capability_summary']} |",
                f"| upgrade_summary | {item['upgrade_summary']} |",
                f"| audit_summary | {item['audit_summary']} |",
                f"| audit_checks | `contract={item['audit_checks']['contract']}` / `schema={item['audit_checks']['schema']}` / `smoke={item['audit_checks']['smoke']}` / `overall={item['audit_checks']['overall']}` |",
                f"| profile_sha256 | `{item['profile_sha256']}` |",
                f"| reference_rules_sha256 | `{item['reference_rules_sha256']}` |",
                "",
                "脚本清单：",
                f"- {', '.join(f'`{name}`' for name in item['script_names'])}",
                "",
            ]
        )

    return "\n".join(lines).rstrip() + "\n"
