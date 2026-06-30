# 炼图术 Studio 设计体系与主题 Token 深度总结

本文档对“炼图术 Studio”项目的主体设计理念、字体排版、主题 Token 以及动效规范进行了深度总结，旨在为另一个项目提供可以直接复制、接入并快速落地的“设计系统真相来源 (Single Source of Truth)”。

---

## 一、 设计体系概述

炼图术 Studio 的视觉体系基于 **Apple 极简白/极暗色** 为基调：
1. **极简克制** — 扁平卡片，通过微妙的底色差、阴影和边框来表达深度，摒弃复杂的毛玻璃效果 (`backdrop-filter`) 和浮夸发光。
2. **双色语义** — 
   * **Apple Blue** (`#0071e3`) 代表品牌、基础操作、普通导航及链接。
   * **Mystic Violet** (`#6366f1`) 代表 AI 元素、智能生成、Style DNA、效果选择器。
3. **内容优先** — 慷慨的留白与精致的排版，大段正文采用 Apple 风格的 `17px`。
4. **Geist 双字体** — UI 界面使用 Geist Sans，AI 生成的内容与代码使用 Geist Mono，实现人类 UI 与 AI 产物的视觉区隔。

---

## 二、 字体与排版 (Typography)

### 2.1 字体族声明
在 Next.js / React 项目中，推荐使用 `next/font/google` 引入字体。
* **UI 表面**: `Geist Sans`
* **Prompt / AI 输出 / 代码**: `Geist Mono`

**CSS 变量映射**：
```css
--font-sans: var(--font-geist-sans), system-ui, -apple-system, sans-serif;
--font-mono: var(--font-geist-mono), 'JetBrains Mono', 'SF Mono', monospace;
```

### 2.2 字号与排版层级
大字号（Display 级别）推荐使用**负字间距 (Negative Letter-spacing)**，让文字排版更有呼吸感和现代编辑感。

| Token / 变量名 | 字号 | 字重 (Weight) | 行高 (Line Height) | 字间距 (Letter Spacing) | 典型用途 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `--typo-display-hero` | `48px` | 700 (Bold) | 1.08 | `-1.5px` | 首页 Hero 大标题 |
| `--typo-display-lg` | `36px` | 600 (Semibold) | 1.15 | `-0.5px` | 页面标题 |
| `--typo-display-md` | `28px` | 600 (Semibold) | 1.2 | `-0.25px` | 区块标题 |
| `--typo-title-lg` | `22px` | 600 (Semibold) | 1.3 | `0` | 卡片组标题 |
| `--typo-title-md` | `17px` | 600 (Semibold) | 1.4 | `0` | 组件标题 |
| `--typo-title-sm` | `15px` | 600 (Semibold) | 1.4 | `0` | 列表标签 |
| `--typo-body-lg` | `17px` | 400 (Regular) | 1.6 | `0` | 大段正文 (Apple 风格) |
| `--typo-body-md` | `15px` | 400 (Regular) | 1.6 | `0` | 默认正文 |
| `--typo-body-sm` | `13px` | 400 (Regular) | 1.5 | `0` | 辅助说明文字 |
| `--typo-caption` | `12px` | 400 (Regular) | 1.4 | `0` | 时间戳、元数据 |
| `--typo-label` | `11px` | 600 (Semibold) | 1.3 | `0.5px` | 大写分类标签 (uppercase) |
| `--typo-mono-md` | `14px` | 400 (Regular) | 1.6 | `0` | Prompt 输出 |
| `--typo-mono-sm` | `12px` | 400 (Regular) | 1.5 | `0` | 行内代码 |
| `--typo-button` | `15px` | 500 (Medium) | 1.0 | `0` | 按钮文字 |
| `--typo-nav` | `14px` | 500 (Medium) | 1.4 | `0` | 导航链接 |

---

## 三、 主题 Token (CSS 变量)

你可以直接将以下 CSS 代码复制到新项目的全局样式文件（如 `variables.css` 或 `globals.css`）中。

