#!/usr/bin/env python3
"""
Validate builder entry docs expose the expected daily script chain.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from skill_script_utils import skill_root


def default_skill_md_path() -> Path:
    return skill_root() / "SKILL.md"


def default_quick_reference_path() -> Path:
    return skill_root() / "QUICK_REFERENCE.md"


def default_scripts_readme_path() -> Path:
    return skill_root() / "scripts" / "README.md"


def run_validation(skill_md_path: Path, quick_reference_path: Path, scripts_readme_path: Path) -> tuple[bool, str]:
    errors: list[str] = []

    skill_text = skill_md_path.read_text(encoding="utf-8")
    quick_text = quick_reference_path.read_text(encoding="utf-8")
    readme_text = scripts_readme_path.read_text(encoding="utf-8") if scripts_readme_path.exists() else ""

    if "## 可执行脚本" not in skill_text:
        errors.append("`SKILL.md` 缺少 `## 可执行脚本` 入口区块。")

    for marker in (
        "run_generate_core_skill_snapshot.py",
        "validate_core_skill_snapshot_drift.py",
        "validate_builder_archetype_consistency.py",
        "validate_builder_entrypoints.py",
        "run_script_template_audit.py",
    ):
        if marker not in skill_text:
            errors.append(f"`SKILL.md` 未暴露 `{marker}`。")

    for marker in (
        "SCRIPT_TEMPLATES.md §3.2",
        "scripts/core_skill_script_snapshot.report.md",
        "validate_core_skill_snapshot_drift.py",
        "run_generate_core_skill_snapshot.py",
        "validate_builder_archetype_consistency.py",
        "scripts/README.md",
    ):
        if marker not in quick_text:
            errors.append(f"`QUICK_REFERENCE.md` 未暴露 `{marker}`。")

    if not scripts_readme_path.exists():
        errors.append("缺少 `scripts/README.md` runbook。")
    else:
        for marker in (
            "run_script_template_audit.py --skill-root skills/backend/ai-skill-builder --archetype builder-audit --refresh-generated --strict --with-smoke",
            "core_skill_script_snapshot.previous.json",
            "允许重置基线的场景",
            "必须保留历史差异的场景",
        ):
            if marker not in readme_text:
                errors.append(f"`scripts/README.md` 未说明 `{marker}`。")

    ok = not errors
    status = "PASS" if ok else "FAIL"
    lines = [
        f"[validate-builder-entrypoints] {status}",
        f"skill_md={skill_md_path.as_posix()}",
        f"quick_reference={quick_reference_path.as_posix()}",
        f"scripts_readme={scripts_readme_path.as_posix()}",
    ]
    if errors:
        lines.extend(f"- ERROR: {item}" for item in errors)
    return ok, "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate builder entry docs expose the expected daily script chain.")
    parser.add_argument("--skill-md", type=Path, help="Path to builder SKILL.md")
    parser.add_argument("--quick-reference", type=Path, help="Path to builder QUICK_REFERENCE.md")
    parser.add_argument("--scripts-readme", type=Path, help="Path to builder scripts/README.md")
    args = parser.parse_args()

    ok, report = run_validation(
        (args.skill_md or default_skill_md_path()).resolve(),
        (args.quick_reference or default_quick_reference_path()).resolve(),
        (args.scripts_readme or default_scripts_readme_path()).resolve(),
    )
    print(report)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
