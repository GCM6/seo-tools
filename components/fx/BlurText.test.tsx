import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { BlurText } from './BlurText'

describe('BlurText', () => {
  it('渲染子内容且带进场 class', () => {
    render(<BlurText>诊断完成</BlurText>)
    expect(screen.getByText('诊断完成')).toHaveClass('fx-blur-in')
  })
})