```css
/* =========================================================================
   炼图术 Studio — 主题 CSS 变量 (Light / Dark 模式)
   ========================================================================= */

:root {
  /* ── 3.1 品牌与强调色 (Light) ── */
  --ds-primary:        #0071e3;                  /* 主按钮、活跃指示、品牌蓝 */
  --ds-primary-hover:  #0077ed;                  /* 主色 Hover 态 */
  --ds-primary-active: #005bb5;                  /* 主色 Active 态 */
  --ds-primary-muted:  rgba(0, 113, 227, 0.08);  /* 选中背景、徽章底色 */
  --ds-primary-ring:   rgba(0, 113, 227, 0.15);  /* 聚焦环 */
  --ds-on-primary:     #ffffff;                  /* 主色之上的文本色 */

  --ds-mystic:         #6366f1;                  /* AI 主色 (紫罗兰) */
  --ds-mystic-hover:   #5558e0;                  /* AI 色 Hover */
  --ds-mystic-muted:   rgba(99, 102, 241, 0.08);  /* AI 选中背景 */
  --ds-mystic-ring:    rgba(99, 102, 241, 0.15);  /* AI 聚焦环 */
  --ds-on-mystic:      #ffffff;                  /* AI 色之上的文本色 */

  /* ── 3.2 画布与表面色 (Light) ── */
  --ds-canvas:            #ffffff;               /* 页面底色背景 */
  --ds-surface-1:         #f5f5f7;               /* 卡片、侧边栏、面板背景 */
  --ds-surface-2:         #e8e8ed;               /* 输入框底色、嵌套卡片 */
  --ds-surface-3:         #d2d2d7;               /* 滚动条轨道、三级深度 */
  --ds-surface-elevated:  #ffffff;               /* 弹窗、下拉悬浮层 (Dialog/Popover) */

  /* ── 3.3 文字层级 (Light) ── */
  --ds-ink:    #1d1d1f;                          /* 标题、核心主文字 */
  --ds-body:   #424245;                          /* 默认正文 */
  --ds-muted:  #86868b;                          /* 副标题、次要标签、时间戳 */
  --ds-ghost:  #aeaeb2;                          /* 占位符、禁用态文本 */
  
  --selection-bg: #005bb5;                       /* 选中文本背景色 */
  --selection-foreground: #ffffff;               /* 选中文本前景色 */

  /* ── 3.4 边框色 (Light) ── */
  --ds-border:         #d2d2d7;                  /* 默认分割线、卡片边框 */
  --ds-border-subtle:  #e8e8ed;                  /* 内部分割线 */
  --ds-border-strong:  #aeaeb2;                  /* 强对比边框 */
  --ds-border-primary: rgba(0, 113, 227, 0.25);  /* 选中/聚焦边框 */
  --ds-border-mystic:  rgba(99, 102, 241, 0.25);  /* AI 聚焦边框 */

  /* ── 3.5 语义色 (Light/Dark 保持一致) ── */
  --ds-success:       #30d158;                   /* 锁定、成功状态 */
  --ds-success-muted: rgba(48, 209, 88, 0.10);   /* 成功背景 */
  --ds-error:         #ff3b30;                   /* 错误、危险操作 */
  --ds-error-muted:   rgba(255, 59, 48, 0.10);   /* 错误背景 */
  --ds-warning:       #ff9f0a;                   /* 警告、草稿状态 */
  --ds-warning-muted: rgba(255, 159, 10, 0.10);
  --ds-info:          #64d2ff;                   /* 信息提示 */
  --ds-info-muted:    rgba(100, 210, 255, 0.10);

  /* ── 3.6 间距系统 (4px 步进) ── */
  --sp-xxs:     4px;
  --sp-xs:      8px;
  --sp-sm:      12px;
  --sp-base:    16px;
  --sp-md:      20px;
  --sp-lg:      24px;
  --sp-xl:      32px;
  --sp-2xl:     40px;
  --sp-3xl:     48px;
  --sp-section: 64px;
  --sp-hero:    80px;

  /* ── 3.7 圆角系统 ── */
  --rd-none: 0px;
  --rd-xs:   4px;                                /* 行内标签 */
  --rd-sm:   6px;                                /* 小按钮 */
  --rd-md:   8px;                                /* 输入框、次要按钮 */
  --rd-lg:   12px;                               /* 卡片、选择器外框 */
  --rd-xl:   16px;                               /* 弹窗面板 (Dialog) */
  --rd-2xl:  20px;                               /* 大卡片、Hero 元素 */
  --rd-pill: 9999px;                             /* 胶囊按钮、药丸徽章 */

  /* ── 3.8 阴影系统 (Light) ── */
  --shadow-card:       0 1px 2px rgba(0, 0, 0, 0.04);
  --shadow-card-hover: 0 4px 12px rgba(0, 0, 0, 0.06);
  --shadow-dropdown:   0 4px 16px rgba(0, 0, 0, 0.08);
  --shadow-dialog:     0 8px 32px rgba(0, 0, 0, 0.12);
  --shadow-toast:      0 4px 24px rgba(0, 0, 0, 0.10);

  /* ── 3.9 过渡效果 ── */
  --transition-fast:    150ms ease;
  --transition-default: 200ms ease;
  --transition-smooth:  300ms ease-out;
  --transition-page:    400ms cubic-bezier(0.25, 1, 0.5, 1);

  /* ── 3.10 常用布局尺寸 ── */
  --layout-sidebar-width:  240px;
  --layout-topnav-height:  56px;
  --layout-max-content:    1120px;
}

/* ─── 暗色模式下覆盖的变量 ─── */
.dark {
  /* ── 品牌与强调色 (Dark) ── */
  --ds-primary:        #2997ff;
  --ds-primary-hover:  #2c8eeb;
  --ds-primary-active: #0071e3;
  --ds-primary-muted:  rgba(41, 151, 255, 0.12);
  --ds-primary-ring:   rgba(41, 151, 255, 0.20);
  --ds-on-primary:     #ffffff;

  --ds-mystic:         #818cf8;
  --ds-mystic-hover:   #6366f1;
  --ds-mystic-muted:   rgba(129, 140, 248, 0.12);
  --ds-mystic-ring:    rgba(129, 140, 248, 0.20);
  --ds-on-mystic:      #ffffff;

  /* ── 画布与表面色 (Dark) ── */
  --ds-canvas:            #0f0e14;
  --ds-surface-1:         #18171f;
  --ds-surface-2:         #1e1d27;
  --ds-surface-3:         #252430;
  --ds-surface-elevated:  rgba(24, 23, 31, 0.95);

  /* ── 文字层级 (Dark) ── */
  --ds-ink:    #f5f5f7;
  --ds-body:   #a1a1a6;
  --ds-muted:  #6e6e73;
  --ds-ghost:  #48484a;
  
  --selection-bg: #8bd9ff;
  --selection-foreground: #08131d;

  /* ── 边框色 (Dark) ── */
  --ds-border:         rgba(255, 255, 255, 0.08);
  --ds-border-subtle:  rgba(255, 255, 255, 0.05);
  --ds-border-strong:  rgba(255, 255, 255, 0.15);
  --ds-border-primary: rgba(41, 151, 255, 0.30);
  --ds-border-mystic:  rgba(129, 140, 248, 0.30);

  /* ── 阴影系统 (Dark - 阴影力度减弱，辅助边框进行视觉区隔) ── */
  --shadow-card:       0 1px 2px rgba(0, 0, 0, 0.20);
  --shadow-card-hover: 0 4px 12px rgba(0, 0, 0, 0.30);
  --shadow-dropdown:   0 4px 16px rgba(0, 0, 0, 0.35);
  --shadow-dialog:     0 8px 32px rgba(0, 0, 0, 0.50);
  --shadow-toast:      0 4px 24px rgba(0, 0, 0, 0.40);
}
```

