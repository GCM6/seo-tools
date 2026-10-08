# Veris 设计系统 v1 · 方向 A「报告」

> 状态：2026-10-07 定稿，用户在三方向原型中选定 A。
> 本文**整体取代** `docs/d.md`（「炼图术 Studio」设计体系）对本项目的全部约束，包括 token、字体、色彩语义、动效规范。`app/globals.css` 里的 `--ds-*`、`--measured`/`--inferred`/`--gap`/`--good`、`--sp-*`、`--rd-*` 等旧变量在改版第 5 波删除。
> 配套文档：`ux-blueprint.md`（逐页结构与交互）、`tokens.css`（token 数值）、`check-contrast.py`（对比度复算）、`directions.html`（方向原型，只作参考）、`audit.md`（改版前审查）。

## 0. 冲突裁决顺序

不同文档对同一细节说法不一致时，按以下顺序裁决（前者优先）：

1. 用户当次的明确指示。
2. `ux-blueprint.md`：页面结构、交互行为、状态处理、文案。
3. 本文：视觉、组件规格、token 用法、可访问性。
4. `app/tokens.css`（实施后）或 `tokens.css`（实施前）：token 数值。与本文 §2 的表冲突时以 token 文件为准，并回改本文。
5. `directions.html`：方向原型，只作参考。

## 1. 原则与禁止清单

### 1.1 原则

1. **颜色只表达三类信息：** 严重度、AI 回答质量、可交互（强调色）。证据等级靠形状区分，优先级靠文字和排序表达。一种颜色只承担一种含义。
2. **每种用途只有一个组件。** 一种面板，一套按钮，一种严重度标记，一种证据徽章，一种表格，一种提示条，一种空状态，一种页头。新需求先找现有组件，找不到再扩展组件，不在页面里另起样式。
3. **结论先行。** 每页第一屏回答这一页要回答的那一个问题；超过 10 行的列表默认折叠。
4. **诊断页是工作区，不是向导。** 抬头写明检测协议、规则版本、证据数和进度；视图导航固定。
5. **工具外壳保持安静。** 不放 hero，不放营销页脚，不放装饰。
6. **状态如实呈现。** 未接入、未测量、采集失败、部分数据，各有明确文字和一个动作；不用骨架屏冒充「没有数据」，也不把失败显示成 0。
7. **动效只服务于功能。** 只用 120–180ms 的展开、切换和抽屉滑入；遵守 `prefers-reduced-motion`。

### 1.2 禁止清单

标 **[否决级]** 的条目不随审美讨论改变，要改必须先改本文。

- **[否决级]** 一种颜色同时表示两种含义。例如用证据色表示归属（自有域名 / 第三方），或用严重度色表示优先级。
- **[否决级]** 证据等级只靠颜色区分，或把「实测」用在 L0–L2 上（项目铁律，见 CLAUDE.md）。
- **[否决级]** 把采集失败、未接入显示成 0 或空白的「正常」结果。
- 渐变（背景、文字、按钮）、发光阴影、毛玻璃、模糊入场、数字滚动、列表逐条飞入、无限循环的装饰动画。
- 网格或点阵装饰背景、装饰圆弧或光斑、大色块横幅、营销式 hero（营销站首屏除外，且不得用渐变）。
- 英文大写等宽「眉标」（如 `INTELLIGENT INTAKE / W0`）、emoji、星星或魔杖类「智能」图标、文案里手写的 `✓ → ➔` 装饰符号（箭头只在链接末尾，由组件统一渲染）。
- 卡片彩色左边条；卡片套卡片；同一页出现两种以上面板样式。
- 页面或组件里写字面色值、任意字号（`text-[13px]`）、任意圆角或阴影。一律走 token 或 `ui-*` 组件类。
- 超过 10 行的列表默认全部展开。

## 2. Token

数值以 `tokens.css` 为准，下表供查阅。所有颜色都有浅色和暗色两个值。

### 2.1 颜色

