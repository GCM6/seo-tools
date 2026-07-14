'use client'

import { useSyncExternalStore } from 'react'
import { useTranslations } from 'next-intl'

const THEME_CHANGE_EVENT = 'veris-theme-change'
type Theme = 'light' | 'dark'

function subscribeToThemeChange(callback: () => void) {
  window.addEventListener(THEME_CHANGE_EVENT, callback)
  return () => window.removeEventListener(THEME_CHANGE_EVENT, callback)
}

function readDocumentTheme(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

function serverTheme(): Theme {
  return 'light'
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  try {
    localStorage.setItem('theme', theme)
  } catch {
    // 隐私模式或受限测试环境下仍允许主题在当前页面生效。
  }
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT))
}

export function ThemeToggle() {
  const t = useTranslations('nav')
  const theme = useSyncExternalStore(subscribeToThemeChange, readDocumentTheme, serverTheme)

  const toggleTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light'
    applyTheme(nextTheme)
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="theme-toggle"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '34px',
        height: '34px',
        borderRadius: '8px',
        background: 'var(--ds-surface-2)',
        border: '1px solid var(--ds-border-subtle)',
        cursor: 'pointer',
        padding: 0
      }}
      title={theme === 'light' ? t('themeToggleToDark') : t('themeToggleToLight')}
      aria-label={theme === 'light' ? t('themeToggleToDark') : t('themeToggleToLight')}
    >
      {theme === 'light' ? (
        // 太阳 SVG (表示切换去 dark)
        <svg style={{ width: '16px', height: '16px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m12.728 12.728l.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
        </svg>
      ) : (
        // 月亮 SVG (表示切换去 light)
        <svg style={{ width: '16px', height: '16px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      )}
    </button>
  )
}
