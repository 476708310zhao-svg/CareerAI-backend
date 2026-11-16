# 阶段 2：来源权利与内容审核闸门

阶段 2 在阶段 1 私有 PDF 来源记录上增加权利声明、独立审核和服务端使用检查。当前尚无正式题目、题目媒体、学生取题或取图接口；这里的审核只针对现有来源记录及其 PDF 资产，不能解释为未来题目或图片已经发布。生产 PDF 导入仍由阶段 1 固定关闭。

## 数据与审核边界

- 权利声明绑定 `question_asset_sources.id`，不是绑定 PDF 哈希。同一 PDF 有两个来源时，不能继承另一个来源的许可证。`evidenceReference` 只存证据线索；购买、上传、填写来源和提交声明都不会自动授权。
- 声明须明确八项布尔权利：`internalStorage`、`machineProcessing`、`thirdPartyProcessing`、`stemDisplay`、`imageDisplay`、`answerDisplay`、`commercialUse`、`adaptation`。未知项、缺失项按 `false`；未知操作默认拒绝。地域为 ISO 两位大写代码或单独的 `*`。日期为 `YYYY-MM-DD`，按 **Asia/Shanghai 自然日** 判定，`validFrom` 和 `validUntil` 均包含当天。非法日期拒绝。
- 每次具体使用必须有**同一条**当前有效、已批准且未撤销的声明同时覆盖操作、地域与商业使用权。不能把两份不同的批准声明拼成商业展示许可。第三方机器处理还须同一声明同时包含 `machineProcessing`。
- 声明提交权限 `questionAssets`，权利批准/驳回/撤销权限 `questionRightsReview`，内容审核权限 `questionContentReview`。提交者和来源上传者不能自审；内容审核也不能由该来源任何权利声明的提交者批准。权利与内容决定分别记录，操作会追加 `question_asset_audit` 事件。
- 内容审核通过要求资产已由独立流程确认 `validation_status=valid` 且 `scan_status=clean`。阶段 1 的新 PDF 两项均为 `pending`，当前不能标内容通过；拒绝可记录。阶段 2 不提供修改 PDF 校验、扫描结果或直接发布的接口，也不提供原件下载/预览。
- 内容审核写入须带稳定 `clientKey` 和所见最新审核 ID。相同键、相同内容由同一人重试返回原记录，即使后来已有另一位审核员的新决定；旧页面用新键提交会因版本过期返回 409，不会把后续驳回反转为通过。
- 批准声明会将旧资产表的处理/展示布尔标志同步为宽松的数据库发布约束材料；这两个标志不是运行时授权依据。服务端每次按来源、地域、日期、商业用途检查当前声明，因此未来起效、到期或撤销都立即按业务日生效。撤销或内容驳回会立即把旧资产发布标志改为 `blocked`。

## 服务端闸门

`services/questionAssetRights.js` 提供 `hasSourceRight(db, sourceId, operation, context)`、`canUseSource(...)`、`assertSourceUse(...)` 和 `canPublishSource(...)`。未来解析任务、题集发布、取题和媒体交付应传入确定的来源 ID、地域及上海业务日期；除 `internalStorage` 外，所有操作都必须显式传入 `commercial: true|false`，省略时拒绝。`hasSourceRight` 只表达法律声明是否有效；`canUseSource` 要求来源处于隔离状态并拥有对应有效授权。仅 `internalStorage` 可在 PDF 深度校验和扫描尚未完成时返回 true；其他处理、改编与展示用途均须 PDF 校验通过且扫描干净。展示类操作另外要求最新内容审核通过和发布状态为 `published`。`commercialUse` 只是其他操作的附加条件，本身不是独立展示许可。`canPublishSource` 仅判定来源题干的前置条件，不代表未来整题、媒体或题集获得发布许可。阶段 3 真正更新 `publish_status` 前，必须按操作当时的有效授权同步旧资产处理/展示标志，并逐来源、逐媒体实时检查对应权利与审核状态；`canPublishSource` 的结果不能直接当作可写发布保证。当前没有改变发布状态的后台 API，故阶段 2 不产生学生可见内容。未来学生读取必须每次调用闸门，不能依赖历史缓存或单独的资产布尔字段。

`context.at` 只供服务端内部定日评估和测试；阶段 3/4 的发布与学生读取必须由服务端取当前上海日期，绝不能将客户端的日期参数透传给闸门，否则可用过去日期回避到期。

## 管理员 API

全部以 `/admin/api/v4/question-asset-governance` 为前缀，要求管理员 JWT，并在每次读写时核对 `admin_accounts` 的当前启用状态与权限；旧 token 遇账号停用或权限撤销立即拒绝。响应沿用 `{code,message,data}` 且 `Cache-Control: no-store`。读取要求上述任一治理权限，写入按动作再核对专用权限。详情和历史都不返回 `storage_key`、原件 URL 或文件内容。

| 方法与路径 | 权限 | 数据 |
| --- | --- | --- |
| `GET /sources?cursor=&limit=` | 任一治理权限 | `{sources,total,nextCursor}`，id 升序，limit 1–100、默认 30 |
| `GET /sources/:sourceId?territory=CN` | 任一治理权限 | `{source,claims,contentReviews,claimsTotal,contentReviewsTotal,effectiveRights}`；首屏历史各最多 100 条 |
| `GET /sources/:sourceId/claims?cursor=&limit=` | 任一治理权限 | `{items,total,nextCursor}`，id 降序，limit 1–100、默认 30 |
| `GET /sources/:sourceId/content-reviews?cursor=&limit=` | 任一治理权限 | 同上，独立分页 |
| `POST /sources/:sourceId/claims` | `questionAssets` | `{clientKey,evidenceReference,rights,territories,validFrom,validUntil}`；同来源、同 key 相同内容幂等 |
| `POST /claims/:claimId/decision` | `questionRightsReview` | `{decision:'approved'|'rejected',reason}`；同审核员同决定/理由重试幂等 |
| `POST /claims/:claimId/revoke` | `questionRightsReview` | `{reason}`；同撤权人同理由重试幂等 |
| `POST /sources/:sourceId/content-reviews` | `questionContentReview` | `{clientKey,expectedLatestReviewId,decision:'approved'|'rejected',reason}`；无历史时 `expectedLatestReviewId:null`。同键同请求重试返回原记录；旧版本返回 `CONTENT_REVIEW_STALE` 409 |

`effectiveRights` 未提供 `territory` 时返回 `{evaluated:false,reason:'TERRITORY_REQUIRED'}`。提供地域后，`rights` 是当前批准声明的原始位图并集，不可据此组合许可；`coverage.freeStemDisplay`、`commercialStemDisplay`、`freeImageDisplay`、`commercialImageDisplay`、`freeAnswerDisplay`、`commercialAnswerDisplay` 按**同一声明**计算组合覆盖。`usable` 表示免费用途叠加资产、内容、发布闸门后的当前可用性；`usable.commercialUse` 始终为 false，因为商业访问不是独立用途。历史分页是审计可检索路径，详情的最近 100 条只是预览。

## 剩余工作与风险

本阶段没有安全原件预览、深度 PDF 校验器、病毒扫描器或生产私有对象存储。只有独立校验与扫描系统把真实 PDF 确认为 `valid/clean`，内容审核才可能通过。阶段 3 的题目和媒体实体创建后，必须保存确定来源并在发布时调用服务端闸门；阶段 4 的每次公开读取亦须实时重查授权。直接拥有数据库写权限的维护者仍可绕过应用服务，因此生产数据库权限与发布流程应继续按运维规则隔离。
