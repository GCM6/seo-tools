'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ThemeToggle } from './ThemeToggle'

export function MobileNav({
  locale,
  labels,
}: {
  locale: string
  labels: {
    projects: string
    rules: string
    settings: string
    newAnalysis: string
    menuTitle: string
    themeMode: string
  }
}) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="mobile-nav-container" style={{ display: 'inline-flex', alignItems: 'center' }}>
      {/* 汉堡包按钮 */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="mobile-nav-toggle-btn"
        style={{
          background: 'transparent',
          border: 0,
          cursor: 'pointer',
          padding: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        aria-label="Open Menu"
      >
        <svg style={{ width: '24px', height: '24px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* 遮罩与抽屉 */}
      {isOpen && (
        <>
          {/* 背景遮罩 */}
          <div
            onClick={() => setIsOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 90,
              background: 'rgba(0, 0, 0, 0.4)',
              backdropFilter: 'blur(4px)',
              animation: 'ds-fade-in var(--transition-fast) forwards'
            }}
          />
          {/* 侧滑抽屉 */}
          <div
            className="mobile-drawer animate-slide-in-right"
            style={{
              position: 'fixed',
              top: 0,
              right: 0,
              bottom: 0,
              width: '280px',
              maxWidth: '85vw',
              background: 'var(--ds-surface-1)',
              borderLeft: '1px solid var(--ds-border-subtle)',
              boxShadow: 'var(--shadow-dialog)',
              zIndex: 100,
              display: 'flex',
              flexDirection: 'column',
              padding: '24px',
              gap: '24px',
              animation: 'ds-slide-in-right var(--transition-default) forwards'
            }}
          >
            {/* 抽屉头部 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="mobile-drawer-title" style={{ fontWeight: 700, color: 'var(--ds-ink)', fontSize: '18px' }}>
                {labels.menuTitle}
              </span>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="mobile-drawer-close-btn"
                style={{ background: 'transparent', border: 0, cursor: 'pointer', display: 'flex', padding: '6px' }}
                aria-label="Close Menu"
              >
                <svg style={{ width: '20px', height: '20px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* 菜单列表 */}
            <nav style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '12px' }}>
              <Link
                href={`/${locale}/projects`}
                onClick={() => setIsOpen(false)}
                style={{
                  fontSize: '15px',
                  fontWeight: 600,
                  color: 'var(--ds-ink)',
                  textDecoration: 'none',
                  padding: '8px 0',
                  borderBottom: '1px solid var(--ds-border-subtle)'
                }}
              >
                {labels.projects}
              </Link>
              <Link
                href={`/${locale}/rules`}
                onClick={() => setIsOpen(false)}
                style={{
                  fontSize: '15px',
                  fontWeight: 600,
                  color: 'var(--ds-ink)',
                  textDecoration: 'none',
                  padding: '8px 0',
                  borderBottom: '1px solid var(--ds-border-subtle)'
                }}
              >
                {labels.rules}
              </Link>
              <Link
                href={`/${locale}/settings`}
                onClick={() => setIsOpen(false)}
                style={{
                  fontSize: '15px',
                  fontWeight: 600,
                  color: 'var(--ds-ink)',
                  textDecoration: 'none',
                  padding: '8px 0',
                  borderBottom: '1px solid var(--ds-border-subtle)'
                }}
              >
                {labels.settings}
              </Link>
            </nav>

            {/* CTA 按钮与主题切换 */}
            <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <Link
                href={`/${locale}/new`}
                onClick={() => setIsOpen(false)}
                className="run-btn"
                style={{
                  marginTop: 0,
                  display: 'block',
                  width: '100%',
                  boxSizing: 'border-box',
                  textAlign: 'center',
                  textDecoration: 'none'
                }}
              >
                {labels.newAnalysis}
              </Link>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '12px', borderTop: '1px solid var(--ds-border-subtle)' }}>
                <span style={{ fontSize: '13px', color: 'var(--ds-body)' }}>{labels.themeMode}</span>
                <ThemeToggle />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
