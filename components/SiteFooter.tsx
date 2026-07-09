import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { RULES_VERSION } from '@/lib/diagnosis/types'
import { version as APP_VERSION } from '@/package.json'

// 协议版本（探针协议 provider/model/params/prompts 的整体版本，spec §3 / plan-ux §5.2）；
// 与 RULES_VERSION 分开钉版本号——规则库与探针协议各自独立演进。
const PROTOCOL_VERSION = 'v2'

// 全站 Footer（design spec §3，2026-07-08）：三栏信息式 + 版本底行。只链接已存在路由，
// 不发明新页面。栏 3 的 RULES_VERSION / 协议版本服务诊断可复现性，非装饰。
// Server Component，统一渲染于 app/[locale]/layout.tsx。
export async function SiteFooter({ locale }: { locale: string }) {
  const [t, nav] = await Promise.all([getTranslations('footer'), getTranslations('nav')])

  return (
    <SiteFooterView
      locale={locale}
      labels={{
        productTagline: t('productTagline'),
        productMethodology: t('productMethodology'),
        navTitle: t('navTitle'),
        methodologyTitle: t('methodologyTitle'),
        evidenceLevels: t('evidenceLevels'),
        sameProtocol: t('sameProtocol'),
        rulesVersionLabel: t('rulesVersion'),
        protocolVersionLabel: t('protocolVersion'),
        projects: nav('projects'),
        newAnalysis: nav('newAnalysis'),
        rules: nav('rules'),
        settings: nav('settings'),
      }}
      rulesVersion={RULES_VERSION}
      protocolVersion={PROTOCOL_VERSION}
      appVersion={APP_VERSION}
    />
  )
}

interface SiteFooterLabels {
  productTagline: string
  productMethodology: string
  navTitle: string
  methodologyTitle: string
  evidenceLevels: string
  sameProtocol: string
  rulesVersionLabel: string
  protocolVersionLabel: string
  projects: string
  newAnalysis: string
  rules: string
  settings: string
}

// 纯展示部分拆成同步子组件，便于单测（不依赖 next-intl/server 的 async 数据获取）。
export function SiteFooterView({
  locale,
  labels,
  rulesVersion,
  protocolVersion,
  appVersion,
}: {
  locale: string
  labels: SiteFooterLabels
  rulesVersion: string
  protocolVersion: string
  appVersion: string
}) {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="sf-col">
          <span className="sf-col-title">Veris</span>
          <p className="sf-tagline">{labels.productTagline}</p>
          <p className="sf-methodology">{labels.productMethodology}</p>
        </div>

        <div className="sf-col">
          <span className="sf-col-title">{labels.navTitle}</span>
          <nav className="sf-nav" aria-label="Footer">
            <Link href={`/${locale}/projects`}>{labels.projects}</Link>
            <Link href={`/${locale}/new`}>{labels.newAnalysis}</Link>
            <Link href={`/${locale}/rules`}>{labels.rules}</Link>
            <Link href={`/${locale}/settings`}>{labels.settings}</Link>
          </nav>
        </div>

        <div className="sf-col">
          <span className="sf-col-title">{labels.methodologyTitle}</span>
          <p>{labels.evidenceLevels}</p>
          <p>{labels.sameProtocol}</p>
          <p className="sf-version-line mono">
            {labels.rulesVersionLabel} {rulesVersion} · {labels.protocolVersionLabel} {protocolVersion}
          </p>
        </div>
      </div>

      <div className="site-footer-bottom">
        <span className="mono">© 2026 Veris · v{appVersion}</span>
      </div>
    </footer>
  )
}
