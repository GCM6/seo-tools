'use client'

import { useSyncExternalStore } from 'react'
import { useTranslations } from 'next-intl'
import { buttonClass } from './Button'

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
  const label = theme === 'light' ? t('themeToggleToDark') : t('themeToggleToLight')

  return (
    <button
      type="button"
      onClick={() => applyTheme(theme === 'light' ? 'dark' : 'light')}
      className={buttonClass({ variant: 'quiet', size: 'sm', iconOnly: true })}
      title={label}
      aria-label={label}
    >
      {theme === 'light' ? (
        // 太阳：当前浅色，点击切到暗色
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m12.728 12.728l.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
        </svg>
      ) : (
        // 月亮：当前暗色，点击切到浅色
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      )}
    </button>
  )
}
