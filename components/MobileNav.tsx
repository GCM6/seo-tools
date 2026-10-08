'use client'

import { useEffect, useRef, useState } from 'react'
import { ButtonLink, buttonClass } from './Button'
import { LocaleSwitch } from './LocaleSwitch'
import { ThemeToggle } from './ThemeToggle'
import { TopNav } from './TopNav'
import { navItems, type SiteHeaderLabels } from './siteNav'

// 手机菜单抽屉（design-system §4 TopBar / §5 抽屉行）：与桌面顶栏同一组导航项、同一顺序。
// Esc 或点遮罩关闭；打开时焦点移到关闭按钮，关闭后回到菜单按钮。不用模糊遮罩、不用滑入动画。
export function MobileNav({ locale, labels }: { locale: string; labels: SiteHeaderLabels }) {
  const [isOpen, setIsOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!isOpen) return
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setIsOpen(false)
      triggerRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen])

  function close() {
    setIsOpen(false)
    triggerRef.current?.focus()
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={buttonClass({ variant: 'quiet', size: 'sm', iconOnly: true })}
        aria-label={labels.menuTitle}
        aria-expanded={isOpen}
        onClick={() => setIsOpen(true)}
      >
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {isOpen ? (
        <>
          <button type="button" className="ui-overlay" aria-label="Close Menu" tabIndex={-1} onClick={close} />
          <div className="ui-menu" role="dialog" aria-modal="true" aria-label={labels.menuTitle}>
            <div className="ui-menu__head">
              <span className="ui-menu__title">{labels.menuTitle}</span>
              <button
                ref={closeRef}
                type="button"
                className={buttonClass({ variant: 'quiet', size: 'sm', iconOnly: true })}
                aria-label="Close Menu"
                onClick={close}
              >
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <TopNav variant="menu" items={navItems(locale, labels)} onNavigate={() => setIsOpen(false)} />

            <div className="ui-menu__foot">
              <ButtonLink href={`/${locale}/new`} variant="primary" onClick={() => setIsOpen(false)}>
                {labels.newAnalysis}
              </ButtonLink>
              <div className="ui-menu__row">
                <span>{labels.language ?? 'Language'}</span>
                <LocaleSwitch />
              </div>
              <div className="ui-menu__row">
                <span>{labels.themeMode}</span>
                <ThemeToggle />
              </div>
            </div>
          </div>
        </>
      ) : null}
    </>
  )
}
