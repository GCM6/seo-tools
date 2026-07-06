#!/usr/bin/env python3
"""
Validate reference_rules.json against builder schema expectations.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from skill_script_utils import ARCHETYPE_CHOICES, load_json

RULE_LIST_FIELDS = {"keywords", "refs", "recommended_guidance"}
RULE_INT_FIELDS = {"min_hits"}
RULE_BOOL_FIELDS = {"exclusive"}
CASE_REQUIRED_STRING_FIELDS = {"request_text"}
CASE_OPTIONAL_STRING_FIELDS = {"name", "expected_route_target", "expected_mode"}
CASE_LIST_FIELDS = {"expected_refs"}
CASE_BOOL_FIELDS = {"expected_route_is_exclusive"}
CASE_ALLOWED_FIELDS = CASE_REQUIRED_STRING_FIELDS | CASE_OPTIONAL_STRING_FIELDS | CASE_LIST_FIELDS | CASE_BOOL_FIELDS


def _as_string_list(value: object, label: str, errors: list[str]) -> list[str]:
    if not isinstance(value, list) or any(not isinstance(item, str) or not item.strip() for item in value):
        errors.append(f"`{label}` 必须是非空字符串数组。")
        return []
    return [item.strip() for item in value]


def _validate_validation_cases(value: object, errors: list[str], warnings: list[str]) -> None:
    if not isinstance(value, list):
        errors.append("`validation_cases` 必须是数组。")
        return

    for index, item in enumerate(value):
        if not isinstance(item, dict):
            errors.append(f"`validation_cases[{index}]` 必须是对象。")
            continue
        for field_name in CASE_REQUIRED_STRING_FIELDS:
            if not str(item.get(field_name, "")).strip():
                errors.append(f"`validation_cases[{index}].{field_name}` 不能为空。")
        for field_name in CASE_LIST_FIELDS:
            if field_name in item:
                _as_string_list(item[field_name], f"validation_cases[{index}].{field_name}", errors)
        for field_name in CASE_OPTIONAL_STRING_FIELDS:
            if field_name in item:
                value = item[field_name]
                if not isinstance(value, str) or not value.strip():
                    errors.append(f"`validation_cases[{index}].{field_name}` 必须是非空字符串。")
        for field_name in CASE_BOOL_FIELDS:
            if field_name in item and not isinstance(item[field_name], bool):
                errors.append(f"`validation_cases[{index}].{field_name}` 必须是布尔值。")
        unknown_fields = sorted(key for key in item.keys() if key not in CASE_ALLOWED_FIELDS)
        for field_name in unknown_fields:
            warnings.append(f"`validation_cases[{index}].{field_name}` 未在 builder schema 白名单中定义，建议确认是否为误写或需先扩充真源。")

    if not value:
        warnings.append("`validation_cases` 为空，建议补至少 1 条回归样例。")


def _validate_rules(raw_rules: object, ref_groups: dict[str, list[str]], errors: list[str], warnings: list[str]) -> None:
    if not isinstance(raw_rules, list) or not raw_rules:
        errors.append("`rules` 必须是非空数组。")
        return

    seen_names: set[str] = set()
    for index, item in enumerate(raw_rules):
        if not isinstance(item, dict):
            errors.append(f"`rules[{index}]` 必须是对象。")
            continue

        name = str(item.get("name", "")).strip()
        if not name:
            errors.append(f"`rules[{index}].name` 不能为空。")
        elif name in seen_names:
            errors.append(f"`rules[{index}].name` 重复: {name}")
        else:
            seen_names.add(name)

        keywords = item.get("keywords")
        if not isinstance(keywords, list) or any(not isinstance(keyword, str) or not keyword.strip() for keyword in keywords):
            errors.append(f"`rules[{index}].keywords` 必须是非空字符串数组。")

        refs = item.get("refs")
        ref_group = item.get("ref_group")
        route_target = str(item.get("route_target", "")).strip()

        has_refs = refs is not None
        if has_refs and not isinstance(refs, list):
            errors.append(f"`rules[{index}].refs` 必须是数组。")
        if isinstance(refs, list) and any(not isinstance(ref, str) or not ref.strip() for ref in refs):
            errors.append(f"`rules[{index}].refs` 必须只包含非空字符串。")

        has_ref_group = ref_group is not None
        if has_ref_group and not isinstance(ref_group, str):
            errors.append(f"`rules[{index}].ref_group` 必须是字符串。")
        if isinstance(ref_group, str) and ref_group not in ref_groups:
            errors.append(f"`rules[{index}].ref_group` 未在 `ref_groups` 中定义: {ref_group}")

        if not has_refs and not has_ref_group and not route_target:
            errors.append(f"`rules[{index}]` 至少需要 `refs`、`ref_group` 或 `route_target` 之一。")

        for field_name in RULE_INT_FIELDS:
            if field_name not in item:
                continue
            int_value = item[field_name]
            if not isinstance(int_value, int) or int_value < 1:
                errors.append(f"`rules[{index}].{field_name}` 必须是 >= 1 的整数。")

        min_hits = item.get("min_hits", 1)

        exclusive = item.get("exclusive", False)
        for field_name in RULE_BOOL_FIELDS:
            if field_name not in item:
                continue
            if not isinstance(item[field_name], bool):
                errors.append(f"`rules[{index}].{field_name}` 必须是布尔值。")
        if exclusive and not route_target:
            errors.append(f"`rules[{index}]` 设置 `exclusive=true` 时必须同时提供 `route_target`。")

        guidance = item.get("recommended_guidance")
        if guidance is not None:
            if not isinstance(guidance, list) or any(not isinstance(entry, str) or not entry.strip() for entry in guidance):
                errors.append(f"`rules[{index}].recommended_guidance` 必须是非空字符串数组。")

        if isinstance(refs, list) and not refs and not route_target:
            warnings.append(f"`rules[{index}]` 的 `refs` 为空，若非纯路由规则建议补充说明。")


def run_validation(config_path: Path, archetype: str | None = None, strict: bool = False) -> tuple[bool, str]:
    errors: list[str] = []
    warnings: list[str] = []

    raw = load_json(config_path)
    if not isinstance(raw, dict):
        return False, "[validate-reference-rules-schema] FAIL\n- 顶层 JSON 必须是对象。"

    ref_groups_raw = raw.get("ref_groups", {})
    ref_groups: dict[str, list[str]] = {}
    if ref_groups_raw:
        if not isinstance(ref_groups_raw, dict):
            errors.append("`ref_groups` 必须是对象。")
        else:
            for group_name, refs in ref_groups_raw.items():
                if not isinstance(group_name, str) or not group_name.strip():
                    errors.append("`ref_groups` 的 key 必须是非空字符串。")
                    continue
                ref_groups[group_name] = _as_string_list(refs, f"ref_groups.{group_name}", errors)

    if "index_ref" in raw and (not isinstance(raw["index_ref"], str) or not raw["index_ref"].strip()):
        errors.append("`index_ref` 必须是非空字符串。")
    if "bootstrap_refs" in raw:
        _as_string_list(raw["bootstrap_refs"], "bootstrap_refs", errors)
    if "full_scope_keywords" in raw:
        _as_string_list(raw["full_scope_keywords"], "full_scope_keywords", errors)
    if "all_detailed_refs" in raw:
        _as_string_list(raw["all_detailed_refs"], "all_detailed_refs", errors)

    if archetype in {"fullstack-orchestrator", "frontend-specialist"} and not str(raw.get("index_ref", "")).strip():
        errors.append(f"`{archetype}` 默认要求提供 `index_ref`。")
    if archetype == "backend-source" and "bootstrap_refs" not in raw:
        warnings.append("`backend-source` 通常应提供 `bootstrap_refs`。")

    _validate_rules(raw.get("rules"), ref_groups, errors, warnings)
    if "validation_cases" in raw:
        _validate_validation_cases(raw["validation_cases"], errors, warnings)
    else:
        warnings.append("缺少 `validation_cases`，建议补回归样例。")

    ok = not errors and (not strict or not warnings)
    status = "PASS" if ok else "FAIL"
    lines = [f"[validate-reference-rules-schema] {status}", f"config={config_path.as_posix()}"]
    if archetype:
        lines.append(f"archetype={archetype}")
    if errors:
        lines.extend(f"- ERROR: {item}" for item in errors)
    if warnings:
        lines.extend(f"- WARN: {item}" for item in warnings)
    return ok, "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate reference_rules.json against builder schema expectations.")
    parser.add_argument("--rules", type=Path, required=True, help="Path to reference_rules.json")
    parser.add_argument("--archetype", choices=ARCHETYPE_CHOICES[:-1], help="Expected script archetype")
    parser.add_argument("--strict", action="store_true", help="Treat warnings as failures")
    args = parser.parse_args()

    ok, report = run_validation(args.rules.resolve(), args.archetype, args.strict)
    print(report)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
