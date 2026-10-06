# SEO Knowledge Brain

Veris treats external material as evidence, not executable truth. The production path is:

`source → immutable source version → atomic claim + exact quote → human review → bilingual knowledge version → knowledge release → workflow proposal → second human review → workflow release → version-frozen analysis session`

## Source policy

- Google Search documentation updates, crawling documentation updates, and Search Central news are `official` sources. The English page is canonical; when Google exposes a distinct `hl=zh-cn` rendering, that localized copy is stored in the same immutable raw object.
- Reddit communities and global SEO searches are `community` sources. The initial matrix covers 12 communities and 14 global queries, and operators can add, pause, or resume community/query subscriptions from the console.
- “All Reddit discussion” means all posts and comments accessible through the configured OAuth API and source/query matrix. Pagination ceilings, deleted content, 429s, and inaccessible branches are recorded in `knowledge_ingest_runs.coverage`; they are never silently called complete.
- Raw payloads are gzip JSON objects in R2. Turso stores searchable text, hashes, object keys, versions, review state, and provenance. A failed/stored document version is retried on its next observation instead of being skipped forever.
- The same Reddit post/comment discovered through multiple subscriptions is stored once by canonical URL; discovery-source IDs are merged into metadata so source overlap cannot inflate consensus.
- Reddit engagement is heat only. It does not increase epistemic confidence.

## Community consensus gate

One discussion is an observation. Two independent threads may remain a hypothesis. A claim becomes `community_practice_candidate` only when it appears in at least three independent threads, two communities, and three author hashes, with no official conflict. A human reviewer still has to approve it.

## Human gates

1. Claim review approves, edits, or rejects a distilled claim. Exact evidence spans are immutable. Rejections require a reason. Official-conflict overrides require a reason. Approved Chinese and English statements must preserve URLs, numeric values, and identifiers.
2. Releasing knowledge asks the configured structured-output model for a constrained knowledge-to-step mapping. Invalid, unavailable, or out-of-scope model output falls back to a deterministic topic map and records that fallback in `provider_snapshot`. Either result remains only a proposal. A second review approves or rejects the diff; only a separate workflow release activates it.

Pending, rejected, raw, or unreleased community content is never read by production diagnosis.

## Workflow V1

- `W0`: goal classification, site stage, symptoms, coverage
- `S1`: feasibility and search demand
- `S2`: keywords, intent, and architecture
- `S3`: crawl, index, rendering, and technical foundation
- `S4`: content, trust, and conversion
- `S5`: authority, backlinks, brand, and community
- `S6`: GEO and AI visibility
- `S7`: GSC trends, decay, and maintenance
- `S8`: algorithms, manual actions, and penalty diagnosis
- `S9`: synthesis, priority, and same-protocol retest

Natural-language intake classifies `new_build`, `diagnose`, `optimize`, or `learn`. Diagnostic symptoms are detected automatically and their steps move ahead of the full background pass. Every session freezes `knowledge_vN`, `workflow_vN`, `rules_vN`, and `rulecfg_vN`.

The intake uses the canonical stages `none`, `new`, `growth`, `mature`, and `penalized`. Missing blocking fields are collected through a resumable session form. `learn` and `new_build` sessions now finish with stored per-step artifacts; site diagnosis stores a step result artifact with evaluated/matched rules and knowledge evidence. A session reaches `completed` only after its recommendation gate is fully decided.

Published knowledge is searchable through `GET /api/knowledge?q=...` and the Knowledge Brain console. Search returns only the current versions of published entries; pending/rejected claims never enter retrieval.

Complex deterministic checks stay in TypeScript. Workflow routing, knowledge references, required sources, and safe scalar parameters are data-driven. Allowed scalar operators are `exists`, `missing`, `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `ratio`, `age`, and `membership`.

## Operations

Required storage variables:

- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET`

Required Reddit variables:

- `REDDIT_CLIENT_ID`
- `REDDIT_CLIENT_SECRET`
- `REDDIT_USER_AGENT`

Distillation uses `KNOWLEDGE_DISTILL_PROVIDER=openai|gemini|deepseek` and optional `KNOWLEDGE_DISTILL_MODEL`. Provider failures are recorded and retried by Inngest; there is no silent cross-provider fallback.

Schedules use Asia/Shanghai:

- Google sources: daily 06:00
- Reddit dispatcher: daily 06:30; it fans out one durable event per source, while the worker keeps Reddit ingestion at concurrency 1
- Active Reddit refresh: Monday 07:00

The Knowledge Brain console is `/[locale]/knowledge`. A one-year backfill can be dispatched per source or across every enabled source. Existing `/api/runs` remains compatible and creates a full-diagnosis knowledge session after migration `0013`.
