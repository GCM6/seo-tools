# Builder 自审记录

## 2026-04-06 跨 skill 治理任务单建档

- 结论：已新增 `.meta/GOVERNANCE_TASKS.md` 作为跨 skill 治理任务单。
- 本轮优先级：`ai-admin-frontend-expert` > `ai-admin-fullstack-expert`。
- 当前收口方向：
  - `ai-admin-frontend-expert` 优先补“升级边界矩阵执行化 + 测试复盘回写 + 渐进式收口前端化表达”
  - `ai-admin-fullstack-expert` 第二顺位补“文档绑定校验闭环 + 旧异常链路差异门禁 + DB 测试分级策略”
- 约束：只下沉治理能力，不复制 `ai-backend-expert` 的后端领域真源与第二套 API / 响应 / 错误码正文。

## 2026-04-06 SCRIPT_TEMPLATES 粒度评估

- 结论：`SCRIPT_TEMPLATES.md` 当前 `597` 行，已超过普通文件 `500` 行建议值，但暂不拆分。
- 原因：该文件仍属于工作流聚合真源，`推荐脚本族`、`archetype 选型矩阵`、`分层骨架`、`reference_rules.json` 结构、模板骨架与 `CLI` 契约在脚本治理任务中高频联动阅读；此时强拆会增加跨文件跳转与同步成本。
- 当前措施：已在正文加入“暂不拆分”的显式说明，避免只留口头判断。
- 后续触发条件：
  - 文件超过 `800` 行；
  - 出现 `3` 个以上相对独立且低耦合的维护热点；
  - `SKILL.md` 或其他入口开始稳定按专题分别引用该文件的不同部分；
  - 某一专题在连续多轮修改中反复单独变动，适合独立成文。
