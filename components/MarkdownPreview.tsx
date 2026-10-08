import type { ReactNode } from 'react'

// 小型 Markdown 渲染：交付稿、执行报告是服务端自己拼的纯文本；AI 回答原文也会带 **加粗**、`代码`。
// 只渲染结构性 Markdown（标题、列表、引用、代码块）和两种行内格式（**加粗**、`行内代码`），
// 不解析 HTML、不用 dangerouslySetInnerHTML，所以对 LLM 原文也是安全的（design-system §4 Markdown：
// AI 回答必须渲染，不能显示 ** 原文）。
const INLINE_RE = /(\*\*[^*\n]+\*\*|`[^`\n]+`)/g

export function renderInline(text: string): ReactNode[] {
  return text.split(INLINE_RE).map((part, i) => {
    if (part.length > 4 && part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>
    if (part.length > 2 && part.startsWith('`') && part.endsWith('`')) return <code key={i}>{part.slice(1, -1)}</code>
    return part
  })
}

export function MarkdownPreview({ markdown }: { markdown: string }) {
  const nodes: ReactNode[] = []
  const lines = markdown.split('\n')
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    if (!line.trim()) {
      index += 1
      continue
    }

    if (line.startsWith('```')) {
      const code: string[] = []
      index += 1
      while (index < lines.length && !lines[index].startsWith('```')) {
        code.push(lines[index])
        index += 1
      }
      if (index < lines.length) index += 1
      nodes.push(<pre key={`code-${index}`} className="ui-code">{code.join('\n')}</pre>)
      continue
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line)
    if (heading) {
      const Tag = heading[1].length === 1 ? 'h2' : heading[1].length === 2 ? 'h3' : 'h4'
      nodes.push(<Tag key={`heading-${index}`}>{renderInline(heading[2])}</Tag>)
      index += 1
      continue
    }

    if (line.startsWith('> ')) {
      nodes.push(<blockquote key={`quote-${index}`}>{renderInline(line.slice(2))}</blockquote>)
      index += 1
      continue
    }

    if (/^-\s+/.test(line)) {
      const items: string[] = []
      while (index < lines.length && /^-\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^-\s+/, ''))
        index += 1
      }
      nodes.push(
        <ul key={`list-${index}`}>
          {items.map((item, itemIndex) => <li key={`${index}-${itemIndex}`}>{renderInline(item)}</li>)}
        </ul>,
      )
      continue
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = []
      while (index < lines.length && /^\d+\.\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\d+\.\s+/, ''))
        index += 1
      }
      nodes.push(
        <ol key={`list-${index}`}>
          {items.map((item, itemIndex) => <li key={`${index}-${itemIndex}`}>{renderInline(item)}</li>)}
        </ol>,
      )
      continue
    }

    nodes.push(<p key={`paragraph-${index}`}>{renderInline(line)}</p>)
    index += 1
  }

  return <div className="ui-prose">{nodes}</div>
}
