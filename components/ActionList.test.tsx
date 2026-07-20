import { describe, expect, it, vi, afterEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import zhMessages from '@/messages/zh.json'
import { ActionList, type ActionListItem, type ActionListRejectedItem } from './ActionList'

// 复用 KeywordTable.test.tsx 的先例：用真实 zh.json 消息桥接 next-intl，而不是
// 硬编码 key→英文 map——这里要跨 screen4/screen3/common.actions 三个命名空间取词，
// 手写 map 容易漏key、也测不出真实文案里的占位符替换是否work。
function resolveMessage(namespace: string | undefined, key: string, vars?: Record<string, unknown>): string {
  const path = [...(namespace ? namespace.split('.') : []), ...key.split('.')]
  let node: unknown = zhMessages
  for (const p of path) {
    if (typeof node !== 'object' || node === null) throw new Error(`missing message: ${namespace ?? ''}.${key}`)
    node = (node as Record<string, unknown>)[p]
  }
  if (typeof node !== 'string') throw new Error(`missing message: ${namespace ?? ''}.${key}`)
  return node.replace(/\{(\w+)\}/g, (_, name: string) => String(vars?.[name] ?? `{${name}}`))
}

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string, vars?: Record<string, unknown>) => resolveMessage(namespace, key, vars),
}))

function item(overrides: Partial<ActionListItem> = {}): ActionListItem {
  return {
    id: 'rec_1',
    priority: 'fill_in',
    title: '修正 canonical 指向自身',
    status: 'accepted',
    expectedImpact: '中',
    effort: '低',
    risk: '低',
    confidence: '高',
    why: 'canonical 指向站外，抓取预算被浪费。',
    validationMethod: '重新抓取确认 canonical 指向自身。',
    evidenceRefs: ['ev_1', 'ev_2'],
    appliedAt: null,
    appliedNote: '',
    prompts: [],
    ...overrides,
  }
}

function rejected(overrides: Partial<ActionListRejectedItem> = {}): ActionListRejectedItem {
  return { id: 'rec_9', title: '否决的建议', note: '', ...overrides }
}

