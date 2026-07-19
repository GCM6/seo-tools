# Reddit SEO/GEO 人群痛点调研报告

- 日期:2026-07-19
- 方法:deep-research 多代理工作流——5 路搜索角度并行 → 23 个来源抓取 → 逐源提取可证伪论断(共 115 条)→ 三票对抗验证
- 用途:为 4 周商业验证(见 memory `veris-4week-validation-metric`)提供报告结构与获客话术依据;**不作为开工写代码的依据**

## 0. 证据质量声明(先读)

| 置信档 | 含义 | 数量 |
|---|---|---|
| ✅ 三票确认 | 3 个独立验证代理都未能否决 | 3 条 |
| ⚠️ 验证未完成 | 验证代理因会话限额全部报错,论断本身来自 Reddit 原帖单次提取 | 14 条 |
| reported | 抓取代理从原帖提取,未经二次验证(本报告正文大多数) | ~90 条 |
| ❌ 三票否决 | 验证代理否决(多因来源是二手博客转述而非原帖),正文不采用,附录列出 | 8 条 |

系统性偏差,读任何结论前先记住三条:
1. **人群偏差**:会上 Reddit 发帖的人偏英文、偏从业者;中文外贸站主(4 周验证的裁判)在样本里是零。痛点可迁移性是**假设**,W2–W3 语音访谈是终审。
2. **发言者立场**:AI 可见度相关帖子里大量发言人自己在做 GEO 工具/服务(文中已逐条标注),他们描述的"痛点"可能是他们想卖的解药的倒影。
3. **时间跨度**:素材横跨 2024-11 至 2026-03,AI 搜索领域变化极快,越早的帖子越可能过时(已标日期的注明)。

---

## 1. B 类:小企业/独立站站主痛点(4 周验证的裁判人群)

### 1.1 对 SEO 代理/服务商的信任崩塌 —— 本次调研热度最高的一簇

核心发现:**站主的焦虑不是价格,是"无法验证"。** 多个独立帖子互证同一结构:付了钱 → 收到看不懂的报告 → 无法判断对方干没干活 → 信任崩塌波及整个行业。

逐帖证据:

| 帖子 | 热度 | 内容 | 置信 |
|---|---|---|---|
| [r/smallbusiness 水管工被报价 $3,500/月锁 12 个月](https://www.lobsterpack.com/blog/local-seo-3500-month-vs-ai-alternative/)(经博客转述) | 147 赞 / 263 评论 / 一周内 | "代理定价像骗局"在小企业圈强共鸣 | ✅ 三票确认 |
| [r/smallbusinessuk 英国建筑小老板](https://www.reddit.com/r/smallbusinessuk/comments/1oebalm/am_i_being_ripped_off_by_seo_agency/) | — | 付 £1,200+VAT/月,零会议零来电,月报是"看起来像 AI 写的随机图表"。**关键句:他明说不嫌贵,结果到位愿意付——他缺的是"可验证的工作与结果证明"**;评论区共识(57 赞 + 23 赞)= 逼代理给逐项工作明细与结果证据 | reported |
| [r/SEO 屋顶公司 $5k/月](https://www.reddit.com/r/SEO/comments/1e0fy2w/is_our_seo_company_ripping_us_off_should_we/) | top 评论 87 赞 | 代理一季度只交 1 篇博客;客户自己对账才发现:GA 显示 1.3 万自然用户 vs 另一源仅 40;代理报告自称 400+ 页被收录(含 "/divorce law" 这种无关页),GSC 实际 43 页。29 赞评论给出的核查方法(查 Ahrefs 外链)客户自己根本不会做——**"拥有数据"和"会核查数据"之间有一条沟** | reported |
| [r/SEO 签约 $3,000/月代理](https://www.reddit.com/r/SEO/comments/17bto5w/signed_up_with_an_seo_company_its_been_a/) | top 评论 79 赞 | 1.5 个月只收到 meta description 更新+几处 H1 修改+一份让客户自己改 alt 的 DIY 指南;代理拒绝披露外链建设明细;top 评论 = "Name. Shame. Cancel.";从业者评论证实这是系统化行业模式(销售拿单→转包 Fiverr→锁 6 个月合同) | reported |
| [r/smallbusiness $300/月家族企业顾问](https://www.reddit.com/r/smallbusiness/comments/sryd1p/seo_consultant_charging_family_business_300month/) | top 评论 251 赞、143 赞 | 社区定价共识:$300/月只是地板,像样的本地 SEO 约 $1k/月;顾问从没碰过网站还收着钱,社区给出的欺诈判据 = "从未改过网站+拿不出数据证明 = 开除";124 赞评论:很多服务商**故意扣着最有意义的交付物(对基线的月度关键词排名报告)不给**,用混乱的填充数据代替 | reported |
| [r/Entrepreneur 系列讨论] | "SEO is astrology for entrepreneurs" 108 赞 vs 反驳"完全科学" 40 赞 | 整个 SEO 学科在企业主眼里的合法性都在被辩论 | reported |

**→ 对 Veris 的含义**:这一簇痛点与"证据分级、可复现、L0–L4"的产品哲学是镜像关系。而且它指向一个从未设计过的获客角度:**「代理对账」——用站主自己的 GSC 数据+可复现实测,独立回答"你的代理这个月到底干没干活"**(收录数对账 / 站内改动痕迹 / 关键词基线对比)。上表屋顶公司案例几乎就是这个功能的需求说明书。

### 1.2 数据看得见、看不懂、没行动

| 证据 | 出处 | 置信 |
|---|---|---|
| 小企业主装了 GA 两年,只打开过 ~3 次,因为跳出率/会话时长"看不懂、没有可行动的含义" | [r/smallbusiness](https://www.reddit.com/r/smallbusiness/comments/1r2pisz/do_any_of_you_actually_look_at_your_google/) | reported |
| 另一位每季度看一次、看不懂,两年只提炼出 1 条可行动结论(退出页数据暴露定价页混乱) | 同帖评论 | reported |
| 有站主付钱雇人把 analytics 翻译成人话摘要——**存在为"解释层"付费的意愿** | 同帖评论 | reported |
| 评论共识:大多数小企业装数据工具是"被告知要装",不知道数据要驱动什么决策;指标不挂到具体结果(表单/来电)就没用 | 同帖评论 | reported |
| 站主感知:没被追踪的口碑转介转化率碾压一切线上指标("邻居转介转化率 80%")——web 数据在他们心里与真实营收脱节 | 同帖 OP+top 评论 | reported |

### 1.3 新手起步:信息过载 + 一半内容像卖课骗局

| 证据 | 出处 | 置信 |
|---|---|---|
| 会写代码的 solo 开发者:SEO 学习材料多到"找不到起点",感知约一半的 SEO 建议是卖课式骗局;明确要"80/20 优先级清单+技术型创始人常见错误清单+免费工具" | [r/SaaS](https://www.reddit.com/r/SaaS/comments/1rksty6/i_can_write_code_but_seo_is_a_total_mystery_to_me.json) | reported |
| 小企业主称关键词/外链/meta 全是天书,想学又雇不起专家;最高赞回复(44 分)说"小站 SEO 一个周末能学会"并甩通用清单——**社区的回应方式本身就证明缺一个'对你的站'的个性化诊断** | [r/SEO](https://www.reddit.com/r/SEO/comments/1lt6rme/how_do_you_make_your_website_rank_higher_on/) | reported |
| 同帖内评论区多人趁机推销自己的服务("雇代理吧""这就是我干的活")——新手在这些帖子里承受代理推销压力,分不清真建议与广告 | 同帖 | reported |
| 评论共识:技术型创始人的最常见失败 = 过度投入技术信号(meta/速度)而没有匹配真实搜索意图的内容;新手需要的是**简化和排序,不是更多数据** | 同帖评论(2 分) | reported |

### 1.4 ⚠️ 获客渠道负面发现:"免费 SEO 审计"话术已被污名化

| 证据 | 出处 | 置信 |
|---|---|---|
| 小企业主每天收到 SEO 公司模板化冷邮件推销假"免费审计",该帖 291 分(95% upvoted)/126 评论,OP 补充说引发广泛共鸣 | [r/smallbusiness](https://www.reddit.com/r/smallbusiness/comments/1rrz5ly/dear_seo_company_vultures_please_stop_emailing.json) | reported |
| 评论共识:绝大多数 SEO 商家是低质转包,其自身网站质量就暴露无能;"保证 Google 第一名"被点名为不可信信号 | 同帖 | reported |
| 站主认定可信帮助只能自己主动搜到/口碑找到,不能被动接受推销 | 同帖 | reported |

**→ 直接修正 W2 发帖话术**:①不用 "免费审计/免费诊断" 开头——该词已是骗子信号;②用新奇角度开场("想知道 ChatGPT 推荐的是你还是你的竞品吗");③姿态做成 inbound(发有价值的内容让人来找),不做冷私信轰炸——后者恰好是本簇痛点里"vulture"的行为模式。

---

## 2. A 类:有经验从业者痛点(已排除出 4 周验证,决定长期定位)

### 2.1 AI 可见度:测不了 → 测不准 → 测了没法用

**测不了(历史基线)**:2024-11 的 r/bigseo 帖([链接](https://www.reddit.com/r/bigseo/comments/1gtyu62/tools_for_tracking_mentions_and_citations_on/))里,从业者找不到任何工具能追踪 ChatGPT 里的品牌提及与引用;能找到的替代品(GA 引荐流量、Mention/Brand24)被公认追踪不到 ChatGPT;OP 当时判断 ChatGPT 原则上不可测("black box")。(reported;注意日期较早,工具市场此后已涌入大量玩家)

**测不准(测量效度之争,2025–2026 持续)**:

| 论断 | 出处 | 置信 |
|---|---|---|
| ✅ 从业者 DIY 探针测 ChatGPT:"答案波动比 SERP 还大,采样不可靠;只有假设性数据没有真实用户数据;结果没法转成行动,所以没什么用" | [r/bigseo 同帖评论](https://www.reddit.com/r/bigseo/comments/1gtyu62/tools_for_tracking_mentions_and_citations_on/) | ✅ 三票确认 |
| API 采的数据 ≠ 用户在 UI 里看到的(缺引用、格式、本地化);有评论者称按 API 结果宣传 "ChatGPT 可见度" 近乎虚假广告——但帖内有反方引用 UW 研究者称 API 更优,OP 让步承认抓取只多 ~8% 品牌提及 | [r/seogrowth](https://www.reddit.com/r/seogrowth/comments/1mxw7bg/why_ai_seo_visibility_tools_are_so_expensive/)、[r/AI_SearchOptimization](https://www.reddit.com/r/AI_SearchOptimization/comments/1rod427/the_geo_bullshit_state_of_geo_in_2026/) | ⚠️ 验证未完成 |
| 可见度百分比只有方向性意义,误差带约 ±7 个点 | [r/DigitalMarketing](https://www.reddit.com/r/DigitalMarketing/comments/1pp8ywr/are_these_ai_visibility_tools_actually_is_helpful/) 评论 | ⚠️ |
| 同一问题换个措辞,品牌引用率从 80% 摆到 10%;人工截图法无法覆盖每周 4 模型 ×200 查询(发言者有工具立场 'vectorgap') | 同上主题帖评论 | reported·有立场 |
| 单次查询统计上无意义:转述 Rand Fishkin 讲座称同一问题要问几百次才能看到同一品牌出现两次(二手转述无链接) | [r/content_marketing](https://www.reddit.com/r/content_marketing/comments/1r7hkg5/seogeo_does_reliable_data_even_exist_anymore/) | reported·二手 |
| 工具生成的合成 prompt 是否代表真实用户提问,用户普遍怀疑——**prompt 集代表性是行业未解的信任问题**(与本项目盲区⑤完全同构) | [r/seogrowth 同帖](https://www.reddit.com/r/seogrowth/comments/1mxw7bg/why_ai_seo_visibility_tools_are_so_expensive/)、r/DigitalMarketing 帖 OP | ⚠️ |
| 反方:GEO 平台创始人(追踪 150+ 公司)承认所有厂商都靠重采样、数据只是"快照不是普查"——但主张足量采样下引用模式可测且稳定(特定品牌/页面结构被反复引用) | [r/AI_SearchOptimization](https://www.reddit.com/r/AI_SearchOptimization/comments/1rod427/the_geo_bullshit_state_of_geo_in_2026/) | reported·有立场 |

**→ 对 Veris 的含义**:行业在方法论上吵成一团,而"诚实标注采样局限"(claim_type 分层、n=5 标注方向性样本、Wilson 噪声门)恰好是 Veris 已有的差异化立场——竞品都在把方向性数据当精确数据卖。但反过来,±7 点误差带、措辞敏感性这些批评**同样打在 Veris 自己身上**:盲区②(连跑两次测噪声底线)在对外之前必须做。

**排名与 AI 引用脱钩(从业者最困惑的现象)**:

| 论断 | 出处 | 置信 |
|---|---|---|
| 站点 Google 前 3、月 5k 自然流量、schema 正确、外链体面,但 Perplexity/ChatGPT 零提及——GSC 和常规审计**给不出任何诊断信号** | [r/marketing](https://www.reddit.com/r/marketing/comments/1r617ad/how_to_improve_ai_brand_visibility_when_your_site/) | ⚠️ |
| 排名更低的竞品出现在 AI 答案里,自己不出现,机制无人能解释;唯一测量手段是"手动逐条输入查询" | 同帖 | ⚠️ |
| 社区共识诊断:AI 引擎按"第三方提及/全网被谈论程度"引用品牌,不按排名位——因果因素在 Semrush/Ahrefs 类工具的测量范围**之外** | 同帖评论 | reported |
| 各 LLM 引擎检索行为不同,一个引擎出现另一个不出现——**必须分引擎测**(Veris 分引擎双口径已按此设计) | 同帖评论 | reported |
| 排名 #2 的词,AIO 却引用第二页的文章——rank tracking 对 AIO 引用无预测力 | [r/DigitalMarketing](https://www.reddit.com/r/DigitalMarketing/comments/1rpdy45/organic_traffic_down_40_and_i_dont_care/) | reported |

### 2.2 测了不知道干嘛:监控型工具的行动断层(付费与留存的分界线)

| 论断 | 出处 | 置信 |
|---|---|---|
| ✅ **"噱头/值得付费"分界线:"你出现了 5 次"= vanity metric,不值钱;"修你的 JS 渲染,因为 Perplexity 读不到你的定价页"= 掏钱**(发言者自述在 GEO 赛道创业,有立场;全帖最高赞之一) | [r/SaaS](https://www.reddit.com/r/SaaS/comments/1r7v8m1/what_would_make_an_ai_seo_tool_an_instant_worth/) | ✅ 三票确认 |
| OP 测了约一打 AI 可见度工具,全部停在"监控品牌提及",没有一个告诉你具体改什么 | [r/SaaS](https://www.reddit.com/r/SaaS/comments/1rpkx2c/every_ai_visibility_tool_ive_tested_only_does/) | ⚠️(注:此条在三票验证中被否决 0-3,但同主题有多帖独立互证,保留并降档) |
| 没有工具做"改完之后复测验证"(verify-after-change)闭环 | 同帖 | ⚠️(同上,被否决但多源互证) |
| 监控型工具流失率高:用户看到"我不在 AI 里"却得不到下一步动作,弃用 | 同帖 | ⚠️ |
| 留存的付费门槛是"执行而非报告":能直接实施的修复+主动告警才值钱,"又一个需要手动查看的仪表盘"会被弃用 | [r/SaaS 1r7v8m1 帖](https://www.reddit.com/r/SaaS/comments/1r7v8m1/what_would_make_an_ai_seo_tool_an_instant_worth/)评论 | reported |
| 买家侧(5 赞):批量 AI 内容生成 = 噱头;"展示品牌在 AI 答案中的实际呈现+明确告诉我修什么+挂钩业务影响"= 值得付费 | 同帖 | reported |
| 从业者点名现有工具缺的两个指标:Share of Model(品牌在 LLM 答案中的份额)、Citation Stability(引用是稳定复现还是一次性运气)——后者直接论证多次采样+复测的必要性 | 同帖 | ⚠️(被否决 1-2,原帖内确有该评论的引文) |
| 用户从 AI 可见度工具实际获得的价值是内容选题灵感和竞品清单,不是可见度数字本身;"fan-out 查询"(LLM 为一个 prompt 发出的子查询)被认为是最有用的输出 | [r/DigitalMarketing 帖](https://www.reddit.com/r/DigitalMarketing/comments/1pp8ywr/are_these_ai_visibility_tools_actually_is_helpful/)评论 | reported |
| 从业者靠"具体内容改动 → before/after AI 答案对比"说服领导层 GEO 工作有价值——同协议复测正中此需求 | [r/content_marketing](https://www.reddit.com/r/content_marketing/comments/1r7hkg5/seogeo_does_reliable_data_even_exist_anymore/) | reported |

### 2.3 AIO 流量流失恐慌与"不敢动页面"

| 论断 | 出处 | 置信 |
|---|---|---|
| 小众旅游站:排名 #1 不变,点击一年掉 ~80%,因为 AIO 用他的内容直接回答;试过改格式/写"不可摘要"内容/转商业词,全部无效——"比任何算法更新都糟,因为没有已知的优化解法" | [r/AISEOforBeginners](https://www.reddit.com/r/AISEOforBeginners/comments/1qy082t/are_googles_ai_overviews_killing_niche_sites/) | reported |
| 全球零点击搜索从 60% 升到 65%(转述 Rand Fishkin/Datos 季报) | 同帖评论(maltelandwehr) | reported·二手 |
| 为 AIO 优化反噬:把排名 #4 的页面改成"答案前置+Q&A 结构",两周后掉到 #11,还是没进 AIO | [r/GrowthHacking](https://www.reddit.com/r/GrowthHacking/comments/1r3h823/optimized_a_page_for_ai_overviews_and_it_tanked/) | reported |
| 追踪自家 ~15 个页面找不到 AIO 收录规律;社区共识是防御性的:"别碰还在排名的页面,要试就用新的牺牲页"——**不存在改动前风险评估、改动后可控对比的工具** | 同帖 | reported |
| 排名与 CTR 不变、自然访问掉 66%、唯一可测变化是展示量掉 50%+——常规排名工具显示"一切正常"却解释不了流量去哪了;13 赞 top 评论归因 AIO | [r/SEO](https://www.reddit.com/r/SEO/comments/1k0obo5/organic_traffic_decreased_incredibly_is_it_ai_or/) | reported |
| 反直觉正面样本:流量降 40% 但月均转化 17→18,且**被 AIO 引用的词几乎总是产生转化的词**——AIO 引用与商业结果正相关;组织痛点 = 领导层还在用流量 vanity metric 拉警报 | [r/DigitalMarketing](https://www.reddit.com/r/DigitalMarketing/comments/1rpdy45/organic_traffic_down_40_and_i_dont_care/)(55 赞,热度中等) | reported |
| 民间小测试:所有受试者都展开了 AIO、没人点开引用链接、多数不核查就信——被 AIO 引用不一定带来点击(但结合上一条,可能带来转化/心智) | [r/SEO 1k0obo5 帖](https://www.reddit.com/r/SEO/comments/1k0obo5/organic_traffic_decreased_incredibly_is_it_ai_or/)评论(4 赞) | reported·小样本 |

### 2.4 GEO 市场信任危机、定价与用词

| 论断 | 出处 | 置信 |
|---|---|---|
| GEO 服务市场充斥不可验证承诺("保证 ChatGPT 第一名""有直连 API 影响 LLM 答案""两周靠 listicle 上 ChatGPT"),从业者视多数自封专家为瞎猜 | [r/AI_SearchOptimization](https://www.reddit.com/r/AI_SearchOptimization/comments/1rod427/the_geo_bullshit_state_of_geo_in_2026/) | ⚠️ |
| 10 年+内容老兵:LLM 厂商不开放排名数据、没有 SERP 那样的真值源,因此视现有 GEO 工具为 snake oil;6 赞 top 评论:厂商在用 ~$500/月卖逆向工程猜测,"手动查+截图"反而更有用 | [r/content_marketing](https://www.reddit.com/r/content_marketing/comments/1r7hkg5/seogeo_does_reliable_data_even_exist_anymore/) | reported |
| AI 引荐归因不可测:ChatGPT 推荐带来的转化在 GA4 里落进 Direct/Unassigned,没有厂商解决 | [r/AI_SearchOptimization 同帖](https://www.reddit.com/r/AI_SearchOptimization/comments/1rod427/the_geo_bullshit_state_of_geo_in_2026/)(GEO 平台创始人发言) | ⚠️·有立场 |
| 定价:Profound $499/月、Ahrefs AI 可见度 $699/月、Semrush 加购 $99/月——被质疑溢价是炒作驱动;低价搅局者 RivalSee 自报 $59–109/月,并证实 GEO 探测的变动成本结构性高于 SEO(联网 LLM 调用按搜索结果 token 计费) | [r/seogrowth](https://www.reddit.com/r/seogrowth/comments/1mxw7bg/why_ai_seo_visibility_tools_are_so_expensive/) | ⚠️·厂商自报有立场 |
| 用词趋势:Reddit 上 AI 搜索优化讨论量 14 个月涨约 7 倍(2025-03 月 8 帖 → 2026-03 峰值 59 帖);2025-08 起社区用词从 GEO 转向 AEO 约 3:1;同期"AI 搜索优化"检索需求陡增而 "seo" 基线持平 | [tohuman.io 数据博客](https://tohuman.io/blog/geo-language-shift-2026)(注意:该博客的另两条论断被三票否决,此数据条未经验证) | reported·来源较弱 |
| 从业者对 "GEO" 品牌词本身存在敌意(最高分帖 111 赞/161 评论视其为忽悠客户的 buzzword)——对外命名慎用 GEO 自称 | 同博客转述 | ❌ 被否决 1-2,谨慎参考 |

---

## 3. 三票确认的硬结论(可直接引用的三句话)

1. **小企业圈对"代理定价像骗局"强共鸣**(水管工帖 147 赞/263 评论)——B 类获客叙事的地基。
2. **测量without行动层会被从业者自己判死**("波动比 SERP 大、没法转成行动、所以没用")——单卖可见度数字此路不通。
3. **付费分界线 = 因果诊断**("你出现了 5 次"不值钱;"修 JS 渲染因为 Perplexity 读不到定价页"值钱)——Veris 的 G03/分引擎能力矩阵恰好站在值钱的一侧。(发言者有立场,但与另两条及多个 reported 条互证)

## 4. 映射到 Veris:吸引与留存功能(按 痛点热度 × 现有能力匹配度 排序)

| # | 功能 | 对应痛点 | 现有能力 | 时点 |
|---|---|---|---|---|
| 1 | **获客钩子:「AI 推荐的是你还是竞品」体检报告**——四引擎+AIO 实测,每条不可见结论挂因果诊断 | §2.1/§2.2 | 探针+AIO 链路已有,缺可分享报告形态 | W1 做报告导出;话术全押此角度 |
| 2 | **获客钩子(B 类专属):「代理对账」**——GSC 收录对账、站内改动痕迹、关键词基线对比,独立回答"代理干没干活" | §1.1(最高热) | 数据能力已有,缺叙事角度 | W2 在人肉代跑报告加一节试反应,不写代码 |
| 3 | **留存:同协议复测 before/after**——"改了这 3 项,引用率 X→Y(超出噪声带)" | §2.2 verify 缺口、§2.3 不敢动页面、§1.1 结果证明 | 已有;但 5 组指标仅 1 组有 Wilson 噪声门(盲区②) | 判真后补噪声门再对外 |
| 4 | **留存:可执行修复项+执行 prompt** | §2.2 "执行而非报告" | 正式通道后端已实现、UI 未接(盲区①) | 验证期不接;访谈反馈驱动 |
| 5 | **留存(远期):变化告警推送**(排名/AI 引用变动主动通知) | §2.2 "仪表盘会被弃用"、§2.3 | 无 | backlog |
| 6 | **信任文案:把 claim_type/L0–L4 讲给用户**——"不保证第一名,只给可复现证据;测不准的地方标出来" | §2.4 信任危机反衬 | 产品哲学已有 | W1 写进报告开头+发帖话术 |

**话术三禁三用**(源自 §1.4/§2.4):禁"免费审计"、禁"保证排名"、慎用"GEO"自称;用"AI 推荐你还是竞品"、用"可复现证据"、用 AEO/AI 可见度措辞。

## 5. 风险、边界与下一步验证

1. **可迁移性**:全部素材来自英文社区;中文外贸站主的代理生态、话术污染程度、付费心理可能不同。→ W2–W3 语音访谈逐条复核 §1 的四簇痛点。
2. **"代理对账"是推导出的新角度**,没有任何直接证据说明站主会为它付费(证据只到"痛"为止)。→ W2 报告加一节,观察访谈反应,别预先开发。
3. **工具 vs 服务的岔路**:§2.2 的"执行是付费门槛"来自从业者;B 类站主可能连执行都做不了。→ 访谈必问:"这份报告里的事,你自己会去做,还是希望有人代做?"多数答"代做" ⇒ 产品形态滑向服务,是比任何功能都大的决策。
4. **测量效度批评是双刃剑**(±7 点误差带、措辞敏感):打竞品也打 Veris。→ 对外前完成盲区②(同站连跑两次测 run-to-run 噪声底线)。
5. **验证环节未跑完**:仅 3/25 论断完成三票验证,其余为单次提取。若某条 reported 结论要成为不可逆决策(如定价、对外承诺)的依据,先单独复核原帖。

## 附录 A:23 个来源清单

| 来源 | 类型 | 主题 |
|---|---|---|
| [r/bigseo — tools for tracking mentions on ChatGPT](https://www.reddit.com/r/bigseo/comments/1gtyu62/tools_for_tracking_mentions_and_citations_on/) | 论坛(2024-11) | AI 可见度测量空缺基线 |
| [r/SaaS — what would make an AI SEO tool worth paying](https://www.reddit.com/r/SaaS/comments/1r7v8m1/what_would_make_an_ai_seo_tool_an_instant_worth/) | 论坛 | 付费分界线 |
| [r/SaaS — every AI visibility tool only does monitoring](https://www.reddit.com/r/SaaS/comments/1rpkx2c/every_ai_visibility_tool_ive_tested_only_does/) | 论坛 | 行动断层/复测缺口 |
| [r/seogrowth — why AI SEO visibility tools are so expensive](https://www.reddit.com/r/seogrowth/comments/1mxw7bg/why_ai_seo_visibility_tools_are_so_expensive/) | 论坛 | 定价/测量方法批评 |
| [r/AI_SearchOptimization — the GEO bullshit: state of GEO in 2026](https://www.reddit.com/r/AI_SearchOptimization/comments/1rod427/the_geo_bullshit_state_of_geo_in_2026/) | 论坛 | 信任危机/方法论之争 |
| [r/marketing — how to improve AI brand visibility](https://www.reddit.com/r/marketing/comments/1r617ad/how_to_improve_ai_brand_visibility_when_your_site/) | 论坛 | 排名与 AI 引用脱钩 |
| [r/DigitalMarketing — are these AI visibility tools actually helpful](https://www.reddit.com/r/DigitalMarketing/comments/1pp8ywr/are_these_ai_visibility_tools_actually_is_helpful/) | 论坛 | 工具价值质疑 |
| [r/content_marketing — SEO/GEO does reliable data even exist](https://www.reddit.com/r/content_marketing/comments/1r7hkg5/seogeo_does_reliable_data_even_exist_anymore/) | 论坛 | 真值源缺失/说服领导 |
| [r/SEO — how do you make your website rank higher](https://www.reddit.com/r/SEO/comments/1lt6rme/how_do_you_make_your_website_rank_higher_on/) | 论坛 | 新手天书感 |
| [r/SaaS — I can write code but SEO is a total mystery](https://www.reddit.com/r/SaaS/comments/1rksty6/i_can_write_code_but_seo_is_a_total_mystery_to_me.json) | 论坛 | 新手 80/20 需求 |
| [r/smallbusiness — do any of you actually look at your Google analytics](https://www.reddit.com/r/smallbusiness/comments/1r2pisz/do_any_of_you_actually_look_at_your_google/) | 论坛 | 仪表盘无行动 |
| [r/SEO — signed up with an SEO company](https://www.reddit.com/r/SEO/comments/17bto5w/signed_up_with_an_seo_company_its_been_a/) | 论坛 | 代理欺诈 |
| [r/smallbusiness — dear SEO company vultures](https://www.reddit.com/r/smallbusiness/comments/1rrz5ly/dear_seo_company_vultures_please_stop_emailing.json) | 论坛(291 分) | 冷触达污名化 |
| [r/smallbusinessuk — am I being ripped off by SEO agency](https://www.reddit.com/r/smallbusinessuk/comments/1oebalm/am_i_being_ripped_off_by_seo_agency/) | 论坛 | 无法验证代理 |
| [r/SEO — is our SEO company ripping us off](https://www.reddit.com/r/SEO/comments/1e0fy2w/is_our_seo_company_ripping_us_off_should_we/) | 论坛 | 报告与 GSC 对账 |
| [r/smallbusiness — SEO consultant charging family business $300/month](https://www.reddit.com/r/smallbusiness/comments/sryd1p/seo_consultant_charging_family_business_300month/) | 论坛 | 定价与欺诈判据 |
| [r/SEO — organic traffic decreased incredibly](https://www.reddit.com/r/SEO/comments/1k0obo5/organic_traffic_decreased_incredibly_is_it_ai_or/) | 论坛 | 排名不变流量掉 |
| [r/AISEOforBeginners — are Google's AI Overviews killing niche sites](https://www.reddit.com/r/AISEOforBeginners/comments/1qy082t/are_googles_ai_overviews_killing_niche_sites/) | 论坛 | AIO 点击流失 |
| [r/GrowthHacking — optimized a page for AI Overviews and it tanked](https://www.reddit.com/r/GrowthHacking/comments/1r3h823/optimized_a_page_for_ai_overviews_and_it_tanked/) | 论坛 | AIO 优化反噬 |
| [r/DigitalMarketing — organic traffic down 40% and I don't care](https://www.reddit.com/r/DigitalMarketing/comments/1rpdy45/organic_traffic_down_40_and_i_dont_care/) | 论坛(55 赞) | AIO 引用与转化正相关 |
| [tohuman.io — GEO language shift 2026](https://tohuman.io/blog/geo-language-shift-2026) | 博客·来源较弱 | 用词趋势数据 |
| [lobsterpack.com — local SEO $3500/month vs AI alternative](https://www.lobsterpack.com/blog/local-seo-3500-month-vs-ai-alternative/) | 博客·转述 Reddit | 水管工定价帖 |

## 附录 B:被三票否决的 8 条(不采用,存档备查)

1. r/SEO 最高分帖敌视 GEO 类目(111 赞)——来源为 tohuman.io 二手转述,1-2 否决;
2. "从业者共识:AI 搜索优化无需新战术"——tohuman.io 转述,0-3 否决;
3. "$800 与 $5,000/月代理交付清单无法区分"——lobsterpack 博客,0-3 否决;
4. "2024-11 无任何工具能追踪 ChatGPT 引用"——0-3 否决(推测因表述绝对化);
5. "Share of Model / Citation Stability 两指标缺失"——0-3 否决(原帖内有引文,可能因概括超出原文,正文降档保留);
6. "rank tracker 无法回答 AI 答案里怎么说你的品牌"——1-2 否决(评论顺带推广 Brandlight);
7. "OP 测了一打工具全停在监控"——0-3 否决(正文以多源互证降档保留);
8. "没有工具闭环 verify-after-change"——0-3 否决(同上降档保留)。

否决主因是来源质量(二手博客)与表述绝对化,不代表相反结论成立;第 5/7/8 条因有原帖引文或多源互证,正文以 ⚠️ 降档形式保留。