---

## 四、 动效与扁平降级类 (CSS Utilities)

### 4.1 动画关键帧 (Keyframes)
在全局 CSS 中添加以下关键帧，它们主要支持微妙的转场过渡：

```css
@keyframes ds-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}

@keyframes ds-slide-up {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

@keyframes ds-image-pop {
  from { opacity: 0; transform: scale(0.96); }
  to   { opacity: 1; transform: scale(1); }
}

@keyframes ds-shimmer {
  0%   { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
```

### 4.2 动效 Class 封装
可以封装成如下实用类：
```css
.animate-slide-up {
  animation: ds-slide-up var(--transition-page) forwards;
}
.animate-fade-in {
  animation: ds-fade-in var(--transition-smooth) forwards;
}
.animate-image-pop {
  animation: ds-image-pop 380ms cubic-bezier(0.25, 1, 0.5, 1) forwards;
}
.animate-shimmer {
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.6) 50%,
    transparent 100%
  );
  background-size: 200% 100%;
  animation: ds-shimmer 1.8s ease infinite;
}
```

### 4.3 扁平化 Glass 替代方案 (降级毛玻璃)
为了贯彻“极简克制、无毛玻璃”的理念，项目将 `.glass` 降级为无毛玻璃、无阴影的实色卡片，从而提供非常干净清爽的 Apple 质感：
```css
.glass {
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  background: var(--ds-surface-1) !important;
  border: none !important;
  box-shadow: none !important;
  border-radius: var(--rd-2xl) !important;
}

.glass-sm {
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  background: var(--ds-surface-1) !important;
  border: none !important;
  box-shadow: none !important;
  border-radius: var(--rd-lg) !important;
}
```

