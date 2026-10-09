# 本地环境操作手册

适用于在本机运行 Veris（Next.js 16 + Inngest + 本地 libSQL 文件库 `veris.db`）。

## 1. 启动

```bash
pnpm dev                     # 固定 3000 端口（package.json 已写死 -p 3000）
pnpm dlx inngest-cli@latest dev --no-discovery -u http://localhost:3000/api/inngest
```

- **端口必须和 OAuth 回调一致**：`.env` 里的 `GOOGLE_OAUTH_REDIRECT_URI` 要写 `http://localhost:3000/api/gsc/callback`，Google Cloud 控制台的"已获授权的重定向 URI"也要是同一个地址。这一步需要你本人在控制台操作。
- 3000 端口被别的项目占用时，next dev 可能换到别的端口，GSC 回调就会落到另一个应用上。启动前先检查：`lsof -i :3000`，以及 `.next/dev/lock`。
- 如果一定要用别的端口（例如 3100），三处要同时改：启动命令的 `-p`、`GOOGLE_OAUTH_REDIRECT_URI`、控制台回调地址。Inngest 的 `-u` 也要指向同一个端口。

## 2. 本地库迁移

### 2.1 先看现状

```bash
sqlite3 -readonly veris.db "select count(*), max(created_at) from __drizzle_migrations;"
```

然后和 `db/migrations/meta/_journal.json` 对比。注意：本地库当年是用 `pnpm db:push` 推的结构，推结构不会记录迁移，所以迁移表可能落后于实际结构。2026-10-04 的实测情况是：

- 迁移表 11 行，0000–0010；
- 0012–0014 的结构已经由 `db:push` 生效：唯一索引、知识库表、`site_pages` 的三个新列；
- 0011 没有生效：`evidence_type` 约束里缺 `social_presence`；
- 0015–0017（SP-A）还没执行。

### 2.2 执行（先备份，必须用 libsql）

```bash
cp veris.db "veris.$(date +%Y%m%d%H%M)-backup.db"   # 文件名以 .db 结尾才被 .gitignore 的 *.db 忽略
node scripts/apply-local-migrations.mjs "$PWD/veris.db" 0011,0015,0016,0017,0018 --record
```

- 备份文件名必须以 `.db` 结尾（`.gitignore` 只忽略 `*.db`、`*.db-*`、`*.db.bak`）；`veris.db.bak-时间戳` 这种名字不会被忽略，可能把带用户数据的库误提交。
- dev 服务开着库时（日志模式为 delete），`cp` 在没有写入进行时是一致的；更稳的做法是用 libsql 执行 `VACUUM INTO '<备份路径>'` 取一致性快照。

- **不要用 `sqlite3 veris.db < db/migrations/0011_*.sql`**。macOS 的 sqlite3 在 0011 最后的改名步骤会报错，而它前一步已经删掉了旧表，结果是 `evidence_artifacts` 整表丢失（2026-10-04 在副本上实测）。脚本用的是 libsql 客户端，和仓库的真库测试用同一种方式回放迁移。
- `--record` 会把 0011–0017 补记进 `__drizzle_migrations`。只有确认这些迁移的结构已经全部生效时才能这么做：要么刚执行过，要么早先由 `db:push` 推过。
- 第一次操作建议先在副本上演练：`cp veris.db /tmp/x.db`，然后对 `/tmp/x.db` 执行同样的命令。

**执行记录（2026-10-06）**：本地 `veris.db` 已完成上述迁移。
- 备份：`veris.2026-10-06-pre-sp-a.db`（libsql `VACUUM INTO` 一致性快照，`integrity_check` 为 ok）。
- 先在当日副本上演练，结果一致后才执行正式库；dev 服务（3100）执行时开着库，未受影响。
- 执行后：迁移表 18 行；`evidence_raw` 表、`project_settings.target_keywords` 列、`social_presence` 约束均已生效；证据 155→155；两个项目市场映射为 `global-en`、品类清空为 `''`（旧的错误默认品类不保留，需要在界面重新填写）。
- `pragma foreign_key_check` 为 60 行，全部是迁移前就存在的 `ai_probe_results → evidence_artifacts` 孤儿行，迁移前后相同。
- 在演练副本上执行 `drizzle-kit migrate`：无待执行迁移，文件逐字节未变。
- 回滚：停掉 dev 服务后，用备份文件覆盖 `veris.db`。

**执行记录（2026-10-07）**：补执行 0018（`runs.baseline_run_id`，回测基线持久化）。备份 `veris.2026-10-07-pre-0018.db`；当日副本演练后执行正式库；迁移表 19 行，run 5 个不变，外键检查仍为迁移前的 60 行；`drizzle-kit migrate` 对副本无操作。注意：drizzle-kit 为 SQLite 生成 ADD COLUMN 时会丢掉 `ON DELETE` 子句，0018 已手动补上 `ON DELETE set null`。

