# 阶段 4：免费网页答题闭环（2026-10-21）

## 范围与公开边界

在阶段 3 的独立 `qb_*` 人工题库上增加网页登录练习。只使用现有小程序一次性登录码换取的用户 JWT，不引入新登录、会员或支付逻辑。管理员题集 `ready` 仍只是内部状态；迁移 `0019_question_practice.sql` 新增默认无记录即关闭的免费网页发布开关。具有实时 `questionBankPublish` 权限的管理员须对单个题集明确启用；停用立刻从目录消失，并阻断该题集取题、正式提交、答案结果与收藏新增。

网页全球可访问、目前没有可信地域围栏，因此启用还要求题集在商业使用场景发布、每道题的当前完整已批准权利声明同时覆盖题干、答案、商业使用及全球 `['*']` 地域；PDF 衍生题还须同一来源完整声明覆盖改编，且通过阶段 3 的验证、扫描、来源审核、资产状态与动态授权。题目内容审核员与有效权利声明提交者仍须独立。同一 SHA 的其他来源不能继承许可。媒体题目前没有安全私有图片交付能力，继续整题阻断。

公开路由每次按用户 ID 查询当前 `users`，当 JWT 与数据库均有 `openid` 时要求一致。所有会话、错题、收藏查询均按 `user_id` 隔离，响应 `Cache-Control: no-store`。路由不接受客户端指定授权判定日期，使用服务端上海日期。撤权、到期或停用之后，仍允许本人查看冻结的题号、进度和成绩元数据；题干、选项、标准答案和解析不会从历史、错题、收藏或旧请求幂等重放中返回。

## 管理发布 API

`GET /admin/api/v4/question-practice/sets/:setId/publication` 返回 `{publication:{setId,enabled,version,changedBy,changedAt,effectiveAvailable,availabilityReason}}`。无记录时 `enabled=false,version=0`。`PUT` 同路径，请求 `{clientKey,enabled,expectedVersion}`；版本冲突返回 `PUBLICATION_VERSION_CONFLICT`。启用时服务端重新检查全部公开授权，停用不受当前许可失效阻碍。所有变更写入只追加的 `qb_free_web_publication_events`，稳定 clientKey 重试不会再次改状态。

## 用户 API

前缀 `/api/v4/question-practice`，需 Bearer JWT，成功返回 `{code:0,message:'success',data}`。

| 请求 | data | 规则 |
| --- | --- | --- |
| `GET /sets?cursor&limit` | `{sets:[{id,title,questionCount}],total,nextCursor}` | 仅显式启用且当前全球商业授权有效的题集 |
| `POST /sets/:id/sessions` `{clientKey}` | `{session}` | 同一用户/题集只保留一个 active 会话；同 key 精确重试 |
| `GET /sessions?cursor&limit&status=active\|finished` | `{sessions,total,nextCursor}` | 本人分页历史与恢复入口 |
| `GET /sessions/:id` | `{session,items:[{position,revisionId,answered,isCorrect,favorite}]}` | 固定顺序、无题面和标准答案 |
| `GET /sessions/:id/items/:position` | `{question:{position,revisionId,type,stem,options?}}` | 只取已答或当前下一题；白名单绝无答案、解析、PDF key |
| `POST /sessions/:id/items/:position/submit` `{requestId,answer}` | `{submission:{position,selectedAnswer,isCorrect,correctAnswer,explanation,submittedAt}}` | 服务端正式判分，当前题单次提交；同键同答案精确重放须仍有授权 |
| `GET /sessions/:id/items/:position/result` | `{submission}` | 只供已正式提交且当前授权有效的本人恢复结果 |
| `POST /sessions/:id/finish` `{}` | `{session}` | 幂等结束，之后不接收新答案 |
| `GET /mistakes?cursor&limit` | `{mistakes,total,nextCursor}` | 本人正式错题；失权项仅留 `available:false` 及成绩元数据 |
| `GET /favorites?cursor&limit` | `{favorites,total,nextCursor}` | 本人收藏；失权项不带题面 |
| `PUT/DELETE /sessions/:id/items/:position/favorite` | `{favorite,available}` | 收藏当前可用题；失权后仍可移除自己的收藏，客户端按 available 清理旧题面 |

`session` 含 `id,setId,setTitle,status,total,answered,correctCount,createdAt,completedAt`。单选和多选 `answer` 为非空选项 ID 数组（多选排序后比较），判断为布尔值；所有题型只有 `null` 表示正式未答并计错，空数组无效，判断 `false` 不等于未答。重复选项、非法选项、重复正式提交及不同答案的同 requestId 重试均拒绝。下一题必须在前题正式提交后才可通过 API 读取/提交；同一会话的 `qb_practice_items` 在创建事务内冻结修订 ID 与顺序，答案行只追加且不可更新/删除。题目之后出现新修订，不改变已创建会话。

## 验证与限制

`tests/questionPractice.test.js` 覆盖显式公开、全球商业许可、PDF 同 SHA 来源隔离、图片阻断、三个题型和未答、并发提交、精确重试、跨用户、撤权/停用/到期脱敏、冻结版本、公开 GET 答案隔离与管理权限。`tests/databaseMigrations.test.js` 检查迁移、快照封存和收藏 owner 复合外键；网页与管理页面各有专项测试。无真实 PDF、生产库或线上配置参与本批；未部署、未上传真实题目。

当前首页仅分页展示公开候选；候选数量的 `total` 是请求时动态授权通过的数量，授权变更可能使前后页数量变化。实现先扫描全部显式启用的候选、逐题检查授权，再截取页；因此公开题集数量增长前需改为有界游标扫描或缓存/失效机制，初期应控制灰度题集量。历史、错题和收藏以游标分页。网站需要管理员使用自有或已获全球商业许可的原创题灰度，不能把内部 ready 题集自动对外开放。
