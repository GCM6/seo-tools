import { subscribe } from '@inngest/realtime'
import { inngest } from '@/lib/inngest/client'
import { runProgressChannel } from '@/lib/inngest/channels'
import { getRun } from '@/lib/repositories'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const run = await getRun(id)
  if (!run) return new Response(JSON.stringify({ error: 'not_found' }), { status: 404 })

  const messages = await subscribe({ app: inngest, channel: runProgressChannel(id), topics: ['progress'] })
  const enc = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      for await (const message of messages) {
        controller.enqueue(enc.encode(`data: ${JSON.stringify(message.data)}\n\n`))
        const type = (message.data as { type?: string }).type
        if (type === 'done' || type === 'failed') break
      }
      controller.close()
    },
  })

  return new Response(stream, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store' } })
}
