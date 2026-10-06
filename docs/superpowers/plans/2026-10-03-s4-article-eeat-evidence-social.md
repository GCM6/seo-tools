# S4 文章页识别 + 文章级 E-E-A-T 与数据支撑 + 社媒链接 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 抓取阶段为每个 HTML 页抽文章信号(文章判定、作者、日期、正文数据与来源归属、引用、引述、表格、参考资料段),按文章页集合诊断 E-E-A-T 代理信号与"博客数据支撑"(AR01–AR05);诊断信任页(TR06)与站内社媒主页链接(SO01/SO02)。

**Architecture:** `lib/crawl/article-signals.ts`(纯函数,输入已解析 document)由 `parseLightCheckHtml` 调用,结果写入 `lightCheckExtra.article`(JSON 列,无迁移,随 site_audit.pages 进快照);`lib/crawl/social-links.ts` 从链接图站外链接识别社媒主页;规则 `lib/diagnosis/rules/eeat.ts`;C06/C07 在文章页 ≥3 时让位。

**Spec:** `docs/superpowers/specs/2026-09-29-s4-article-eeat-evidence-social-design.md`

## Global Constraints

- 同前(pnpm、同层测试、不引入 zod、中文注释标出处、不 commit、只改计划内文件、messages 文本级插入)。
- 基线:178 文件 / 1493 用例全绿、tsc 0、lint 0 错 4 警告。
- E-E-A-T 信号一律是**代理指标**,描述明示"非 Google 官方排名因子";AR04/AR05 识别是启发式 → inferred。
- `RULES_VERSION = 'rules_v9'`。

## Review Focus

1. **中文博客**(GBK 编码、"据…统计""数据显示"、"作者:"前缀、`2024年3月` 日期):信号必须能识别 —— 期望中文归属语与署名前缀可识别。→ Task 1。
2. **年份与日期不是"数据"**("2023年""2024-03-01"):不能算统计数字 —— 期望排除。→ Task 1。
3. **页脚社媒图标 / 分享按钮**:分享链接(sharer、intent/tweet)不是主页 —— 期望排除;正文里的社媒链接不算引用来源。→ Task 1/3。
4. **产品列表页 URL 含 /blog/ 但正文很短**:不应判为文章 —— 期望 URL 弱证据需正文 ≥300 词/字。→ Task 1。
5. **没有博客的站**:C06/C07 仍按首页口径工作,AR 规则整组不判定 —— 期望文章页 <3 时 AR no-op、C06/C07 不让位。→ Task 4。

---

### Task 1: `article-signals.ts`
- Interfaces: `extractArticleSignals(document, pageUrl: string, entryHost: string): ArticleSignals`;`ArticleSignals` 同 spec §3;常量 `ARTICLE_MIN_WORDS = 300`;`isAuthoritativeHost(host)`;`countWords(text)`(中文按字、拉丁按词)。
- 测试覆盖:四条文章判定路径(schema / og:article / article+time / URL 弱证据+长度);作者四种来源与"By/作者:"前缀清理;作者页链接;日期(JSON-LD、meta、time);正文根选择(article > main > body 去 nav/header/footer/aside);数据识别(带单位/百分比/货币、排除年份与日期、中英归属语使 attributed 计数);引用(正文站外链接、排除社媒/分享、权威域名);引述、表格、参考资料段。

### Task 2: light-check 接线
- `LightCheckExtra.article?: ArticleSignals`;`parseLightCheckHtml` 调 `extractArticleSignals`(只在 HTML 解析路径)。
- 测试:GBK 中文博客页经 `fetchLightCheck` 解码后信号正确(Review Focus 1)。

### Task 3: `social-links.ts`
- `detectSocialProfiles(external: LinkGraphExternal[]): SocialProfile[]`(`{ platform, url, pages, regions }`);平台表与主页形态规则同 spec §4;`socialPlatformOf(url)`。
- 测试:各平台主页 vs 分享链接、同平台多 URL 去重按页数排序。

### Task 4: 规则 + 让位 + 模板 + 版本
- `lib/diagnosis/rules/eeat.ts`:AR01–AR05(P2, seo)、TR06(P2, seo)、SO01/SO02(P5, geo);阈值同 spec §5;文章页集合 = 快照中 `lightCheckExtra.article.isArticle` 的已抓 HTML 页(跳转合并后的节点)。
- `content.ts`:C06/C07 在文章页 ≥3 时返回 null(由 AR 规则接管)。
- 模板 AR01–AR05、TR06、SO01、SO02;`rules_v9`。
- 测试:每条命中/不命中/守卫;C06/C07 让位与不让位(Review Focus 5)。

### Task 5: 端到端 + 全量 + 冒烟 + 审查
- `lib/crawl/article-signals.e2e.test.ts`:假博客站(5 篇文章各缺不同信号 + 页脚社媒图标 + 首页 Organization sameAs)走真实链路,断言 AR/TR06/SO 命中。
- 全量 / tsc / lint。
- 真实站点冒烟:一个中文博客、一个英文博客,各抽 5 篇人工核对信号,记录误判。
- S3+S4 合并派一次独立只读审查。
