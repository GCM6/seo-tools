// hreflang 代码校验（SP-A §5.2 #1）：按 BCP 47 子集校验 语言(ISO 639-1)[-文字(4 字母)][-地区(ISO 3166-1 alpha-2)]，另允许 x-default。
// 代码表来源（2026-10-04 取数，见实现笔记 Task 17）：
//   - 语言：IANA Language Subtag Registry（File-Date 2026-09-17）中未弃用的 2 字母语言子标签，共 184 个
//     （= ISO 639-1 的 183 个 + BCP 47 仍有效的 sh），uk（乌克兰语）、eu（巴斯克语）均合法。
//   - 地区：ISO 3166-1 alpha-2 正式分配的 249 个（Debian iso-codes 项目的 iso_3166-1.json，与 IANA 注册表交叉核对一致；
//     不含 IANA 额外收录的私用码 AA/ZZ 与例外保留码 AC/CP/CQ/DG/EA/EU/EZ/IC/TA/UN，也不含 UK——英国是 GB）。

export const ISO_639_1: ReadonlySet<string> = new Set([
  'aa', 'ab', 'ae', 'af', 'ak', 'am', 'an', 'ar', 'as', 'av', 'ay', 'az', 'ba', 'be', 'bg', 'bi', 'bm', 'bn', 'bo', 'br',
  'bs', 'ca', 'ce', 'ch', 'co', 'cr', 'cs', 'cu', 'cv', 'cy', 'da', 'de', 'dv', 'dz', 'ee', 'el', 'en', 'eo', 'es', 'et',
  'eu', 'fa', 'ff', 'fi', 'fj', 'fo', 'fr', 'fy', 'ga', 'gd', 'gl', 'gn', 'gu', 'gv', 'ha', 'he', 'hi', 'ho', 'hr', 'ht',
  'hu', 'hy', 'hz', 'ia', 'id', 'ie', 'ig', 'ii', 'ik', 'io', 'is', 'it', 'iu', 'ja', 'jv', 'ka', 'kg', 'ki', 'kj', 'kk',
  'kl', 'km', 'kn', 'ko', 'kr', 'ks', 'ku', 'kv', 'kw', 'ky', 'la', 'lb', 'lg', 'li', 'ln', 'lo', 'lt', 'lu', 'lv', 'mg',
  'mh', 'mi', 'mk', 'ml', 'mn', 'mr', 'ms', 'mt', 'my', 'na', 'nb', 'nd', 'ne', 'ng', 'nl', 'nn', 'no', 'nr', 'nv', 'ny',
  'oc', 'oj', 'om', 'or', 'os', 'pa', 'pi', 'pl', 'ps', 'pt', 'qu', 'rm', 'rn', 'ro', 'ru', 'rw', 'sa', 'sc', 'sd', 'se',
  'sg', 'sh', 'si', 'sk', 'sl', 'sm', 'sn', 'so', 'sq', 'sr', 'ss', 'st', 'su', 'sv', 'sw', 'ta', 'te', 'tg', 'th', 'ti',
  'tk', 'tl', 'tn', 'to', 'tr', 'ts', 'tt', 'tw', 'ty', 'ug', 'uk', 'ur', 'uz', 've', 'vi', 'vo', 'wa', 'wo', 'xh', 'yi',
  'yo', 'za', 'zh', 'zu',
])

