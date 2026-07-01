import { Inngest } from 'inngest'
import { realtimeMiddleware } from '@inngest/realtime/middleware'

// realtimeMiddleware 注入 ctx.publish，供采集函数向 run 进度 channel 广播 SSE。
export const inngest = new Inngest({ id: 'veris', middleware: [realtimeMiddleware()] })
