export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await params
  const enc = new TextEncoder()
  const stream = new ReadableStream({
    start(c) {
      const events = [
        { type: 'progress', pct: 20 }, { type: 'finding_created', side: 'technical' },
        { type: 'progress', pct: 70 }, { type: 'done' },
      ]
      let i = 0
      const tick = () => {
        if (i >= events.length) return c.close()
        c.enqueue(enc.encode(`data: ${JSON.stringify(events[i++])}\n\n`)); setTimeout(tick, 600)
      }
      tick()
    },
  })
  return new Response(stream, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store' } })
}