export const ISO_3166_1_A2: ReadonlySet<string> = new Set([
  'AD', 'AE', 'AF', 'AG', 'AI', 'AL', 'AM', 'AO', 'AQ', 'AR', 'AS', 'AT', 'AU', 'AW', 'AX', 'AZ', 'BA', 'BB', 'BD', 'BE',
  'BF', 'BG', 'BH', 'BI', 'BJ', 'BL', 'BM', 'BN', 'BO', 'BQ', 'BR', 'BS', 'BT', 'BV', 'BW', 'BY', 'BZ', 'CA', 'CC', 'CD',
  'CF', 'CG', 'CH', 'CI', 'CK', 'CL', 'CM', 'CN', 'CO', 'CR', 'CU', 'CV', 'CW', 'CX', 'CY', 'CZ', 'DE', 'DJ', 'DK', 'DM',
  'DO', 'DZ', 'EC', 'EE', 'EG', 'EH', 'ER', 'ES', 'ET', 'FI', 'FJ', 'FK', 'FM', 'FO', 'FR', 'GA', 'GB', 'GD', 'GE', 'GF',
  'GG', 'GH', 'GI', 'GL', 'GM', 'GN', 'GP', 'GQ', 'GR', 'GS', 'GT', 'GU', 'GW', 'GY', 'HK', 'HM', 'HN', 'HR', 'HT', 'HU',
  'ID', 'IE', 'IL', 'IM', 'IN', 'IO', 'IQ', 'IR', 'IS', 'IT', 'JE', 'JM', 'JO', 'JP', 'KE', 'KG', 'KH', 'KI', 'KM', 'KN',
  'KP', 'KR', 'KW', 'KY', 'KZ', 'LA', 'LB', 'LC', 'LI', 'LK', 'LR', 'LS', 'LT', 'LU', 'LV', 'LY', 'MA', 'MC', 'MD', 'ME',
  'MF', 'MG', 'MH', 'MK', 'ML', 'MM', 'MN', 'MO', 'MP', 'MQ', 'MR', 'MS', 'MT', 'MU', 'MV', 'MW', 'MX', 'MY', 'MZ', 'NA',
  'NC', 'NE', 'NF', 'NG', 'NI', 'NL', 'NO', 'NP', 'NR', 'NU', 'NZ', 'OM', 'PA', 'PE', 'PF', 'PG', 'PH', 'PK', 'PL', 'PM',
  'PN', 'PR', 'PS', 'PT', 'PW', 'PY', 'QA', 'RE', 'RO', 'RS', 'RU', 'RW', 'SA', 'SB', 'SC', 'SD', 'SE', 'SG', 'SH', 'SI',
  'SJ', 'SK', 'SL', 'SM', 'SN', 'SO', 'SR', 'SS', 'ST', 'SV', 'SX', 'SY', 'SZ', 'TC', 'TD', 'TF', 'TG', 'TH', 'TJ', 'TK',
  'TL', 'TM', 'TN', 'TO', 'TR', 'TT', 'TV', 'TW', 'TZ', 'UA', 'UG', 'UM', 'US', 'UY', 'UZ', 'VA', 'VC', 'VE', 'VG', 'VI',
  'VN', 'VU', 'WF', 'WS', 'YE', 'YT', 'ZA', 'ZM', 'ZW',
])

export type HreflangCheck = { ok: true } | { ok: false; reason: 'bad_language' | 'bad_region' | 'bad_format'; suggestion?: string }

export function checkHreflang(raw: string): HreflangCheck {
  const code = raw.trim()
  if (code.toLowerCase() === 'x-default') return { ok: true }
  const parts = code.split('-')
  if (parts.length > 3) return { ok: false, reason: 'bad_format' }
  const lang = parts[0].toLowerCase()
  if (!ISO_639_1.has(lang)) return { ok: false, reason: 'bad_language' }
  const rest = parts.slice(1)
  let region: string | undefined
  if (rest.length === 2) {
    // 语言-文字-地区：中间必须是 4 字母文字子标签（如 zh-Hant-TW）。
    if (!/^[A-Za-z]{4}$/.test(rest[0])) return { ok: false, reason: 'bad_format' }
    region = rest[1]
  } else if (rest.length === 1) {
    if (/^[A-Za-z]{4}$/.test(rest[0])) return { ok: true } // 语言-文字（如 zh-Hant）
    region = rest[0]
  }
  if (region !== undefined && !ISO_3166_1_A2.has(region.toUpperCase()))
    // 最常见的错误是用 UK 表示英国（正确是 GB）。
    return { ok: false, reason: 'bad_region', ...(region.toLowerCase() === 'uk' ? { suggestion: `${lang}-gb` } : {}) }
  return { ok: true }
}
