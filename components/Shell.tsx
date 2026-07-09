import { getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'
import { Stepper } from './Stepper'

// 向导上下文条：仅剩「分析目标」域名徽章 + 4 步 Stepper（design spec §1.1，2026-07-08）。
// 品牌/项目/规则库/设置/CTA/DataSourceHealth/LocaleSwitch 已上移到 SiteHeader（全站 layout
// 统一渲染）；本组件不再输出外层 .shell div —— 限宽容器由 app/[locale]/layout.tsx 的
// <main className="shell"> 提供。仅向导流页面使用：/new、/runs/[id] 及其子页。
export async function Shell({
  active,
  locale,
  runId,
  domain,
  children,
}: {
  active: 1 | 2 | 3 | 4
  locale: string
  runId?: string
  domain?: string
  children: ReactNode
}) {
  const t = await getTranslations('common')

  return (
    <>
      {domain ? (
        <div className="target">
          <span>{t('targetLabel')}</span>
          <span className="dom mono">{domain}</span>
        </div>
      ) : null}

      <Stepper active={active} runId={runId} locale={locale} />

      {children}
    </>
  )
}
