#!/usr/bin/env python3
"""
Validate whether a skill's scripts follow builder script template contracts.
"""

from __future__ import annotations

import argparse
import re
from pathlib import Path

from skill_script_utils import (
    ALLOWED_UTILS_NAMES,
    ARCHETYPE_CHOICES,
    bundle_for,
    detect_duplicate_helpers,
    existing_utils_name,
    has_function,
    has_symbol,
    infer_archetype,
    load_json,
    python_files,
)


def _required_functions(file_name: str) -> tuple[str, ...]:
    if file_name == "select_references.py":
        return ("load_rule_config", "select_references", "explain_selection", "main")
    if file_name == "validate_reference_rules_schema.py":
        return ("run_validation", "main")
    if file_name == "validate_script_contracts.py":
        return ("run_validation", "main")
    if file_name == "validate_core_skill_snapshot_drift.py":
        return ("run_validation", "main")
    if file_name == "validate_builder_archetype_consistency.py":
        return ("run_validation", "main")
    if file_name == "validate_builder_entrypoints.py":
        return ("run_validation", "main")
    if file_name in {"validate_output_templates.py", "validate_solution_consistency.py", "validate_code_references.py"}:
        return ("run_validation", "main")
    if file_name == "query_doc_map.py":
        return ("find_matches", "main")
    if file_name.startswith("run_"):
        return ("main",)
    if file_name.startswith("validate_"):
        return ("main",)
    return ("main",)


def _has_minimal_script_entry_block(skill_md_path: Path) -> bool:
    if not skill_md_path.exists():
        return False
    text = skill_md_path.read_text(encoding="utf-8")
    return "## 可执行脚本" in text


def _warn_bootstrap_wording_drift(target_skill_root: Path) -> list[str]:
    rules_path = target_skill_root / "scripts" / "reference_rules.json"
    if not rules_path.exists():
        return []

    raw = load_json(rules_path)
    if not isinstance(raw, dict):
        return []

    bootstrap_refs = raw.get("bootstrap_refs")
    if not isinstance(bootstrap_refs, list):
        return []

    bootstrap_strings = [item.strip() for item in bootstrap_refs if isinstance(item, str) and item.strip()]
    if len(bootstrap_strings) < 2:
        return []

    index_refs = [item for item in bootstrap_strings if "api-reference.md" in item]
    trigger_refs = [item for item in bootstrap_strings if "trigger-matrix" in item]
    if not index_refs or not trigger_refs:
        return []

    legacy_index_only_patterns = (
        re.compile(r"先读\s+`[^`\n]*api-reference\.md`", flags=re.IGNORECASE),
        re.compile(r"先读取本索引，再", flags=re.IGNORECASE),
        re.compile(r"默认先读取本索引，再", flags=re.IGNORECASE),
        re.compile(r"->\s*[^`\n]*api-reference\.md\s*->\s*scripts/reference_rules\.json", flags=re.IGNORECASE),
    )
    bootstrap_markers = ("默认启动集", "默认启动引用", "启动集", "bootstrap_refs")

    warnings: list[str] = []
    doc_paths = (
        target_skill_root / "SKILL.md",
        target_skill_root / ".meta" / "GOVERNANCE_PROFILE.md",
    )
    for doc_path in doc_paths:
        if not doc_path.exists():
            continue

        text = doc_path.read_text(encoding="utf-8")
        mentions_index = any(ref in text or Path(ref).name in text for ref in index_refs)
        mentions_trigger = any(ref in text or Path(ref).name in text for ref in trigger_refs)
        mentions_bootstrap = any(marker in text for marker in bootstrap_markers)
        hits_legacy_pattern = any(pattern.search(text) for pattern in legacy_index_only_patterns)

        if mentions_index and not mentions_trigger:
            warnings.append(
                f"`{doc_path.relative_to(target_skill_root).as_posix()}` 已提到索引入口，但未同步提到 trigger-matrix；"
                "当前 `reference_rules.json` 已启用 `bootstrap_refs` 双启动集。"
            )
            continue

        if hits_legacy_pattern and not mentions_bootstrap:
            warnings.append(
                f"`{doc_path.relative_to(target_skill_root).as_posix()}` 仍存在“默认只先读索引”的旧口径；"
                "建议改为“索引 + trigger-matrix 共同构成默认启动集”。"
            )

    return warnings


