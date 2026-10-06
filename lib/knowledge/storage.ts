import { createHash, createHmac } from 'node:crypto'
import { gzipSync } from 'node:zlib'

function encodePath(value: string): string {
  return value.split('/').map(encodeURIComponent).join('/')
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac('sha256', key).update(value).digest()
}

function hash(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex')
}

export interface RawObjectStore {
  putJsonGzip(key: string, value: unknown): Promise<void>
}

export class R2ObjectStore implements RawObjectStore {
  constructor(
    private readonly config = {
      accountId: process.env.R2_ACCOUNT_ID ?? '',
      accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
      bucket: process.env.R2_BUCKET ?? '',
    },
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  isConfigured(): boolean {
    return Object.values(this.config).every(Boolean)
  }

  async putJsonGzip(key: string, value: unknown): Promise<void> {
    if (!this.isConfigured()) throw new Error('r2_not_configured')
    const body = gzipSync(Buffer.from(JSON.stringify(value)))
    const now = new Date()
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
    const shortDate = amzDate.slice(0, 8)
    const host = `${this.config.accountId}.r2.cloudflarestorage.com`
    const canonicalUri = `/${encodeURIComponent(this.config.bucket)}/${encodePath(key)}`
    const payloadHash = hash(body)
    const canonicalHeaders = `content-encoding:gzip\ncontent-type:application/json\nhost:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`
    const signedHeaders = 'content-encoding;content-type;host;x-amz-content-sha256;x-amz-date'
    const canonicalRequest = `PUT\n${canonicalUri}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`
    const scope = `${shortDate}/auto/s3/aws4_request`
    const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${hash(canonicalRequest)}`
    const dateKey = hmac(`AWS4${this.config.secretAccessKey}`, shortDate)
    const regionKey = hmac(dateKey, 'auto')
    const serviceKey = hmac(regionKey, 's3')
    const signingKey = hmac(serviceKey, 'aws4_request')
    const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex')

    const response = await this.fetchImpl(`https://${host}${canonicalUri}`, {
      method: 'PUT',
      headers: {
        authorization: `AWS4-HMAC-SHA256 Credential=${this.config.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
        'content-encoding': 'gzip',
        'content-type': 'application/json',
        'x-amz-content-sha256': payloadHash,
        'x-amz-date': amzDate,
      },
      body,
    })
    if (!response.ok) throw new Error(`r2_put_failed:${response.status}`)
  }
}

export class MemoryObjectStore implements RawObjectStore {
  readonly objects = new Map<string, unknown>()
  async putJsonGzip(key: string, value: unknown): Promise<void> {
    this.objects.set(key, value)
  }
}

export function rawObjectKey(source: string, externalId: string, capturedAt: string, contentHash: string): string {
  const safeId = externalId.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180)
  return `knowledge/${source}/${safeId}/${capturedAt.replace(/[:.]/g, '-')}-${contentHash}.json.gz`
}