| Token | 浅色 | 暗色 | 用途 |
|---|---|---|---|
| `--bg` | `#EDEFF2` | `#0E1115` | 工作台画布 |
| `--surface` | `#FFFFFF` | `#151920` | 面板、顶栏、报告纸面 |
| `--surface-2` | `#F4F6F8` | `#1B2028` | 表头、悬停行、代码块、浅底 |
| `--ink` | `#14171C` | `#E7EAEF` | 主文字、标题、「实测」徽章底 |
| `--ink-2` | `#464C56` | `#B1B8C3` | 次要文字、「抽样实测」徽章底 |
| `--ink-3` | `#656C78` | `#8D95A1` | 辅助小字、元信息 |
| `--line` | `#D8DCE2` | `#2A303A` | 分隔线、面板边框 |
| `--line-strong` | `#B3BAC5` | `#3B4350` | 次级按钮边框 |
| `--ctl-border` | `#858C98` | `#6B7482` | 输入框、下拉、复选框边框（≥3:1） |
| `--accent` | `#234A9A` | `#93ADEF` | 链接、主按钮、焦点环、当前视图 |
| `--accent-hover` | `#1B3B7D` | `#B0C4F4` | 主按钮悬停 |
| `--accent-ink` | `#FFFFFF` | `#0E1115` | 强调色上的文字 |
| `--accent-soft` | `#E7EDF8` | `#1E2840` | 选中行、文字选区 |
| `--on-ink` | `#FFFFFF` | `#0E1115` | 实心徽章上的文字 |
| `--sev-high` / `-soft` | `#B42318` / `#FBEAE8` | `#F08A7E` / `#3A1E1C` | 严重度高、错误 |
| `--sev-mid` / `-soft` | `#A44C0A` / `#FBF0E4` | `#E8A25A` / `#382A19` | 严重度中、警告 |
| `--sev-low` | `#8B929D` | `#8E96A3` | 严重度「提示」的方块（只用于图形） |
| `--ok` / `-soft` | `#2B7A4B` / `#E6F2EB` | `#6CC28F` / `#17301F` | 达标、已接受、已执行 |
| `--overlay` | `rgba(20,23,28,.45)` | `rgba(0,0,0,.6)` | 抽屉、对话框遮罩 |
| `--shadow-overlay` | `0 8px 24px rgba(20,23,28,.14)` | `0 8px 24px rgba(0,0,0,.5)` | 只用于浮层（下拉、抽屉、对话框） |

对比度：`python3 check-contrast.py tokens.css` 覆盖 28 对用法 × 2 个主题，共 56 对，2026-10-07 实算全部达标。文字 ≥4.5:1；图形和控件边界 ≥3:1（WCAG 1.4.11）。第 1 波会把同一检查写成 vitest 测试，改 token 后跑不过就不能合入。

### 2.2 字体

| 角色 | 字体栈 | 加载方式 |
|---|---|---|
| 正文 / 界面 `--font-sans` | IBM Plex Sans → PingFang SC → Hiragino Sans GB → Microsoft YaHei → Noto Sans SC → system-ui | 拉丁字形用 `next/font/google` 的 `IBM_Plex_Sans`（400/500/600），注入 `--font-plex-sans` |
| 数据 / 代码 `--font-mono` | IBM Plex Mono → ui-monospace → SF Mono → Menlo → Consolas | `IBM_Plex_Mono`（400/500），注入 `--font-plex-mono` |

- **中文用系统字体，不加载中文 webfont。** 苹方和微软雅黑质量够好，可以省下数 MB 下载。原型里加载 Noto Sans SC 只是为了跨平台截图一致。
- **mono 只用于字面数据：** URL、域名、证据 ID、规则版本、代码。数字统一用 `font-variant-numeric: tabular-nums`，不用 mono。
- 现状：`globals.css` 里声明的 Geist 从未加载过（全仓没有 `next/font` 和 `@font-face`），站点实际一直在用系统字体。

**字号阶梯（只有 8 级）：**

