# 首页 UI/UX 全面审查报告与修复计划

> 以 10 年 UI/UX 专家视角，从代码层面逐行审查 Veris 首页（`app/[locale]/page.tsx`）及相关组件、全局样式，发现以下问题并提出修复方案。

---

## 🔴 严重问题（运行时错误 / 功能损坏）

### 1. `runTypeLabels` 和 `statusLabels` 未定义 — 运行时崩溃

> [!CAUTION]
> [page.tsx#L247](file:///Users/gongchunming/Public/website/seo-tools/app/%5Blocale%5D/page.tsx#L247) 引用了 `runTypeLabels` 和 `statusLabels`，但**整个文件中从未声明或导入这两个变量**。当用户有项目且有 `latestRun` 时，页面会直接 **ReferenceError 崩溃**。

**修复**：从 `tProjects` 翻译中获取这两个字典，参照 [projects/page.tsx#L51-52](file:///Users/gongchunming/Public/website/seo-tools/app/%5Blocale%5D/projects/page.tsx#L51-L52) 的做法：
```tsx
const statusLabels = tProjects.raw('status') as Record<string, string>
const runTypeLabels = tProjects.raw('runType') as Record<string, string>
```

---

## 🟠 排版 / 字号问题（Typography）

### 2. 字号体系混乱 — 大量内联魔数，无 token 约束

| 位置 | 当前字号 | 问题 |
|------|---------|------|
| Welcome sub-label (L49) | `11px` | 过小，可读性差 |
| Welcome title (L52) | `26px` | 非标准阶梯值 |
| Welcome desc (L55) | `13.5px` | `.5px` 精度无意义 |
| Section title h2 (L105, L266) | `16px` | 与 body `15px` 仅差 1px，层级感弱 |
| 项目域名 Link (L231) | `14.5px` | 非标准 `.5px` |
| 数据源名称 (L315) | `12.5px` | 非标准 `.5px` |
| 导航链接 nav-link (CSS L403) | `13.5px` | 非标准 `.5px` |
| Onboarding 步骤标题 (L167) | `12.5px` | 非标准 `.5px` |
| Onboarding 步骤描述 (L168) | `11.5px` | 过小，信息密度不足 |
| Onboarding 描述文字 (L150) | `12px` | 主描述文字太小 |
| CTA 按钮 (L68) | `13px` | Banner 内 CTA 太小 |
| Market 标签 (L237) | `11px` | 过小 |

**修复方案**：
- 建立明确的字号阶梯：`11px (mono/eyebrow)` → `12px (caption)` → `13px (small)` → `14px (body-sm)` → `15px (body)` → `16px (h3)` → `18px (h2)` → `22px (h1)` → `28px (hero)`
- 消灭所有 `.5px` 字号（`13.5px`→`14px`、`12.5px`→`13px`、`14.5px`→`15px`）
- 使用 CSS 自定义属性而非内联硬编码

### 3. 字重层级不统一

- Welcome title `fontWeight: 800` → 过重，显得粗暴（应 `700`）
- Section title h2 `fontWeight: 700` + `fontSize: 16px` → 太小配太重，视觉失衡
- 数据源标签 `fontWeight: 500`、状态标签 `fontWeight: 600` → 层级混乱

---

## 🟠 间距 / 内边距问题（Spacing）

### 4. Dashboard 容器缺少页面级内边距

[page.tsx#L34](file:///Users/gongchunming/Public/website/seo-tools/app/%5Blocale%5D/page.tsx#L34) 的 `.dashboard-hub` **没有自身的 padding**，完全依赖外层 `.shell` 的 `padding: 32px 20px 64px`。但 `.shell` 的水平内边距仅 `20px (--sp-md)`，在宽屏上内容**紧贴两侧**，视觉拥挤。

**修复**：
- `.shell` 的水平 padding 至少 `var(--sp-lg)` (24px)，大屏 `var(--sp-xl)` (32px)
- 或给 `.dashboard-hub` 加 `padding: 0 var(--sp-xs)` 呼吸空间

### 5. Welcome Banner 内边距不一致

- `padding: '32px 24px'` → 上下 32px、左右 24px，上下比左右大 33%，比例失调
- 应统一为 `32px` 或 `32px 28px`

### 6. 两栏布局间距问题

- `.dashboard-main` gap `24px` 配 `2fr 1fr` 比例 → 右栏过窄（约 33% 宽度），数据源列表挤压
- 建议改为 `3fr 2fr` 或 `1.5fr 1fr` 更均衡

### 7. 项目卡片间距层级混乱

- 卡片内 `padding: 20px`，但 header 区域 `marginBottom: 8px` 太紧
- `borderTop: paddingTop: 12px` → 内容和分隔线贴太近
- Market 标签 `padding: 2px 6px` → 水平边距不足，点击目标太小

### 8. Onboarding 空态引导卡片

- 三步卡片与上方描述之间 `marginTop: 8px` 太小
- 卡片内 `padding: 16px` 但 `gap: 24px` → 卡片和外部空间不协调

---

## 🟠 样式架构问题

### 9. 大量内联 style 对象 — 维护灾难

> [!WARNING]
> 首页 [page.tsx](file:///Users/gongchunming/Public/website/seo-tools/app/%5Blocale%5D/page.tsx) 几乎**每个元素都使用内联 `style={{}}`**，总计约 50+ 处内联样式。这导致：
> - 无法复用和统一管理
> - 无法利用 CSS 伪类（`:hover`、`:focus`）
> - 代码膨胀、可读性差
> - 与 `globals.css` 中已有的 token 系统完全脱节

**修复方案**：将首页的内联样式迁移到 `globals.css` 中作为命名 class（如 `.dashboard-hub`、`.welcome-banner`、`.project-summary-card` 等），统一使用 design token。

### 10. Tailwind 与 Vanilla CSS 混用

| 组件 | 问题 |
|------|------|
| [Logo.tsx](file:///Users/gongchunming/Public/website/seo-tools/components/Logo.tsx#L11) | 使用 `flex items-center gap-2 w-7 h-7 text-xl font-bold` 等 Tailwind 类 |
| [projects/page.tsx#L21](file:///Users/gongchunming/Public/website/seo-tools/app/%5Blocale%5D/projects/page.tsx#L21) | 使用 `text-lg font-semibold` |
| [projects/page.tsx#L22](file:///Users/gongchunming/Public/website/seo-tools/app/%5Blocale%5D/projects/page.tsx#L22) | 使用 `mt-1 text-sm text-neutral-500` |
| [SiteFooter.tsx#L74](file:///Users/gongchunming/Public/website/seo-tools/components/SiteFooter.tsx#L74) | 使用 `mb-3` |

项目 CSS 核心使用 Vanilla CSS + design token，但多处组件混入了 Tailwind 工具类。虽然 `@import "tailwindcss"` 存在，但这种混合模式造成样式优先级和维护混乱。

**修复方案**：Logo 等组件中的 Tailwind 类统一改为 `globals.css` 中的语义类或内联 `style`（使用 token），保持一致性。

### 11. CSS 媒体查询断点冲突

- 移动端断点**两套共存且冲突**：
  - L1008: `@media (max-width: 768px)` + L1039: `@media (min-width: 769px)`
  - L2695: `@media (max-width: 1024px)` + L2715: `@media (min-width: 1025px)`
- 两套断点都控制 `.mobile-nav-trigger` 的显隐，且都用了 `!important`
- `768px` 和 `1024px` 语义不同但都管同一个元素，哪个生效取决于加载顺序

**修复**：统一为一套断点系统（建议 `1024px` 作为折叠点），删除 `768px` 那套冗余规则。

---

## 🟡 交互 / 可用性问题

### 12. `.card:hover` 全局 transform 误伤

[globals.css#L558-L562](file:///Users/gongchunming/Public/website/seo-tools/app/globals.css#L558-L562) 定义了 `.card:hover { transform: translateY(-2px) }`，但这个效果会应用于：
- Onboarding 空态卡片（不需要 hover 效果）
- 数据源健康度面板（不需要 hover 效果）
- 所有使用 `.card` 的容器

**修复**：仅对可点击的项目卡片应用 hover 上浮效果。

### 13. 项目卡片 favicon `onError` 事件处理器

[page.tsx#L225-L227](file:///Users/gongchunming/Public/website/seo-tools/app/%5Blocale%5D/page.tsx#L225-L227) 的 `onError` 回调是一个函数，但这是 Server Component，**不能使用事件处理器**。这会导致 Next.js 报错或静默失败。

**修复**：使用 `<img>` 标签的纯 CSS 兜底方案，或将卡片渲染逻辑提取为 Client Component。

### 14. Welcome Banner CTA 按钮点击区域偏小

- `padding: 10px 20px` + `fontSize: 13px` → 按钮太小，移动端不利于触控
- 建议至少 `padding: 12px 24px` + `fontSize: 14px`

### 15. 「查看所有项目」链接点击区域

- `fontSize: 12px` 的纯文本链接，无 padding → 移动端 tap target 不达标（建议 ≥ 44px）

---

## 🟡 视觉一致性问题

### 16. 颜色使用不规范

- Welcome Banner 背景 `boxShadow: 'rgba(11, 110, 116, 0.15)'` → 硬编码 RGB，应使用 token
- Banner 内的白色 `color: '#ffffff'` → 应使用 `var(--ds-on-primary)`
- CTA 按钮 `backgroundColor: '#ffffff'` → 硬编码

### 17. 数据源列表最后一项 `borderBottom` 多余

[page.tsx#L316](file:///Users/gongchunming/Public/website/seo-tools/app/%5Blocale%5D/page.tsx#L316) 每个数据源项都有 `borderBottom`，但最后一项的底边框紧贴卡片边缘，视觉多余。

**修复**：使用 `:last-child { border-bottom: none }` 或改用 `gap` + `border-top` 模式。

### 18. `.run-btn` 的 `text-decoration` 缺失

`.run-btn` 作为 `<Link>` 使用时默认继承 `a` 标签的 `color: var(--measured)` 和可能的下划线。Header 内的 `.run-btn` 样式中有 `margin-top: 0`，但没有 `text-decoration: none`。

---

## 🟡 响应式 / 移动端问题

### 19. 首页两栏在平板尺寸下的表现

- `grid-template-columns: 2fr 1fr` 在 `769px-1024px` 范围内，两栏会各自压缩
- 右栏数据源列表在此范围内可能文字溢出或换行丑陋
- 虽然 `1024px` 断点下有堆叠规则，但 `768px-1024px` 之间有两套冲突规则

### 20. Welcome Banner 在小屏下的装饰圆形

背景装饰圆（L77-L89）`right: '-10%'` 在窄屏下可能导致水平滚动条。

**修复**：给 `.welcome-banner` 加 `overflow: hidden`（已有）— 确认无遗漏。

---

## Proposed Changes

### 组件 1：首页逻辑修复

#### [MODIFY] [page.tsx](file:///Users/gongchunming/Public/website/seo-tools/app/%5Blocale%5D/page.tsx)

1. **添加 `runTypeLabels` 和 `statusLabels` 定义**（修复崩溃）
2. **统一字号**：消除所有 `.5px` 魔数
3. **优化间距**：统一 padding/margin 使用 token
4. **将大量内联样式迁移到 CSS class**
5. **修复 Server Component 中的 `onError` 事件处理器问题**

---

### 组件 2：全局样式修复

#### [MODIFY] [globals.css](file:///Users/gongchunming/Public/website/seo-tools/app/globals.css)

1. **建立字号阶梯变量**（`--text-*` 系列）
2. **统一媒体查询断点**，删除冲突的 `768px` 规则
3. **添加首页专用 class**（`.welcome-banner-*`、`.dashboard-section-title`、`.source-list-item`）
4. **`.card:hover` 限定为可交互卡片**
5. **`.shell` 水平内边距调大**
6. **`.run-btn` 补充 `text-decoration: none`**

---

### 组件 3：Logo 组件 Tailwind 清理

#### [MODIFY] [Logo.tsx](file:///Users/gongchunming/Public/website/seo-tools/components/Logo.tsx)

将 Tailwind 工具类替换为 `style` 属性 + design token，或在 `globals.css` 中定义 `.brand-logo` class。

---

### 组件 4：项目列表页 Tailwind 清理

#### [MODIFY] [projects/page.tsx](file:///Users/gongchunming/Public/website/seo-tools/app/%5Blocale%5D/projects/page.tsx)

将 `text-lg`、`font-semibold`、`mt-1`、`text-sm`、`text-neutral-500` 替换为 design token。

---

## Verification Plan

### 手动验证
- 在 `pnpm dev` 下访问首页，确认有项目时不再崩溃
- 检查所有页面字号是否符合阶梯规范
- 验证 `768px-1024px` 范围内布局正确
- 验证暗色模式下颜色是否正常
- 检查移动端（375px、390px、414px）布局
