#!/usr/bin/env python3
"""
Run builder-level audits for a target skill's script bundle.
"""

from __future__ import annotations

import argparse
from pathlib import Path
from tempfile import TemporaryDirectory

from validate_builder_archetype_consistency import run_validation as validate_builder_archetype_consistency
from validate_builder_entrypoints import run_validation as validate_builder_entrypoints
from skill_script_utils import ARCHETYPE_CHOICES, infer_archetype, python_command, run_command
from validate_core_skill_snapshot_drift import run_validation as validate_core_skill_snapshot_drift
from validate_reference_rules_schema import run_validation as validate_rules_schema
from validate_script_contracts import run_validation as validate_script_contracts


def run_reference_case_bool_regression() -> tuple[bool, str]:
    from run_generate_reference_rules import run_validation as generate_reference_rules
    from skill_script_utils import load_json

    with TemporaryDirectory() as temp_dir:
        temp_root = Path(temp_dir)
        skill_root = temp_root / "tmp-skill"
        scripts_dir = skill_root / "scripts"
        references_dir = skill_root / "references" / "index"
        scripts_dir.mkdir(parents=True, exist_ok=True)
        references_dir.mkdir(parents=True, exist_ok=True)

        (references_dir / "api-reference.md").write_text("# temp index\n", encoding="utf-8", newline="\n")

        source_path = scripts_dir / "reference_rules.source.md"
        source_path.write_text(
            "\n".join(
                (
                    "## 1. 索引入口",
                    "",
                    "- `references/index/api-reference.md`",
                    "",
                    "## 6. 路由规则",
                    "",
                    "### `redirect_only`",
                    "",
                    "- `keywords`: `联调`",
                    "- `refs`:",
                    "- `route_target`: `ai-api-handoff-bridge`",
                    "- `exclusive`: `true`",
                    "",
                    "## 7. 回归样例",
                    "",
                    "### `bool_case_should_stay_boolean`",
                    "",
                    "- `request_text`: `联调切换到 bridge`",
                    "- `expected_refs`:",
                    "  - `references/index/api-reference.md`",
                    "- `expected_route_target`: `ai-api-handoff-bridge`",
                    "- `expected_route_is_exclusive`: `true`",
                    "",
                )
            ),
            encoding="utf-8",
            newline="\n",
        )

        output_path = scripts_dir / "reference_rules.json"
        report_path = scripts_dir / "reference_rules.report.md"
        success, report = generate_reference_rules(
            skill_root,
            source_path,
            output_path,
            report_path,
            archetype="frontend-specialist",
            check=False,
        )
        if not success:
            return False, f"[builder-bool-regression] FAIL\n- 生成失败\n{report}"

        payload = load_json(output_path)
        if not isinstance(payload, dict):
            return False, "[builder-bool-regression] FAIL\n- 输出 JSON 顶层不是对象。"

        cases = payload.get("validation_cases", [])
        if not isinstance(cases, list):
            return False, "[builder-bool-regression] FAIL\n- `validation_cases` 不是数组。"

        matched_case = next(
            (
                item
                for item in cases
                if isinstance(item, dict) and str(item.get("name", "")).strip() == "bool_case_should_stay_boolean"
            ),
            None,
        )
        if matched_case is None:
            return False, "[builder-bool-regression] FAIL\n- 未找到回归样例 `bool_case_should_stay_boolean`。"

        exclusive_value = matched_case.get("expected_route_is_exclusive")
        if type(exclusive_value) is not bool or exclusive_value is not True:
            return (
                False,
                "[builder-bool-regression] FAIL\n"
                f"- `expected_route_is_exclusive` 期望是布尔 `true`，实际类型={type(exclusive_value).__name__} 值={exclusive_value!r}",
            )

    return True, "[builder-bool-regression] PASS\n- `expected_route_is_exclusive` 已稳定输出为 JSON boolean。"


def refresh_generated_artifacts(target_skill_root: Path, effective_archetype: str) -> tuple[bool, list[str]]:
    reports: list[str] = []
    ok = True
    scripts_dir = target_skill_root / "scripts"

    reference_rules_source: Path | None = None
    for candidate_name in ("reference_rules.source.md", "reference_rules.source.json"):
        candidate = scripts_dir / candidate_name
        if candidate.exists():
            reference_rules_source = candidate
            break

    if reference_rules_source is not None:
        from run_generate_reference_rules import run_validation as generate_reference_rules

        success, report = generate_reference_rules(
            target_skill_root,
            reference_rules_source,
            scripts_dir / "reference_rules.json",
            scripts_dir / "reference_rules.report.md",
            None if effective_archetype == "builder-audit" else effective_archetype,
            check=False,
        )
        ok = ok and success
        reports.append(report)

    if effective_archetype == "builder-audit" and (scripts_dir / "run_generate_core_skill_snapshot.py").exists():
        from run_generate_core_skill_snapshot import run_validation as generate_core_skill_snapshot

        success, report = generate_core_skill_snapshot(
            scripts_dir / "core_skill_script_snapshot.json",
            scripts_dir / "core_skill_script_snapshot.report.md",
            scripts_dir / "core_skill_script_snapshot.previous.json",
            check=False,
            with_audit=True,
        )
        ok = ok and success
        reports.append(report)

    if not reports:
        reports.append("[refresh-generated] PASS\n- 未发现需要刷新的 machine-generated 产物。")
    return ok, reports