| Token | 值 | 用途 |
|---|---|---|
| `--fs-xs` | 12px | 徽章、表头、脚注、计数 |
| `--fs-sm` | 13px | 说明、元信息、表格正文、次级按钮 |
| `--fs-base` | 14px | 正文、控件、导航 |
| `--fs-md` | 16px | 区块小标题 h3、结论引导句 |
| `--fs-lg` | 19px | 区段标题 h2 |
| `--fs-xl` | 24px | 页面标题 h1 |
| `--fs-num` | 28px | 关键数字、报告标题 |
| `--fs-display` | 38px | 只用于营销站首屏 h1 |

**字重、行高与字距：**
- 字重只有 400、500、600。
- 正文行高 1.6，标题 1.3，大数字 1.1。
- 字距默认 0；h1 用 -0.005em；不使用大写字母加字距的写法。

### 2.3 间距

沿用 Tailwind v4 默认的 4px 间距刻度（`p-1` = 4px，`gap-4` = 16px），不注册新的间距 token。允许的值：4、8、12、16、20、24、32、40、48、64px。不允许任意值（`p-[13px]`）。

### 2.4 形状、层级与动效

- **圆角：** 一律 `--radius: 2px`，覆盖面板、按钮、输入框、徽章、表格和抽屉。只有状态圆点和进度点用 50%。
- **控件高度：** `--ctl-h` 34px（默认），`--ctl-h-sm` 28px（表格行内、筛选条）。
- **阴影：** 页面内元素一律不用阴影，层次靠边框和底色。`--shadow-overlay` 只给浮层用。
- **层级：** sticky 10、dropdown 20、drawer 30、dialog 40、toast 50。
- **动效：**
  - 时长 `--dur-fast` 120ms（悬停、按下）、`--dur` 180ms（展开、抽屉）；缓动 `--ease`。
  - 只允许动 `opacity`、`transform`，以及颜色的 transition。
  - `prefers-reduced-motion: reduce` 时全部关闭。
  - 加载转圈只在请求进行中出现。

### 2.5 布局与断点

| 用途 | 宽度 |
|---|---|
| 工作台内容区 `--w-app` | 1320px |
| 报告文档 `--w-doc` | 860px |
| 营销站内容区 `--w-mk` | 1180px |
| 段落最大行宽 `--w-text` | 65ch |

- **页边距：** 屏宽 <640px 时左右各 16px，≥640px 时 24px。
- **断点：** 沿用 Tailwind 默认值。手机 <640px；`sm` 640px；`md` 768px；`lg` 1024px；`xl` 1280px。
  - 工作台按桌面优先设计，手机上可用、不横向滚动。
  - 分享报告和营销站按手机优先设计。
- **横向溢出：**
  - 任何宽度下页面本身不得横向滚动。
  - 宽表格放在自己的 `overflow-x: auto` 容器里。
  - 验收时用元素级检查：越界元素的第一个非 visible 祖先必须是 auto/scroll。

## 3. 语义编码（产品级不变量）

### 3.1 证据等级：只用形状区分

| `claim_type` | 等级 | 徽章形状 | 中文 | English |
|---|---|---|---|---|
| `measured_hard` | L4 | 实心，底色 `--ink`，字色 `--on-ink` | 实测 | Measured |
| `measured_sample` | L3 | 实心，底色 `--ink-2`，字色 `--on-ink` | 抽样实测 | Sampled |
| `inferred` | L2 | 空心，1px `--ink-2` 边框，字色 `--ink-2` | 推断 | Inferred |
| `hypothesis` | L1 | 虚线 1px `--ink-3` 边框，字色 `--ink-3` | 疑似 | Hypothesis |

- 映射集中在 `lib/evidence.ts`，返回 `grade: 'hard' | 'sample' | 'inferred' | 'hypothesis'`。
  - 现状：L3/L4 都显示为「实测」，`hypothesis` 和 `inferred` 共用同一个橙色变体。
