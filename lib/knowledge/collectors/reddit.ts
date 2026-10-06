import type { SourceCandidate } from '../types'
import { fetchWithRetry } from '../fetch'

interface RedditListingChild {
  kind: string
  data: Record<string, unknown>
}

interface RedditListing {
  data?: { after?: string | null; children?: RedditListingChild[] }
}

export interface RedditCoverage {
  candidates: SourceCandidate[]
  earliestObservedAt?: string
  pagesFetched: number
  inaccessibleReasons: string[]
}

async function token(fetchImpl: typeof fetch): Promise<string> {
  const clientId = process.env.REDDIT_CLIENT_ID ?? ''
  const clientSecret = process.env.REDDIT_CLIENT_SECRET ?? ''
  if (!clientId || !clientSecret) throw new Error('reddit_oauth_not_configured')
  const response = await fetchWithRetry('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'content-type': 'application/x-www-form-urlencoded',
      'user-agent': process.env.REDDIT_USER_AGENT || 'veris-knowledge-brain/1.0',
    },
    body: 'grant_type=client_credentials',
  }, { fetchImpl })
  if (!response.ok) throw new Error(`reddit_oauth_failed:${response.status}`)
  const json = await response.json() as { access_token?: string }
  if (!json.access_token) throw new Error('reddit_oauth_protocol_mismatch')
  return json.access_token
}

function headers(accessToken: string): HeadersInit {
  return {
    authorization: `Bearer ${accessToken}`,
    'user-agent': process.env.REDDIT_USER_AGENT || 'veris-knowledge-brain/1.0',
  }
}

function postCandidate(data: Record<string, unknown>): SourceCandidate {
  const id = String(data.id ?? '')
  const permalink = String(data.permalink ?? '')
  const created = Number(data.created_utc ?? 0)
  const selftext = String(data.selftext ?? '')
  const title = String(data.title ?? '')
  return {
    externalId: `t3_${id}`,
    canonicalUrl: `https://www.reddit.com${permalink}`,
    documentType: 'post',
    title,
    author: String(data.author ?? ''),
    community: String(data.subreddit ?? ''),
    publishedAt: created ? new Date(created * 1000).toISOString() : undefined,
    locale: 'en',
    rawText: `${title}\n\n${selftext}`.trim(),
    rawPayload: data,
    metadata: { score: data.score, upvoteRatio: data.upvote_ratio, numComments: data.num_comments },
  }
}

function flattenComments(children: RedditListingChild[], postUrl: string, output: SourceCandidate[], moreIds: string[]): void {
  for (const child of children) {
    if (child.kind === 'more') {
      const ids = Array.isArray(child.data.children) ? child.data.children.map(String).filter(Boolean) : []
      moreIds.push(...ids)
      continue
    }
    if (child.kind !== 't1') continue
    const data = child.data
    const body = String(data.body ?? '')
    const id = String(data.id ?? '')
    const created = Number(data.created_utc ?? 0)
    if (body) {
      const deleted = body === '[deleted]' || body === '[removed]'
      output.push({
        externalId: `t1_${id}`,
        canonicalUrl: `${postUrl}${postUrl.includes('?') ? '&' : '?'}comment=${id}`,
        documentType: 'comment',
        title: `Comment in ${postUrl}`,
        author: String(data.author ?? ''),
        community: String(data.subreddit ?? ''),
        publishedAt: created ? new Date(created * 1000).toISOString() : undefined,
        locale: 'en',
        rawText: body,
        rawPayload: data,
        metadata: { score: data.score, parentId: data.parent_id, linkId: data.link_id, deleted },
      })
    }
    const replies = data.replies as RedditListing | '' | undefined
    if (replies && typeof replies === 'object') flattenComments(replies.data?.children ?? [], postUrl, output, moreIds)
  }
}

async function fetchComments(postId: string, postUrl: string, accessToken: string, fetchImpl: typeof fetch): Promise<SourceCandidate[]> {
  const response = await fetchWithRetry(`https://oauth.reddit.com/comments/${postId}?limit=500&depth=10&raw_json=1`, { headers: headers(accessToken) }, { fetchImpl })
  if (!response.ok) throw new Error(`reddit_comments_failed:${response.status}`)
  const listings = await response.json() as RedditListing[]
  const output: SourceCandidate[] = []
  const moreIds: string[] = []
  flattenComments(listings[1]?.data?.children ?? [], postUrl, output, moreIds)
  // Reddit 把深层/大讨论串的其余可访问评论折叠为 kind=more；按 API 单次上限分批展开。
  while (moreIds.length) {
    const ids = moreIds.splice(0, 100)
    const params = new URLSearchParams({ api_type: 'json', link_id: `t3_${postId}`, children: ids.join(','), raw_json: '1' })
    const moreResponse = await fetchWithRetry(`https://oauth.reddit.com/api/morechildren?${params}`, { headers: headers(accessToken) }, { fetchImpl })
    if (!moreResponse.ok) throw new Error(`reddit_morecomments_failed:${moreResponse.status}`)
    const moreBody = await moreResponse.json() as { json?: { data?: { things?: RedditListingChild[] } } }
    flattenComments(moreBody.json?.data?.things ?? [], postUrl, output, moreIds)
  }
  return output
}

export async function collectReddit(options: {
  community?: string
  query?: string
  since: Date
  includeComments?: boolean
  fetchImpl?: typeof fetch
  maxPages?: number
}): Promise<RedditCoverage> {
  const fetchImpl = options.fetchImpl ?? fetch
  const accessToken = await token(fetchImpl)
  const candidates: SourceCandidate[] = []
  const inaccessibleReasons: string[] = []
  const maxPages = options.maxPages ?? 10
  let after: string | null | undefined
  let pagesFetched = 0
  let reachedCutoff = false

  do {
    const base = options.community
      ? `https://oauth.reddit.com/r/${encodeURIComponent(options.community)}/new`
      : 'https://oauth.reddit.com/search'
    const params = new URLSearchParams({ limit: '100', raw_json: '1', sort: 'new' })
    if (options.query) params.set('q', options.query)
    if (after) params.set('after', after)
    const response = await fetchWithRetry(`${base}?${params}`, { headers: headers(accessToken) }, { fetchImpl })
    if (!response.ok) throw new Error(`reddit_listing_failed:${response.status}`)
    const listing = await response.json() as RedditListing
    pagesFetched++
    const posts = (listing.data?.children ?? []).filter((child) => child.kind === 't3').map((child) => postCandidate(child.data))
    for (const post of posts) {
      if (post.publishedAt && new Date(post.publishedAt) < options.since) {
        reachedCutoff = true
        continue
      }
      candidates.push(post)
      if (options.includeComments !== false) {
        try {
          candidates.push(...await fetchComments(post.externalId.replace(/^t3_/, ''), post.canonicalUrl, accessToken, fetchImpl))
        } catch (error) {
          inaccessibleReasons.push(error instanceof Error ? error.message : String(error))
        }
      }
    }
    after = listing.data?.after
  } while (after && !reachedCutoff && pagesFetched < maxPages)

  if (after && pagesFetched >= maxPages) inaccessibleReasons.push('reddit_listing_page_limit_reached')
  const dates = candidates.map((candidate) => candidate.publishedAt).filter((date): date is string => Boolean(date)).sort()
  return { candidates, earliestObservedAt: dates[0], pagesFetched, inaccessibleReasons }
}