### 2.3 校验

```bash
sqlite3 -readonly veris.db "select count(*) from evidence_artifacts;"     # 与迁移前一致
sqlite3 -readonly veris.db "pragma integrity_check;"                       # ok
sqlite3 -readonly veris.db "select sql from sqlite_master where name='evidence_artifacts';" | grep -c social_presence   # 1
sqlite3 -readonly veris.db "select market, industry, language, count(*) from projects group by 1,2,3;"
LIBSQL_URL="file:$PWD/veris.db" LIBSQL_AUTH_TOKEN=local pnpm exec drizzle-kit migrate   # 应为空操作
```

0015 的效果：旧项目的市场从 "English · Global" 映射为 `global-en`，旧的下拉"行业"清空（向导会要求重新填写英文品类），语言统一为 `en`。

已知遗留：原库本来就有 60 条 `ai_probe_results` 指向已不存在的证据（`pragma foreign_key_check` 可见），迁移前后数量一致，与迁移无关。

### 2026-10 问题台账（0019）

新代码的诊断流水线会写 `check_results` / `issues` / `issue_events`，所以**升级代码后、发起任何新体检之前**，先把下面 1–3 步连续做完：回填只处理还没有问题记录的项目，若在迁移和回填之间跑了新体检，该项目的历史就再也不会被回填。

1. 备份（文件名以 `.db` 结尾才会被 `.gitignore` 忽略）：`cp veris.db veris.$(date +%Y-%m-%d)-pre-0019.db`
2. 迁移：`node scripts/apply-local-migrations.mjs "$PWD/veris.db" 0019 --record`
3. 回填（先 dry-run 看数字，再正式执行；可重复执行，已有问题的项目会跳过）：
   `LIBSQL_URL=file:./veris.db pnpm -s issues:backfill --dry-run`，确认后去掉 `--dry-run` 再跑一次。
4. 核对：`LIBSQL_URL=file:./veris.db pnpm -s issues:report > /tmp/issues.md`，逐条看一遍（文档开头有图例）。

- `--rebuild`（删掉项目问题后重放）只允许对库副本使用，指向 `veris.db` 时脚本会直接拒绝。
- 回填是纯重放：历史体检没有逐条检查台账，没再出现的问题记「未复查（历史数据没有台账）」，不会判「已修复」；旧建议的接受 / 否决、旧发现的忽略会补成决定（标「历史回填」）。
- 回填后的第一次真实体检：历史问题的协议指纹为空，抽样类（AI 引用等）问题无法确认口径一致，未命中时会关闭为「已关闭（检测口径已变或无法确认一致）」，不会判「已修复」；回填出的问题规则版本记为未知（历史体检出自 rules_v1…v10），所以第一次真实体检时没再查出的问题会关闭为「已关闭（不可比）·规则已更新或历史版本未知」，不会判「自行消失 / 已修复」；仍查出的问题保留原来的决定继续跟踪（标「规则已更新或历史版本未知」，不与历史数值比较）。这是预期行为。
- 线上库如已部署，同样执行 1–3。

## 3. 数据源凭据（BYOK）

设置页录入的凭据加密存在 `provider_credentials` 表里，优先级高于 `.env`。DataForSEO 由主采集、AIO、预检统一经 `resolveDataforseoCredentials` 解析。

| 数据源 | 需要什么 | 没有时 |
|---|---|---|
| GSC | 平台 OAuth（`GOOGLE_OAUTH_*`、`CREDENTIALS_ENCRYPTION_KEY`）+ 项目授权 + 选择站点 | 排名与关键词无法评估；授权失效（invalid_grant）时预检会提示重新授权 |
| DataForSEO | `DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD` | 关键词、竞品、外链、AIO 无法评估 |
| PageSpeed Insights | `PAGESPEED_API_KEY`（Google Cloud 免费申请） | 会匿名调用，但 2026-10-04、10-06 两次实测都是 429，响应里的配额上限为 0——不配 key 实际不可用，性能记为"失败：http_429" |
| 渲染 | Cloudflare（账号 ID + token）或 Browserless token | 无法对比 JS 渲染前后的正文 |
| AI 引擎 | OpenAI / Perplexity / Gemini / DeepSeek 任一 key | GEO 可见度无法评估；只配 DeepSeek（不联网）时无法检查 AI 是否引用本站 |
| Google CSE | `GOOGLE_CSE_API_KEY` + `GOOGLE_CSE_CX` | 社媒/评价站检索与前台可见性跳过 |

进入新建向导第 2 步时会自动运行一次"运行前检查"，逐项显示以上数据源本次是否可用。