- 「疑似」统一用于 L1：徽章和报告里的证据阶梯说明用同一个词，不再在别处写「假设」。
- 证据徽章**只能**表示证据等级。自有域名 / 第三方、关键词缺口、达标这类信息，用 §3.2 的严重度标记或纯文字表达。

### 3.2 严重度：方块加文字

| `severity` | 文案 | 标记 |
|---|---|---|
| `high` | 高 | 8×8 方块，`--sev-high` |
| `mid` | 中 | 方块，`--sev-mid` |
| `ok` | 提示 | 方块，`--sev-low`（**不得用绿色**：这类条目写的是缺口，不是达标） |
| 达标项（规则通过） | 达标 | `✓` 用 `--ok` 色，由组件渲染 |

### 3.3 建议与执行状态

| 状态 | 文案 | 形式 |
|---|---|---|
| `draft` | 待确认 | 行内直接给「接受」主按钮和「否决」次按钮；只读视图显示空心圆 + 文字，`--accent` |
| `accepted` | 已接受 | `✓ 已接受`，`--ok` |
| `edited` | 已编辑 | `✓ 已编辑`，`--ok` |
| `rejected` | 已否决 | 文字用 `--ink-3`，标题加删除线；可以「改回待确认」 |
| 已执行（`applied_at` 不为空） | 已执行 · YYYY-MM-DD | `✓`，用 `--ink`，加日期 |

### 3.4 优先级：只用文字和排序

全站统一 4 个叫法，矩阵也用这 4 个名字，不再出现「速赢 / 战略 / 填充 / 低优先」：

| 值 | 名称 | 说明 |
|---|---|---|
| `quick_win` | 优先处理 | 高影响 · 低成本 |
| `strategic` | 重点投入 | 高影响 · 高成本 |
| `fill_in` | 顺手补齐 | 低影响 · 低成本 |
| `low` | 暂缓处理 | 低影响 · 高成本 |

### 3.5 AI 回答质量（品牌提问）

| 类别 | 颜色 |
|---|---|
| 有依据 | `--ok` |
| 疑似臆测 | `--sev-mid` |
| 承认不知道 | `--ink-3` |
| 断言无依据 | `--sev-high` |
| 未判定 | `--line-strong` 斜纹 |

用于堆叠条和图例，不做大圆圈。

### 3.6 数据可用性（如实呈现）

| 情形 | 呈现 | 动作 |
|---|---|---|
| 数据源未接入（没配置） | 「未接入」，`--ink-3` | 「去设置」链接 |
| 已接入但本轮没测 | 「本轮未测量」 | 「重新诊断」（如适用） |
| 采集失败 | 「采集失败：〈原因〉」，`--sev-high` | 「重试」 |
| 部分数据 | 「部分数据（n / N）」，并说明缺的是哪部分 | — |

骨架屏只用于路由正在加载（`loading.tsx`）。开发者指令（如 `.env` 变量名）只在设置页出现，诊断页和报告里不出现。

## 4. 组件规格

**实现约定：**
- 组件平铺在 `components/`，PascalCase。所有基础组件都不调用 i18n，文案由调用方 `t()` 后传入（同现有 `ProvenanceTag` 约定）。
- 样式写在 `app/ui.css`，放进 `@layer components`，类名统一加 `ui-` 前缀，修饰符用 `--`，例如 `ui-btn ui-btn--primary ui-btn--sm`。
- 页面只用 Tailwind 的布局类（flex/grid/gap/间距/显示与隐藏），不在页面里写颜色、字号、圆角和阴影。

