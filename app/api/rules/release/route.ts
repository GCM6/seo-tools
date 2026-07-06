import { NextResponse } from 'next/server'
import { releaseApprovedProposals, getReleasedVersions } from '@/lib/repositories'
import { deriveNextRulesVersion } from '@/lib/diagnosis/rule-proposals'
import { RULES_VERSION } from '@/lib/diagnosis/types'

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { version?: string }
  let version = body.version?.trim()
  if (version) {
    if (!/^rules_v\d+$/.test(version)) {
      return NextResponse.json({ error: 'version_format_invalid' }, { status: 422 })
    }
  } else {
    const published = await getReleasedVersions()
    version = deriveNextRulesVersion(published, RULES_VERSION)
  }
  const result = await releaseApprovedProposals(version)
  // 提示：数据资产已即时生效；代码常量 RULES_VERSION 需开发手动同步为该版本并部署（见 Global Constraints）。
  return NextResponse.json({ version, ...result })
}
