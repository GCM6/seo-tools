import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import zhMessages from '@/messages/zh.json'
import { RecCard } from './RecCard'

// 用真实 zh.json 桥接 next-intl（同 ActionList.test）：RecCard 跨 common / screen3 / workspace /
// findings 多个命名空间取词，手写 map 容易漏 key，也测不出占位符替换。
function resolveMessage(key: string, vars?: Record<string, unknown>): string {
  let node: unknown = zhMessages
  for (const p of key.split('.')) {
    if (typeof node !== 'object' || node === null) throw new Error(`missing message: ${key}`)
    node = (node as Record<string, unknown>)[p]
  }
  if (typeof node !== 'string') throw new Error(`missing message: ${key}`)
  return node.replace(/\{(\w+)\}/g, (_, name: string) => String(vars?.[name] ?? `{${name}}`))
}

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, vars?: Record<string, unknown>) => resolveMessage(key, vars),
}))

const refresh = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}))

function okFetch() {
  return vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response))
}

describe('RecCard 接受 / 否决', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', okFetch())
    refresh.mockClear()
  })

  it('接受与否决互斥', async () => {
    render(<RecCard id="r1" title="t" fields={{ why: '', impact: '', confidence: '' }} initialStatus="draft" />)

    fireEvent.click(screen.getByRole('button', { name: /接受/ }))
    expect(await screen.findByRole('button', { name: /已接受/ })).toHaveAttribute('aria-pressed', 'true')

    // 否决会清掉已接受状态 → 互斥。
    fireEvent.click(screen.getByRole('button', { name: /否决/ }))
    await waitFor(() => expect(screen.queryByRole('button', { name: /已接受/ })).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: '已否决' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('接受时 PATCH /api/recommendations/{id}，成功后刷新抬头进度', async () => {
    render(<RecCard id="r2" title="t" fields={{}} initialStatus="draft" />)

    fireEvent.click(screen.getByRole('button', { name: /接受/ }))
    await waitFor(() => expect(fetch).toHaveBeenCalled())

    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/recommendations/r2')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body as string)).toEqual({ status: 'accepted' })
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('保存失败：行内写明失败，状态回到原样（不再静默回滚）', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, json: () => Promise.resolve({}) } as Response)))
    render(<RecCard id="r3" title="t" fields={{}} initialStatus="draft" />)

    fireEvent.click(screen.getByRole('button', { name: /接受/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('没有保存成功，状态没有改变')
    await waitFor(() => expect(screen.getByRole('button', { name: '接受' })).toHaveAttribute('aria-pressed', 'false'))
  })
})

describe('RecCard 行内容与展开区', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', okFetch())
  })

  const withFix = '移除重点页 noindex\n\n参考修复示例（静态模板，非生成内容）：\n<meta name="robots" content="index,follow" />'

  it('修复示例不进标题，收在展开区的代码块里；点标题展开', () => {
    render(<RecCard id="r4" title={withFix} fields={{ why: '重点页被排除在索引之外。' }} initialStatus="draft" />)

    const heading = screen.getByRole('heading', { name: '移除重点页 noindex' })
    const toggle = screen.getByRole('button', { name: '移除重点页 noindex' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    const code = screen.getByText('<meta name="robots" content="index,follow" />')
    expect(code.closest('[hidden]')).not.toBeNull()
    expect(heading).not.toHaveTextContent('<meta')

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(code.closest('[hidden]')).toBeNull()
    expect(screen.getByRole('button', { name: '复制代码' })).toBeInTheDocument()
  })

  it('「针对：问题」链接到问题页对应条目，严重度与证据等级显示在行内', () => {
    render(
      <RecCard
        id="r5"
        title="根据证据优化该内容页"
        fields={{ impact: '高（warning 级，影响约 23 页/模板），修复对该支柱得分与可见性影响显著', effort: '中' }}
        initialStatus="accepted"
        severity="mid"
        confidenceGrade="sample"
        target={{ title: 'AI 答案可见度偏低', href: '/zh/runs/r/issues#find_1' }}
      />,
    )
    expect(screen.getByRole('link', { name: 'AI 答案可见度偏低' })).toHaveAttribute('href', '/zh/runs/r/issues#find_1')
    expect(screen.getByText('中')).toHaveClass('ui-sev--mid')
    // 行内只放影响级别，长句留在展开区。
    expect(screen.getByText('预期影响 高 · 工作量 中')).toBeInTheDocument()
    expect(screen.getByText('抽样实测')).toBeInTheDocument()
  })
})

describe('RecCard 编辑', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', okFetch())
  })

  it('保存并接受：写入人工标题与修订说明，修复示例原样接回；标题随之更新', async () => {
    render(
      <RecCard
        id="r6"
        title={'移除重点页 noindex\n\n参考修复示例（静态模板，非生成内容）：\n<meta name="robots" content="index" />'}
        fields={{}}
        initialStatus="draft"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '移除重点页 noindex' }))
    fireEvent.click(screen.getByRole('button', { name: '编辑' }))
    fireEvent.change(screen.getByLabelText('标题'), { target: { value: '只对标签页保留 noindex' } })
    fireEvent.change(screen.getByLabelText('修订说明'), { target: { value: '博客分类页也要放开' } })
    fireEvent.click(screen.getByRole('button', { name: '保存并接受' }))

    await waitFor(() => expect(fetch).toHaveBeenCalled())
    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({
      status: 'edited',
      editedPayload: {
        what: '只对标签页保留 noindex\n\n参考修复示例（静态模板，非生成内容）：\n<meta name="robots" content="index" />',
        note: '博客分类页也要放开',
      },
    })
    expect(await screen.findByRole('heading', { name: '只对标签页保留 noindex' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /已接受/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('博客分类页也要放开')).toBeInTheDocument()
  })

  it('标题清空时不提交，提示标题不能为空', () => {
    render(<RecCard id="r7" title="补齐 sitemap" fields={{}} initialStatus="draft" />)
    fireEvent.click(screen.getByRole('button', { name: '补齐 sitemap' }))
    fireEvent.click(screen.getByRole('button', { name: '编辑' }))
    fireEvent.change(screen.getByLabelText('标题'), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: '保存并接受' }))

    expect(screen.getByText('标题不能为空。')).toBeInTheDocument()
    expect(screen.getByLabelText('标题')).toHaveAttribute('aria-invalid', 'true')
    expect(fetch).not.toHaveBeenCalled()
  })
})
