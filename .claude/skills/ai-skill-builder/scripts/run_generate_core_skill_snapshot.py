#!/usr/bin/env python3
"""
Generate the builder's core skill script capability snapshot.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from core_skill_snapshot_utils import (
    build_core_skill_snapshot,
    load_snapshot_file,
    render_snapshot_json,
    render_snapshot_report,
)
from skill_script_utils import skill_root


def default_output_path() -> Path:
    return skill_root() / "scripts" / "core_skill_script_snapshot.json"


def default_report_path() -> Path:
    return skill_root() / "scripts" / "core_skill_script_snapshot.report.md"


def default_previous_path() -> Path:
    return skill_root() / "scripts" / "core_skill_script_snapshot.previous.json"


def run_validation(
    output_path: Path,
    report_path: Path,
    previous_path: Path,
    check: bool = False,
    with_audit: bool = True,
) -> tuple[bool, str]:
    snapshot = build_core_skill_snapshot(with_audit=with_audit)
    json_text = render_snapshot_json(snapshot)

    previous_snapshot = load_snapshot_file(previous_path)
    existing_output_text = output_path.read_text(encoding="utf-8") if output_path.exists() else None
    if not check and existing_output_text and existing_output_text != json_text:
        previous_path.write_text(existing_output_text, encoding="utf-8", newline="\n")
        previous_snapshot = load_snapshot_file(previous_path)

    report_text = render_snapshot_report(snapshot, output_path, report_path, previous_path, previous_snapshot)

    errors: list[str] = []
    if check:
        if not output_path.exists():
            errors.append(f"缺少快照文件：{output_path.as_posix()}")
        elif output_path.read_text(encoding="utf-8") != json_text:
            errors.append("`core_skill_script_snapshot.json` 已过时，请先重新生成。")

        if not report_path.exists():
            errors.append(f"缺少快照报告：{report_path.as_posix()}")
        elif report_path.read_text(encoding="utf-8") != report_text:
            errors.append("`core_skill_script_snapshot.report.md` 已过时，请先重新生成。")
    else:
        output_path.write_text(json_text, encoding="utf-8", newline="\n")
        report_path.write_text(report_text, encoding="utf-8", newline="\n")

    ok = not errors
    status = "PASS" if ok else "FAIL"
    lines = [
        f"[generate-core-skill-snapshot] {status}",
        f"output={output_path.as_posix()}",
        f"report={report_path.as_posix()}",
        f"previous={previous_path.as_posix()}",
        f"with_audit={with_audit}",
    ]
    if errors:
        lines.extend(f"- ERROR: {item}" for item in errors)
    return ok, "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate the builder core skill script capability snapshot.")
    parser.add_argument(
        "--output",
        type=Path,
        help="Path to generated core_skill_script_snapshot.json. Defaults to builder/scripts/core_skill_script_snapshot.json",
    )
    parser.add_argument(
        "--report",
        type=Path,
        help="Path to generated core_skill_script_snapshot.report.md. Defaults to builder/scripts/core_skill_script_snapshot.report.md",
    )
    parser.add_argument(
        "--previous",
        type=Path,
        help="Path to previous core skill snapshot baseline. Defaults to builder/scripts/core_skill_script_snapshot.previous.json",
    )
    parser.add_argument("--check", action="store_true", help="Only validate generated files against current snapshot.")
    parser.add_argument(
        "--without-audit",
        action="store_true",
        help="Skip per-skill contract/schema/smoke audit when building the snapshot.",
    )
    args = parser.parse_args()

    output_path = (args.output or default_output_path()).resolve()
    report_path = (args.report or default_report_path()).resolve()
    previous_path = (args.previous or default_previous_path()).resolve()
    ok, report = run_validation(output_path, report_path, previous_path, args.check, not args.without_audit)
    print(report)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
