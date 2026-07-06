#!/usr/bin/env python3
"""
Shared helpers for ai-skill-builder script audits.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path


ARCHETYPE_CHOICES = (
    "backend-source",
    "fullstack-orchestrator",
    "frontend-specialist",
    "lightweight-routing",
    "builder-audit",
)

ALLOWED_UTILS_NAMES = ("skill_script_utils.py", "core_skill_snapshot_utils.py")

COMMON_HELPERS = (
    "read_text",
    "normalize_relative_path",
    "extract_line_value",
    "extract_first_line_value",
    "project_root",
    "load_module_doc_map",
    "is_skill_uri",
    "resolve_skill_uri",
)

ARCHETYPE_BUNDLES: dict[str, dict[str, tuple[str, ...]]] = {
    "backend-source": {
        "required": (
            "reference_rules.json",
            "select_references.py",
            "validate_reference_triggers.py",
            "validate_output_templates.py",
            "validate_solution_consistency.py",
        ),
        "recommended": (
            "query_doc_map.py",
            "validate_code_references.py",
            "run_strict_delivery_gate.py",
            "validate_reference_rules_schema.py",
            "validate_script_contracts.py",
            "run_script_smoke_tests.py",
        ),
    },
    "fullstack-orchestrator": {
        "required": (
            "reference_rules.json",
            "select_references.py",
            "validate_reference_triggers.py",
            "validate_output_templates.py",
            "validate_solution_consistency.py",
        ),
        "recommended": (
            "query_doc_map.py",
            "run_strict_delivery_gate.py",
            "validate_reference_rules_schema.py",
            "validate_script_contracts.py",
            "run_script_smoke_tests.py",
        ),
    },
    "frontend-specialist": {
        "required": (
            "reference_rules.json",
            "select_references.py",
            "validate_reference_triggers.py",
            "validate_output_templates.py",
            "validate_solution_consistency.py",
        ),
        "recommended": (
            "validate_reference_rules_schema.py",
            "validate_script_contracts.py",
            "run_script_smoke_tests.py",
        ),
    },
    "lightweight-routing": {
        "required": (
            "reference_rules.json",
            "select_references.py",
            "validate_reference_triggers.py",
        ),
        "recommended": (
            "validate_reference_rules_schema.py",
            "validate_script_contracts.py",
        ),
    },
    "builder-audit": {
        "required": (
            "skill_script_utils.py",
            "core_skill_script_snapshot.json",
            "validate_reference_rules_schema.py",
            "validate_script_contracts.py",
            "run_script_template_audit.py",
            "suggest_script_bundle.py",
            "run_generate_core_skill_snapshot.py",
            "validate_core_skill_snapshot_drift.py",
            "validate_builder_archetype_consistency.py",
            "validate_builder_entrypoints.py",
        ),
        "recommended": (
            "run_generate_reference_rules.py",
        ),
    },
}


def scripts_root() -> Path:
    return Path(__file__).resolve().parent


def skill_root() -> Path:
    return scripts_root().parent


def workspace_root() -> Path:
    return skill_root().parents[2]


def is_skill_uri(value: str) -> bool:
    return value.strip().startswith("skill://")


def resolve_skill_uri(value: str) -> Path:
    normalized = value.strip()
    if not is_skill_uri(normalized):
        raise ValueError(f"not a skill uri: {value}")
    relative = normalized[len("skill://") :].strip("/")
    if not relative:
        raise ValueError("empty skill uri")
    return workspace_root() / "skills" / relative


def read_text(path: Path) -> str:
    if not path.exists():
        raise FileNotFoundError(f"file not found: {path}")
    return path.read_text(encoding="utf-8")


def load_json(path: Path) -> object:
    return json.loads(read_text(path))


def governance_profile_path(target_skill_root: Path) -> Path:
    return target_skill_root / ".meta" / "GOVERNANCE_PROFILE.md"


def load_profile_archetype(target_skill_root: Path) -> str | None:
    profile_path = governance_profile_path(target_skill_root)
    if not profile_path.exists():
        return None

    text = read_text(profile_path)
    match = re.search(r"^\|\s*archetype\s*\|\s*`?([a-z-]+)`?\s*\|", text, flags=re.MULTILINE)
    if not match:
        return None

    archetype = match.group(1).strip()
    if archetype in ARCHETYPE_BUNDLES:
        return archetype
    return None


def python_files(target: Path) -> list[Path]:
    return sorted(path for path in target.glob("*.py") if path.is_file())


def has_function(path: Path, function_name: str) -> bool:
    pattern = re.compile(rf"^\s*def\s+{re.escape(function_name)}\s*\(", flags=re.MULTILINE)
    return pattern.search(read_text(path)) is not None


def has_symbol(path: Path, symbol: str) -> bool:
    return symbol in read_text(path)


def infer_archetype(target_skill_root: Path) -> str:
    profile_archetype = load_profile_archetype(target_skill_root)
    if profile_archetype:
        return profile_archetype

    name = target_skill_root.name.lower()
    references_dir = target_skill_root / "references"

    if "skill-builder" in name:
        return "builder-audit"
    if name == "ai-backend-expert" or (references_dir / "arch").exists():
        return "backend-source"
    if "fullstack" in name or ((references_dir / "backend").exists() and (references_dir / "frontend").exists()):
        return "fullstack-orchestrator"
    if "frontend" in name or (references_dir / "frontend").exists():
        return "frontend-specialist"
    return "lightweight-routing"


def bundle_for(archetype: str) -> dict[str, tuple[str, ...]]:
    if archetype not in ARCHETYPE_BUNDLES:
        raise ValueError(f"unsupported archetype: {archetype}")
    return ARCHETYPE_BUNDLES[archetype]


def existing_utils_name(target_scripts_dir: Path) -> str | None:
    for file_name in ALLOWED_UTILS_NAMES:
        if (target_scripts_dir / file_name).exists():
            return file_name
    return None


def detect_duplicate_helpers(target_scripts_dir: Path) -> dict[str, list[str]]:
    duplicates: dict[str, list[str]] = {}
    for helper_name in COMMON_HELPERS:
        hits: list[str] = []
        for path in python_files(target_scripts_dir):
            if path.name in ALLOWED_UTILS_NAMES:
                continue
            if has_function(path, helper_name):
                hits.append(path.name)
        if len(hits) >= 2:
            duplicates[helper_name] = hits
    return duplicates


def normalize_relative_path(root: Path, target: Path) -> str:
    try:
        return target.resolve().relative_to(root.resolve()).as_posix()
    except Exception:
        return target.resolve().as_posix()


def run_command(command: list[str], cwd: Path) -> tuple[bool, str]:
    result = subprocess.run(command, capture_output=True, text=True, cwd=str(cwd))
    output = ((result.stdout or "") + (result.stderr or "")).strip()
    return result.returncode == 0, output


def python_command(script_path: Path, *args: str) -> list[str]:
    return [sys.executable, str(script_path), *args]
