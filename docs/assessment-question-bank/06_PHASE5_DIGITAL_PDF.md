# 阶段 5：数字 PDF 辅助识题（本地代码）

## 范围与闸门

管理员在独立审题工作台创建解析任务。来源必须有有效的 `machineProcessing` 授权，且资产已深验为 `valid`、扫描为 `clean`。缺授权为 `WAIT_RIGHTS`，深验或扫描未完成为 `WAIT_ASSET_CHECK`，本地私有存储不可用为 `WAIT_STORAGE`。此阶段没有可信扫描和深验服务，也没有生产私有对象存储，因此目前导入的真实 PDF 默认仍被挡在 `WAIT_ASSET_CHECK`。不得在真实库里手工改这两个字段来绕过检查。

Worker 是独立进程 `node scripts/dispatch_question_parse.js --once`（或 `--loop`），HTTP 创建任务不解析 PDF。每次处理页前重查来源权利、资产状态；原件按 SHA-256 和字节数重新核验。任务有 60 秒租约、每页数据库 checkpoint，过期租约可被下一 Worker 接管；同来源、哈希、试卷版本、解析器版本只保留一份任务和草稿。作业最多 100 页。120 秒是**逐阶段检查的软总预算**：页前后、规则解析前后及草稿写入前复查，超限停在 `WAIT_BUDGET` 且不写草稿；同步规则解析和草稿写入本身不能被该预算中断，因此实际耗时可能稍超 120 秒。每次 PDF 元数据读取与单页读取分别在可终止子进程中执行，硬限时 15 秒和 10 秒；超时杀死该进程、任务标 `FAILED`，重试从 checkpoint 继续。子进程 stdout 最多 3 MiB；每页落库文本最多 512 KiB、坐标 JSON 最多 2 MiB，整任务页证据最多 20 MiB。容量超限标 `NEEDS_MANUAL`，超限页不落库。代码没有调用任何外部 OCR、模型或第三方存储服务。

解析器使用仓库锁定的 `pdf-parse@1.1.1` 所含 PDF.js 的 `getPage/getTextContent` 取得文本块坐标。它不使用 `pdf-parse` 默认拼接文本；默认回调的页失败被吞掉，不适合作为成功证据。页级块与原始文本保存到 `qp_pages`，每份草稿保存来源页和块摘要。规则先按章节与题号分题，再把行内或文末答案按“试卷版本 + 章节 + 题号”关联；冲突答案保留全部候选原文、选项和页号，但不给出可信答案。无答案、冲突、重复编号、答案选项不在选项表、双栏和文本提示的图形均进入 `needs_repair`。扫描空页为 `WAIT_OCR` 或页级 `scanned`，没有虚构题目和答案。旧版 PDF.js 在 Node 下不能可靠检查所有绘图操作，故**每个真实 PDF 页**都标 `GRAPHIC_CONTENT_UNVERIFIED`，相关草稿要求审题员看受权原页；该标记不代表检测出了图形。

解析结果仅写 `qp_drafts`，**不会**写 `qb_questions`、`qb_revisions`、`qb_sets` 或公开练习表。即使答案规则标为 `VERIFIED`，草稿仍待人工审题。编辑须提供版本号和说明，`qp_draft_edits` 不可修改/删除；编辑在 `BEGIN IMMEDIATE` 事务内重新核查机器处理权和资产状态，撤权后拒绝更新。题干、选项、答案或解析发生实质编辑时，答案状态降为 `UNVERIFIED`、当前答案证据清空；原始候选证据仍保存供人工核对。阶段 3 的人工题库审核与权利审核仍需单独执行，当前没有草稿一键发布路径。

## 私有管理 API

前缀 `/admin/api/v4/question-parsing`。实时管理员账号权限复核；`questionAssets` 可建任务、重试、看任务/草稿和页证据、请求原页；编辑草稿须同时具备 `questionAssets` 与 `questionBankEdit`，单独持有编辑权限不能读取解析资料。所有结果 `Cache-Control: no-store`。

| 方法与路径 | 请求/返回摘要 |
| --- | --- |
| `POST /jobs` | `{sourceId,paperVersion,territory,commercial,clientKey}` → `{job}`；无权/未扫描仍建阻塞态 |
| `GET /jobs`、`GET /jobs/:id` | 分页或单任务状态、原因与 checkpoint |
| `POST /jobs/:id/retry` | 重新核验后排队或保持阻塞态 |
| `GET /jobs/:id/drafts`、`GET /drafts/:id` | 待审草稿、`answerEvidenceCandidates` 候选证据和不可变编辑历史 |
| `PATCH /drafts/:id` | `{expectedVersion,stem,options,answerOptionIds,explanation,reviewNote}`；CAS 编辑、审计 |
| `GET /jobs/:id/pages/:pageNumber` | 私有页文字、坐标块、布局状态与 `flags`；响应也受页字节上限保护 |
| `GET /sources/:sourceId/pages/:pageNumber/preview?jobId=:id` | 与作业来源、地域/商业上下文绑定的 PNG；每次渲染前后都检查机器处理权 |

PNG 使用 `pdftoppm` 单页渲染，`shell:false`、参数数组、12 秒超时、8 MiB 输出上限；渲染器不可用返回 `PREVIEW_UNAVAILABLE`。原件从不进入公开 `/uploads`，预览链接不包含 token，后台以 Bearer 请求后显示可撤销 Blob URL。路径和对象 key 不出 API。

## 测试与验收边界

已复制原开发包的 `05_合成测试用例.json` 为 `tests/fixtures/question-parse-cases.json`，测试运行不依赖桌面目录。`tests/questionParsing.test.js` 覆盖六例、跨页题干、同页末尾答案、章节重复编号、缺/冲突答案及候选页、扫描页、双栏坐标、来源授权、同 SHA 不同来源、断点重试、撤权、页/整任务字节上限、子进程超时和输出上限、规则解析后预算到期不写草稿、草稿 CAS/审计、管理员鉴权和本地合成 PDF 的真实页提取及 PNG 预览。隔离数据库迁移测试覆盖 0020 追加 schema。

原 `06_验收测试矩阵.csv` 中的相关项：TC-008 跨页题干与两页来源通过合成测试；TC-009 空文本扫描页不产题、标待 OCR；TC-010 坐标保留与双栏有本地测试，所有真实页保守标图形未核验，**真实复杂图表样本待验证**；TC-011 同 PDF 不同来源记录独立、授权不继承；TC-027 子进程硬超时、输出量与本地页数/任务预算闸门通过，真实成本尚无样本；TC-028 逐页 checkpoint 中断恢复通过合成测试。生产实样的切题率、答案匹配率、漏题率、人工修订工时，以及真实授权/扫描/私有存储能力均待后续实际配置与取样，不以合成用例通过代替。
