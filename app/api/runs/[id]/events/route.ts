import { subscribe } from '@inngest/realtime'
import { inngest } from '@/lib/inngest/client'
import { runProgressChannel, type RunProgressMessage } from '@/lib/inngest/channels'
import { getRun } from '@/lib/repositories'

const SSE_HEADERS = { 'content-type': 'text/event-stream', 'cache-control': 'no-store' }

function frame(msg: RunProgressMessage): string {
  return `data: ${JSON.stringify(msg)}\n\n`
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const run = await getRun(id)
  if (!run) return new Response(JSON.stringify({ error: 'not_found' }), { status: 404 })

  // 只有进行中的 run（collecting 采集 / diagnosing 诊断生成）才订阅 realtime channel——
  // 两阶段都往同一 run:{id} channel 推进度。其余状态（collected/failed/reviewing、或
  // 早已结束后重连）不会再有消息发到 channel——若仍订阅，for await 永不收到终止帧、
  // 流永不关闭、连接挂到平台超时。这里直接一次性回终止帧并关闭。
  if (run.status !== 'collecting' && run.status !== 'diagnosing') {
    const msg: RunProgressMessage =
      run.status === 'failed' ? { type: 'failed', reason: run.failureReason ?? 'unknown_failure' } : { type: 'done' }
    return new Response(frame(msg), { headers: SSE_HEADERS })
  }

  const messages = await subscribe({ app: inngest, channel: runProgressChannel(id), topics: ['progress'] })
  // subscribe() 返回的是 ReadableStream；Node 运行时它本身可 async 迭代，但 DOM 的
  // ReadableStream 类型未声明 [Symbol.asyncIterator]，这里收窄成 AsyncIterable 供 for await。
  const iterable = messages as unknown as AsyncIterable<{ data: RunProgressMessage }>
  const enc = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      for await (const message of iterable) {
        controller.enqueue(enc.encode(frame(message.data)))
        const { type } = message.data
        if (type === 'done' || type === 'failed') break
      }
      controller.close()
    },
  })

  return new Response(stream, { headers: SSE_HEADERS })
}
