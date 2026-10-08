import { getTranslations } from 'next-intl/server'
import { RULES_VERSION } from '@/lib/diagnosis/types'
import packageInfo from '@/package.json'

// 协议版本（探针协议 provider/model/params/prompts 的整体版本，spec §3 / plan-ux §5.2）；
// 与 RULES_VERSION 分开钉版本号——规则库与探针协议各自独立演进。
const PROTOCOL_VERSION = 'v2'

// 应用内页脚只保留一行版本信息（ux-blueprint §0）：版本号服务于诊断可复现，不是装饰；
// 营销式多栏页脚已移除（内部工具不需要）。Server Component，统一渲染于 app/[locale]/layout.tsx。
export async function SiteFooter() {
  const t = await getTranslations('footer')

  return (
    <SiteFooterView
      labels={{ rulesVersionLabel: t('rulesVersion'), protocolVersionLabel: t('protocolVersion') }}
      rulesVersion={RULES_VERSION}
      protocolVersion={PROTOCOL_VERSION}
      appVersion={packageInfo.version}
    />
  )
}

// 纯展示部分拆成同步子组件，便于单测（不依赖 next-intl/server 的 async 数据获取）。
export function SiteFooterView({
  labels,
  rulesVersion,
  protocolVersion,
  appVersion,
}: {
  labels: { rulesVersionLabel: string; protocolVersionLabel: string }
  rulesVersion: string
  protocolVersion: string
  appVersion: string
}) {
  return (
    <footer className="ui-foot">
      <p className="ui-foot__in">
        Veris · <span className="ui-num">v{appVersion}</span> · {labels.rulesVersionLabel}{' '}
        <span className="ui-mono">{rulesVersion}</span> · {labels.protocolVersionLabel}{' '}
        <span className="ui-mono">{protocolVersion}</span>
      </p>
    </footer>
  )
}
