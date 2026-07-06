# Builder 自检链 Runbook

本文档是 `ai-skill-builder/scripts/` 的接手入口，用来说明 builder 自检链的最短执行路径、`--refresh-generated` 的使用方式，以及 `core_skill_script_snapshot.previous.json` 的生命周期。

## 1. 什么时候读

- 需要刷新或审计 builder 自身的 machine-generated 产物时
- 需要确认 builder 的 archetype 口径、入口文档和快照表是否漂移时
- 接手 builder 治理工作，但不想先通读完整 `SKILL.md` 时

## 2. 默认链路

按默认顺序执行：

1. `python skills/backend/ai-skill-builder/scripts/run_generate_core_skill_snapshot.py`
2. `python skills/backend/ai-skill-builder/scripts/validate_core_skill_snapshot_drift.py`
3. `python skills/backend/ai-skill-builder/scripts/validate_builder_archetype_consistency.py`
4. `python skills/backend/ai-skill-builder/scripts/validate_builder_entrypoints.py`
5. `python skills/backend/ai-skill-builder/scripts/run_script_template_audit.py --skill-root skills/backend/ai-skill-builder --archetype builder-audit --strict --with-smoke`

如果只想跑一条“刷新 + 校验 + smoke”的一键链，优先使用：

```bash
python skills/backend/ai-skill-builder/scripts/run_script_template_audit.py --skill-root skills/backend/ai-skill-builder --archetype builder-audit --refresh-generated --strict --with-smoke
```

## 3. 每个脚本负责什么

- `run_generate_core_skill_snapshot.py`
  刷新 `core_skill_script_snapshot.json`、`core_skill_script_snapshot.report.md`，并在需要时推进 `core_skill_script_snapshot.previous.json` 基线。
- `validate_core_skill_snapshot_drift.py`
  对比 `SCRIPT_TEMPLATES.md §3.2` 与最新快照是否一致。
- `validate_builder_archetype_consistency.py`
  对比 `skill_script_utils.py`、`SCRIPT_TEMPLATES.md`、`GOVERNANCE_PROFILE_TEMPLATE.md` 的 archetype 真源是否一致。
- `validate_builder_entrypoints.py`
  对比 `SKILL.md`、`QUICK_REFERENCE.md`、本 README 是否仍暴露正确的 builder 自检链与基线说明。
- `run_script_template_audit.py --refresh-generated`
  先刷新 machine-generated 产物，再串联 contract / drift / archetype / entrypoint / smoke。

## 4. generated 产物边界

- `core_skill_script_snapshot.json`
  当前有效快照真源，供脚本读取与 drift check 使用。
- `core_skill_script_snapshot.report.md`
  面向人类的报告，重点看 `§1` 建议回写表与 `§2` 变更摘要。
- `core_skill_script_snapshot.previous.json`
  上一版有效快照基线，只用于生成“相对上一次的结构变化”。

## 5. previous snapshot 生命周期

默认规则：

- 普通刷新时，不手动改 `core_skill_script_snapshot.previous.json`。
- 当 `run_generate_core_skill_snapshot.py` 发现当前 `core_skill_script_snapshot.json` 将被新内容覆盖时，会先把旧的 current snapshot 复制到 `core_skill_script_snapshot.previous.json`，再写入新的 current snapshot。
- 如果 current snapshot 没变化，就不推进 `previous`，避免制造伪 diff。

必须保留历史差异的场景：

- 3 个核心 skill 的脚本清单发生变化
- `reference_rules.json` 的 trigger 回归规模发生变化
- archetype 或 builder 对能力边界的归类口径发生变化
- 任何会让 `SCRIPT_TEMPLATES.md §3.2` 建议回写表变化的治理动作

允许重置基线的场景：

- 首次建立 `previous` 基线
- 明确接受了一轮大规模治理收口，且希望把“当前状态”定为新的比较起点
- 历史 `previous` 已确认失真、无法代表上一版有效状态

重置基线时的要求：

- 与普通脚本修补分开提交，避免把“治理变更”和“基线重置”混在一起
- 在本 README、`QUICK_REFERENCE.md` 或当轮交付说明中写清为什么允许重置
- 重置后先运行一次 `run_generate_core_skill_snapshot.py` 和 `validate_core_skill_snapshot_drift.py`，确认新基线可用

## 6. 接手建议

- 想知道“现在是什么状态”，先读 `core_skill_script_snapshot.report.md`
- 想知道“为什么变了”，先看 `core_skill_script_snapshot.report.md §2`
- 想知道“builder 日常该跑什么”，先跑 `run_script_template_audit.py --refresh-generated ...`
- 想知道“文档入口有没有漏同步”，直接跑 `validate_builder_entrypoints.py`