| 组件（文件） | 类名 | 规格 |
|---|---|---|
| **Button**（`Button.tsx`） | `ui-btn` + `--primary` / `--secondary`（默认）/ `--quiet` / `--danger`，`--sm` | 高 34/28px；左右内边距 14/10px；字号 13px；字重 500；圆角 2px。传 `href` 时渲染 Next `Link`；`loading` 时禁用并显示转圈；图标在文字左侧，14px。每个视图只放 1 个 primary |
| **Link** | 原生 `a` | `--accent`，悬停加下划线（偏移 3px）。行内「查看全部」类链接末尾带 → |
| **EvidenceBadge**（`EvidenceBadge.tsx`，取代 `ProvenanceTag`） | `ui-ev` + `--hard` / `--sample` / `--inferred` / `--hypothesis` | 高 20px；内边距 0 7px；字号 12px；字重 500；不换行。可带 `title` 写就近解释；可选后缀 `· n=23` |
| **Tag**（`Tag.tsx`） | `ui-tag`，`--accent` | 中性短标签：平台、类型、归属（自有 / 第三方）、缺口类型等不是证据等级、也不是严重度的信息。高 20px，`--surface-2` 底，`--line` 边，12px `--ink-2`。`accent` 只用于需要突出的那一类（如「自有」） |
| **SeverityMark**（`SeverityMark.tsx`） | `ui-sev` + `--high` / `--mid` / `--low` / `--pass` | 8×8 方块（达标用 ✓）+ 文字，字号 12px，`--ink-2` |
| **StatusText**（`StatusText.tsx`） | `ui-status` + `--draft` / `--accepted` / `--edited` / `--rejected` / `--applied` | 见 §3.3 |
| **Panel**（`Panel.tsx`） | `ui-panel`，`ui-panel__head` / `__body` / `__foot` | `--surface` 底、1px `--line` 边、2px 圆角、无阴影。内边距 20px（手机 16px）；紧凑档 `--dense` 为 12px。**不允许面板套面板**；面板内的分组用 `ui-divider` 或表格 |
| **SectionHeader**（`SectionHeader.tsx`） | `ui-sec-head` | h2（19px/600）+ 右侧说明（13px `--ink-3`）或一个链接动作；与内容间距 14px；区段之间间距 32px |
| **PageHeader**（`PageHeader.tsx`） | `ui-page-head` | 用于非诊断页：面包屑（可选）+ h1（24px）+ 一句说明（14px `--ink-2`）+ 右侧动作（最多 1 个 primary + 2 个 secondary）。下方 1px 分隔线 |
| **WorkspaceHeader**（`WorkspaceHeader.tsx`） | `ui-ws-head` | 用于诊断页：面包屑 / h1 域名 / `Facts` 事实栏 / `Lifecycle` 进度 / 右侧动作。见蓝图 §3 |
| **Facts**（`Facts.tsx`） | `ui-facts` | `dl` 网格，单元最小 118px，1px `--line` 网格线，标签 12px `--ink-3`，值 13px `--ink`；报告抬头同样用它 |
| **Lifecycle**（`Lifecycle.tsx`） | `ui-life` | 一行步骤，用 22px 横线连接。已完成：✓ + `--ink-2`；当前：8px `--accent` 圆点 + 600 字重；未来：`--ink-3`。**只显示状态，不可点击** |
| **WorkspaceTabs**（`WorkspaceTabs.tsx`） | `ui-tabs` | 诊断视图导航：链接 + 计数（12px `--ink-3`）。当前项 2px `--accent` 下划线 + 600 字重 + `aria-current="page"`。右侧是「原始数据」链接组。手机上可横向滚动（在自身容器内） |
| **Table** | `ui-table`，`ui-table-wrap` | 表头 12px `--ink-3`，`--surface-2` 底；行 1px `--line` 分隔，行高 ≥40px；数字列右对齐 + tabular-nums；悬停行 `--surface-2`。宽表格包一层 `ui-table-wrap`（overflow-x auto）。可展开行见 §5 |
| **InlineBar** | `ui-bar` | 高 6px，`--surface-2` 轨道，`--ink-3` 填充；高亮项（如自有域名）用 `--accent`。比例按本表最大值计算 |
| **ShowMore**（`ShowMore.tsx`，client） | — | 列表超过 `limit`（默认 10）时先截断，末尾是「显示全部 N 个」/「收起」次级小按钮；展开后焦点留在按钮上 |
| **ResultTable**（`ResultTable.tsx`） | `ui-result` | 「检测结果」表：检测项目 / 结果 / 说明 / 证据，共 4 列。结果用 19px/500 + tabular-nums，单位或分母 13px `--ink-3`。手机上每行折成「名称–结果」一行 + 说明一行 + 徽章一行 |
| **Notice**（`Notice.tsx`） | `ui-notice` + `--info`（默认）/ `--warn` / `--error` / `--success` | 一个组件取代现有 4 种以上提示样式。info：`--surface` 底 + `--line` 边；其余用对应 `-soft` 底 + 同色 1px 边 + 左侧 14px 图标。正文 13px `--ink`，可带一个链接动作。**不加左侧彩条** |
| **EmptyState**（`EmptyState.tsx`，取代 `EmptyStateCTA`、`.pending-block`、拿 `.note` 当空状态的写法） | `ui-empty` | 面板内居左：标题（14px/600）+ 一句原因（13px `--ink-2`）+ 最多 1 个动作。不放插画和大图标 |
| **Disclosure** | `ui-disclosure`（原生 `details`/`summary`） | 摘要行 14px/500，左侧 ▸/▾ 由 CSS 绘制；不需要 JS |
| **CodeBlock**（`CodeBlock.tsx`） | `ui-code` | `--surface-2` 底，mono 13px，内边距 12px；超长内容在自身容器内横向滚动；右上角「复制」小按钮（client 叶子组件），复制后显示「已复制」2 秒 |
| **Markdown**（`MarkdownPreview.tsx` 重写样式） | `ui-prose` | AI 回答和报告正文**必须渲染** Markdown，不显示 `**` 原文。段距 8px，列表缩进 20px，行内代码用 `--surface-2` |
| **Field**（`Field.tsx`） | `ui-field`，`ui-input` / `ui-select` / `ui-textarea` / `ui-check` | 标签 13px/500 → 控件（34px 高，`--ctl-border`）→ 提示 12px `--ink-3` → 错误 12px `--sev-high`（同时设 `aria-invalid` 和 `aria-describedby`）。占位符用 `--ink-3`，不作为标签使用 |
| **FilterChips**（`FilterChips.tsx`） | `ui-chips` | 一组切换按钮（`aria-pressed`）：28px 高、2px 圆角、1px `--line-strong`；选中项 `--ink` 底 + `--on-ink` 字；计数用 tabular-nums |
| **Drawer**（`EvidenceDrawer.tsx` 重写样式） | `ui-drawer` | 右侧滑入，宽 min(560px, 100vw)，`--surface` 底 + `--shadow-overlay`，遮罩 `--overlay`。Esc 关闭，焦点限制在抽屉内，关闭后焦点回到触发处 |
| **Spinner** | `ui-spin` | 14px 环形转圈，只在请求进行中显示；减少动效模式下改为静态省略号 |
| **Skeleton**（`Skeleton.tsx`） | `ui-skel` | 只用于路由加载（`loading.tsx`）：`--surface-2` 底，不加扫光 |
| **Logo**（`Logo.tsx`） | `ui-logo` | 单色三角标志（去掉竖线和填充）+ 「Veris」字标（600，16px，不做双色） |
| **TopBar**（`SiteHeader.tsx` 重写） | `ui-top` | 高 56px，`--surface` 底，下边 1px `--line`。左侧 Logo + 主导航（项目 / 规则库 / 知识库 / 设置），右侧语言、主题切换和「新建分析」（primary）。手机上主导航收进菜单 |
| **Footer**（`SiteFooter.tsx` 重写） | `ui-foot` | 应用内只保留一行：`Veris · v0.1.0 · 规则 rules_v10 · 协议 v2`，12px `--ink-3`。去掉营销式多栏页脚 |

