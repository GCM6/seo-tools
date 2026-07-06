# google-seo-expert 专属清单

> 本 skill 的本地红线、局部联动与交付闭环。builder 全局清单之外的领域专属项。

## 本地真源口径
- 领域真源是 `docs/`；`references/` 只蒸馏不发明。任何 SEO 主张都应能回链到某个 `docs/` 章节。
- 术语唯一真源是 `references/00-glossary.md`，其他文件不得重定义术语。
- 路由唯一真源是 `references/trigger-matrix.md` + `reference-index.md`；`SKILL.md §6` 的主线清单须与之一致。
- **官方勘误唯一真源是 `references/10-official-corrections.md`**：docs 主张与谷歌官方冲突时在此定义修正口径（附核实日期与官方原文），受影响 reference 只行内标注 `〔官方勘误 → …〕`，不重复定义。docs 原文不改（历史笔记记录）。

## 局部联动（改一处必同步）
- 改 `docs/` → 刷新对应 `references/0X-*.md` + index 来源对照。
- 增/删 reference → 同步 `reference-index.md`、`trigger-matrix.md`、`SKILL.md §6.1`。
- 改红线 → 同步 `SKILL.md §7 BLOCKERS` + 对应 reference「红线」节 + 本清单。
- 谷歌官方政策变化 → 先更新 `references/10-official-corrections.md` 条目（附核实日期），再刷新受影响 reference 行内标注；涉红线时同步 `SKILL.md §7`。

## 交付闭环（每次用本 skill 出方案）
- [ ] 已判定 scenario + site_stage，信息不足先澄清。
- [ ] 结论引用来源（reference + docs 章节）。
- [ ] 全部 BLOCKERS 逐条排查无违反。
- [ ] 与谷歌官方政策冲突处已提示用户。
- [ ] 已核对 `references/10-official-corrections.md`，未复述被勘误主张；【经验】级数字未以事实口径引用。
- [ ] 涉付费/人工外链的方案已披露官方 link spam 定性与合规替代。

## 领域专属红线（高频踩坑，务必拦截）
- 不在上游需求不成立时承诺 SEO 效果。
- 不把「加广告/加外链」当没询盘的万能解。
- 不建议关键词堆砌、精准锚文本批量外链、小语种泛滥、无人工终审的批量 AI 内容。
- 不用第三方工具数据下结论（以 GSC 为准）。
- 降权修复不误删近期高质量新内容。
