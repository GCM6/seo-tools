// 项目 market 字段 → DataForSEO location_code / language_code 的显式映射（AIO 专用）。
//
// 与 lib/dataforseo/locations.ts 的 resolveLocation 不同：那个函数对未命中的 market 静默
// 兜底到 US/en（供已有的种子词 SERP / 竞品识别使用，容错优先）。AIO 口径要求「映射不到时
// 明确跳过、不猜」（任务书显式要求），所以这里命中返回 spec、未命中返回 undefined，
// 调用方据此把该 run 的 AIO 阶段标记为 not_attempted 并记录 market，而不是悄悄按 en-US 采样。
//
// project.market 存的是 messages/{zh,en}.json screen1.marketOptions 的原文（自由文本，非
// ISO 国家码）——见 components/NewAnalysisForm.tsx 的 marketOptions 用法。V0 向导只有 3 个
// 选项（中文/英文各自的本地化文案），此处覆盖全部 6 个字符串（zh 文案 + en 文案）。
// "东南亚"/"Southeast Asia" 横跨新马泰印越菲多国，没有单一 location_code 能代表，
// 不猜一个"代表国家"——保持未映射，AIO 阶段整体跳过。
//
// location_code 核实来源：docs.dataforseo.com（US=2840，页面 https://docs.dataforseo.com/v3/serp/google/locations/
// 示例数据直接给出）；China=2156 未能从 SERP locations 页直接核实到，来自 DataForSEO
// Bing Keyword Performance locations_and_languages 文档间接确认（该值在 DataForSEO 各 API
// 间对国家级 location_code 保持一致）——标记为 reported，非 observed，交付报告已注明。
export interface AioLocationSpec {
  locationCode: number
  languageCode: string
}

const AIO_MARKET_LOCATIONS: Record<string, AioLocationSpec> = {
  'English · Global': { locationCode: 2840, languageCode: 'en' }, // en-US，任务书显式要求覆盖
  '中文 · 中国大陆': { locationCode: 2156, languageCode: 'zh' },
  'Chinese · Mainland China': { locationCode: 2156, languageCode: 'zh' },
}

// 命中返回 location/language；未命中（含"东南亚"/"Southeast Asia"及任何未来新增市场文案）
// 返回 undefined，调用方必须显式处理"跳过"分支，不得回落默认值。
export function resolveAioLocation(market: string): AioLocationSpec | undefined {
  return AIO_MARKET_LOCATIONS[market.trim()]
}