def run_smoke_tests(target_skill_root: Path) -> tuple[bool, str]:
    scripts_dir = target_skill_root / "scripts"
    commands: list[list[str]] = []

    if (scripts_dir / "select_references.py").exists():
        commands.append(python_command(scripts_dir / "select_references.py", "--help"))
        commands.append(python_command(scripts_dir / "select_references.py", "脚本模板审计", "--explain"))
    if (scripts_dir / "validate_reference_triggers.py").exists():
        commands.append(python_command(scripts_dir / "validate_reference_triggers.py"))

    for file_name in (
        "run_generate_core_skill_snapshot.py",
        "validate_core_skill_snapshot_drift.py",
        "validate_builder_archetype_consistency.py",
        "validate_builder_entrypoints.py",
        "suggest_script_bundle.py",
        "validate_reference_rules_schema.py",
        "validate_output_templates.py",
        "validate_solution_consistency.py",
        "validate_script_contracts.py",
        "validate_code_references.py",
        "query_doc_map.py",
        "run_generate_reference_rules.py",
        "run_strict_delivery_gate.py",
    ):
        path = scripts_dir / file_name
        if path.exists():
            commands.append(python_command(path, "--help"))

    reports: list[str] = []
    ok = True
    for command in commands:
        success, output = run_command(command, scripts_dir)
        ok = ok and success
        label = " ".join(command[1:])
        reports.append(f"[script-smoke:{label}] {'PASS' if success else 'FAIL'}\n{output}")

    if not reports:
        return True, "[script-smoke] PASS\n- 无可执行命令，跳过冒烟。"
    return ok, "\n".join(reports)


def main() -> int:
    parser = argparse.ArgumentParser(description="Run builder audits for a target skill script bundle.")
    parser.add_argument("--skill-root", type=Path, required=True, help="Target skill root")
    parser.add_argument("--archetype", choices=ARCHETYPE_CHOICES, help="Expected archetype")
    parser.add_argument("--strict", action="store_true", help="Treat warnings as failures")
    parser.add_argument("--with-smoke", action="store_true", help="Also run script CLI smoke tests")
    parser.add_argument(
        "--refresh-generated",
        action="store_true",
        help="Refresh machine-generated artifacts before validations, then continue audit and optional smoke.",
    )
    args = parser.parse_args()

    target_skill_root = args.skill_root.resolve()
    effective_archetype = args.archetype or infer_archetype(target_skill_root)
    scripts_dir = target_skill_root / "scripts"
    reports: list[str] = []
    ok = True

    if args.refresh_generated:
        success, refresh_reports = refresh_generated_artifacts(target_skill_root, effective_archetype)
        ok = ok and success
        reports.extend(refresh_reports)

    success, report = validate_script_contracts(target_skill_root, effective_archetype, args.strict)
    ok = ok and success
    reports.append(report)

    rules_path = scripts_dir / "reference_rules.json"
    if rules_path.exists():
        success, report = validate_rules_schema(rules_path, None if effective_archetype == "builder-audit" else effective_archetype, args.strict)
        ok = ok and success
        reports.append(report)
    else:
        reports.append("[validate-reference-rules-schema] PASS\n- 未发现 reference_rules.json，跳过 schema 校验。")

    snapshot_validator = scripts_dir / "validate_core_skill_snapshot_drift.py"
    if snapshot_validator.exists():
        success, report = validate_core_skill_snapshot_drift(
            target_skill_root / "SCRIPT_TEMPLATES.md",
            scripts_dir / "core_skill_script_snapshot.json",
            scripts_dir / "core_skill_script_snapshot.report.md",
            scripts_dir / "core_skill_script_snapshot.previous.json",
        )
        ok = ok and success
        reports.append(report)

    if (scripts_dir / "validate_builder_archetype_consistency.py").exists():
        success, report = validate_builder_archetype_consistency(
            target_skill_root / "SCRIPT_TEMPLATES.md",
            target_skill_root / "GOVERNANCE_PROFILE_TEMPLATE.md",
        )
        ok = ok and success
        reports.append(report)

    if (scripts_dir / "validate_builder_entrypoints.py").exists():
        success, report = validate_builder_entrypoints(
            target_skill_root / "SKILL.md",
            target_skill_root / "QUICK_REFERENCE.md",
            target_skill_root / "scripts" / "README.md",
        )
        ok = ok and success
        reports.append(report)

    if effective_archetype == "builder-audit":
        success, report = run_reference_case_bool_regression()
        ok = ok and success
        reports.append(report)

    if args.with_smoke:
        success, report = run_smoke_tests(target_skill_root)
        ok = ok and success
        reports.append(report)

    print("\n".join(reports))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
