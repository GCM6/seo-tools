export const KNOWLEDGE_RELEASE_VERSION = 'knowledge_v1'
export const WORKFLOW_VERSION = 'workflow_v1'
export const RULE_CONFIG_VERSION = 'rulecfg_v1'
export const DISTILLATION_PROMPT_VERSION = 'seo_claims_v1'
export const KNOWLEDGE_PARSER_VERSION = 'knowledge_parser_v1'

export const GOOGLE_KNOWLEDGE_SOURCES = [
  {
    id: 'ks_google_search_docs_updates',
    sourceType: 'google_docs' as const,
    name: 'Google Search documentation updates',
    canonicalUrl: 'https://developers.google.com/search/updates/search_docs_updates.rss',
    authorityLevel: 'official' as const,
    language: 'en',
  },
  {
    id: 'ks_google_crawling_docs_updates',
    sourceType: 'google_docs' as const,
    name: 'Google crawling documentation updates',
    canonicalUrl: 'https://developers.google.com/crawling/docs/changelog/crawling_docs_updates.rss',
    authorityLevel: 'official' as const,
    language: 'en',
  },
  {
    id: 'ks_google_search_central_news',
    sourceType: 'google_news' as const,
    name: 'Google Search Central Blog',
    canonicalUrl: 'https://feeds.feedburner.com/blogspot/amDG',
    authorityLevel: 'official' as const,
    language: 'en',
  },
] as const

export const REDDIT_COMMUNITIES = [
  'SEO',
  'bigseo',
  'TechSEO',
  'LocalSEO',
  'ecommerce',
  'smallbusiness',
  'SaaS',
  'marketing',
  'Entrepreneur',
  'content_marketing',
  'AI_SearchOptimization',
  'seogrowth',
] as const

export const REDDIT_QUERIES = [
  'SEO',
  'technical SEO',
  'indexing',
  'canonical',
  'crawl budget',
  'content SEO',
  'backlinks',
  'Google Search Console',
  'schema markup',
  'core update',
  'GEO AEO',
  'AI Overviews',
  'ChatGPT Search',
  'Perplexity visibility',
] as const

export const KNOWLEDGE_TOPICS = [
  'demand',
  'keyword_intent',
  'site_architecture',
  'crawl',
  'indexing',
  'rendering',
  'structured_data',
  'content_quality',
  'trust',
  'conversion',
  'authority',
  'backlinks',
  'local_seo',
  'geo_ai_visibility',
  'gsc_measurement',
  'algorithm_updates',
  'manual_actions',
  'diagnostic_method',
] as const

export type KnowledgeTopic = (typeof KNOWLEDGE_TOPICS)[number]

