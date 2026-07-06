# S3 · 技术地基

> 来源：docs/seo06.md §30（官网标准）、§31（路线图）、§28（基础配置）、§20（FAQ Schema）、§26（小语种修复）、docs/seo4.md（图片 SEO）。
> 技术 SEO 是入门级基础，正规建站基本能达标；不必过度纠结，重点仍在内容。但下列清单必须过关。

## 平台与可控性
- 推荐 **WordPress + 古腾堡/Blocksy + Rank Math**，几乎满足所有 SEO 功能需求。
- **源码自主可控**：服务器/源码自己掌控，才能改规则、对接 API、做定制。避免套壳 SaaS（拿不到源码、优化受限）。

## 技术清单（可勾选）
- [ ] **固定链接结构** 合理、**站点地图（sitemap）** 生成并提交 GSC。
- [ ] **面包屑导航**、页面层级 **三层以内**。
- [ ] **移动端适配/响应式**（移动端占 70-80% 访问，必须达标）。
- [ ] **页面速度**：以 PageSpeed Insights 的 **Core Web Vitals 字段数据**为准——LCP ≤2.5s / INP ≤200ms / CLS ≤0.1（P75，分移动/桌面；Lighthouse 分数仅作修复线索，非排名输入）〔官方勘误 → references/10-official-corrections.md C-6，docs 原"满载时长"口径已过时〕；手段：图片转 WebP + 压缩、CDN、代码精简。
- [ ] **TDK** 可自定义（Title/Description 自然含目标词；Description 不写谷歌也会抓，写好提升点击率）。
- [ ] **301 重定向 / canonical** 可设置（用法见 S7）。
- [ ] **结构化数据（Schema）** 部署：优先仍产出富摘要的类型（Product/Article/Organization/Breadcrumb 等）；FAQ Schema 已无富摘要收益（见下）〔官方勘误 → references/10-official-corrections.md C-1〕。
- [ ] **小语种语言标签** 正确声明（做多语种时让谷歌识别版本）。
- [ ] **合规**：Cookie 同意弹窗，符合 GDPR/CCPA（投广告站尤其必须）。
- [ ] **robots / noindex**：Tag 标签页、冗余分类页设 noindex，减少无效抓取。

## FAQ Schema 要点〔官方勘误 → references/10-official-corrections.md C-1〕
- **富摘要已退场**：FAQ 富摘要 2023-08 起仅限权威政府/健康站，**2026-05-07 起对所有站点停止展示**（docs 原"性价比高且稳定生效"反映的是 2025 前时点）。不得再以富摘要/点击率为由建议部署。
- **现行价值定位**：FAQPage 仍是有效 schema.org 类型，已部署的保留无害；价值转向为 AI 引擎提供机器可读的问答上下文（Bing 官方确认 schema 喂给其 LLM/Copilot——机制层官方确认，效果量化无对照实验）。
- 部署手段仍适用：Elementor 加 FAQ 组件勾选 Schema markup；古腾堡可服务器端规则生成（防与插件重复）。
- **红线（不变且更重要）**：结构化数据的问答必须与前端展示**完全一致**，不一致 = 作弊会被罚；问题须是用户真实关心的，不堆砌。
- 验证：Schema.org 词汇校验 + 谷歌 Rich Results Test（注意其对已退场类型不再报告）。

## 图片 SEO（来源 docs/seo4.md）
- 批量转 WebP + 无损压缩 + 统一尺寸（适配速度与排版）。
- 为图片生成匹配内容的 **alt 标签**，可批量审计全站 alt 语法/措辞。
- AI 配图（DALL·E 3 等）做人工后处理，规避 AI 水印与算法风险。

## 小语种（Gtranslate 泛滥修复，详见 S7/S8）
- Gtranslate 前端只勾少数语种，后台仍默认生成上百语言页，暴涨页面数、耗抓取预算、稀释主站权重、引发降权。
- 修复：GSC 看各语种展示/点击/询盘，只留有价值语种；用 .htaccess 白名单 + 把关停语种 301 到对应英文页（回收权重、避免大量 404）。

## 红线
- NEVER 用翻译插件泛滥生成上百小语种页。
- NEVER FAQ/Schema 与前端内容不一致。
- NEVER 忽视移动端速度。

## 自检
- [ ] 上方技术清单全部达标。
- [ ] 移动端 PageSpeed 合格。
- [ ] 无小语种泛滥；多语种已正确声明语言标签。
