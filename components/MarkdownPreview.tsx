import type { ReactNode } from 'react'

// A deliberately small Markdown previewer. Delivery drafts and the execution
// decision report are plain text from our own server-side assemblers, so
// rendering only the structural Markdown we produce keeps the preview safe
// without adding an HTML parsing dependency.
// Standalone module so ActionReportWorkspace (and any future delivery-style
// card) can import it without pulling in card-specific applied/copy state.
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
      nodes.push(<pre key={`code-${index}`} className="delivery-code">{code.join('\n')}</pre>)
      continue
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line)
    if (heading) {
      const Tag = heading[1].length === 1 ? 'h2' : heading[1].length === 2 ? 'h3' : 'h4'
      nodes.push(<Tag key={`heading-${index}`}>{heading[2]}</Tag>)
      index += 1
      continue
    }

    if (line.startsWith('> ')) {
      nodes.push(<blockquote key={`quote-${index}`}>{line.slice(2)}</blockquote>)
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
          {items.map((item, itemIndex) => <li key={`${index}-${itemIndex}`}>{item}</li>)}
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
          {items.map((item, itemIndex) => <li key={`${index}-${itemIndex}`}>{item}</li>)}
        </ol>,
      )
      continue
    }

    nodes.push(<p key={`paragraph-${index}`}>{line}</p>)
    index += 1
  }

  return <div className="delivery-preview">{nodes}</div>
}