## 5. 交互状态矩阵

所有过渡 120ms（`--dur-fast`）。焦点环一律 `outline: 2px solid var(--accent); outline-offset: 2px`，只在 `:focus-visible` 时显示。

| 元素 | 默认 | 悬停 | 按下 | 焦点 | 禁用 | 加载 / 选中 / 错误 |
|---|---|---|---|---|---|---|
| 主按钮 | `--accent` 底，`--accent-ink` 字 | `--accent-hover` 底 | 同悬停，内容下移 1px | 焦点环 | 不透明度 .45，`cursor: not-allowed` | 加载：转圈 + 文字不变 + 禁用 |
| 次级按钮 | `--surface` 底，`--line-strong` 边，`--ink` 字 | 边框改 `--ink-3` | `--surface-2` 底 | 焦点环 | 不透明度 .45 | 加载：同主按钮 |
| 安静按钮 | 透明，`--ink-2` 字 | `--surface-2` 底，`--ink` 字 | `--line` 底 | 焦点环 | 不透明度 .45 | — |
| 危险按钮 | `--surface` 底，`--sev-high` 字，`--sev-high` 边 | `--sev-high-soft` 底 | 同悬停 | 焦点环 | 不透明度 .45 | 二次确认：同位置换成「确认删除？ 确认 / 取消」，不用 `confirm()` |
| 链接 | `--accent` | 下划线 | — | 焦点环 | — | 外链末尾加 ↗ |
| 视图标签 | `--ink-2` | `--ink` | — | 焦点环 | — | 当前：`--ink`、600 字重、2px `--accent` 下划线、`aria-current` |
| 输入框 / 下拉 / 多行输入 | `--surface` 底，`--ctl-border` 边 | 边框改 `--ink-3` | — | 边框改 `--accent` + 焦点环 | `--surface-2` 底，`--ink-3` 字 | 错误：边框改 `--sev-high` + 错误文字 + `aria-invalid` |
| 复选 / 单选 | 16px，`--ctl-border` 边 | 边框改 `--ink-3` | — | 焦点环 | 不透明度 .45 | 选中：`--accent` 底 + 白色勾 |
| 筛选芯片 | `--surface` 底，`--line-strong` 边 | 边框改 `--ink-3` | — | 焦点环 | — | 选中（`aria-pressed`）：`--ink` 底 + `--on-ink` 字 |
| 可展开表格行 | 标题是按钮（`aria-expanded`） | 标题加下划线；整行 `--surface-2` 底 | — | 焦点环（标题按钮） | — | 展开：详情区 `hidden` 移除，焦点留在标题按钮上 |
| 显示更多 | 次级小按钮「显示全部 N 个」 | 同次级按钮 | — | 焦点环 | — | 展开后文案改为「只看前 10 个」 |
| 提问编号格 | 32px，`--line-strong` 边，`--ink-3` 字 | 边框改 `--ink-3`，字改 `--ink` | — | 焦点环 | — | 选中（`aria-pressed`）：`--accent` 1px 边加内阴影；「提到你」的格子用 `--ok` 实心 + 白字 |
| 抽屉 | — | — | — | 打开时焦点移到标题 | — | Esc / 遮罩点击关闭；关闭后焦点回到触发处 |