describe('ActionList', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('gated=0：展示明确空态卡而不是整段消失', () => {
    render(<ActionList items={[]} rejectedItems={[]} />)
    expect(screen.getByText('当前没有已纳入执行的建议')).toBeInTheDocument()
  })

  it('按优先级四象限排序渲染（quick_win 在 strategic 之前，调用方已排好序，组件按传入顺序渲染）', () => {
    render(
      <ActionList
        items={[
          item({ id: 'rec_strategic', priority: 'strategic', title: '策略建议' }),
          item({ id: 'rec_quick', priority: 'quick_win', title: '优先建议' }),
        ]}
        rejectedItems={[]}
      />,
    )
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    // 组件按 props 传入顺序渲染卡片；排序职责在 page.tsx（server 侧），此处验证渲染顺序忠实反映传入顺序。
    expect(headings).toEqual(['策略建议', '优先建议'])
  })

  it('展示已否决折叠区（默认收起，展开后看到每条标题与说明）', () => {
    render(
      <ActionList
        items={[]}
        rejectedItems={[rejected({ note: '不适用本站' }), rejected({ id: 'rec_10', title: '另一条否决', note: '' })]}
      />,
    )
    const summary = screen.getByText('已否决 2 条（留痕）')
    expect(summary).toBeInTheDocument()
    fireEvent.click(summary)
    expect(screen.getByText('不适用本站')).toBeInTheDocument()
    // 没有记录否决理由时如实展示「系统未记录否决理由」，不编造一句听起来合理的说明。
    expect(screen.getByText('系统未记录否决理由。')).toBeInTheDocument()
  })

  // B1（P0-4）：命中侧算出的受影响页面清单编码在 why 里（见 lib/diagnosis/recommend.ts
  // appendAffectedPagesSection），组件要把它拆成独立「受影响页面」字段块展示，而不是把带标记的
  // 原始拼接文本整段甩给用户当「为什么」念。
  describe('受影响页面（B1）', () => {
    it('why 携带受影响页面清单时，拆成独立字段块展示，且「为什么」文本本身不再包含该清单标记', () => {
      const why =
        'robots.txt 屏蔽了关键页。' +
        '\n\n受影响页面（共 12 个，已列前 2 个）：\n- https://example.com/a\n- https://example.com/b'
      render(<ActionList items={[item({ why })]} rejectedItems={[]} />)

      fireEvent.click(screen.getByText('查看详情'))
      expect(screen.getByText('robots.txt 屏蔽了关键页。')).toBeInTheDocument()
      expect(screen.getByText('受影响页面')).toBeInTheDocument()
      expect(screen.getByText('共 12 个，已列前 2 个：')).toBeInTheDocument()
      expect(screen.getByText('https://example.com/a')).toBeInTheDocument()
      expect(screen.getByText('https://example.com/b')).toBeInTheDocument()
      // 「为什么」段落本身必须是清理后的干净文本，不能仍带着「受影响页面（共…」的原始标记。
      expect(screen.queryByText(/受影响页面（共/)).not.toBeInTheDocument()
    })

    it('why 没有受影响页面清单时，不展示该字段块', () => {
      render(<ActionList items={[item({ why: '普通理由，不含清单' })]} rejectedItems={[]} />)
      fireEvent.click(screen.getByText('查看详情'))
      expect(screen.getByText('普通理由，不含清单')).toBeInTheDocument()
      expect(screen.queryByText('受影响页面')).not.toBeInTheDocument()
    })
  })

  // B2（P0-4）：证据引用要从裸 ev_xxx ID 变成人类可读摘要（内部 ID 仍保留在括号里供系统内对账）。
  describe('证据引用人类可读摘要（B2）', () => {
    it('提供 evidenceSummaries 时，用摘要替换裸 ID', () => {
      render(
        <ActionList
          items={[
            item({
              evidenceRefs: ['ev_1', 'ev_2'],
              evidenceSummaries: {
                ev_1: '全站轻检（2026-07-18 · L4）：共检测 128 页（ev_1）',
              },
            }),
          ]}
          rejectedItems={[]}
        />,
      )
      fireEvent.click(screen.getByText('查看详情'))
      expect(screen.getByText('全站轻检（2026-07-18 · L4）：共检测 128 页（ev_1）')).toBeInTheDocument()
      // ev_2 没有对应摘要时，如实回退展示裸 ID，不静默丢弃这条引用。
      expect(screen.getByText('ev_2')).toBeInTheDocument()
      expect(screen.queryByText('ev_1')).not.toBeInTheDocument()
    })

    it('未提供 evidenceSummaries 时，回退展示裸 ID（向后兼容既有调用）', () => {
      render(<ActionList items={[item({ evidenceRefs: ['ev_1'] })]} rejectedItems={[]} />)
      fireEvent.click(screen.getByText('查看详情'))
      expect(screen.getByText('ev_1')).toBeInTheDocument()
    })
  })

  describe('标记已执行', () => {
    it('成功路径：提交后展示已执行 ✓ 与备注', async () => {
      global.fetch = vi.fn(async () => new Response(JSON.stringify({ appliedAt: '2026-07-19T00:00:00.000Z', appliedNote: '已发布到 CMS' }), { status: 200 }))
      render(<ActionList items={[item()]} rejectedItems={[]} />)

      fireEvent.click(screen.getByRole('button', { name: '标记已执行' }))
      fireEvent.change(screen.getByPlaceholderText('可填执行了什么、改动链接等，便于回测复核'), { target: { value: '已发布到 CMS' } })
      fireEvent.click(screen.getByRole('button', { name: '确认已执行' }))

      await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/recommendations/rec_1', expect.objectContaining({ method: 'PATCH' })))
      expect(await screen.findByText(/已执行 ✓/)).toBeInTheDocument()
      expect(screen.getByText('已发布到 CMS')).toBeInTheDocument()
    })

    it('失败路径：展示行内错误，且保留用户已填写的备注（不静默丢弃）', async () => {
      global.fetch = vi.fn(async () => new Response(JSON.stringify({ error: 'not_gated' }), { status: 422 }))
      render(<ActionList items={[item()]} rejectedItems={[]} />)

      fireEvent.click(screen.getByRole('button', { name: '标记已执行' }))
      const textarea = screen.getByPlaceholderText('可填执行了什么、改动链接等，便于回测复核')
      fireEvent.change(textarea, { target: { value: '我已经改了但请求会失败' } })
      fireEvent.click(screen.getByRole('button', { name: '确认已执行' }))

      expect(await screen.findByText('标记失败，请重试；你填写的说明已保留。')).toBeInTheDocument()
      // 备注保留、表单仍展开，用户可以直接重试而不必重新输入。
      expect(screen.getByPlaceholderText('可填执行了什么、改动链接等，便于回测复核')).toHaveValue('我已经改了但请求会失败')
      expect(screen.queryByText(/已执行 ✓/)).not.toBeInTheDocument()
    })
  })

  // A3 补充：已执行可撤销——PATCH applied:false，不锁死为只读终态。
  describe('撤销已执行（A3 补充）', () => {
    it('成功路径：点击撤销后 PATCH applied:false，卡片回到未执行态', async () => {
      global.fetch = vi.fn(async () => new Response(JSON.stringify({ appliedAt: null, appliedNote: null }), { status: 200 }))
      render(<ActionList items={[item({ appliedAt: '2026-07-01T00:00:00.000Z', appliedNote: '已发布到 CMS' })]} rejectedItems={[]} />)

      expect(screen.getByText(/已执行 ✓/)).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: '撤销执行' }))

      await waitFor(() =>
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/recommendations/rec_1',
          expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ applied: false }) }),
        ),
      )
      await waitFor(() => expect(screen.queryByText(/已执行 ✓/)).not.toBeInTheDocument())
      expect(screen.getByRole('button', { name: '标记已执行' })).toBeInTheDocument()
    })

    it('失败路径：展示行内错误，卡片仍保持已执行态（不静默丢弃已执行记录）', async () => {
      global.fetch = vi.fn(async () => new Response(JSON.stringify({ error: 'not_found' }), { status: 404 }))
      render(<ActionList items={[item({ appliedAt: '2026-07-01T00:00:00.000Z', appliedNote: '已发布到 CMS' })]} rejectedItems={[]} />)

      fireEvent.click(screen.getByRole('button', { name: '撤销执行' }))

      expect(await screen.findByText('撤销失败，请重试。')).toBeInTheDocument()
      expect(screen.getByText(/已执行 ✓/)).toBeInTheDocument()
    })
  })

  describe('生成执行提示词', () => {
    it('成功路径：生成后按 promptType 展示可展开区块', async () => {
      global.fetch = vi.fn(async () => new Response(JSON.stringify({
        prompts: [{ id: 'gp_1', promptType: 'technical', promptText: '你是资深 SEO 专家，请执行……' }],
      }), { status: 200 }))
      render(<ActionList items={[item()]} rejectedItems={[]} />)

      fireEvent.click(screen.getByRole('button', { name: '生成执行提示词' }))

      await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/recommendations/rec_1/prompt', { method: 'POST' }))
      const block = await screen.findByText('执行提示词')
      expect(block).toBeInTheDocument()
      fireEvent.click(block)
      expect(screen.getByText('你是资深 SEO 专家，请执行……')).toBeInTheDocument()
      // 生成成功后按钮消失，不再重复展示「生成执行提示词」。
      expect(screen.queryByRole('button', { name: '生成执行提示词' })).not.toBeInTheDocument()
    })

    it('失败路径：展示行内错误，生成按钮仍在（可重试）', async () => {
      global.fetch = vi.fn(async () => new Response(JSON.stringify({ error: 'recommendation status "draft" cannot generate prompt' }), { status: 422 }))
      render(<ActionList items={[item()]} rejectedItems={[]} />)

      fireEvent.click(screen.getByRole('button', { name: '生成执行提示词' }))

      expect(await screen.findByText('生成失败，请重试。')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '生成执行提示词' })).toBeInTheDocument()
    })

    it('content 类建议返回 content+brief 两个区块', async () => {
      global.fetch = vi.fn(async () => new Response(JSON.stringify({
        prompts: [
          { id: 'gp_1', promptType: 'content', promptText: '内容执行提示词全文' },
          { id: 'gp_2', promptType: 'brief', promptText: '写作简报全文' },
        ],
      }), { status: 200 }))
      render(<ActionList items={[item()]} rejectedItems={[]} />)

      fireEvent.click(screen.getByRole('button', { name: '生成执行提示词' }))

      expect(await screen.findByText('执行提示词')).toBeInTheDocument()
      expect(screen.getByText('写作简报')).toBeInTheDocument()
    })

    // A4：已有 prompt 时展示「重新生成」而不是永久只读，带 regenerate=1 幂等覆盖既有记录。
    describe('重新生成（A4）', () => {
      it('已有 prompt 时展示重新生成按钮，点击带 regenerate=1 请求并用新结果替换展示', async () => {
        global.fetch = vi.fn(async () => new Response(JSON.stringify({
          prompts: [{ id: 'gp_2', promptType: 'technical', promptText: '重新生成后的提示词全文' }],
        }), { status: 200 }))
        render(
          <ActionList
            items={[item({ prompts: [{ id: 'gp_1', promptType: 'technical', promptText: '旧提示词全文' }] })]}
            rejectedItems={[]}
          />,
        )

        // 已有 prompt 时不展示初次生成按钮，只展示重新生成。
        expect(screen.queryByRole('button', { name: '生成执行提示词' })).not.toBeInTheDocument()
        const button = screen.getByRole('button', { name: '重新生成' })
        fireEvent.click(button)

        await waitFor(() =>
          expect(global.fetch).toHaveBeenCalledWith('/api/recommendations/rec_1/prompt?regenerate=1', { method: 'POST' }),
        )
        fireEvent.click(await screen.findByText('执行提示词'))
        expect(screen.getByText('重新生成后的提示词全文')).toBeInTheDocument()
        expect(screen.queryByText('旧提示词全文')).not.toBeInTheDocument()
      })

      it('失败路径：展示行内错误，重新生成按钮仍在（可重试）', async () => {
        global.fetch = vi.fn(async () => new Response(JSON.stringify({ error: 'regenerate_failed' }), { status: 422 }))
        render(
          <ActionList
            items={[item({ prompts: [{ id: 'gp_1', promptType: 'technical', promptText: '旧提示词全文' }] })]}
            rejectedItems={[]}
          />,
        )

        fireEvent.click(screen.getByRole('button', { name: '重新生成' }))

        expect(await screen.findByText('生成失败，请重试。')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: '重新生成' })).toBeInTheDocument()
        expect(screen.getByText('旧提示词全文')).toBeInTheDocument()
      })
    })
  })
})
