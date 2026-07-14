'use client'

import { useEffect, useState } from 'react'

export function ReportToc({
  toc,
  title,
}: {
  toc: [string, string][]
  title: string
}) {
  const [activeAnchor, setActiveAnchor] = useState<string>('')

  useEffect(() => {
    // 监听所有的 section 节点
    const handleIntersect = (entries: IntersectionObserverEntry[]) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          setActiveAnchor(entry.target.id)
        }
      })
    }

    const observer = new IntersectionObserver(handleIntersect, {
      rootMargin: '-20% 0px -60% 0px', // 当 section 位于视口中偏上区域时激活
    })

    toc.forEach(([anchor]) => {
      const el = document.getElementById(anchor)
      if (el) {
        observer.observe(el)
      }
    })

    return () => {
      observer.disconnect()
    }
  }, [toc])

  return (
    <nav className="report-toc no-print" aria-label={title}>
      <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {toc.map(([anchor, label]) => {
          const isActive = activeAnchor === anchor
          return (
            <li
              key={anchor}
              className={isActive ? 'active' : ''}
              style={{
                borderLeft: isActive ? '2px solid var(--ds-primary)' : '2px solid transparent',
                paddingLeft: '12px',
                marginLeft: '-2px',
                transition: 'all var(--transition-fast)'
              }}
            >
              <a
                href={`#${anchor}`}
                style={{
                  textDecoration: 'none',
                  fontSize: '13px',
                  color: isActive ? 'var(--ds-primary)' : 'var(--ds-body)',
                  fontWeight: isActive ? 600 : 500,
                  transition: 'all var(--transition-fast)'
                }}
              >
                {label}
              </a>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