## 6. 可访问性

- **对比度：** 见 §2.1，以脚本实算为准，不靠肉眼。第 1 波起由 vitest 测试守护。
- **键盘：** 所有交互元素可用 Tab 到达，顺序与视觉顺序一致；可展开项用原生 `button` 或 `details`。
- **语义：**
  - 每页只有一个 h1；区段用 h2，块内用 h3，不跳级。
  - 视图导航用 `nav` + `aria-current`。
  - 表格用 `table` / `th scope`。
  - 图表要有 `role="img"` 和写出具体数值的 `aria-label`。
- **触控目标：** 桌面 ≥28px；手机 ≥40px（手机上 `ui-btn--sm` 自动提到 40px 高）。
- **减少动效：** `prefers-reduced-motion: reduce` 时关闭全部 transition 和 animation，转圈改为静态文字。

## 7. 暗色模式

- 由 `html.dark` 类切换，只换颜色 token，不做整块反色（现状里黑色面板在暗色下会变成白色，这个问题要消除）。
- **主题脚本与 hydration：** 主题脚本在 hydration 之前写入 `dark` 类，所以 `<html>` 必须加 `suppressHydrationWarning`。现状缺这一项，控制台会报 hydration mismatch。
- **Tailwind 的 `dark:` 变体改为跟随 `.dark` 类：** 在 `globals.css` 里写 `@custom-variant dark (&:where(.dark, .dark *));`。现状它跟随的是系统设置，主题切换管不到它。
- **分享报告 `/share` 固定浅色：** 客户转发和打印都需要稳定外观。

