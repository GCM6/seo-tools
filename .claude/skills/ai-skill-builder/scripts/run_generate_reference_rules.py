#!/usr/bin/env python3
"""
Generate reference_rules.json from an editable source config.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import tempfile
from collections import defaultdict
from pathlib import Path

from skill_script_utils import (
    ARCHETYPE_CHOICES,
    infer_archetype,
    is_skill_uri,
    load_json,
    load_profile_archetype,
    resolve_skill_uri,
)
from validate_reference_rules_schema import (
    CASE_BOOL_FIELDS,
    CASE_LIST_FIELDS,
    RULE_BOOL_FIELDS,
    RULE_INT_FIELDS,
    RULE_LIST_FIELDS,
    run_validation as validate_reference_rules_schema,
)


LIST_FIELDS = ("bootstrap_refs", "full_scope_keywords", "all_detailed_refs")
SCALAR_FIELDS = ("index_ref",)
SOURCE_META_FIELDS = {"archetype", "base", "extensions", "notes", "description"}
SECTION_ALIASES = {
    "元信息": "meta",
    "索引入口": "index_ref",
    "index ref": "index_ref",
    "启动引用": "bootstrap_refs",
    "bootstrap refs": "bootstrap_refs",
    "全量关键词": "full_scope_keywords",
    "full scope keywords": "full_scope_keywords",
    "全量明细引用": "all_detailed_refs",
    "all detailed refs": "all_detailed_refs",
    "引用分组": "ref_groups",
    "ref groups": "ref_groups",
    "路由规则": "rules",
    "rules": "rules",
    "回归样例": "validation_cases",
    "validation cases": "validation_cases",
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


def strip_markdown_wrappers(value: str) -> str:
    normalized = value.strip()
    if normalized.startswith("`") and normalized.endswith("`") and len(normalized) >= 2:
        return normalized[1:-1].strip()
    if normalized.startswith("**") and normalized.endswith("**") and len(normalized) >= 4:
        return normalized[2:-2].strip()
    return normalized


def normalize_heading(value: str) -> str:
    normalized = re.sub(r"^\d+(?:\.\d+)?[.\s]*", "", value.strip())
    normalized = normalized.replace("`", "").strip().lower()
    return normalized


def parse_inline_list(value: str) -> list[str]:
    if not value.strip():
        return []
    normalized = value.replace("，", ",").replace("；", ",").replace("、", ",")
    return [strip_markdown_wrappers(item) for item in normalized.split(",") if strip_markdown_wrappers(item)]


def parse_scalar_value(raw_value: str) -> object:
    value = strip_markdown_wrappers(raw_value)
    lowered = value.lower()
    if lowered in {"true", "false"}:
        return lowered == "true"
    if re.fullmatch(r"-?\d+", value):
        return int(value)
    return value


def parse_markdown_source(source_path: Path) -> dict[str, object]:
    lines = source_path.read_text(encoding="utf-8").splitlines()
    result: dict[str, object] = {}

    current_section: str | None = None
    current_group_name: str | None = None
    current_rule: dict[str, object] | None = None
    current_case: dict[str, object] | None = None
    current_list_field: str | None = None

    def ensure_ref_groups() -> dict[str, list[str]]:
        raw = result.setdefault("ref_groups", {})
        if not isinstance(raw, dict):
            raise ValueError("`ref_groups` 结构损坏。")
        return raw  # type: ignore[return-value]

    def ensure_rules() -> list[dict[str, object]]:
        raw = result.setdefault("rules", [])
        if not isinstance(raw, list):
            raise ValueError("`rules` 结构损坏。")
        return raw  # type: ignore[return-value]

    def ensure_cases() -> list[dict[str, object]]:
        raw = result.setdefault("validation_cases", [])
        if not isinstance(raw, list):
            raise ValueError("`validation_cases` 结构损坏。")
        return raw  # type: ignore[return-value]

    for raw_line in lines:
        line = raw_line.rstrip()
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith("```"):
            continue
        if stripped.startswith("<!--") or stripped.startswith("-->"):
            continue

        top_heading = re.match(r"^##\s+(.+)$", stripped)
        if top_heading:
            section_key = SECTION_ALIASES.get(normalize_heading(top_heading.group(1)))
            current_section = section_key
            current_group_name = None
            current_rule = None
            current_case = None
            current_list_field = None
            continue

        sub_heading = re.match(r"^###\s+(.+)$", stripped)
        if sub_heading:
            heading_value = strip_markdown_wrappers(sub_heading.group(1))
            current_list_field = None
            if current_section == "ref_groups":
                current_group_name = heading_value
                ensure_ref_groups().setdefault(current_group_name, [])
                current_rule = None
                current_case = None
            elif current_section == "rules":
                current_rule = {"name": heading_value}
                ensure_rules().append(current_rule)
                current_group_name = None
                current_case = None
            elif current_section == "validation_cases":
                current_case = {"name": heading_value}
                ensure_cases().append(current_case)
                current_group_name = None
                current_rule = None
            continue

        list_item = re.match(r"^-\s+(.+)$", raw_line)
        if current_section in SCALAR_FIELDS and list_item:
            result[current_section] = strip_markdown_wrappers(list_item.group(1))
            continue

        if current_section in {"bootstrap_refs", "full_scope_keywords", "all_detailed_refs"} and list_item:
            result.setdefault(current_section, [])
            assert isinstance(result[current_section], list)
            result[current_section].append(strip_markdown_wrappers(list_item.group(1)))
            continue

        if current_section == "ref_groups" and current_group_name and list_item:
            ref_groups = ensure_ref_groups()
            ref_groups.setdefault(current_group_name, [])
            ref_groups[current_group_name].append(strip_markdown_wrappers(list_item.group(1)))
            continue

        if current_section == "meta" and list_item:
            payload = list_item.group(1)
            if ":" not in payload:
                continue
            key, value = payload.split(":", 1)
            result[strip_markdown_wrappers(key)] = parse_scalar_value(value.strip())
            continue

        if current_section in {"rules", "validation_cases"} and list_item:
            target = current_rule if current_section == "rules" else current_case
            if target is None:
                continue
            payload = list_item.group(1)
            if ":" not in payload:
                continue
            key, value = payload.split(":", 1)
            field_name = strip_markdown_wrappers(key)
            value = value.strip()
            section_list_fields = RULE_LIST_FIELDS if current_section == "rules" else CASE_LIST_FIELDS
            section_int_fields = RULE_INT_FIELDS if current_section == "rules" else set()
            section_bool_fields = RULE_BOOL_FIELDS if current_section == "rules" else CASE_BOOL_FIELDS
            if field_name in section_list_fields:
                values = parse_inline_list(value)
                if values:
                    target[field_name] = values
                    current_list_field = None
                else:
                    target[field_name] = []
                    current_list_field = field_name
            elif field_name in section_int_fields | section_bool_fields:
                target[field_name] = parse_scalar_value(value)
                current_list_field = None
            else:
                target[field_name] = strip_markdown_wrappers(value)
                current_list_field = None
            continue

        nested_bullet = re.match(r"^\s+-\s+(.+)$", raw_line)
        if current_section in {"rules", "validation_cases"} and current_list_field and nested_bullet:
            target = current_rule if current_section == "rules" else current_case
            if target is None:
                continue
            target.setdefault(current_list_field, [])
            assert isinstance(target[current_list_field], list)
            target[current_list_field].append(strip_markdown_wrappers(nested_bullet.group(1)))
            continue

    return result


def as_string_list(value: object, label: str, errors: list[str]) -> list[str]:
    if value is None:
        return []
    if not isinstance(value, list):
        errors.append(f"`{label}` 必须是数组。")
        return []

    result: list[str] = []
    for index, item in enumerate(value):
        if not isinstance(item, str) or not item.strip():
            errors.append(f"`{label}[{index}]` 必须是非空字符串。")
            continue
        result.append(item.strip())
    return result


def as_rule_list(value: object, label: str, errors: list[str]) -> list[dict[str, object]]:
    if value is None:
        return []
    if not isinstance(value, list):
        errors.append(f"`{label}` 必须是数组。")
        return []

    rules: list[dict[str, object]] = []
    for index, item in enumerate(value):
        if not isinstance(item, dict):
            errors.append(f"`{label}[{index}]` 必须是对象。")
            continue
        rules.append(dict(item))
    return rules


def as_case_list(value: object, label: str, errors: list[str]) -> list[dict[str, object]]:
    if value is None:
        return []
    if not isinstance(value, list):
        errors.append(f"`{label}` 必须是数组。")
        return []

    cases: list[dict[str, object]] = []
    for index, item in enumerate(value):
        if not isinstance(item, dict):
            errors.append(f"`{label}[{index}]` 必须是对象。")
            continue
        cases.append(dict(item))
    return cases


def as_ref_groups(value: object, label: str, errors: list[str]) -> dict[str, list[str]]:
    if value is None:
        return {}
    if not isinstance(value, dict):
        errors.append(f"`{label}` 必须是对象。")
        return {}

    result: dict[str, list[str]] = {}
    for raw_name, raw_refs in value.items():
        if not isinstance(raw_name, str) or not raw_name.strip():
            errors.append(f"`{label}` 的分组名必须是非空字符串。")
            continue
        group_name = raw_name.strip()
        result[group_name] = as_string_list(raw_refs, f"{label}.{group_name}", errors)
    return result


def merge_ref_groups(base: dict[str, list[str]], extra: dict[str, list[str]]) -> dict[str, list[str]]:
    result: dict[str, list[str]] = {}
    for group_name in ordered_unique([*base.keys(), *extra.keys()]):
        merged_refs = list(base.get(group_name, ()))
        merged_refs.extend(extra.get(group_name, ()))
        result[group_name] = ordered_unique(merged_refs)
    return result


def merge_rules(base_rules: list[dict[str, object]], extra_rules: list[dict[str, object]]) -> list[dict[str, object]]:
    ordered_keys: list[str] = []
    merged: dict[str, dict[str, object]] = {}

    def make_key(rule: dict[str, object], fallback_index: int) -> str:
        raw_name = rule.get("name")
        if isinstance(raw_name, str) and raw_name.strip():
            return raw_name.strip()
        return f"__unnamed_rule_{fallback_index}"

    for index, rule in enumerate(base_rules):
        key = make_key(rule, index)
        ordered_keys.append(key)
        merged[key] = dict(rule)

    for index, rule in enumerate(extra_rules, start=len(base_rules)):
        key = make_key(rule, index)
        if key not in merged:
            ordered_keys.append(key)
        merged[key] = dict(rule)

    return [merged[key] for key in ordered_keys]


def merge_validation_cases(base_cases: list[dict[str, object]], extra_cases: list[dict[str, object]]) -> list[dict[str, object]]:
    ordered_keys: list[str] = []
    merged: dict[str, dict[str, object]] = {}

    def make_key(case: dict[str, object], fallback_index: int) -> str:
        for field_name in ("name", "request_text"):
            raw_value = case.get(field_name)
            if isinstance(raw_value, str) and raw_value.strip():
                return f"{field_name}:{raw_value.strip()}"
        return f"__unnamed_case_{fallback_index}"

    for index, case in enumerate(base_cases):
        key = make_key(case, index)
        ordered_keys.append(key)
        merged[key] = dict(case)

    for index, case in enumerate(extra_cases, start=len(base_cases)):
        key = make_key(case, index)
        if key not in merged:
            ordered_keys.append(key)
        merged[key] = dict(case)

    return [merged[key] for key in ordered_keys]


def split_source_sections(raw: dict[str, object]) -> tuple[dict[str, object], dict[str, object]]:
    if "base" in raw or "extensions" in raw:
        base = raw.get("base", {})
        extensions = raw.get("extensions", {})
        if not isinstance(base, dict):
            raise ValueError("`base` 必须是对象。")
        if not isinstance(extensions, dict):
            raise ValueError("`extensions` 必须是对象。")
        return dict(base), dict(extensions)

    base = {key: value for key, value in raw.items() if key not in SOURCE_META_FIELDS}
    return base, {}


def build_reference_rules(source_payload: dict[str, object]) -> tuple[dict[str, object], list[str]]:
    errors: list[str] = []
    base, extensions = split_source_sections(source_payload)

    output: dict[str, object] = {}
    for field_name in SCALAR_FIELDS:
        if field_name in extensions:
            output[field_name] = extensions[field_name]
        elif field_name in base:
            output[field_name] = base[field_name]

    for field_name in LIST_FIELDS:
        merged_values = as_string_list(base.get(field_name), f"base.{field_name}", errors)
        merged_values.extend(as_string_list(extensions.get(field_name), f"extensions.{field_name}", errors))
        if merged_values:
            output[field_name] = ordered_unique(merged_values)

    ref_groups = merge_ref_groups(
        as_ref_groups(base.get("ref_groups"), "base.ref_groups", errors),
        as_ref_groups(extensions.get("ref_groups"), "extensions.ref_groups", errors),
    )
    if ref_groups:
        output["ref_groups"] = ref_groups

    output["rules"] = merge_rules(
        as_rule_list(base.get("rules"), "base.rules", errors),
        as_rule_list(extensions.get("rules"), "extensions.rules", errors),
    )
    if "validation_cases" in base or "validation_cases" in extensions:
        output["validation_cases"] = merge_validation_cases(
            as_case_list(base.get("validation_cases"), "base.validation_cases", errors),
            as_case_list(extensions.get("validation_cases"), "extensions.validation_cases", errors),
        )

    return output, errors


def iter_reference_paths(payload: dict[str, object]) -> list[str]:
    refs: list[str] = []
    for field_name in ("index_ref",):
        raw_value = payload.get(field_name)
        if isinstance(raw_value, str) and raw_value.strip():
            refs.append(raw_value.strip())

    for field_name in ("bootstrap_refs", "all_detailed_refs"):
        refs.extend(value for value in payload.get(field_name, []) if isinstance(value, str))

    ref_groups = payload.get("ref_groups", {})
    if isinstance(ref_groups, dict):
        for values in ref_groups.values():
            if isinstance(values, list):
                refs.extend(value for value in values if isinstance(value, str))

    rules = payload.get("rules", [])
    if isinstance(rules, list):
        for rule in rules:
            if not isinstance(rule, dict):
                continue
            refs.extend(value for value in rule.get("refs", []) if isinstance(value, str))

    validation_cases = payload.get("validation_cases", [])
    if isinstance(validation_cases, list):
        for case in validation_cases:
            if not isinstance(case, dict):
                continue
            refs.extend(value for value in case.get("expected_refs", []) if isinstance(value, str))

    return ordered_unique([value.strip() for value in refs if value.strip()])


def validate_reference_paths(skill_root: Path, payload: dict[str, object]) -> list[str]:
    errors: list[str] = []
    for relative_path in iter_reference_paths(payload):
        if is_skill_uri(relative_path):
            target_path = resolve_skill_uri(relative_path)
        elif relative_path.startswith("../"):
            continue
        else:
            target_path = skill_root / relative_path
        if not target_path.exists():
            errors.append(f"引用的路径不存在: {relative_path}")
    return errors


def format_output(payload: dict[str, object]) -> str:
    ordered_payload: dict[str, object] = {}
    for field_name in ("index_ref", "bootstrap_refs", "full_scope_keywords", "all_detailed_refs", "ref_groups", "rules", "validation_cases"):
        if field_name in payload:
            ordered_payload[field_name] = payload[field_name]
    return json.dumps(ordered_payload, ensure_ascii=False, indent=2) + "\n"


def file_digest(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def render_repo_relative_path(path: Path, repo_root: Path) -> str:
    try:
        return path.resolve().relative_to(repo_root.resolve()).as_posix()
    except ValueError:
        return path.as_posix()


def sanitize_schema_report(schema_report: str, output_path: Path, repo_root: Path) -> str:
    lines: list[str] = []
    for line in schema_report.splitlines():
        if line.startswith("config="):
            lines.append(f"config={render_repo_relative_path(output_path, repo_root)}")
            continue
        lines.append(line)
    return "\n".join(lines)


def reference_inventory(skill_root: Path) -> list[str]:
    references_dir = skill_root / "references"
    if not references_dir.exists():
        return []
    return sorted(path.relative_to(skill_root).as_posix() for path in references_dir.rglob("*.md") if path.is_file())


def collect_reference_usage(payload: dict[str, object]) -> dict[str, list[str]]:
    usage: dict[str, list[str]] = defaultdict(list)

    def add_ref(ref: object, source: str) -> None:
        if isinstance(ref, str) and ref.strip():
            usage[ref.strip()].append(source)

    add_ref(payload.get("index_ref"), "index_ref")

    for index, ref in enumerate(payload.get("bootstrap_refs", [])):
        add_ref(ref, f"bootstrap_refs[{index}]")
    for index, ref in enumerate(payload.get("all_detailed_refs", [])):
        add_ref(ref, f"all_detailed_refs[{index}]")

    ref_groups = payload.get("ref_groups", {})
    if isinstance(ref_groups, dict):
        for group_name, refs in ref_groups.items():
            if not isinstance(refs, list):
                continue
            for ref in refs:
                add_ref(ref, f"ref_groups.{group_name}")

    rules = payload.get("rules", [])
    if isinstance(rules, list):
        for index, rule in enumerate(rules):
            if not isinstance(rule, dict):
                continue
            rule_name = str(rule.get("name", "")).strip() or f"rule_{index}"
            for ref in rule.get("refs", []):
                add_ref(ref, f"rules.{rule_name}")

    validation_cases = payload.get("validation_cases", [])
    if isinstance(validation_cases, list):
        for index, case in enumerate(validation_cases):
            if not isinstance(case, dict):
                continue
            case_name = str(case.get("name", "")).strip() or str(case.get("request_text", "")).strip() or f"case_{index}"
            for ref in case.get("expected_refs", []):
                add_ref(ref, f"validation_cases.{case_name}")

    return {key: ordered_unique(values) for key, values in usage.items()}


def summarize_sources(sources: list[str], limit: int = 4) -> str:
    unique_sources = ordered_unique(sources)
    if len(unique_sources) <= limit:
        return ", ".join(f"`{item}`" for item in unique_sources)
    visible = ", ".join(f"`{item}`" for item in unique_sources[:limit])
    return f"{visible} 等 {len(unique_sources)} 处"


def summarize_refs(refs: list[str], limit: int = 4) -> str:
    unique_refs = ordered_unique(refs)
    if not unique_refs:
        return "无"
    if len(unique_refs) <= limit:
        return ", ".join(f"`{item}`" for item in unique_refs)
    visible = ", ".join(f"`{item}`" for item in unique_refs[:limit])
    return f"{visible} 等 {len(unique_refs)} 个"


def resolve_rule_refs(rule: dict[str, object], ref_groups: dict[str, list[str]]) -> list[str]:
    resolved_refs: list[str] = []
    raw_group = rule.get("ref_group")
    if isinstance(raw_group, str) and raw_group.strip():
        resolved_refs.extend(ref_groups.get(raw_group.strip(), []))
    raw_refs = rule.get("refs", [])
    if isinstance(raw_refs, list):
        resolved_refs.extend(ref for ref in raw_refs if isinstance(ref, str) and ref.strip())
    return ordered_unique(resolved_refs)


def normalize_ref_for_local_inventory(skill_root: Path, ref: str) -> str | None:
    normalized = ref.strip()
    if not normalized:
        return None
    if normalized.startswith("references/") and normalized.endswith(".md"):
        return normalized
    if is_skill_uri(normalized):
        try:
            resolved = resolve_skill_uri(normalized)
            relative = resolved.resolve().relative_to(skill_root.resolve()).as_posix()
            if relative.startswith("references/") and relative.endswith(".md"):
                return relative
        except Exception:
            return None
    return None


def build_report_text(
    skill_root: Path,
    source_path: Path,
    output_path: Path,
    report_path: Path,
    effective_archetype: str | None,
    output_text: str,
    payload: dict[str, object],
    schema_report: str,
    content_errors: list[str],
    warnings: list[str],
) -> str:
    all_reference_files = reference_inventory(skill_root)
    usage_map = collect_reference_usage(payload)
    local_usage_map: dict[str, list[str]] = defaultdict(list)
    for ref, sources in usage_map.items():
        normalized_ref = normalize_ref_for_local_inventory(skill_root, ref)
        if not normalized_ref:
            continue
        local_usage_map[normalized_ref].extend(sources)
    local_usage_map = {key: ordered_unique(values) for key, values in local_usage_map.items()}

    referenced_reference_files = sorted(local_usage_map)
    covered_reference_files = sorted(set(all_reference_files) & set(referenced_reference_files))
    uncovered_reference_files = sorted(set(all_reference_files) - set(covered_reference_files))
    missing_reference_targets = sorted(set(referenced_reference_files) - set(all_reference_files))
    ref_groups = payload.get("ref_groups", {})
    ref_group_rows: list[tuple[str, int, str]] = []
    if isinstance(ref_groups, dict):
        for group_name in sorted(ref_groups):
            refs = ref_groups[group_name]
            if not isinstance(refs, list):
                continue
            normalized_refs = [ref for ref in refs if isinstance(ref, str) and ref.strip()]
            ref_group_rows.append((group_name, len(normalized_refs), summarize_refs(normalized_refs)))

    top_refs = sorted(
        (
            ref,
            len(sources),
            summarize_sources(sources),
        )
        for ref, sources in local_usage_map.items()
        if ref in covered_reference_files
    )
    top_refs.sort(key=lambda item: (-item[1], item[0]))
    single_use_refs = [item for item in top_refs if item[1] == 1]

    rule_rows: list[tuple[str, int, int, str, str]] = []
    rules = payload.get("rules", [])
    if isinstance(rules, list):
        for index, raw_rule in enumerate(rules):
            if not isinstance(raw_rule, dict):
                continue
            rule_name = str(raw_rule.get("name", "")).strip() or f"rule_{index}"
            keywords = raw_rule.get("keywords", [])
            keyword_count = len(keywords) if isinstance(keywords, list) else 0
            min_hits = raw_rule.get("min_hits", 1)
            route_source = "direct"
            raw_group = raw_rule.get("ref_group")
            if isinstance(raw_group, str) and raw_group.strip():
                route_source = f"ref_group:`{raw_group.strip()}`"
                if isinstance(raw_rule.get("refs"), list) and raw_rule.get("refs"):
                    route_source = f"{route_source} + direct refs"
            elif isinstance(raw_rule.get("route_target"), str) and raw_rule.get("route_target", "").strip():
                route_source = f"route_target:`{str(raw_rule.get('route_target')).strip()}`"
            resolved_refs = resolve_rule_refs(raw_rule, ref_groups if isinstance(ref_groups, dict) else {})
            rule_rows.append(
                (
                    rule_name,
                    keyword_count,
                    min_hits if isinstance(min_hits, int) else 1,
                    route_source,
                    summarize_refs(resolved_refs),
                )
            )

    repo_root = skill_root.parents[2]
    schema_summary = sanitize_schema_report(schema_report, output_path, repo_root)
    status = "PASS" if not content_errors else "FAIL"
    lines = [
        f"# {skill_root.name} Reference Rules Report",
        "",
        "本文档由 `ai-skill-builder/scripts/run_generate_reference_rules.py` 自动生成，用于审计当前路由规则派生产物的覆盖与一致性。",
        "",
        "## 0. 元信息",
        "",
        "| 项目 | 内容 |",
        "|------|------|",
        f"| skill_root | `{render_repo_relative_path(skill_root, repo_root)}` |",
        f"| source | `{render_repo_relative_path(source_path, repo_root)}` |",
        f"| output | `{render_repo_relative_path(output_path, repo_root)}` |",
        f"| report | `{render_repo_relative_path(report_path, repo_root)}` |",
        f"| archetype | `{effective_archetype or 'unknown'}` |",
        f"| source_sha256 | `{file_digest(source_path.read_text(encoding='utf-8'))}` |",
        f"| rules_sha256 | `{file_digest(output_text)}` |",
        f"| 生成状态 | `{status}` |",
        "",
        "## 1. 规模摘要",
        "",
        "| 指标 | 数值 |",
        "|------|------|",
        f"| bootstrap_refs | `{len(payload.get('bootstrap_refs', []))}` |",
        f"| full_scope_keywords | `{len(payload.get('full_scope_keywords', []))}` |",
        f"| all_detailed_refs | `{len(payload.get('all_detailed_refs', []))}` |",
        f"| ref_groups | `{len(payload.get('ref_groups', {}))}` |",
        f"| rules | `{len(payload.get('rules', []))}` |",
        f"| validation_cases | `{len(payload.get('validation_cases', []))}` |",
        f"| references/ 总文件数 | `{len(all_reference_files)}` |",
        f"| 路由覆盖文件数 | `{len(covered_reference_files)}` |",
        f"| 未覆盖文件数 | `{len(uncovered_reference_files)}` |",
        "",
        "## 2. 覆盖详情",
        "",
        f"- 已覆盖 `references/*.md`：`{len(covered_reference_files)}` / `{len(all_reference_files)}`",
    ]

    if uncovered_reference_files:
        lines.append(f"- 未覆盖文件：{', '.join(f'`{item}`' for item in uncovered_reference_files)}")
    else:
        lines.append("- 未覆盖文件：`0` 个")

    if missing_reference_targets:
        lines.append(f"- 规则引用但目录中不存在的文件：{', '.join(f'`{item}`' for item in missing_reference_targets)}")
    else:
        lines.append("- 规则引用但目录中不存在的文件：`0` 个")

    lines.extend(
        [
            "",
            "## 3. 高密度引用文件",
            "",
            "| Reference | 被引用次数 | 主要来源 |",
            "|------|------|------|",
        ]
    )
    if top_refs:
        for ref, hit_count, source_summary in top_refs[:10]:
            lines.append(f"| `{ref}` | `{hit_count}` | {source_summary} |")
    else:
        lines.append("| `N/A` | `0` | 无 |")

    lines.extend(
        [
            "",
            "## 4. 引用分组覆盖",
            "",
            "| ref_group | 文件数 | 覆盖文件 |",
            "|------|------|------|",
        ]
    )
    if ref_group_rows:
        for group_name, file_count, ref_summary in ref_group_rows:
            lines.append(f"| `{group_name}` | `{file_count}` | {ref_summary} |")
    else:
        lines.append("| `N/A` | `0` | 无 |")

    lines.extend(
        [
            "",
            "## 5. 单次引用文件",
            "",
            "| Reference | 唯一来源 |",
            "|------|------|",
        ]
    )
    if single_use_refs:
        for ref, _, source_summary in single_use_refs:
            lines.append(f"| `{ref}` | {source_summary} |")
    else:
        lines.append("| `N/A` | 无 |")

    if content_errors:
        lines.extend(
            [
                "",
                "## 6. 校验摘要",
                "",
                "- 错误：",
            ]
        )
        for item in content_errors:
            lines.append(f"  - {item}")
    else:
        lines.extend(
            [
                "",
                "## 6. 校验摘要",
                "",
                "- 错误：无",
            ]
        )
    if warnings:
        lines.append("- 告警：")
        for item in warnings:
            lines.append(f"  - {item}")
    else:
        lines.append("- 告警：无")

    lines.extend(
        [
            "",
            "## 7. 规则展开矩阵",
            "",
            "| Rule | 关键词数 | min_hits | 加载来源 | 展开 refs |",
            "|------|------|------|------|------|",
        ]
    )
    if rule_rows:
        for rule_name, keyword_count, min_hits, route_source, ref_summary in rule_rows:
            lines.append(f"| `{rule_name}` | `{keyword_count}` | `{min_hits}` | {route_source} | {ref_summary} |")
    else:
        lines.append("| `N/A` | `0` | `0` | 无 | 无 |")

    lines.extend(
        [
            "",
            "## 8. Schema 校验原文",
            "",
            "```text",
            schema_summary,
            "```",
            "",
        ]
    )
    return "\n".join(lines)


def run_validation(
    skill_root: Path,
    source_path: Path,
    output_path: Path,
    report_path: Path,
    archetype: str | None = None,
    check: bool = False,
) -> tuple[bool, str]:
    content_errors: list[str] = []
    runtime_errors: list[str] = []
    warnings: list[str] = []

    if source_path.suffix.lower() == ".md":
        raw = parse_markdown_source(source_path)
    else:
        raw = load_json(source_path)
        if not isinstance(raw, dict):
            return False, "[generate-reference-rules] FAIL\n- source 顶层必须是对象。"

    try:
        generated_payload, build_errors = build_reference_rules(raw)
    except ValueError as exc:
        return False, f"[generate-reference-rules] FAIL\n- {exc}"

    content_errors.extend(build_errors)
    content_errors.extend(validate_reference_paths(skill_root, generated_payload))

    source_archetype = raw.get("archetype")
    effective_archetype: str | None = archetype
    if not effective_archetype and isinstance(source_archetype, str) and source_archetype.strip():
        effective_archetype = source_archetype.strip()
    if not effective_archetype:
        effective_archetype = load_profile_archetype(skill_root) or infer_archetype(skill_root)

    output_text = format_output(generated_payload)
    with tempfile.TemporaryDirectory() as temp_dir:
        temp_output = Path(temp_dir) / "reference_rules.json"
        temp_output.write_text(output_text, encoding="utf-8", newline="\n")
        schema_ok, schema_report = validate_reference_rules_schema(temp_output, effective_archetype)
    if not schema_ok:
        content_errors.append("生成结果未通过 reference_rules schema 校验。")

    report_text = build_report_text(
        skill_root=skill_root,
        source_path=source_path,
        output_path=output_path,
        report_path=report_path,
        effective_archetype=effective_archetype,
        output_text=output_text,
        payload=generated_payload,
        schema_report=schema_report,
        content_errors=content_errors,
        warnings=warnings,
    )

    if check:
        if not output_path.exists():
            runtime_errors.append(f"目标文件不存在，无法 check: {output_path.as_posix()}")
        else:
            current_output = output_path.read_text(encoding="utf-8")
            if current_output != output_text:
                runtime_errors.append("生成结果与当前 reference_rules.json 不一致，请先重新生成。")
        if not report_path.exists():
            runtime_errors.append(f"报告文件不存在，无法 check: {report_path.as_posix()}")
        else:
            current_report = report_path.read_text(encoding="utf-8")
            if current_report != report_text:
                runtime_errors.append("生成结果与当前 reference_rules.report.md 不一致，请先重新生成。")
    else:
        output_path.write_text(output_text, encoding="utf-8", newline="\n")
        report_path.write_text(report_text, encoding="utf-8", newline="\n")

    all_errors = [*content_errors, *runtime_errors]
    ok = not all_errors
    status = "PASS" if ok else "FAIL"
    lines = [
        f"[generate-reference-rules] {status}",
        f"skill_root={skill_root.as_posix()}",
        f"source={source_path.as_posix()}",
        f"output={output_path.as_posix()}",
        f"report={report_path.as_posix()}",
    ]
    if effective_archetype:
        lines.append(f"archetype={effective_archetype}")
    if warnings:
        lines.extend(f"- WARN: {item}" for item in warnings)
    if all_errors:
        lines.extend(f"- ERROR: {item}" for item in all_errors)
    lines.append(schema_report)
    return ok, "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate reference_rules.json from a source config.")
    parser.add_argument(
        "--skill-root",
        type=Path,
        required=True,
        help="Target skill root, for example skills/backend/ai-backend-expert",
    )
    parser.add_argument(
        "--source",
        type=Path,
        help="Path to reference_rules source file. Defaults to <skill-root>/scripts/reference_rules.source.md",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Path to generated reference_rules.json. Defaults to <skill-root>/scripts/reference_rules.json",
    )
    parser.add_argument(
        "--report",
        type=Path,
        help="Path to generated reference_rules.report.md. Defaults to <skill-root>/scripts/reference_rules.report.md",
    )
    parser.add_argument("--check", action="store_true", help="Only validate generated output against current file.")
    parser.add_argument("--archetype", choices=ARCHETYPE_CHOICES[:-1], help="Expected target archetype.")
    args = parser.parse_args()

    skill_root = args.skill_root.resolve()
    if args.source:
        source_path = args.source.resolve()
    else:
        markdown_source = skill_root / "scripts" / "reference_rules.source.md"
        json_source = skill_root / "scripts" / "reference_rules.source.json"
        source_path = (markdown_source if markdown_source.exists() else json_source).resolve()
    output_path = (args.output or (skill_root / "scripts" / "reference_rules.json")).resolve()
    report_path = (args.report or (skill_root / "scripts" / "reference_rules.report.md")).resolve()

    ok, report = run_validation(skill_root, source_path, output_path, report_path, args.archetype, args.check)
    print(report)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
