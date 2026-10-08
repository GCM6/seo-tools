import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BrandFactRow, type BrandFactRowFact, type FactStatus } from './BrandFactRow'

const labels = {
  verify: '标记为已验证',
  verified: '已验证',
  unverify: '取消验证',
  retire: '停用',
  restore: '恢复',
  retired: '已停用',
  draft: '草稿',
  remove: '删除',
  removeConfirm: '确认删除',
  cancel: '取消',
  sourceLabel: '来源',
  error: '没有保存成功，请重试。',
}

function fact(overrides: Partial<BrandFactRowFact> = {}): BrandFactRowFact {
  return { id: 'bf_1', factType: '产品', factText: 'Metadocu 支持批量清除元数据', sourceUrl: null, sourceNote: null, status: 'draft', ...overrides }
}

function renderRow(
  f: BrandFactRowFact,
  handlers: { onSetStatus?: (id: string, status: FactStatus) => Promise<void>; onRemove?: (id: string) => Promise<void> } = {},
) {
  const onSetStatus = handlers.onSetStatus ?? vi.fn<(id: string, status: FactStatus) => Promise<void>>(() => Promise.resolve())
  const onRemove = handlers.onRemove ?? vi.fn<(id: string) => Promise<void>>(() => Promise.resolve())
  render(
    <ul>
      <BrandFactRow fact={f} labels={labels} onSetStatus={onSetStatus} onRemove={onRemove} />
    </ul>,
  )
  return { onSetStatus, onRemove }
}

describe('BrandFactRow', () => {
  it('状态用文字写明；标记为已验证后状态变为「已验证」，按钮变为「取消验证」', async () => {
    const { onSetStatus } = renderRow(fact())
    expect(screen.getByText('草稿')).toHaveClass('ui-status--draft')
    fireEvent.click(screen.getByRole('button', { name: '标记为已验证' }))
    await waitFor(() => expect(onSetStatus).toHaveBeenCalledWith('bf_1', 'verified'))
    expect(await screen.findByText('已验证')).toHaveClass('ui-status--accepted')
    expect(screen.getByRole('button', { name: '取消验证' })).toBeInTheDocument()
  })

  it('已停用的事实先「恢复」才能再验证', () => {
    renderRow(fact({ status: 'retired' }))
    expect(screen.getByText('已停用')).toHaveClass('ui-status--rejected')
    expect(screen.queryByRole('button', { name: '标记为已验证' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '恢复' })).toBeInTheDocument()
  })

  it('删除要在行内确认一次；取消则什么都不做', async () => {
    const { onRemove } = renderRow(fact())
    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(onRemove).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }))
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith('bf_1'))
    await waitFor(() => expect(screen.queryByText('Metadocu 支持批量清除元数据')).not.toBeInTheDocument())
  })

  it('保存失败：行内写明失败，状态回到原样', async () => {
    renderRow(fact(), { onSetStatus: vi.fn<(id: string, status: FactStatus) => Promise<void>>(() => Promise.reject(new Error('db'))) })
    fireEvent.click(screen.getByRole('button', { name: '标记为已验证' }))
    expect(await screen.findByText('没有保存成功，请重试。')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('草稿')).toBeInTheDocument())
  })
})
