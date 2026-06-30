# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 编码前必读（强制）

**写、改、review 任何 `.ts` / `.tsx` 代码之前,必须先调用 `veris-coding` skill。** 它钉死了本项目的版本约定(React 19 + Next.js 16 App Router、Next 全栈后端、libSQL/Drizzle、Vercel)和项目铁律。模型默认会写出 Next ≤14 / React ≤18 的旧写法(如 `forwardRef`、同步 `cookies()`),不读该 skill 会反复出错。每次编码都要命中,不要跳过。

## Project status

This repo is **pre-implementation**. There is no application code, build system, or tests yet — only planning docs under `docs/`. When you start building, the stack and structure below are the agreed plan, not yet reality; treat the plan docs as the source of truth and update this file once real commands exist.

- `docs/plan-ux.md` — the authoritative v2 technical / product / business plan (architecture, data model, API, evidence protocol, MVP boundaries). Read this first.
- `docs/plan-d.md` — **an HTML clickable UI prototype despite the `.md` extension.** Open it in a browser, don't read it as Markdown. The plan suggests renaming it to `docs/prototype.html`.

## What this product is (Veris)

A **SEO + GEO (Generative Engine Optimization) evidence-based diagnostic workbench**, internal codename **Veris**. It diagnoses how visible a website is in both traditional search (via Google Search Console) and AI answer engines (ChatGPT / Perplexity / Gemini / Claude), then produces human-confirmed recommendations and ready-to-use execution prompts, with a 4–6 week retest loop.

It is explicitly **not** a rank tracker, **not** an auto-content generator, and **not** an "AI SEO magic" tool.

## The core principle that constrains all design

**Every conclusion must be verifiable. What cannot be verified may only be labeled as inference or hypothesis — never as fact.** This is the product's moat, and it drives concrete engineering rules you must respect:

- **Evidence grading (L0–L4)** is central. Findings carry a `claim_type` of `hypothesis | inferred | measured_sample | measured_hard`. The UI label `实测`/"measured" is reserved for L3/L4 only. See `docs/plan-ux.md` §5.1.
- **The AI agent is a constrained orchestrator, not a chatbot.** Tools collect facts; the agent may only read evidence, summarize findings, and draft recommendations. The agent must never invent numbers, and every finding it emits must carry `evidence_refs` and a `claim_type`, validated against a schema.
- **Measurement vs. inference must stay layered** — fact, sampled measurement, model inference, and product recommendation are kept distinct in both data and UI.
- **Human-in-the-loop gate:** only recommendations with status `accepted` or `edited` may produce output prompts. The tool never auto-publishes.
- **Same-protocol retest:** before/after comparison must use the same prompt set, market/language, model family, and sampling rule.
- **No false causal claims** — e.g. low CTR alone is "suspected SERP/AIO influence" (hypothesis), never "suppressed by AI Overviews," unless backed by time-series SERP evidence. Phrasing rules are in §2.3, §5.4, and §9.3.

## Planned architecture (from `docs/plan-ux.md` §4, §6, §7)

> **Stack converged in SP1:** a single TypeScript fullstack on Vercel. The original Python/FastAPI + PostgreSQL plan is superseded — see `docs/superpowers/specs/2026-06-30-sp1-frontend-scaffold-design.md`.

- **Frontend:** Next.js 16 App Router + React 19 — an internal tool, interaction-first, no marketing pages.
- **Backend:** same Next app — Route Handlers + Server Actions (TypeScript). No separate Python service.
- **Async:** long-running jobs run on Inngest (Vercel-friendly); avoid in-process background tasks for anything long.
- **DB:** libSQL (Turso) via Drizzle — raw evidence stored as JSON, relational tables enforce constraints. No Redis in V0.
- **Page inspection:** a hosted browser API (Vercel cannot bundle its own chromium), comparing initial HTML vs. rendered main-text.
- **Deploy:** Vercel. No long-lived servers; design within serverless/edge limits (timeouts, no local chromium, ephemeral filesystem).
- **AI probes:** a unified provider adapter over Perplexity / OpenAI / Anthropic / Google. Always persist the full raw response.
- **GSC:** Google OAuth read-only — the first-priority real-data source.

End-to-end flow: `new project → collect evidence → generate findings → generate recommendations → human gate → output execution assets → retest`.

### Data-model invariants (enforce these as DB constraints — §6.2)

- `findings.evidence_refs` must be non-empty.
- `claim_type = measured_hard` requires at least one L4 evidence artifact.
- `claim_type = measured_sample` requires an associated probe or SERP sample artifact.
- Prompts may only be generated when `recommendations.status in (accepted, edited)`.
- `generated_prompts.input_fact_refs` must reference `verified` or human-confirmed `brand_facts`.
- Every AI probe must persist the full protocol (provider, model_id, version/snapshot, params, prompts, market, run_idx, raw_response, citations, hashes, parser_version — §5.2).
- Evidence is immutable: store raw payload + capture time + tool version + hash. Deleting a project must cascade-delete user data and third-party API responses.

## Scope discipline (MVP boundaries — §8)

V0 is a single-user, single-project, BYOK (bring-your-own-API-key) internal tool with a fixed 20-prompt set at `n=5` (directional sample only). **Do not** build multi-tenant billing, Redis, DataForSEO, auto-CMS-writing, auto-outreach, or deterministic AIO attribution in V0 — these are explicitly deferred to V1/V2. When adding a feature, check it against the V0/V1/V2 split before building.

## 语言规范

- 所有对话和文档都使用中文
- 文档使用 markdown 格式
- The product targets Chinese and niche-vertical users; planning docs and UI copy are in Chinese. Keep that audience in mind for any user-facing strings.
