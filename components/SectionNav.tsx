'use client'

import { useEffect, useState } from 'react'

export type SectionNavItem = { anchor: string; label: string }
export type SectionNavGroup = { label: string; items: SectionNavItem[] }

// 主诊断页（P1-6）区块导航条。i18n-free 展示组件：分组名与条目文案均由调用方 t() 解析后
// 传入（同 components/ReportToc.tsx 的既有约定）。高亮逻辑参考 ReportToc 的
// IntersectionObserver 模式，但渲染形态不同——本组件是横向 sticky 顶部 chips，不是纵向
// 侧栏，因此宽屏/窄屏共用同一套布局：窄屏天然靠 overflow-x 横向滚动，不需要两套实现。
// 调用方按各区块是否实际渲染过滤 items（例如「分引擎 SoV」只在 sovByEngine.length>1 时
// 才该出现），避免导航项指向不存在的锚点。
export function SectionNav({
  groups,
  ariaLabel,
}: {
  groups: SectionNavGroup[]
  ariaLabel: string
}) {
  const [activeAnchor, setActiveAnchor] = useState<string>('')

  useEffect(() => {
    const anchors = groups.flatMap((g) => g.items.map((i) => i.anchor))

    const handleIntersect = (entries: IntersectionObserverEntry[]) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          setActiveAnchor(entry.target.id)
        }
      })
    }

    const observer = new IntersectionObserver(handleIntersect, {
      rootMargin: '-10% 0px -70% 0px',
    })

    anchors.forEach((anchor) => {
      const el = document.getElementById(anchor)
      if (el) observer.observe(el)
    })

    return () => {
      observer.disconnect()
    }
  }, [groups])

  const visibleGroups = groups.filter((g) => g.items.length > 0)
  if (visibleGroups.length === 0) return null

  return (
    <nav className="section-nav no-print" aria-label={ariaLabel}>
      <div className="section-nav-scroll">
        {visibleGroups.map((group) => (
          <div className="section-nav-group" key={group.label}>
            <span className="section-nav-group-label">{group.label}</span>
            <div className="section-nav-group-items">
              {group.items.map((item) => (
                <a
                  key={item.anchor}
                  href={`#${item.anchor}`}
                  className={`section-nav-item${activeAnchor === item.anchor ? ' active' : ''}`}
                >
                  {item.label}
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
    </nav>
  )
}
