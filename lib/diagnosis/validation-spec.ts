import type { RuleHit, Pillar } from './types'

// 结构化验证口径（spec §5.1-2）——建议 outcome 自动判定的**唯一**结构化输入。
// 人话 validationMethod 照常展示给用户；outcome 计算只吃这里的字段，不解析自由文本。
// `validation_spec` 非空才允许建议进入 verifying（spec §6 约束）。
export interface ValidationSpec {
  // 回测时从哪类证据取指标：GSC 关键词表 / 探针聚合 / 重新抓取 / PageSpeed。
  metricSource: 'gsc' | 'probe' | 'crawl' | 'psi'
  // 指标名（回测执行器据此取标量；取不到则退化为 finding 四态信号）。
  metric: string
  // 作用域：站级 'site' / URL 模板 / 关键词集等（人读，供报告展示）。
  scope: string
  // 期望方向：修复生效应让指标上升还是下降。
  direction: 'increase' | 'decrease'
  // 观察窗口（天）；与 4-6 周回测节奏对齐，默认 28。
  windowDays: number
}

// 按支柱 + prompt 通道派生默认 validation_spec。模板可覆盖（templates[id].validationSpec）。
// 覆盖优先，派生兜底——保证 55 条规则**全部**带非空 spec，不必逐条手写。
const PILLAR_DEFAULT: Record<Pillar, Omit<ValidationSpec, 'scope' | 'windowDays'>> = {
  // P1 技术健康：修复后重新抓取，期望「问题页数」下降（fingerprint 应 resolved）。
  P1: { metricSource: 'crawl', metric: 'affected_pages', direction: 'decrease' },
  // P2 内容与页面：重抓，期望正文/结构达标页数上升。
  P2: { metricSource: 'crawl', metric: 'affected_pages', direction: 'decrease' },
  // P3 关键词：GSC，期望展示/点击上升（位次类见 metric 覆盖）。
  P3: { metricSource: 'gsc', metric: 'impressions', direction: 'increase' },
  // P4 竞品：探针 SoV，期望品牌被提及率上升。
  P4: { metricSource: 'probe', metric: 'brand_sov', direction: 'increase' },
  // P5 权威与 AI 就绪：探针，期望品牌可见度/正面引用上升（可达性类见覆盖）。
  P5: { metricSource: 'probe', metric: 'brand_presence', direction: 'increase' },
}

export function deriveValidationSpec(hit: RuleHit, override?: ValidationSpec): ValidationSpec {
  if (override) return override
  const base = PILLAR_DEFAULT[hit.pillar]
  return {
    ...base,
    scope: hit.scope || 'site',
    windowDays: 28,
  }
}
