# 职位与校招数据来源、新鲜度及降级契约

更新时间：2026-09-04

## 目标

职位和校招接口统一输出 `dataMeta`，让客户端能够说明数据来自哪里、何时更新、是否可能失效，以及当前是否正在使用降级数据。本契约不等同于 Job Trust Score；官网可验证性、重复度和状态变化仍属于后续能力。

## 主源与降级顺序

### 职位

1. 搜索页以 `/api/jobs/search` 为正式主源；明确国家时依次尝试 JSearch、该国受支持的 Adzuna、地点匹配的 RemoteOK，再降级到同国本地历史职位库。`global` 不默认搜索美国。
2. 聚合页以 `/api/jobs/aggregate` 为正式主源，组合已启用来源；明确国家时使用 JSearch/Adzuna，`global` 使用每天轮换的两个国家市场、RemoteOK 及已注册的 The Muse，并在 `coverage` 披露本次抽样范围。不足时 `global` 可补充本地历史职位；明确国家不跨国补位。
3. 飞书人工职位只作为小程序网络层兜底，不与正式接口竞速决定主结果。
4. 本地历史职位不复制、不生成 `_pool_` ID，也不把抓取时间或当前时间写成发布时间。

官网 Web `/api/jobs`、`/api/jobs/map` 与小程序 `/api/jobs/search`、`/api/jobs/aggregate` 接受 `country=global` 或两位国家代码。明确国家时，JSearch 使用该国家代码，Adzuna 只在已支持市场使用；上游不可用时不悄悄改搜美国，也不拿其他国家的本地旧岗位填充。`global` 以 RemoteOK 的跨地区远程岗位为基础，Web 列表、地图和小程序聚合列表每天轮换两个国家作为本地职位抽样，并在 `coverage` 标明 `sampled`、本次请求的国家及 `countriesWithResults`（实际返回当地岗位的国家）；这不是“世界所有国家的完整岗位库”。远程职位仅在岗位地点标明该国家或 worldwide/anywhere/global 时进入明确国家的结果。

同一来源、同一查询在短时间内共用缓存并合并并发请求；来源遇到 429/403 时进入冷却期，后续排队请求不再立即打到上游。JSearch 默认每个服务进程每日最多 6 次上游调用，可按订阅方案用 `JSEARCH_DAILY_REQUEST_BUDGET` 调整；这只是进程内保护，重启会重置，不代替供应商配额。地图每个抽样国家的结果缓存 24 小时，不再一次并发拉取六组关键词和 12 页 The Muse。The Muse 正式用途只有配置已注册应用的 `THE_MUSE_API_KEY` 才调用，避免无注册凭据持续收到 403。职位地图仍会保留近期本地兜底和来源/新鲜度标识，但不会公开展示过期岗位。

提供商依据：[JSearch country 参数与配额说明](https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch/playground/apiendpoint_374e27ef-ac8b-4014-a801-29065a6f224b)、[Adzuna 按国家搜索接口](https://developer.adzuna.com/docs/search)、[The Muse 注册与限流要求](https://www.themuse.com/developers/api/v2)、[RemoteOK API](https://remoteok.com/faq)。可用国家、招聘配额及上游条款可能变化，服务端只保证按所选国家发起有效请求，不保证每个国家都有结果。

### 校招

1. 校招列表与详情以服务端已同步的校招表为主源。
2. 来源值“飞书校招日历”归一为 `campus_feishu`，“综合公开信息”归一为 `public_campus`。
3. 开发示例和本地缓存只能在明确降级条件下展示，并必须标记 `isFallback=true`。

## `dataMeta` 字段

单条职位或校招记录包含：

| 字段 | 含义 |
|---|---|
| `sourceCode` | 稳定来源代码 |
| `sourceLabel` | 面向用户的来源名称 |
| `sourceType` | 聚合站、职位板、官网职位板、人工整理、历史库、缓存或未知 |
| `isFallback` | 是否为降级结果 |
| `fallbackReason` | 降级原因；非降级结果为空 |
| `freshness` | `fresh`、`aging`、`stale`、`expired` 或 `unknown` |
| `freshnessLabel` | 面向用户的新鲜度文案 |
| `freshnessReason` | 风险解释和复核建议 |
| `publishedAt` | 可验证的发布/开放时间 |
| `updatedAt` | 可验证的内容更新时间 |
| `fetchedAt` | 本次接口抓取或生成元数据的时间 |
| `referenceAt` | 新鲜度计算采用的 `updatedAt` 或 `publishedAt` |
| `ageDays` | 距 `referenceAt` 的整天数；无法确认时为 `null` |
| `freshDays` / `staleDays` | 当前业务域阈值 |
| `isExpired` | 是否已超过明确截止日期 |

集合响应包含 `generatedAt`、`sourceCodes`、`freshnessCounts`、`fallbackCount`、`degraded` 和 `fallbackReason`。

## 新鲜度规则

| 业务域 | `fresh` | `aging` | `stale` |
|---|---:|---:|---:|
| 职位 | 0～30 天 | 31～90 天 | 超过 90 天 |
| 校招 | 0～7 天 | 8～30 天 | 超过 30 天 |

存在明确且已过的截止日期时，`expired` 优先于其他状态。缺少可验证的发布或更新时间时为 `unknown`，不得用 `fetchedAt` 冒充内容发布时间。

校招截止日期兼容 `YYYY-MM-DD`、`YY.M.D` 和 `M.D`。无年份日期结合招聘开放时间或招聘年度推断；“尽快投递”“招满即停”等滚动截止文案保持原文，不伪造具体日期。

## 客户端展示

- 职位卡和校招卡以紧凑形式展示“来源 · 新鲜度”。
- 详情页展示来源、新鲜度和复核原因，并继续提示以企业官网为准。
- 读取本地缓存时，`sourceCode` 必须改为 `cache`，同时保留 `originSourceCode` 和 `originSourceLabel`；界面显示“本地缓存”，不能继续假装在线源。
- `aging`、`stale`、`expired`、`unknown` 和 fallback 是风险提示，不代表职位一定无效；用户仍应打开官方投递页复核。

## 后续边界

本批只建立数据来源和时间可信度基线。Job Trust Score 后续还需增加官网链接可验证性、重复岗位识别、历史状态变化、公司域名一致性和风险证据，不能直接把当前新鲜度映射成一个确定性可信分数。
