'use client'

import { useRef, type KeyboardEvent } from 'react'

export interface ViewTab {
  id: string
  label: string
  /** 可选计数（tabular-nums 小字），0 也显示。 */
  count?: number
}

/** 面板要用的 id：调用方给面板 role="tabpanel"、id=viewPanelId、aria-labelledby=viewTabId。 */
export const viewTabId = (idBase: string, id: string) => `${idBase}-tab-${id}`
export const viewPanelId = (idBase: string, id: string) => `${idBase}-panel-${id}`

// 页内视图标签（规则库、知识库）：外观和诊断工作区的路由标签一致（.ui-tabs），但切的是同一页里的视图，
// 所以语义用 tablist / tab：方向键 / Home / End 切换并移动焦点，只有选中的标签在 Tab 序列里。i18n-free。
export function ViewTabs({
  idBase,
  label,
  tabs,
  value,
  onChange,
}: {
  idBase: string
  label: string
  tabs: ViewTab[]
  value: string
  onChange: (id: string) => void
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})

  function select(id: string) {
    onChange(id)
    refs.current[id]?.focus()
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    const i = tabs.findIndex((tab) => tab.id === value)
    if (e.key === 'ArrowRight') select(tabs[(i + 1) % tabs.length].id)
    else if (e.key === 'ArrowLeft') select(tabs[(i - 1 + tabs.length) % tabs.length].id)
    else if (e.key === 'Home') select(tabs[0].id)
    else if (e.key === 'End') select(tabs[tabs.length - 1].id)
    else return
    e.preventDefault()
  }

  return (
    <div className="ui-tabs">
      <div className="ui-tabs__list" role="tablist" aria-label={label}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            ref={(el) => {
              refs.current[tab.id] = el
            }}
            type="button"
            role="tab"
            id={viewTabId(idBase, tab.id)}
            className="ui-tabs__link"
            aria-selected={value === tab.id}
            aria-controls={viewPanelId(idBase, tab.id)}
            tabIndex={value === tab.id ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={onKeyDown}
          >
            {tab.label}
            {/* 空格只为无障碍名称读作「来源 29」；inline-flex 里的空白不占位，视觉间距由 gap 决定 */}
            {tab.count !== undefined ? (
              <>
                {' '}
                <span className="ui-tabs__count">{tab.count}</span>
              </>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  )
}
