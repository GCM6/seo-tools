# TARGET_CHECKLIST 模板

本文档用于给单个 target skill 固定“专属检查清单层”，把只对该 skill 生效的真源口径、局部联动与交付闭环要求沉淀到 `.meta/CHECKLIST.md`，避免这类规则继续混入 builder 全局 checklist。

## 何时创建或更新

- 某个 target skill 存在明显不同于其他 skill 的专属真源口径时
- 某个 target skill 有自己独有的强制联动文件、局部门禁或交付闭环要求时
- 发现 builder `.meta/GLOBAL_CHECKLIST.md` 长期保存了某个 target skill 的局部规则，需要回收到 target 自己目录时

## 使用原则

- `.meta/CHECKLIST.md` 只写当前 target skill 独有的规则，不重复 builder 全局治理元规则
- 动态扫描发现、修复待办、迁移过程记录仍分别归 `REVIEW.md`、`ISSUES.md`、`MIGRATION.md`
- 若某条规则其实适用于所有被治理 skill，应回写 builder `.meta/GLOBAL_CHECKLIST.md`，而不是继续塞在 target checklist
- 若当前 skill 暂时没有明确的本地专属规则，可以不创建 `.meta/CHECKLIST.md`

## 推荐骨架

```markdown
# [skill-name] 专属检查清单 (T-01 ~ T-N)

> **定位**：`[skill-name]` 的 target 专属检查清单单一真源。
> **使用方式**：builder 在读取 `.meta/GOVERNANCE_PROFILE.md` 后继续读取本文，对本 skill 的局部真源口径、强制联动与交付闭环逐条排雷。

---

## 核心真源口径（T-01 ~ T-xx）

| # | 红线 | ✅ 正确 | ❌ 错误 |
|---|------|--------|--------|
| T-01 | ... | ... | ... |

## 局部联动与交付闭环（T-xx ~ T-N）

| # | 红线 | ✅ 正确 | ❌ 错误 |
|---|------|--------|--------|
| T-xx | ... | ... | ... |
```

## 填写建议

- 核心真源口径优先写当前 skill 自己维护的 API、命名、脚本、目录、工作流硬约束
- 局部联动只写“改这里就必须同步改哪里”的强耦合关系，不要把所有相关文件都抄进去
- 交付闭环只写当前 skill 特有的强制要求，例如 doc-first、task 回写、测试问题总结、最终答复回报格式等
- 若当前 skill 经常面对 legacy 路由、旧 helper、mock → 真实、兼容聚合输入等过渡态，优先在 checklist 中固化“真源规范优先”“兼容窗口 / 退出条件必填”“默认渐进式收口”的 target 级红线
- 条目命名优先稳定、短句、可对照；避免把一句话写成一整段说明
