#!/usr/bin/env python3
"""
Suggest a script bundle archetype and expected files for a target skill.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from skill_script_utils import bundle_for, infer_archetype, python_files


def build_suggestion(target_skill_root: Path) -> dict[str, object]:
    scripts_dir = target_skill_root / "scripts"
    archetype = infer_archetype(target_skill_root)
    bundle = bundle_for(archetype)
    existing = sorted(path.name for path in python_files(scripts_dir)) if scripts_dir.exists() else []
    existing_json = sorted(path.name for path in scripts_dir.glob("*.json")) if scripts_dir.exists() else []
    existing_names = sorted(set(existing + existing_json))
    required = list(bundle["required"])
    recommended = list(bundle["recommended"])
    expected = set(required) | set(recommended)

    notes: list[str] = []
    if archetype == "backend-source":
        notes.append("适合维护后端真源规范、文档绑定和领域校验器的 skill。")
    elif archetype == "fullstack-orchestrator":
        notes.append("适合编排前后端 references 与交付门禁的 skill，不默认复制底层后端真源校验器。")
    elif archetype == "frontend-specialist":
        notes.append("适合前端专题 skill，默认保持路由与模板闭环，门禁轻量化。")
    elif archetype == "lightweight-routing":
        notes.append("适合只做 references 路由与回归的轻量 skill。")
    elif archetype == "builder-audit":
        notes.append("适合像 builder 这样的治理型 skill，自身只维护审计脚本，不保存下游运行时脚本副本。")

    return {
        "skill_root": target_skill_root.as_posix(),
        "archetype": archetype,
        "required_scripts": required,
        "recommended_scripts": recommended,
        "existing_scripts": existing_names,
        "missing_required": sorted(set(required) - set(existing_names)),
        "missing_recommended": sorted(set(recommended) - set(existing_names)),
        "extra_scripts": sorted(set(existing_names) - expected),
        "notes": notes,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Suggest a script bundle archetype for a target skill.")
    parser.add_argument("--skill-root", type=Path, required=True, help="Target skill root")
    parser.add_argument("--json", action="store_true", help="Print JSON output")
    args = parser.parse_args()

    suggestion = build_suggestion(args.skill_root.resolve())
    if args.json:
        print(json.dumps(suggestion, ensure_ascii=False, indent=2))
        return 0

    print("[suggest-script-bundle] PASS")
    print("skill_root:", suggestion["skill_root"])
    print("archetype:", suggestion["archetype"])
    print("required:", suggestion["required_scripts"])
    print("recommended:", suggestion["recommended_scripts"])
    print("existing:", suggestion["existing_scripts"])
    print("missing_required:", suggestion["missing_required"])
    print("missing_recommended:", suggestion["missing_recommended"])
    print("extra_scripts:", suggestion["extra_scripts"])
    for note in suggestion["notes"]:
        print("note:", note)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
