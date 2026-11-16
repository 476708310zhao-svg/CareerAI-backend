# P2 分页、指标与迁移预检

## 接口兼容

未传 `pageSize` 的旧请求保持原响应结构和完整数据。新客户端可逐步改用以下有界读取：

- `GET /api/v4/applications/board?pageSize=25&status=preparing&keyword=公司名`：`pageSize` 为 1–100；返回原有 `groups`、`statuses`，`statistics` 和 `total` 为筛选后的完整计数，另有 `hasMore`、`nextCursor`。下一页传回原样的 URL 编码 `cursor`，筛选条件须保持一致。排序仍为截止日期升序、更新时间和 ID 降序。刷新或修改筛选条件时从第一页重新读取。
- `GET /api/v4/resumes/:id/versions?pageSize=20`：返回 `data.list`、`hasMore`、`nextCursor`；列表只有版本元数据，不包含简历正文。下一页传 `cursor=<nextCursor>`。需要正文时请求 `GET /api/v4/resumes/:id/versions/:versionId`。版本详情继续按登录用户校验归属；已归档简历的历史版本仍可读取。

小程序主申请工作台每次读取 50 条，并提供“加载更多”与触底续页；筛选和概览明确表示已加载范围，刷新和账号切换会重置游标。其余需要完整候选集合的页面以及 Web 申请工作台逐页聚合，单次响应均有上限。简历版本选择器只读取逐页摘要，当前简历正文按版本 ID 单独读取；旧版 PDF 关联恢复按摘要逐项检查正文。兼容的无 `pageSize` 接口仍保留给旧客户端。

## 指标保留

`api_performance_v4` 完整记录耗时至少 800 ms 或状态码至少 500 的请求；其他 API 请求按 10% 采样。现有慢请求和 5xx 告警计数仍是完整样本。服务启动和每小时各执行一次清理，每次最多删除 5,000 条普通样本和 5,000 条慢样本中超过 30 天的记录；清理仅涉及指标表，不执行 `VACUUM`。

## Schema 收敛边界

生产发布预检会只读验证版本化迁移状态。`pending`、校验和不符或缺失已应用迁移文件会阻断预检，不自动应用迁移。启动期历史 DDL 仅在新库或存在未应用迁移时执行；已完整迁移的数据库会跳过这些建表、索引和兼容性 `ALTER`。若迁移记录完整但关键基线表缺失，启动会报错，不能静默修补。长期环境仍须按 [数据库迁移基线与恢复手册](DATABASE_MIGRATION_PLAN.md) 备份、演练和核对。

## 开发依赖

使用 npm `overrides` 将旧版小程序自动化 SDK 的易受影响传递依赖固定到已修复版本，并将 `nodemon` 的 `minimatch` 固定到 11.0.8。`npm audit` 完整依赖树为 0 条告警，`check:e2e-3.0` dry-run 通过；真实微信开发者工具 E2E 未在本轮执行。