---

## 五、 在另一个项目中的落地接入指南

### 5.1 方案 A：原生 CSS / 纯 CSS 变量
直接在项目的根入口 CSS 文件（如 `index.css` 或 `App.css`）最上方引入上一节的 CSS 变量。然后在样式中通过 `var()` 使用即可：
```css
.my-card {
  background-color: var(--ds-surface-1);
  border: 1px solid var(--ds-border);
  border-radius: var(--rd-lg);
  box-shadow: var(--shadow-card);
  transition: all var(--transition-default);
}
.my-card:hover {
  box-shadow: var(--shadow-card-hover);
}
```

### 5.2 方案 B：在 Tailwind CSS v4.x 中接入
如果你另一个项目使用的是 **Tailwind CSS v4.0+**，可以直接在 CSS 文件中通过 `@theme inline` 语法将变量注册进 Tailwind 的编译器中，这样在 HTML 里可以直接写 `bg-background`、`text-ink` 等：

```css
@import "tailwindcss";

@theme inline {
  /* 基础映射 */
  --color-background: var(--ds-canvas);
  --color-foreground: var(--ds-ink);
  
  /* 字体映射 */
  --font-sans: var(--font-sans);
  --font-mono: var(--font-mono);

  /* 主题色系映射 */
  --color-primary: var(--ds-primary);
  --color-primary-hover: var(--ds-primary-hover);
  --color-primary-muted: var(--ds-primary-muted);
  --color-on-primary: var(--ds-on-primary);
  
  --color-mystic: var(--ds-mystic);
  --color-mystic-hover: var(--ds-mystic-hover);
  --color-mystic-muted: var(--ds-mystic-muted);
  --color-on-mystic: var(--ds-on-mystic);

  /* 文字颜色映射 */
  --color-ink: var(--ds-ink);
  --color-body: var(--ds-body);
  --color-muted: var(--ds-muted);
  --color-ghost: var(--ds-ghost);

  /* 边框映射 */
  --color-border: var(--ds-border);
  --color-border-subtle: var(--ds-border-subtle);
  --color-border-strong: var(--ds-border-strong);

  /* 圆角映射 */
  --radius-xs: var(--rd-xs);
  --radius-sm: var(--rd-sm);
  --radius-md: var(--rd-md);
  --radius-lg: var(--rd-lg);
  --radius-xl: var(--rd-xl);
  --radius-2xl: var(--rd-2xl);
  --radius-pill: var(--rd-pill);
}
```