def run_validation(target_skill_root: Path, archetype: str | None = None, strict: bool = False) -> tuple[bool, str]:
    scripts_dir = target_skill_root / "scripts"
    skill_md_path = target_skill_root / "SKILL.md"
    errors: list[str] = []
    warnings: list[str] = []

    if not scripts_dir.exists():
        return False, f"[validate-script-contracts] FAIL\n- 缺少 scripts 目录: {scripts_dir}"

    if not skill_md_path.exists():
        errors.append(f"缺少 `SKILL.md`: {skill_md_path}")

    effective_archetype = archetype or infer_archetype(target_skill_root)
    bundle = bundle_for(effective_archetype)
    existing_names = {path.name for path in python_files(scripts_dir)} | {path.name for path in scripts_dir.glob("*.json")}

    for file_name in bundle["required"]:
        if file_name not in existing_names:
            errors.append(f"缺少 archetype `{effective_archetype}` 的必需脚本: {file_name}")

    for file_name in bundle["recommended"]:
        if file_name not in existing_names:
            warnings.append(f"建议补充 `{file_name}`，以满足 archetype `{effective_archetype}` 的完整模板。")

    if effective_archetype != "builder-audit" and not _has_minimal_script_entry_block(skill_md_path):
        errors.append("`SKILL.md` 缺少“## 可执行脚本”最小脚本入口区块。")

    utils_name = existing_utils_name(scripts_dir)
    if effective_archetype != "builder-audit" and not utils_name:
        warnings.append("未发现共享 utils（`skill_script_utils.py`），后续容易重复 helper。")

    for path in python_files(scripts_dir):
        if path.name in ALLOWED_UTILS_NAMES:
            continue
        for function_name in _required_functions(path.name):
            if not has_function(path, function_name):
                errors.append(f"`{path.name}` 缺少函数: `{function_name}()`")

    select_path = scripts_dir / "select_references.py"
    if select_path.exists():
        if not has_symbol(select_path, "--explain"):
            warnings.append("`select_references.py` 未显式暴露 `--explain` 参数。")
        if not has_symbol(select_path, "--json"):
            warnings.append("`select_references.py` 未显式暴露 `--json` 参数。")

    for path in python_files(scripts_dir):
        if path.name.startswith("run_") and path.name != "run_script_smoke_tests.py":
            if not has_symbol(path, "run_validation"):
                warnings.append(f"`{path.name}` 未发现 `run_validation` 编排痕迹，确认其是否只是 CLI 包装。")

    duplicates = detect_duplicate_helpers(scripts_dir)
    for helper_name, hits in duplicates.items():
        warnings.append(f"公共 helper `{helper_name}` 在多个脚本重复定义: {hits}")

    warnings.extend(_warn_bootstrap_wording_drift(target_skill_root))

    ok = not errors and (not strict or not warnings)
    status = "PASS" if ok else "FAIL"
    lines = [
        f"[validate-script-contracts] {status}",
        f"skill_root={target_skill_root.as_posix()}",
        f"archetype={effective_archetype}",
    ]
    if utils_name:
        lines.append(f"utils={utils_name}")
    if errors:
        lines.extend(f"- ERROR: {item}" for item in errors)
    if warnings:
        lines.extend(f"- WARN: {item}" for item in warnings)
    return ok, "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate a skill's scripts against builder contracts.")
    parser.add_argument("--skill-root", type=Path, required=True, help="Target skill root")
    parser.add_argument("--archetype", choices=ARCHETYPE_CHOICES, help="Expected archetype")
    parser.add_argument("--strict", action="store_true", help="Treat warnings as failures")
    args = parser.parse_args()

    ok, report = run_validation(args.skill_root.resolve(), args.archetype, args.strict)
    print(report)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