## 8. 文案与格式

- **语气：** 直述事实，主语明确，不喊口号。例如「AI 目前不会主动推荐你」，而不是「穿透 GEO 迷雾」。
- **标签：**
  - 中文界面不出现英文大写眉标。
  - 不用 emoji。
  - 状态末尾的 `✓` 由 `StatusText` 组件渲染，文案里不写。
- **术语表：**
  - 实测 / 抽样实测 / 推断 / 疑似；
  - 高 / 中 / 提示 / 达标；
  - 优先处理 / 重点投入 / 顺手补齐 / 暂缓处理；
  - 待确认 / 已接受 / 已编辑 / 已否决 / 已执行；
  - 执行清单（取代「输出」作为视图名，路由仍为 `/output`）。
- **时间：**
  - 一律显示本地时间 `YYYY-MM-DD HH:mm`，不显示裸 ISO 字符串。
  - 运行时间优先取 `started_at`，没有时回落到 `finished_at`。
  - 两者都没有时显示「时间未记录」，不显示「—」。
- **数字：**
  - 分数写成「0 / 23」，斜杠两侧留空格。
  - 小数最多 1 位。
  - 百分比用整数，并配上分子分母。
- **错误文案：** 先说哪里出了问题，再说怎么办，不道歉。例如「AI 引擎没有返回结果（超时）。稍后重试，或在设置里换一个引擎。」
- **采样口径：** 写清实际接入的引擎和样本量，例如「本轮只接入了 DeepSeek，23 个提问」，不罗列没有接入的引擎。

## 9. 工程约束（守护设计系统，避免再次失控）

- **文件：**
  - token 在 `app/tokens.css`；
  - 组件样式在 `app/ui.css`（`@layer components`）；
  - `globals.css` 只保留 `@import`、`@theme`、`@custom-variant` 和基础元素样式。旧样式逐波删除。
- **CSS 分层（第 1 波实测踩到）：** 元素选择器（`body`、`a`、`h1`–`h3`、`button`、`::selection`、`:focus-visible`）一律放进 `@layer base`。未分层的规则会压过 `@layer components` 里的 `ui-*` 类：未分层的 `a { color }` 曾把主按钮文字染成蓝色，导致蓝底蓝字看不见。
- **样式守护测试**（`lib/design/style-guard.test.ts`）扫描 `app/**/*.tsx` 和 `components/**/*.tsx`，命中以下写法即失败：
  - 十六进制或 `rgb(` 字面色值；
  - Tailwind 任意值 `-[`，包括颜色、字号、间距、圆角、阴影；
  - 内联 `style` 里的 `color` / `background` / `fontSize` / `borderRadius` / `boxShadow`；
  - `animate-` 类；
  - `bg-gradient` / `from-` / `to-`。
- **白名单与开关：**
  - 改版期间用白名单列出尚未迁移的文件，每迁完一个就从白名单删掉。
  - 第 5 波白名单必须清空。
  - 唯一例外：图表里由数据算出来的 `width: N%`。
- **对比度测试**（`lib/design/contrast.test.ts`）解析 `app/tokens.css`，按 §2.1 的配对断言。
- **依赖：** 不引入组件库，不引入新的运行时依赖。字体经 `next/font` 在构建期自托管。