### 5.3 方案 C：在 Tailwind CSS v3.x 中配置 `tailwind.config.js`
如果是 **Tailwind CSS v3.x**，则需要在 `tailwind.config.js` 文件的 `extend` 中进行如下配置：

```javascript
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class', // 启用基于 class 的暗色模式
  theme: {
    extend: {
      colors: {
        // 映射 CSS 变量，确保能够响应 Dark 模式切换
        canvas: 'var(--ds-canvas)',
        surface: {
          1: 'var(--ds-surface-1)',
          2: 'var(--ds-surface-2)',
          3: 'var(--ds-surface-3)',
          elevated: 'var(--ds-surface-elevated)',
        },
        primary: {
          DEFAULT: 'var(--ds-primary)',
          hover: 'var(--ds-primary-hover)',
          active: 'var(--ds-primary-active)',
          muted: 'var(--ds-primary-muted)',
        },
        mystic: {
          DEFAULT: 'var(--ds-mystic)',
          hover: 'var(--ds-mystic-hover)',
          muted: 'var(--ds-mystic-muted)',
        },
        ink: 'var(--ds-ink)',
        body: 'var(--ds-body)',
        muted: 'var(--ds-muted)',
        ghost: 'var(--ds-ghost)',
        border: {
          DEFAULT: 'var(--ds-border)',
          subtle: 'var(--ds-border-subtle)',
          strong: 'var(--ds-border-strong)',
        }
      },
      borderRadius: {
        xs: 'var(--rd-xs)',
        sm: 'var(--rd-sm)',
        md: 'var(--rd-md)',
        lg: 'var(--rd-lg)',
        xl: 'var(--rd-xl)',
        '2xl': 'var(--rd-2xl)',
        pill: 'var(--rd-pill)',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        'card-hover': 'var(--shadow-card-hover)',
        dropdown: 'var(--shadow-dropdown)',
        dialog: 'var(--shadow-dialog)',
        toast: 'var(--shadow-toast)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      }
    },
  },
  plugins: [],
}
```

### 5.4 方案 D：Shadcn/ui 桥接配置
如果另一个项目也是用 **Shadcn/ui**，你只需要在 CSS 文件中加入以下桥接映射，Shadcn/ui 的所有官方组件（例如 `Button`、`Dialog`、`Input` 等）将自动继承炼图术 Studio 的极简白/极暗色主题：

```css
:root {
  --background:          var(--ds-canvas);
  --foreground:          var(--ds-ink);
  --card:                var(--ds-surface-1);
  --card-foreground:     var(--ds-ink);
  --popover:             var(--ds-surface-elevated);
  --popover-foreground:  var(--ds-ink);
  --primary:             var(--ds-primary);
  --primary-foreground:  var(--ds-on-primary);
  --secondary:           var(--ds-surface-1);
  --secondary-foreground: var(--ds-ink);
  --muted:               var(--ds-surface-1);
  --muted-foreground:    var(--ds-muted);
  --accent:              var(--ds-surface-1);
  --accent-foreground:   var(--ds-ink);
  --destructive:         var(--ds-error);
  --border:              var(--ds-border);
  --input:               var(--ds-border);
  --ring:                var(--ds-primary);
  --radius:              12px; /* 对应 --rd-lg */
}

.dark {
  --background:          var(--ds-canvas);
  --foreground:          var(--ds-ink);
  --card:                var(--ds-surface-1);
  --card-foreground:     var(--ds-ink);
  --popover:             var(--ds-surface-elevated);
  --popover-foreground:  var(--ds-ink);
  --primary:             var(--ds-primary);
  --primary-foreground:  var(--ds-on-primary);
  --secondary:           var(--ds-surface-1);
  --secondary-foreground: var(--ds-ink);
  --muted:               var(--ds-surface-1);
  --muted-foreground:    var(--ds-muted);
  --accent:              var(--ds-surface-1);
  --accent-foreground:   var(--ds-ink);
  --destructive:         var(--ds-error);
  --border:              var(--ds-border);
  --input:               var(--ds-border);
  --ring:                var(--ds-primary);
}
```
