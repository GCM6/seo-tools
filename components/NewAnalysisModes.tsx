'use client'

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

type Mode = 'site' | 'goal'
const MODES: Mode[] = ['site', 'goal']

// 新建分析的两种开始方式（ux-blueprint §4）：页面顶部二选一，不再上下堆两个表单。
// 两个面板都保持挂载（没选中的 hidden），来回切换不丢已填的内容。
// 标签页键盘约定：左右方向键 / Home / End 切换并移动焦点。i18n-free。
export function NewAnalysisModes({
  labels,
  site,
  goal,
}: {
  labels: { label: string; site: string; goal: string }
  site: ReactNode
  goal: ReactNode
}) {
  const [mode, setMode] = useState<Mode>('site')
  const id = useId()
  const tabs = useRef<Record<Mode, HTMLButtonElement | null>>({ site: null, goal: null })

  function select(next: Mode) {
    setMode(next)
    tabs.current[next]?.focus()
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    const i = MODES.indexOf(mode)
    if (e.key === 'ArrowRight') select(MODES[(i + 1) % MODES.length])
    else if (e.key === 'ArrowLeft') select(MODES[(i - 1 + MODES.length) % MODES.length])
    else if (e.key === 'Home') select(MODES[0])
    else if (e.key === 'End') select(MODES[MODES.length - 1])
    else return
    e.preventDefault()
  }

  return (
    <div className="ui-modes">
      <div className="ui-segmented" role="tablist" aria-label={labels.label}>
        {MODES.map((m) => (
          <button
            key={m}
            ref={(el) => {
              tabs.current[m] = el
            }}
            type="button"
            role="tab"
            id={`${id}-tab-${m}`}
            aria-selected={mode === m}
            aria-controls={`${id}-panel-${m}`}
            tabIndex={mode === m ? 0 : -1}
            onClick={() => setMode(m)}
            onKeyDown={onKeyDown}
          >
            {labels[m]}
          </button>
        ))}
      </div>
      {MODES.map((m) => (
        <div key={m} role="tabpanel" id={`${id}-panel-${m}`} aria-labelledby={`${id}-tab-${m}`} hidden={mode !== m}>
          {m === 'site' ? site : goal}
        </div>
      ))}
    </div>
  )
}
