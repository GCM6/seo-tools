// Demo 固定数据：teamflow.cn 一套完整 baseline run。
// 数据与原型 docs/plan-d.md 的 <script> prompts 数组、SoV 卡片，以及 messages/zh.json screen2 叙事保持一致。
// 仅作 seed / 演示用途，非实测采集结果。

export const DEMO_RUN_ID = 'run_demo'
export const DEMO_PROJECT_ID = 'teamflow'
export const DEMO_DOMAIN = 'teamflow.cn'

export interface DemoPrompt {
  text: string
  present: boolean
}

// 20 条高购买意图提问 —— 照搬原型 prompts 数组（[问题, 是否出现]）。
// present=true 共 6 条 → AI 可见度 6/20，与 screen2 叙事一致。
export const DEMO_PROMPTS: DemoPrompt[] = [
  { text: '适合小团队的项目管理工具推荐', present: false },
  { text: 'best project management tool for small teams', present: false },
  { text: 'Asana 和 Notion 哪个更适合远程团队', present: false },
  { text: '免费的团队任务管理软件', present: true },
  { text: '甘特图在线协作工具', present: false },
  { text: '创业公司用什么项目管理工具', present: false },
  { text: 'teamflow 怎么样 好用吗', present: true },
  { text: '项目进度跟踪软件推荐', present: false },
  { text: '中文项目管理工具 哪个好', present: true },
  { text: '看板工具 trello 替代品', present: false },
  { text: '10 人团队协作软件', present: false },
  { text: '带甘特图的免费工具', present: false },
  { text: '远程团队任务分配工具', present: false },
  { text: 'teamflow 定价', present: true },
  { text: '产品团队迭代管理工具', present: false },
  { text: '敏捷开发看板工具推荐', present: false },
  { text: '低成本团队协作软件', present: true },
  { text: '项目管理软件对比 2026', present: false },
  { text: 'teamflow 和 asana 区别', present: true },
  { text: '小公司用的免费办公协作工具', present: false },
]

export interface DemoSov {
  name: string
  pct: number
  you: boolean
}

// 竞品 Share of Voice —— 照搬原型 .sov 卡片：teamflow 30%（你），Asana 70 / Notion 55 / Monday.com 45。
export const DEMO_SOV: DemoSov[] = [
  { name: 'teamflow', pct: 30, you: true },
  { name: 'Asana', pct: 70, you: false },
  { name: 'Notion', pct: 55, you: false },
  { name: 'Monday.com', pct: 45, you: false },
]
