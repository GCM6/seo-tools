#!/usr/bin/env python3
"""
Validate builder archetype definitions stay consistent across code and templates.
"""

from __future__ import annotations

import argparse
import re
from pathlib import Path

from skill_script_utils import ARCHETYPE_BUNDLES, ARCHETYPE_CHOICES, skill_root


def default_script_templates_path() -> Path:
    return skill_root() / "SCRIPT_TEMPLATES.md"


def default_profile_template_path() -> Path:
    return skill_root() / "GOVERNANCE_PROFILE_TEMPLATE.md"


def _extract_backtick_values(text: str) -> list[str]:
    return [item.strip() for item in re.findall(r"`([a-z-]+)`", text) if item.strip()]


def parse_matrix_archetypes(script_templates_path: Path) -> list[str]:
    lines = script_templates_path.read_text(encoding="utf-8").splitlines()
    heading_index: int | None = None
    for index, line in enumerate(lines):
        if line.startswith("## 3. archetype 选型矩阵"):
            heading_index = index
            break
    if heading_index is None:
        raise ValueError("未找到 `SCRIPT_TEMPLATES.md` 的 archetype 选型矩阵。")

    table_rows: list[str] = []
    for index in range(heading_index + 1, len(lines)):
        line = lines[index].rstrip()
        if not line.startswith("|"):
            if table_rows:
                break
            continue
        table_rows.append(line)

    result: list[str] = []
    for row in table_rows[2:]:
        columns = [item.strip() for item in row.strip().strip("|").split("|")]
        if not columns:
            continue
        result.extend(_extract_backtick_values(columns[0]))
    return result


def parse_profile_template_archetypes(profile_template_path: Path) -> list[str]:
    text = profile_template_path.read_text(encoding="utf-8")
    match = re.search(r"\|\s*archetype\s*\|\s*(.+?)\s*\|", text)
    if not match:
        raise ValueError("未找到 `GOVERNANCE_PROFILE_TEMPLATE.md` 中的 archetype 模板行。")
    return _extract_backtick_values(match.group(1))


def run_validation(script_templates_path: Path, profile_template_path: Path) -> tuple[bool, str]:
    errors: list[str] = []
    warnings: list[str] = []

    runtime_archetypes = list(ARCHETYPE_CHOICES)
    bundle_archetypes = list(ARCHETYPE_BUNDLES.keys())
    if runtime_archetypes != bundle_archetypes:
        errors.append(
            f"`ARCHETYPE_CHOICES` 与 `ARCHETYPE_BUNDLES` key 顺序不一致：{runtime_archetypes} vs {bundle_archetypes}"
        )

    try:
        matrix_archetypes = parse_matrix_archetypes(script_templates_path)
    except ValueError as exc:
        errors.append(str(exc))
        matrix_archetypes = []

    try:
        profile_archetypes = parse_profile_template_archetypes(profile_template_path)
    except ValueError as exc:
        errors.append(str(exc))
        profile_archetypes = []

    if matrix_archetypes and matrix_archetypes != runtime_archetypes:
        errors.append(
            f"`SCRIPT_TEMPLATES.md` archetype 矩阵与代码不一致：{matrix_archetypes} vs {runtime_archetypes}"
        )

    if profile_archetypes and profile_archetypes != runtime_archetypes:
        errors.append(
            f"`GOVERNANCE_PROFILE_TEMPLATE.md` archetype 列表与代码不一致：{profile_archetypes} vs {runtime_archetypes}"
        )

    for path in (script_templates_path, profile_template_path):
        text = path.read_text(encoding="utf-8")
        normalized_lines = [
            line for line in text.splitlines() if "不要再写 `lightweight-reference`" not in line
        ]
        if "lightweight-reference" in "\n".join(normalized_lines):
            errors.append(f"`{path.as_posix()}` 仍残留旧 archetype 口径 `lightweight-reference`。")
        if "`builder-audit`" not in text:
            warnings.append(f"`{path.as_posix()}` 未显式出现 `builder-audit`。")

    ok = not errors
    status = "PASS" if ok else "FAIL"
    lines = [
        f"[validate-builder-archetype-consistency] {status}",
        f"script_templates={script_templates_path.as_posix()}",
        f"profile_template={profile_template_path.as_posix()}",
        f"runtime_archetypes={runtime_archetypes}",
    ]
    if errors:
        lines.extend(f"- ERROR: {item}" for item in errors)
    if warnings:
        lines.extend(f"- WARN: {item}" for item in warnings)
    return ok, "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate builder archetype consistency across code and templates.")
    parser.add_argument(
        "--script-templates",
        type=Path,
        help="Path to SCRIPT_TEMPLATES.md. Defaults to builder/SCRIPT_TEMPLATES.md",
    )
    parser.add_argument(
        "--profile-template",
        type=Path,
        help="Path to GOVERNANCE_PROFILE_TEMPLATE.md. Defaults to builder/GOVERNANCE_PROFILE_TEMPLATE.md",
    )
    args = parser.parse_args()

    ok, report = run_validation(
        (args.script_templates or default_script_templates_path()).resolve(),
        (args.profile_template or default_profile_template_path()).resolve(),
    )
    print(report)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
