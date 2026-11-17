# 企业官网岗位同步器：开发步骤与首批实现

日期：2026-11-17。开发基线：`codex/release-20261116`；任务分支：`feat/official-job-sync`。产品目标同时覆盖**中国内地、英国和美国**。本批先用现有中国内地试点中 **10 家可通过 Greenhouse、Lever、Ashby 读取公开岗位的企业**验证同步链路；另外 10 家只有官网入口，不计入自动同步岗位。英美企业在逐家核实招聘板、地点与使用条款后按同一链路接入，不把未经核验的名单当成已覆盖岗位。

## 0. 文档和接口发现

- 产品/来源契约：`PRODUCT.md`、`docs/JOB_CAMPUS_DATA_PROVENANCE_CONTRACT.md`、`docs/CN_OFFICIAL_20_PILOT.md`、`docs/JOB_MANUAL_VERIFICATION.md`、`docs/onboarding/01_CURRENT_STATE.md`。
- 已有接口：`GET /api/jobs/aggregate`、`GET /api/jobs/detail?job_id=...`、`GET /api/jobs/official-boards`，由 `routes/jobs.js` 提供；`GET /api/v4/jobs` 由 `routes/v4/jobs.js` 提供。官网板适配器在 `services/cnOfficialPilot.js`，缓存/限速/冷却模式在 `services/jobSourceGateway.js`。
- 官方接口：[Greenhouse Job Board API](https://docs.greenhouse.io/job-board)、[Lever Postings API](https://github.com/Lever/postings-api)、[Ashby Job Postings API](https://developers.ashbyhq.com/docs/public-job-posting-api)。Ashby 还有需企业选择参与的[合作方岗位 Feed](https://developers.ashbyhq.com/docs/dedicated-partner-job-feeds)，适合未来跨企业规模化合作。
- 反例：`routes/aggregate.js` 的旧持久聚合把 Greenhouse `updated_at`、Lever `createdAt` 写作发布时间，关键词推断签证支持，且仅 upsert、不处理岗位消失。旧表与 `/api/jobs/aggregate` 不是同一数据源；不能直接扩企业名单当作新同步器。

## 1. 首批实现：适配器与真实来源字段

**开发内容**：沿 `services/cnOfficialPilot.js:43-114,158-207` 的固定企业白名单、字段归一、来源失败隔离模式，实现每家企业完整读取。Greenhouse 可接受明确核准的企业自定义招聘域名；Ashby 用规范化岗位 URL 建稳定键；Lever 支持分页和 EU 实例。适配器可按企业板国家配置中国内地、英国或美国筛选，但当前启用的固定企业名单仍只有中国内地试点。保留 `publishedAt`、`sourceUpdatedAt`、`fetchedAt` 三个不同事实。

**首批验证**：现有 `tests/cnOfficialPilot.test.js` 加入 Ashby 无 `id`、Greenhouse 自定义域名、Lever 多页/EU 样本；抽样真实企业响应前不推断实际可收录数量。

**防错**：不把公开接口可读取等同于无限转载授权；不把官网首页当岗位详情；不把 Greenhouse 更新时间、Lever 创建时间当发布日期；职位文本出现 sponsor 一词时不自动宣称雇主提供签证支持。

**公开展示边界**：Human 确认目前没有企业或 ATS 的第三方展示授权。首批仅展示企业、岗位名、地点、类型、来源和官网申请链接等必要信息；适配器不请求 Greenhouse 正文，所有 ATS 岗位正文均不保存到持久库，也不从实时回退接口向用户返回。

## 2. 首批实现：持久快照与独立同步命令

**开发内容**：版本化迁移 `0034_official_job_sync.sql` 新增官网岗位及同步运行表，不重写旧 `aggregated_jobs`。以“企业板 + 官网岗位稳定 ID”幂等 upsert，按国家保存首次/最近见到时间、官网链接、来源引用及本次完整同步结果。`scripts/sync_official_jobs.js` 需要显式 `--run --db=<existing-db-path>`；正式定时器由运维单独配置。

**失效规则**：单板请求错误不更改岗位状态；完整同步中首次缺失只增加计数，连续两次缺失才关闭。整板突然变空或大比例消失只标记异常，等待人工核对。重新出现的岗位可恢复开放。当前本地岗位链接探测及质量看板只覆盖 `jobs.json`，不能直接宣称覆盖官网同步数据。

**首批验证**：`tests/officialJobSync.test.js` 用内存 SQLite 验证幂等、两轮缺失、错误/空板保护、异常大幅减少、发布日期与更新时间分离；`tests/databaseMigrations.test.js` 验证迁移。CLI 在无 `--run`、无显式 DB 或缺迁移时必须拒绝执行。

**防错**：不在开发中连接生产库或真实定时器；不让同步器在读请求中做数据库迁移；不因 HTTP 200 断言企业申请表仍接受投递。

## 3. 首批实现：两端查询共用官网快照

**开发内容**：`routes/jobs.js` 在首批企业板均有同步尝试且至少一家成功取得有效岗位后优先读取持久快照；未准备好时沿用原实时读取。详情根据同一岗位 ID 查询。`utils/jobData.js` 将有效官网岗位加入 V4 可浏览集合，使 `routes/v4/jobs.js`、Web 和申请流程读同一岗位；小程序继续走既有岗位接口。来源失败时保留上次快照但标注降级。

**验收**：隔离库同步后，小程序使用的 `/api/jobs/aggregate` 与 Web 使用的 `/api/v4/jobs` 均能查到同一官网岗位；详情/加入申请引用同一 ID；岗位关闭后不能再作为当前可申请岗位展示，但历史申请记录仍可读取。

**防错**：不改旧本地岗位 ID，不跨国家补位，不把最近同步时间当原始发布时间；同步未准备好时维持原接口兼容。

## 4. 后续任务：运营与规模扩展

1. 为企业板建立来源负责人、授权/条款核查、运行频率和目标岗位簇；若超出当前固定名单，需单独审核新增企业。
2. 后台展示每家企业的最近成功时间、失败、空结果、疑似大量下架、当前有效岗位数；决定是否手动关闭异常岗位。
3. 建跨来源同岗识别（官网规范链接 + 公司/岗位/地点），并与 JSearch、Adzuna 聚合结果合并；目前 `_dedupeJobKey` 优先各来源自己的 ID，不能保证跨源去重。
4. 用实际用户指标验收“目标届别且官网可申请的岗位数”、近七日新增、失效处理时长及用户确认投递比例；不以抓取总数充当有效岗位数。
5. **英国与美国接入批次**：分别建立经验证的企业板白名单和岗位样本；从 ATS 的结构化国家字段或明确地点证据判断市场，不能根据企业总部或搜索词猜测岗位国家。完善适配器的地区筛选、`utils/jobGeography.js` 来源路由与 `/api/jobs/aggregate` 查询；现有 V4 查询已可读取按国家保存的快照。每个市场独立验收来源故障、有效岗位数和官网投递链接。
6. 商业化跨企业聚合优先争取雇主/供应商合作授权；美国与英国的数据采集、展示和保留条件逐来源核对。

## 5. 发布门槛与风险

- 2026-11-17 首次生产发布：Human 审查并批准 PR #3 后，合并提交 `f13b863` 部署成功。正式备份通过完整性检查，数据库应用 `0034`，10 板首次同步得到 18 条开放岗位（9 板有结果、1 板为空）；公网 `/api/jobs/aggregate` 返回 18 条官网岗位、0 条正文、18 条 HTTPS 链接。每日 06:40 的生产单实例 cron 已启用。
- 现场浏览器发现公开 Next.js 网页 `/jobs` 使用 `/backend/api/jobs`，后端实际为本仓库 `/api/jobs`，此前未读取新官网快照。修复分支 `fix/official-web-list` 将持久快照合入首屏快速列表、普通列表和可续页快照；官网岗位优先展示，按国家和筛选条件过滤，去除同公司同岗位同地点的重复项。官网岗位关闭时旧翻页游标失效；公开网页上的岗位仍须在该修复发布后单独验收。
- `fix/official-web-list` 经 PR #4 审查、CI 和发布检查后已部署，公网网页 API 可见 13 条官网岗位。5 条生产快照仍为开放的岗位因发布时间超过旧网页的 90 天新鲜度阈值而被列表层过滤；官网申请表已在本次真实来源核验中检查。`fix/official-open-web-jobs` 使官网快照的开放/关闭状态决定是否入列，发布时间与来源更新时间仍原样展示并保留“可能过期”提示，不伪造发布日期。发布后应再次核对 18 条及官网入口。
- 真实试跑曾得到 19 条中国内地候选；逐条详情与申请页检查发现 Meshy 的 `Applied Researcher Intern` 标题与官网 `Full time` 类型冲突，已在适配器中排除。修正后隔离库 10 板同步均完成，18 条保持开放，冲突项按两次缺失规则关闭。13 条 Greenhouse 页面均返回岗位标题、姓名/邮箱/简历/提交字段；Ashby 与 Lever 的 6 个独立申请页在浏览器可见表单，其中冲突项不得展示。没有提交真实申请，因此只证明表单可见。真实网络出现过 `ECONNRESET`，公开 GET 现仅对连接重置、超时和 502–504 最多重试两次；403、429 不重试。有效岗位数会随企业官网变化，不把本次 18 条当作发布承诺。
- `scripts/run-official-job-sync.sh` 是单实例调度入口，必须显式设置 `OFFICIAL_JOB_SYNC_DB_PATH`，使用 `flock` 防止重叠并写入 `official-job-sync.log`。部署不会自动启用定时任务；发布负责人在生产库迁移和首次手动同步验收后再单独配置计划任务，并指定日志告警责任人。
- 生产当前读检（2026-11-17）：`current` 指向 `manual-20261116-86b2f0ca4976-lf`，线上 `schema_migrations` 最新为 `0033`、共 33 项，服务器 Node 为 v20.20.2；此候选只需新增 `0034`，仍须先备份、在生产副本演练并核对迁移校验和。服务器时区为 CST（UTC+08），已有校园同步 06:00、提醒 08:10 定时任务，官网岗位同步应在独立时间窗口单独启用。
- 本分支已用模拟上游和真实企业公开响应在隔离数据库验证；新迁移涉及生产数据库，正式应用前按 `AGENTS.md`、`docs/production-deploy.md` 做备份、副本演练、校验和核对及单独发布审查。实时响应与岗位申请表可见，不等于已经获准转载全文或已经完成实际投递。
- 无全文转载授权后的展示核对：适配器、持久快照、手机端接口和 Web V4 接口均不保存或返回官网岗位正文。Web 职位列表增加“企业官网申请”链接，加入申请后的详情保留该入口，并在正文为空时提示以企业官网为准；仅接受 HTTPS 的官网链接。独立的 Edge 浏览器验收 `tests/browser/web-official-job-link.cjs` 使用合成岗位与临时数据库，验证列表、申请详情入口及正文不外显；已通过。原有完整 Web 工作台可选浏览器测试在既有并发更新提示步骤超时，未将其视为此专项的通过证据。
- 生产副本迁移预演（2026-11-17）：在服务器 `/tmp` 内对当前生产 SQLite 执行在线备份，仅在该隔离副本应用 `0034` SQL；前后 `integrity_check=ok`、新表数为 2、生产原库 `0034` 应用数为 0。服务端 SQL SHA-256 为 `6452fdac0a4226d3194d817949099e4e6942cb79dc8ac8874b2d967c69dc6e52`，与工作树一致；预演副本及 SQL 临时文件已清理。此步骤未修改生产数据库，也不替代正式备份、发布负责人审查和迁移 apply。
- 运行 `node --test tests/cnOfficialPilot.test.js tests/officialJobSync.test.js`、`node --test tests/databaseMigrations.test.js`、`npm test`、`npm run check:release`、`git diff --check`；再用非生产测试环境验证真实企业响应、同步频率及两端页面。
- 首批没有数据库并发租约、运营审核页面或跨源实体去重；若准备上生产，需要把单实例定时调度和异常处理责任明确写入部署任务。生产版不能依赖公开接口的偶然可访问性来承诺岗位覆盖。
