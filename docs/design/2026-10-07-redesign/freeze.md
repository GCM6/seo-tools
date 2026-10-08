# 改版封版清单（方向 A「检测报告」）

- **封版时间：** 2026-10-08
- **分支：** `feat/ui-redesign-a`
- **基线：** 本文件所在的提交，上一个提交是 `57912f0`。
- **追溯方法：** 之后任何界面改动，都可以用下面这条命令和基线对比：
  `git diff <基线提交> -- app/tokens.css app/ui.css app/globals.css components app marketing`

## 1. 权威文件

| 文件 | 管什么 | md5 |
|---|---|---|
| `docs/design/2026-10-07-redesign/ux-blueprint.md` | 每页的结构、交互、状态、文案 | `6d6ea8af1203bd1eb493aa6c74fd59e9` |
| `docs/design/2026-10-07-redesign/design-system.md` | 视觉、组件规格、token 用法、可访问性 | `06bb211d95697ec4206faad018de42b1` |
| `app/tokens.css` | 颜色、字号、圆角、宽度等 token 数值（唯一真源） | `12a62799c313432052d996bdca610426` |
| `marketing/app/tokens.css` | 营销站 token，必须与 `app/tokens.css` 一字不差 | `12a62799c313432052d996bdca610426` |
| `app/ui.css` | 全部组件样式（`@layer components`，类名 `ui-*`） | `3bd86fcd7a2d794664f43187a8551f4b` |
| `app/globals.css` | 只剩 Tailwind 入口、元素基础样式、`.shell`、打印规则、`.term` | `119be175d71e6de2def50fdf63cd919f` |
| `lib/design/style-guard.ts` | 样式守卫规则 | `9fd919c6e22e3e91ff68cbbfb90844df` |
| `lib/design/contrast.test.ts` | 对比度测试（AA） | `a34c8051c78ac5edcc7c5c3be0b33f8f` |
| `lib/design/marketing-tokens.test.ts` | 营销站同源测试 | `14272c1ac5a9c2e05a0591723efca52b` |

## 2. 冲突时以谁为准

按 `design-system.md` §0 的顺序，前者优先：

1. 用户当次的明确指示；
2. `ux-blueprint.md`；
3. `design-system.md`；
4. `app/tokens.css`；
5. `directions.html`。

营销站 token 不能单独改：要改就改 `app/tokens.css`，再执行 `cp app/tokens.css marketing/app/tokens.css`。否则同源测试会失败。

## 3. 自动守护（`pnpm test` 时都会跑）

- **样式守卫：** 白名单已清零。`app/`、`components/` 下任何 `.tsx` 出现以下写法，测试直接失败：
  - 写死的颜色；
  - 任意值类；
  - 内联视觉样式；
  - 渐变、动画、阴影类；
  - 调色板类。
- **对比度：** 文字和背景的每一种搭配，浅色、暗色两套都必须达到 AA。
- **营销站同源：** 营销站的 token、字体模块、Logo 路径必须与应用一致。

## 4. 实现中对蓝图的补充与偏离

- **顶栏「新建分析」改为次按钮**（用户拍板，`design-system.md` 已回改）。每屏只保留页面自己的 1 个主按钮；手机菜单抽屉里仍是主按钮。
- **新建分析第 2 步：** 预检成功时只保留「运行前检查」表（用户拍板）。预检加载中或失败时，才显示 GSC / AI 探针两行作兜底。
- **新增共用组件：**
  - `NewAnalysisModes`：二选一开始方式；
  - `ViewTabs`：页内视图标签；
  - `ShowMoreRows`：长表格折叠；
  - `RelativeDate`：相对日期。
- **改版中顺手修掉的问题：**
  - 基线诊断从不写开始时间，导致「最近一次」和回测锚点选错（`5ec20db`）；
  - 知识库「最近一次采集」取到最旧的那条（`c54c6d9`）。
- **页面主容器仍用旧类名 `.shell`**（`[locale]/layout.tsx`）。样式只有一条，保留在 `globals.css`。

## 5. 遗留开口

1. **营销站上线前要定：**
   - 首屏公开展示了 metadocu.com 的真实诊断结果；
   - 联系邮箱是个人邮箱；
   - 正式域名未定（目前用 `example.com` 占位）。
2. **逐像素比对只覆盖默认状态：** 共 44 张，含桌面、暗色、英文、390px。展开的行、出错提示、菜单打开这类交互状态，只有单元测试和人工抽查，没有像素基线。
3. **死文案按保守口径删除（189 个）：** 名字是常见词的 key（如 `title`、`note`）没有判定，可能还有少量没用的残留。
4. **分支状态：** 还没合并到 `main`，也没推送。
5. **本地环境：**
   - 3000 端口被另一个项目占用；
   - Inngest（8288）仍指向 3000；
   - 用户自己的 dev server 需要换端口重启，才能看到新样式和跑诊断。
