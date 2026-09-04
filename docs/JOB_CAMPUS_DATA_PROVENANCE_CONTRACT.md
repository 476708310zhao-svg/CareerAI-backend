# 职位与校招数据来源、新鲜度及降级契约

更新时间：2026-09-04

## 目标

职位和校招接口统一输出 `dataMeta`，让客户端能够说明数据来自哪里、何时更新、是否可能失效，以及当前是否正在使用降级数据。本契约不等同于 Job Trust Score；官网可验证性、重复度和状态变化仍属于后续能力。

## 主源与降级顺序

### 职位

1. 搜索页以 `/api/jobs/search` 为正式主源；服务端依次尝试 JSearch、Adzuna，再降级到本地历史职位库。
2. 聚合页以 `/api/jobs/aggregate` 为正式主源，组合 The Muse、RemoteOK、Adzuna、JSearch 等已启用来源；不足时可补充本地历史职位。
3. 飞书人工职位只作为小程序网络层兜底，不与正式接口竞速决定主结果。
4. 本地历史职位不复制、不生成 `_pool_` ID，也不把抓取时间或当前时间写成发布时间。

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
