import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { NextIntlClientProvider } from 'next-intl'
import { BrandAliasesCard } from './BrandAliasesCard'
import zhMessages from '@/messages/zh.json'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

afterEach(() => vi.unstubAllGlobals())

function renderCard(props: Partial<Parameters<typeof BrandAliasesCard>[0]> = {}) {
  return render(
    <NextIntlClientProvider locale="zh" messages={zhMessages}>
      <BrandAliasesCard projectId="proj_a" initialAliases={[]} {...props} />
    </NextIntlClientProvider>,
  )
}

describe('BrandAliasesCard', () => {
  it('无别名时显示空态文案', () => {
    renderCard({ initialAliases: [] })
    expect(screen.getByText('尚未添加任何品牌别名。')).toBeInTheDocument()
  })

  it('预填已有别名，逐条可见', () => {
    renderCard({ initialAliases: ['旧名', '简称'] })
    expect(screen.getByText('旧名')).toBeInTheDocument()
    expect(screen.getByText('简称')).toBeInTheDocument()
  })

  it('输入并点击新增：加入列表，不重复添加同一别名', () => {
    renderCard({ initialAliases: ['旧名'] })
    const input = screen.getByLabelText('新增别名')
    fireEvent.change(input, { target: { value: '新别名' } })
    fireEvent.click(screen.getByRole('button', { name: '添加' }))
    expect(screen.getByText('新别名')).toBeInTheDocument()

    fireEvent.change(input, { target: { value: '旧名' } })
    fireEvent.click(screen.getByRole('button', { name: '添加' }))
    expect(screen.getAllByText('旧名')).toHaveLength(1)
  })

  it('点击删除按钮移除该别名', () => {
    renderCard({ initialAliases: ['旧名', '简称'] })
    fireEvent.click(screen.getByRole('button', { name: '删除别名“旧名”' }))
    expect(screen.queryByText('旧名')).not.toBeInTheDocument()
    expect(screen.getByText('简称')).toBeInTheDocument()
  })

  it('保存成功：调用别名保存接口并展示成功提示', async () => {
    const spy = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, aliases: ['旧名'] }) }))
    vi.stubGlobal('fetch', spy)
    renderCard({ initialAliases: ['旧名'] })
    fireEvent.click(screen.getByRole('button', { name: '保存别名' }))
    await waitFor(() => expect(screen.getByText('品牌别名已保存。')).toBeInTheDocument())
    expect(spy).toHaveBeenCalledWith(
      '/api/projects/proj_a/brand-aliases',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ aliases: ['旧名'] }) }),
    )
  })

  it('保存失败：展示失败提示', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({}) })))
    renderCard({ initialAliases: ['旧名'] })
    fireEvent.click(screen.getByRole('button', { name: '保存别名' }))
    await waitFor(() => expect(screen.getByText('保存失败，请重试。')).toBeInTheDocument())
  })
})
