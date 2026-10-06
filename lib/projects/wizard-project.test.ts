import { describe, it, expect } from 'vitest'
import { wizardProjectProps } from './wizard-project'

const row = {
  id: 'proj_old', domain: 'https://metadocu.com/', industry: 'document metadata removal tool', market: 'global-en', language: 'en',
  competitors: ['exiftool.org'], ownerId: 'local', nextRetestDueAt: null, createdAt: '2026-07-12 10:00:00', updatedAt: '2026-10-04 10:00:00',
}

describe('wizardProjectProps（/new?projectId= 回填向导，第一波审查 C1）', () => {
  it('没有项目 → null', () => {
    expect(wizardProjectProps(null, null)).toBeNull()
  })
  it('目标词随项目一起回填（向导总会提交 targetKeywords，漏传 = 点下一步就清空）', () => {
    expect(wizardProjectProps(row, { targetKeywords: ['strip exif', 'remove pdf metadata'] })).toEqual({
      id: 'proj_old', domain: 'https://metadocu.com/', industry: 'document metadata removal tool', market: 'global-en', language: 'en',
      competitors: ['exiftool.org'], targetKeywords: ['strip exif', 'remove pdf metadata'],
    })
  })
  it('没有设置行 → 目标词为 []', () => {
    expect(wizardProjectProps(row, null)?.targetKeywords).toEqual([])
  })
})
