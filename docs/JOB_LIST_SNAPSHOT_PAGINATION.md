# 官网岗位列表：本次检索样本分页

日期：2026-10-27。状态：本地实现，生产运行实例尚未核验，未部署。

## 接口契约

- 首屏：`GET /api/jobs?pagination=snapshot&pageSize=20&keyword=...&region=...`。默认页为 1；`pageSize` 必须为 1–50 的整数。
- 续页：保留完全相同的筛选参数与 `pageSize`，增加上一页的 `data.nextCursor`：`GET /api/jobs?pagination=snapshot&pageSize=20&keyword=...&region=...&cursor=...`。不递增 `page`。
- 成功时保留列表结构 `code=0`、`data.list/page/pageSize/total/totalPages/source/sources/dataMeta`，并增加 `data.hasMore`、`data.nextCursor`、`data.totalScope='retrieved_snapshot'` 与同值的 `meta.totalScope`。官网 API 客户端只返回 `data`，因此须同时核对 `data.totalScope` 和布尔型 `data.hasMore`，才能确认新契约已生效。`total`/`totalPages` 仅表示**本次取得、过滤和去重后的岗位样本**，不是外部平台的全库岗位数量。
- 首屏只采集当前已启用来源的第一页或固定 feed，之后按同一快照切页。续页不会重新调用来源、轮换国家、重排或切换实时/历史回退。重试同一个游标返回同一页。
- 筛选或 `pageSize` 改变时返回 HTTP 400、`JOB_SNAPSHOT_QUERY_MISMATCH`；未知、过期、进程重启后丢失或被容量限制驱逐的游标返回 HTTP 410、`JOB_SNAPSHOT_EXPIRED`。客户端可以保留已显示的旧结果，但必须标明“本次快照已过期”、停止续页，并要求用户重新搜索。无效页码、复杂对象或超长筛选返回 HTTP 400。极端大样本会确定性地精简列表描述，并按原有排序保留最多 200 条、2 MiB 内的可用岗位；单条仍超限则跳过。`data.snapshotTruncated=true` 明示截断，`total` 仅为保留样本数；岗位详情仍可单独读取原始详情。
- `source=local` 保留原有准确的本地 `page/total/totalPages`。未带 `pagination=snapshot` 的旧接口保持原有行为，避免影响未知客户端。

## 边界与部署

快照只保存公开岗位的本次检索列表，游标由加密安全随机数生成，不包含关键词或岗位文本。进程内快照有效期为 5 分钟，最多 64 份、每份最多 200 条/2 MiB，总数据上限 16 MiB；过期或超额时删除旧快照并使旧游标返回 410。列表缓存本身不会扩大外部来源调用页数或 JSearch 每日请求预算。列表中超长描述最多保留 2000 个字符，详情接口不受此列表精简影响。

当前仓库 `ecosystem.config.cjs` 指定 `instances: 1`、`exec_mode: 'fork'`，标准 `deploy.sh` 使用该配置；**尚未独立确认线上当前 PM2 实际实例数**。进程内游标不支持多实例无黏性负载均衡，部署或开启官网翻页前必须只读确认正式服务只有一个实例及其运行版本。多实例部署需要共享快照存储或黏性路由及失效策略；本地实现不能作为已上线证明。

旧 `/api/jobs?page>1` 的实时路径存在“上游分页后再次切片”的已知缺陷，`total` 仅是每次抓取的混合池数量。本批只新增显式 opt-in 契约，旧路径不改变；官网新控件应只调用 `pagination=snapshot`。小程序当前主岗位列表使用 `/api/jobs/aggregate`，不受此分支影响。
