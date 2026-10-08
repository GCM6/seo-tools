import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// 营销站独立部署、不能 import 应用里的文件，所以 token 是一份拷贝（ux-blueprint §7「使用同一套 token」）。
// 这条测试保证两份一字不差：改了 app/tokens.css 就同步执行
//   cp app/tokens.css marketing/app/tokens.css
describe('营销站 token 与应用同源', () => {
  it('marketing/app/tokens.css 与 app/tokens.css 完全一致', () => {
    const app = readFileSync(join(process.cwd(), 'app/tokens.css'), 'utf8')
    const marketing = readFileSync(join(process.cwd(), 'marketing/app/tokens.css'), 'utf8')
    expect(marketing).toBe(app)
  })

  it('营销站字体模块与应用一致（同一套 IBM Plex 变量）', () => {
    const app = readFileSync(join(process.cwd(), 'app/fonts.ts'), 'utf8')
    const marketing = readFileSync(join(process.cwd(), 'marketing/app/fonts.ts'), 'utf8')
    expect(marketing).toBe(app)
  })

  it('营销站 Logo 的路径与应用一致', () => {
    const paths = (file: string) => [...readFileSync(join(process.cwd(), file), 'utf8').matchAll(/\sd="([^"]+)"/g)].map((m) => m[1])
    const app = paths('components/Logo.tsx')
    expect(app.length).toBeGreaterThan(0)
    expect(paths('marketing/components/Logo.tsx')).toEqual(app)
  })
})
