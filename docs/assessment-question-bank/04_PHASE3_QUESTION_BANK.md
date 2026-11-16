# 阶段 3：内部人工题库与题集（2026-10-21）

## 本批范围

独立于旧 `interview_questions` 建立 `qb_*` 表，支持单选、多选、判断的人工录题、不可变修订、来源及媒体证据、内容和权利分开审核、题集排序与内部发布。只挂载管理员 `/admin/api/v4/question-bank`，本阶段没有学生读题、取图、答案或公网媒体接口。`/uploads` 不存放题目媒体。当前任何带图片的题都不能进入 ready，因为安全的私有媒体交付仍待后续阶段实现。

原创题必须记录作者和归属证据，且有独立内容审核及权利声明审核。PDF 来源题须引用确定的 `question_asset_sources.id`；来源、验证、扫描、阶段 2 内容审核和同一来源声明的题干、答案、改编及商业权都必须符合场景。题目修订还需要独立的一份已批准完整声明；不会拼接不同声明的权利。相同 SHA 的多个来源只共享 `question_pdf_assets` blob，不共享 `sourceId` 许可。

## 管理 API

统一响应 `{code:0,message:'success',data}`；受控错误返回相应 HTTP 状态和 `{code:'ERROR_CODE',message:'ERROR_CODE',data:null}`。所有管理响应 `Cache-Control: no-store`，每次读取当前管理员账号与权限。读权限要求至少有 `questionBankEdit`、`questionBankPublish`、`questionContentReview` 或 `questionRightsReview` 之一。写操作分别要求编辑、发布、内容审核、权利审核权限，复用阶段 2 两个审核权限。旧 `questions` 权限不会自动授权新题库。

| 路径 | 请求主体 | 返回 data |
| --- | --- | --- |
| `POST /questions` | `{clientKey,content,provenance,media:[]}` | `{question,revision}` |
| `GET /questions?cursor=0&limit=30` | — | `{questions,total,nextCursor}` |
| `GET /questions/:id` | — | `{question,revisions}`，修订含完整 `contentReviews`、`rightsClaims` |
| `POST /questions/:id/revisions` | `{clientKey,expectedRevisionId,content,provenance,media:[]}` | `{question,revision}` |
| `POST /revisions/:id/content-reviews` | `{clientKey,expectedLatestReviewId:null\|id,decision,reason}` | `{contentReview}` |
| `POST /revisions/:id/rights-claims` | `{clientKey,evidenceReference,rights,territories,validFrom,validUntil}` | `{claim}` |
| `POST /rights-claims/:id/decision` | `{decision,reason}` | `{claim}` |
| `POST /rights-claims/:id/revoke` | `{reason}` | `{claim}` |
| `POST /sets` | `{clientKey,title}` | `{set}` |
| `GET /sets?cursor=0&limit=30` | — | `{sets,total,nextCursor}` |
| `GET /sets/:id` | — | `{set,items}`，item 有 position、固定 revisionId、questionId、revisionNo、type、stem |
| `PUT /sets/:id/items` | `{expectedVersion,revisionIds:[...]}` | `{set,items}` |
| `POST /sets/:id/publish` | `{clientKey,expectedVersion,territory:'CN',commercial:false}` | `{set,items}` |

`content` 只接 `{type,stem,options,answer,explanation}`。`single`、`multiple` 有 2–8 个唯一 A–H 选项，答案为引用选项 ID 的数组；单选恰好 1 个，多选至少 2 个。`boolean` 不带 options，answer 是布尔值。`provenance` 原创为 `{kind:'original',authorName,ownershipEvidence}`，PDF 为 `{kind:'pdf',sourceId,evidenceReference}`。媒体仅记 `{kind:'image',sourceId,pageNumber,locator}` 来源定位元数据，当前不会产出媒体 URL。

题目及修订创建使用 clientKey 幂等；新修订还绑定所见父修订 ID，避免旧响应或同 key 用于另一父版本。内容审核使用 clientKey 加 expectedLatestReviewId，比对当前最新审核记录；旧请求的精确重试只返回旧结果，不覆盖后续结论。题集编辑用 version CAS。题集发布使用 clientKey、version 和服务端当前上海日期评估。不能靠商品、管理员身份或资产 blob 的全局标志推导授权。

## 不变性与实时使用闸门

`qb_revisions` 把 content、provenance、media 放在同一不可变行；数据库触发器禁止 UPDATE/DELETE。草稿编辑就是新建修订，原内容/权利结论不会被带到新修订。题集 item 始终引用确定的 revision ID，服务层拒绝同一逻辑题的两个修订同时入集。ready 题集的属性和 item/顺序由数据库触发器禁止改写；发布只能经带同一事务 permit 的服务端 ready 过渡。拥有任意数据库写权限的人仍属受信边界，触发器不能阻止其直接造 permit 或改原始审核表。

服务端 `services/questionBankRights.js` 提供 `revisionReadiness`、`canUseRevision`、`canUseSet`。`commercial` 必须显式布尔；发布、未来学生取题、提交和媒体访问应调用这些检查。`canUseSet` 每次都按固定题集场景，重新核对题目修订、当前内容结论、有效期、地域、完整单份权利声明，以及 PDF 来源真实状态与阶段 2 `canUseSource`。撤权、过期、来源内容驳回或资产状态变化后立刻拒绝使用。内部路由不接受客户端指定 `at`；内部测试可注入日期验证到期。

PDF 发布前使用 `canPublishSource` 加同一来源完整权利声明，避免已发布状态造成预发布死锁；服务在同一事务里根据当前有效来源声明同步旧 `question_pdf_assets.processing_right/display_right`，然后设置 `publish_status`。这两个旧标志属于去重后的全局 asset，存在保守耦合；运行时仍逐 sourceId 核对，不能由另一来源的授权或已发布状态代替本来源授权。阶段 1 资产目前仍以验证/扫描 pending 为默认，因而真实 PDF 来源题保持不可发布，直到可信验证和扫描流程完成。

内容审核和权利裁决拒绝题目作者、该修订的权益提交者、PDF 上传者和来源权益提交者自审；同时 ready/use 动态检查当前有效内容审核员与有效权利声明提交者不同，防止先审后提权的时序绕过。题集发布者权限不等于审核通过。

## 验证与已知边界

隔离库迁移、DB 触发器、严格题型/答案、幂等及 CAS、跨角色/自审、单份声明组合、撤权/到期、跨来源同 SHA、固定修订顺序与图片阻断均由 `tests/questionBank.test.js` 和 `tests/databaseMigrations.test.js` 覆盖。管理页专项在 `tests/questionBankAdmin.test.js`。不连接真实 PDF、主运行数据库、生产配置；未提交、推送或部署。

详情 API 目前返回某逻辑题全部修订和审核历史，不会静默截断；极长历史的分页查询是后续规模化前需补的性能工作。迁移读取器只识别当前使用的简单 `CREATE TRIGGER ... BEGIN ... END;` 形式，仍拒绝触发器外事务语句；复杂 CASE 或 SQL 字符串内包含 `END;` 的触发器，迁移前需扩展解析器与测试。
