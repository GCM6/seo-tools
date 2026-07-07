'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import type { HealthItem } from '@/lib/settings/data-source-health'

// 顶栏常驻的数据源健康度 pill + 抽屉。client leaf——只有它需要交互（toggle）。
// pill 显示 up/total，配色随健康度分档；点开抽屉逐源列出状态 + 缺失影响，
// 未接入（down）的源给「去连接」直达设置页对应锚点。（spec §SP-G2b-4）
export function DataSourceHealth({
  items,
  up,
  total,
  locale,
  projectId,
}: {
  items: HealthItem[]
  up: number
  total: number
  locale: string
  projectId?: string
}) {
  const t = useTranslations('dataHealth')
  const [open, setOpen] = useState(false)

  // 健康度分档：全绿 ok / 半 warn / 全缺 bad——驱动 pill 语义配色。
  const tone = up >= total ? 'ok' : up === 0 ? 'bad' : 'warn'

  // GSC 连接已按项目移到项目详情页（SP-G1b）；其余源（aiProbe/dataforseo…）仍在全局设置页。
  // 有 projectId 时 gsc「去连接」指向项目详情，否则回退设置页锚点（不回归）。
  const connectHref = (key: string): string =>
    key === 'gsc' && projectId ? `/${locale}/projects/${projectId}` : `/${locale}/settings#source-${key}`

  return (
    <div className="ds-health">
      <button
        type="button"
        className={`ds-pill ${tone}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="dot" />
        {t('pill', { up, total })}
      </button>

      {open ? (
        <div className="ds-drawer" role="group" aria-label={t('title')}>
          <div className="ds-drawer-h">{t('title')}</div>
          {items.map((it) => (
            <div key={it.key} className={`ds-row ${it.up ? 'up' : 'down'}`}>
              <span className={`dot ${it.up ? 'up' : 'down'}`} />
              <div className="ds-row-body">
                <div className="ds-row-name">{t(`source.${it.key}`)}</div>
                <div className="ds-row-impact">
                  {it.up ? t('statusUp') : t(`impact.${it.key}`)}
                </div>
              </div>
              {it.up ? (
                <span className="ds-row-ok">{t('statusUp')}</span>
              ) : (
                <Link href={connectHref(it.key)} className="ds-row-connect">
                  {t('connect')}
                </Link>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
