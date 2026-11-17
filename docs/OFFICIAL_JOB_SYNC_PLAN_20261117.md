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

- 本分支只开发并用模拟上游、隔离数据库验证；新迁移涉及生产数据库，正式应用前按 `AGENTS.md`、`docs/production-deploy.md` 做备份、副本演练、校验和核对及单独发布审查。
- 运行 `node --test tests/cnOfficialPilot.test.js tests/officialJobSync.test.js`、`node --test tests/databaseMigrations.test.js`、`npm test`、`npm run check:release`、`git diff --check`；再用非生产测试环境验证真实企业响应、同步频率及两端页面。
- 首批没有数据库并发租约、运营审核页面或跨源实体去重；若准备上生产，需要把单实例定时调度和异常处理责任明确写入部署任务。生产版不能依赖公开接口的偶然可访问性来承诺岗位覆盖。
