import { describe, it, expect } from 'vitest'
import { resolveAioLocation } from './locations'

describe('resolveAioLocation', () => {
  it('English · Global → en-US（location_code 2840 / language en）', () => {
    expect(resolveAioLocation('English · Global')).toEqual({ locationCode: 2840, languageCode: 'en' })
  })

  it('中文市场（zh/en 两种本地化文案）均映射到 China（2156/zh）', () => {
    expect(resolveAioLocation('中文 · 中国大陆')).toEqual({ locationCode: 2156, languageCode: 'zh' })
    expect(resolveAioLocation('Chinese · Mainland China')).toEqual({ locationCode: 2156, languageCode: 'zh' })
  })

  it('"东南亚"/"Southeast Asia" 横跨多国，没有单一 location_code：明确不映射，不猜默认国家', () => {
    expect(resolveAioLocation('东南亚')).toBeUndefined()
    expect(resolveAioLocation('Southeast Asia')).toBeUndefined()
  })

  it('未知/空字符串市场：不映射', () => {
    expect(resolveAioLocation('')).toBeUndefined()
    expect(resolveAioLocation('some-unmapped-market')).toBeUndefined()
  })

  it('容忍首尾空白', () => {
    expect(resolveAioLocation('  English · Global  ')).toEqual({ locationCode: 2840, languageCode: 'en' })
  })
})
