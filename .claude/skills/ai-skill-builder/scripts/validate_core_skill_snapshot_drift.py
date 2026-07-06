#!/usr/bin/env python3
"""
Validate that SCRIPT_TEMPLATES.md §3.2 and generated snapshot artifacts stay in sync.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from core_skill_snapshot_utils import build_core_skill_snapshot, render_snapshot_report, render_snapshot_table
from run_generate_core_skill_snapshot import (
    default_output_path,
    default_previous_path,
    default_report_path,
    run_validation as validate_snapshot_generation,
)
from skill_script_utils import skill_root


def default_script_templates_path() -> Path:
    return skill_root() / "SCRIPT_TEMPLATES.md"


def extract_section_table(script_templates_path: Path) -> list[str]:
    lines = script_templates_path.read_text(encoding="utf-8").splitlines()
    heading_index: int | None = None
    for index, line in enumerate(lines):
        if line.startswith("### 3.2 "):
            heading_index = index
            break
    if heading_index is None:
        raise ValueError("未找到 `### 3.2` 段落。")

    table_start: int | None = None
    for index in range(heading_index + 1, len(lines)):
        if lines[index].startswith("| skill | archetype |"):
            table_start = index
            break
    if table_start is None:
        raise ValueError("未找到 `SCRIPT_TEMPLATES.md §3.2` 的快照表。")

    table_lines: list[str] = []
    for index in range(table_start, len(lines)):
        line = lines[index].rstrip()
        if not line.startswith("|"):
            if table_lines:
                break
            continue
        table_lines.append(line)

    if len(table_lines) < 3:
        raise ValueError("`SCRIPT_TEMPLATES.md §3.2` 的快照表内容不足。")
    return table_lines


def extract_report_table(report_text: str) -> list[str]:
    lines = report_text.splitlines()
    heading_index: int | None = None
    for index, line in enumerate(lines):
        if line == "## 1. SCRIPT_TEMPLATES §3.2 建议回写表":
            heading_index = index
            break
    if heading_index is None:
        raise ValueError("生成报告缺少 `SCRIPT_TEMPLATES §3.2 建议回写表` 段落。")

    table_lines: list[str] = []
    for index in range(heading_index + 1, len(lines)):
        line = lines[index].rstrip()
        if not line.startswith("|"):
            if table_lines:
                break
            continue
        table_lines.append(line)

    if len(table_lines) < 3:
        raise ValueError("生成报告中的快照表内容不足。")
    return table_lines


def run_validation(
    script_templates_path: Path,
    snapshot_output_path: Path,
    snapshot_report_path: Path,
    snapshot_previous_path: Path,
    with_audit: bool = True,
) -> tuple[bool, str]:
    errors: list[str] = []

    generated_ok, generated_report = validate_snapshot_generation(
        snapshot_output_path,
        snapshot_report_path,
        snapshot_previous_path,
        check=True,
        with_audit=with_audit,
    )
    if not generated_ok:
        errors.append("生成快照产物已漂移，请先重新执行 `run_generate_core_skill_snapshot.py`。")

    snapshot = build_core_skill_snapshot(with_audit=with_audit)
    expected_table = render_snapshot_table(snapshot["skills"])  # type: ignore[index]
    expected_report_text = render_snapshot_report(
        snapshot,
        snapshot_output_path,
        snapshot_report_path,
        snapshot_previous_path,
    )

    try:
        actual_doc_table = extract_section_table(script_templates_path)
    except ValueError as exc:
        errors.append(str(exc))
        actual_doc_table = []

    try:
        report_table = extract_report_table(expected_report_text)
    except ValueError as exc:
        errors.append(str(exc))
        report_table = []

    if report_table and report_table != expected_table:
        errors.append("生成报告中的建议回写表与当前内存快照不一致。")

    if actual_doc_table and actual_doc_table != expected_table:
        errors.append("`SCRIPT_TEMPLATES.md §3.2` 与当前核心 skill 快照不一致。")

    ok = not errors
    status = "PASS" if ok else "FAIL"
    lines = [
        f"[validate-core-skill-snapshot-drift] {status}",
        f"script_templates={script_templates_path.as_posix()}",
        f"snapshot_output={snapshot_output_path.as_posix()}",
        f"snapshot_report={snapshot_report_path.as_posix()}",
        f"snapshot_previous={snapshot_previous_path.as_posix()}",
        f"with_audit={with_audit}",
        generated_report,
    ]
    if actual_doc_table:
        lines.append("expected_table_lines=" + str(len(expected_table)))
        lines.append("actual_table_lines=" + str(len(actual_doc_table)))
    if errors:
        lines.extend(f"- ERROR: {item}" for item in errors)
    return ok, "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate core skill snapshot drift against SCRIPT_TEMPLATES.md §3.2.")
    parser.add_argument(
        "--script-templates",
        type=Path,
        help="Path to SCRIPT_TEMPLATES.md. Defaults to builder/SCRIPT_TEMPLATES.md",
    )
    parser.add_argument(
        "--snapshot-output",
        type=Path,
        help="Path to core_skill_script_snapshot.json. Defaults to builder/scripts/core_skill_script_snapshot.json",
    )
    parser.add_argument(
        "--snapshot-report",
        type=Path,
        help="Path to core_skill_script_snapshot.report.md. Defaults to builder/scripts/core_skill_script_snapshot.report.md",
    )
    parser.add_argument(
        "--snapshot-previous",
        type=Path,
        help="Path to core_skill_script_snapshot.previous.json. Defaults to builder/scripts/core_skill_script_snapshot.previous.json",
    )
    parser.add_argument(
        "--without-audit",
        action="store_true",
        help="Skip per-skill contract/schema/smoke audit when rebuilding expected snapshot.",
    )
    args = parser.parse_args()

    script_templates_path = (args.script_templates or default_script_templates_path()).resolve()
    snapshot_output_path = (args.snapshot_output or default_output_path()).resolve()
    snapshot_report_path = (args.snapshot_report or default_report_path()).resolve()
    snapshot_previous_path = (args.snapshot_previous or default_previous_path()).resolve()
    ok, report = run_validation(
        script_templates_path,
        snapshot_output_path,
        snapshot_report_path,
        snapshot_previous_path,
        with_audit=not args.without_audit,
    )
    print(report)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
