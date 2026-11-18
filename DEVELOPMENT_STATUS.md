# DEVELOPMENT_STATUS

## 2026-11-18 企业官网第二批扩展（待审查）

- 新增博世、大陆集团及 Inter IKEA Group 的 6 个 SmartRecruiters 国家板，补充小红书、哔哩哔哩、宁德时代、蔚来、米哈游的招聘官网入口。目录去重后共 33 家，英国官网岗位已接入网页和小程序查询。隔离库真实试跑通过筛选 91 条（中国内地 7、英国 28、美国 56），5 个入库样本确认官网详情链接对应，宜家因类型证据冲突为 0 条。
- 专项 38/38 通过，`npm run check:release` 退出 0（851 通过、2 跳过，数据检查 0 错误），小程序静态检查通过。生产和微信真机验收待发布阶段。使用现有数据库结构，第二批以 PR #6 的分支为审查基线。

## 2026-11-18 飞书企业清单首批扩展与官网职位概览（代码完成，待 PR 审查）

- 从飞书「27届企业笔试测评资料库」企业测评总表读取 621 条企业名称候选；该清单用于发现企业，不作为岗位数据。新增 SHEIN 美国 Greenhouse 自动板及亚马逊、微软、英伟达、特斯拉 4 个官网入口，目录从 20 家增至 25 家。SHEIN 官方公开接口现场返回 16 条岗位，当前没有符合实习/应届规则的开放岗位；这次扩展不会凭空增加公开岗位数量。
- 官网职位的 `description` 现在由已保存的公司、岗位、地点、类型组成本站简要概览，原始官网正文仍不保存或返回，既有 0034 快照无需数据库迁移或重新同步。小程序按当前国家显示官网目录及实际数量，美国官网快照也接入 `/api/jobs/aggregate?country=us`；中国内地快照就绪判定保持独立，避免新增美国板使旧岗位回退。
- 验证：真实 SHEIN 板只读抓取 16 条、筛选接受 0 条；专项 37/37 通过；最终 `npm run check:release` 退出 0（852 项中 850 通过、0 失败、2 项既有跳过）；修改后 `npm run check:miniprogram`、JS 语法和 `git diff --check` 通过。可选 Web 浏览器专项因当前工作树没有安装 Playwright 而未执行；其断言已更新为核对简要概览且原文不外显。没有迁移、生产同步、微信真实 E2E 或部署。

## 2026-11-17 企业官网岗位同步器正式发布与网页补齐

- Human 审查 PR #3 并批准生产迁移及部署；该 PR 已合并至 `codex/release-20261116`。服务器按合并提交 `f13b863` 建立不可变发布目录，正式备份经 `integrity_check=ok` 核验后应用 `0034`，发布脚本检查和切流成功。内网及公网健康接口返回 200。
- 首次生产同步 10 家企业板：9 板 `ok`、1 板 `empty`，18 条岗位开放，0 条非空正文，18 条 HTTPS 官网链接，数据库完整性 `ok`。生产 cron 已在备份旧 crontab 后配置为每天北京时间 06:40，使用单实例锁和日志文件。
- 公开网页 `zhiyincareer.com/jobs` 实际读取 `/backend/api/jobs`（映射本仓库 `/api/jobs`），不是首批已接入的 `/api/jobs/aggregate` 或 `/api/v4/jobs`。Human 审查通过 PR #4，两项 CI 通过，补齐读路径后已部署合并提交 `a92b2a1`；隔离库验证了首屏、普通列表、国家过滤和旧翻页游标失效，`npm test` 850 项中 848 通过、0 失败、2 项既有跳过，最终 `npm run check:release` 退出 0。
- 发布后公网 `/api/jobs?source=local&country=cn` 和官网代理各显示 13 条官网岗位，正文均为空；生产库仍有 18 条开放岗位。其余 5 条被旧网页的发布时间新鲜度过滤掉。`fix/official-open-web-jobs` 正按“生产快照状态为开放”修正，公开网页最终验收仍待此修复发布。
- 差额修复专项 9/9 通过，最终 `npm run check:release` 退出 0（850 项测试中 848 通过、0 失败、2 项既有跳过）。该修复没有迁移或写入生产数据；PR 审查、CI、发布及网页浏览器复核仍待完成。

## 2026-11-17 企业官网岗位同步器上线核验（已审查并发布）

- 对 10 家企业板的隔离库复测得到 18 条开放岗位；逐条核对 Greenhouse 页面与 Ashby/Lever 浏览器申请表后，排除官网明示为全职的误判实习岗位，临时连接错误只有限重试。Human 确认尚无第三方展示授权，官网岗位只保留必要元数据及官网 HTTPS 链接，不保存或返回完整岗位正文；Web 列表及申请详情已提供官网入口。
- `node --test tests/cnOfficialPilot.test.js tests/officialJobSync.test.js` 22/22 通过；`npm run check:release` 退出 0；独立 Edge 浏览器官网入口验收通过。原有完整 Web 浏览器测试在既有并发更新提示步骤超时，不能作为本次专项通过证据。
- 发布前读检确认数据库停在 `0033`。在服务器隔离副本预演 `0034` 后，前后完整性检查均为 `ok`、两个新表已建立、迁移 SQL SHA-256 与本地一致；隔离副本已清理。后续审批、迁移及发布结果见本文件顶部。

## 2026-11-17 企业官网岗位同步器首批实现（功能分支完成，文件占用已释放）

- 从 `codex/release-20261116` 建立 `feat/official-job-sync`。首批复用现有 10 家中国内地 Greenhouse、Lever、Ashby 招聘板，增加完整快照、版本化迁移 `0034`、幂等同步命令、连续两次缺失后关闭、上游错误与异常大幅下架保护；小程序岗位接口、Web V4 岗位和申请流程共用稳定官网岗位 ID。中国内地、英国和美国均纳入国家字段和适配器验证；英美企业板名单尚未核准，当前未声称已上线覆盖。
- 风险与验证：迁移仅在隔离 SQLite 中演练，未连接生产库、运行真实官网同步、配置定时器或部署。新增 `.gitattributes` 固定迁移 SQL 的 LF 行尾，避免 Windows 检出改变迁移校验和。数据库迁移、外部招聘源条款及异常下架处理需在生产发布前单独审查。`npm test` 848 项中 846 通过、0 失败、2 项既有跳过；官网适配器与同步专项 20/20；`npm run check:release` 退出 0；`git diff --check` 通过。实现与后续步骤见 `docs/OFFICIAL_JOB_SYNC_PLAN_20261117.md`。文件占用已释放：Codex。

## 2026-11-17 学生求职流程与机构服务差距规划（文档完成，文件占用已释放）

- 新增 `docs/学生求职流程与机构服务差距规划_20261117.md`，依据学生求职八步和机构服务截图，对照小程序、Web、后端与当前发布边界，列出差距、P0/P1/P2 阶段、API 复用、验收和防误导约束。只做源码与文档核查，未修改业务代码、线上配置、数据库或微信版本。
- 文档存在及范围、相关路由位置和 `git diff --check` 已核对；真实岗位数据、AI 质量、Web/微信端到端与服务交付仍待阶段 0 样例验收。文件占用已释放：Codex。

## 2026-11-17 新成员交接包（文档完成，文件占用已释放）

- 在 `docs/onboarding/` 整理入项导航、当前分支与生产版本边界、本地环境、协作约定、可执行的首日任务和维护者清单；另备 PR 描述模板。`README.md` 增加入项入口并对齐 CI 命令，`AGENTS.md` 改用仓库相对路径、移除已过期的第二批边界。
- 交接包 ZIP 位于仓库外 `outputs/CareerAI-new-member-handoff-20261117-final.zip`，包含入项文档、README、AGENTS、PR 模板和不含真实凭据的 `.env.example`；未包含生产配置、数据库或用户资料。文档链接、ZIP 条目与 `git diff --check` 已核对。本次仅改文档，不涉及业务代码、微信上传或生产部署。文件占用已释放：Codex。

## 2026-11-16 微信 AI 开发模式评测材料准备（本地完成，待平台自测）

- 用户确认 AppID 已开通 AI 能力并提供微信官方评测指南。核对官方 2026-11-16 文档：Nightly 开发者工具中选择「小程序 AI 编译」、基础库至少 3.16.2；开发者自测支持已上传的开发版本，微信团队评测仅支持最新体验版且默认全选 Skill。团队评测文件需 50–100 条 Intent，正例至少 40 条、负例 8–10 条，平台所有检测项通过后才能继续。
- 在 `docs/ai-evaluation/` 新增 20 条自测文件、50 条团队评测候选文件及操作说明；团队文件为 42 条正例、8 条负例，覆盖现有岗位、校招、面经 3 个只读 Skill 的 6 个原子接口，含 11 条时间标签和 1 条未注册场景。JSON 格式、数量、标签、去重本地核对通过；`npm run check:miniprogram` 通过。平台复杂度、多样性、时间/未注册标签判定及实际轨迹尚未运行，不能声称已通过微信评测。当前未安装/运行 Nightly，未上传体验版、登录评测插件或提交微信团队评测。文件占用已释放：Codex。

## 2026-11-16 首页今日待办返回闪动修复（本地完成，文件占用已释放）

- 根据用户 3.37 秒真机录屏，返回首页时待办先呈本地顺序、随后恢复服务端顺序，同一组任务短时交替换位，造成图标跳动。现在同一账号、同一天已有待办时保留当前显示列表，刷新后只在可见内容实际变化时更新；跨日或账号切换仍重建，接口空结果或失败时回退本地任务。只修改 `miniprogram/pages/index/index.js` 与 `tests/frontendVisualCheckpoint.test.js`。
- 首页视觉与导航专项 50/50、`npm run check:miniprogram`、定向 `git diff --check` 通过。微信 CLI 从唯一项目预览成功（总包 2,649,099 字节），二维码为 `tmp/home-task-flicker-preview-20261116.png`，待用户真机复测。未上传测试版或正式发布；其余工作区改动保持原状。文件占用已释放：Codex。

## 2026-11-16 线上部署与 Git 发布（已完成，文件占用已释放）

- 负责人：Codex。发布分支 `codex/release-20261116` 已推送 GitHub，业务代码提交为 `86b2f0ca497673a384f9e3375491ba30cdc2cd92`。合入远端维护分支，排除 `tmp/` 和旧候选哈希清单，敏感文件扫描和 `git diff --check` 通过。
- Human 单独批准生产迁移。先备份并在生产库副本演练 `0023–0030`，再停旧服务、对停止写入后的线上库生成一致性备份并应用八个迁移；生产库 `integrity_check=ok`、迁移版本数 33、`pending=0`。迁移前备份位于 `/www/backups/zhiyincareer/jobapp-server_migration_20261116_qviFNd/`。
- 首次发布候选在切流前发现模拟支付 smoke 测试继承生产关闭开关；修复后第二次发现 Windows 归档将迁移 SQL 改成 CRLF，触发校验和门禁。两次均未切换流量。最终按 Git 树原始 LF 字节重新打包同一提交，只读迁移预检通过；完整发布脚本退出 0，服务器测试 827/827、验收 29 通过/1 提醒，严格预检与隔离候选就绪均通过。
- 线上 `current` 与 PM2 均指向 `/www/wwwroot/zhiyincareer-main/releases/manual-20261116-86b2f0ca4976-lf`，发布前备份位于 `/www/backups/zhiyincareer/jobapp-server_20261116_140138.A3Nfqe/`。公网 `/api/health/ready`、`/api/payment/config`、`/api/jobs` 返回 200 JSON；需鉴权的新路由返回预期 401 JSON。旧版本目录和备份保留作回滚。按 Human 本轮选择，仅发布后端；小程序客户端代码在 Git，未上传微信体验版或提交审核。

## 2026-11-16 P2 剩余代码项收口（已完成，文件占用已释放）

- 小程序主申请工作台改为 50 条一页，支持按钮和触底续页；其余需要完整列表的客户端逐页聚合。简历版本选择器改读摘要，当前正文按版本 ID 读取；旧服务端保留兼容回退。Web 工作台逐页聚合，首页概览从分页统计读取完整计数。
- 完整迁移数据库启动时跳过历史 DDL；新库和待迁移库仍走兼容建表。隔离副本实测已迁移库不会重建被移除的索引，待迁移状态仍可识别。开发依赖通过传递依赖固定消除 12 条告警，`npm audit` 全量为 0；小程序自动化 dry-run 和 Jimp 编解码通过。
- 验证：`npm run check:release` 退出 0，825 项中 823 通过、0 失败、2 跳过；`check:acceptance` 29 通过、0 失败、1 提醒；`check:e2e-3.0` dry-run 4/4 通过。未执行真实微信开发者工具 E2E；未修改生产库、提交或部署。详情见 `docs/P2_PAGINATION_AND_METRICS_20261116.md`。

## 2026-11-16 P2 性能与工程质量优化（阶段完成，文件占用已释放）

- 负责人：Codex。新增申请看板和简历版本的显式分页与游标，筛选下推 SQLite，版本摘要与按需详情分开；旧请求仍返回原结构。旧简历接口增加字段类型、长度与对象校验，错误输入返回 400，500 响应不回显内部异常。
- 性能指标完整保留慢请求和 5xx，普通请求按 10% 采样；启动后及每小时分批清理超过 30 天的指标。生产发布预检只读检查版本化迁移是否全部应用，不自动修改 Schema。历史启动 DDL 和客户端分页接入在上方“剩余代码项收口”中完成，细节见 `docs/P2_PAGINATION_AND_METRICS_20261116.md`。
- 验证：`npm run check:release` 退出 0，824 项测试中 822 通过、0 失败、2 跳过；新增隔离专项 5/5 通过；验收 29 通过、0 失败、1 条既有提醒。未触碰生产库或部署，文件占用已释放。

## 2026-11-16 P1 安全与数据完整性优化（已完成，文件占用已释放）

- 后台每次请求核验数据库中的管理员账号、启用状态与实时权限；撤权、停用或删除后旧 JWT 立即失效。相应测试改为真实测试账号。
- 旧版及后台的简历删除改为归档，避免级联删除 V4 历史版本；旧版列表、详情、编辑、后台列表与自动投递简历来源均排除归档项。ASR 临时文件改存非公开目录，旧公开路径封锁，请求 20 秒超时并清理上传文件。
- 将 Nodemailer 升至 10.6.0，并修复生产依赖链。验证：`npm test` 819 项中 817 通过、2 跳过、0 失败；AI 质量、小程序、数据检查均退出 0；验收 29 通过、0 失败、1 提醒；Nodemailer 本地流式发信兼容性通过；`npm audit --omit=dev` 为 0。完整依赖审计仍报告 12 项开发工具链漏洞，集中在 `miniprogram-automator`/Jimp 与 `nodemon`，未使用强制升级。未修改生产数据库、提交或部署。文件占用已释放。

## 2026-11-13 中国银行原创变式题扩至 186 道（已完成）

- 用户选择本轮直接扩至 186 道原创题。新增 174 道分成 6 辑、每辑 29 道，与原有 12 道合计 186；另有 3 道功能体验题。全部题集均非官方、非 PDF 原题。新增内容经结构、去重及隔离服务全链路验证，174/174 判分正确。生产发布前后备份完成；线上只读核对 8 个题集均 ready 且免费目录启用、总题量 189、PDF 来源数 0、数据库完整性 ok，临时编写账号已停用。题目源文件和详细证据见 `content/question-bank-original/` 与 `docs/QUESTION_PRACTICE_RELEASE_20261113.md`。用户真机逐题体验仍可反馈。

## 2026-11-13 中国银行校招原创模拟题集发布（已完成）

- 用户选择先发布独立原创模拟题。已独立编写并上线 12 道非官方模拟题，生产题集 ID 2；未使用中国银行 PDF 原题或解析。发布前内容哈希核对与隔离全套答题 12/12 正确，题库/练习服务专项 19/19 通过；生产发布前后均已备份。线上只读核对题集 `ready`、免费目录启用、PDF 来源数 0、数据库完整性 `ok`，临时编写账号已停用。详情见 `docs/QUESTION_PRACTICE_RELEASE_20261113.md`；小程序真机整套练习待用户验收。

## 2026-11-13 刷题结果与选项状态视觉修复（已完成，文件占用已释放）

- 根据真机截图，答题结果按 `isCorrect` 分别使用淡绿/淡红背景与对应标题色；判断题左侧空框在选中后变为 ☑，单选和多选题在选中项右侧显示 ☑。只修改答题页 WXML/WXSS，没有改变判分、答案或生产数据库。
- 刷题专项 19/19、`npm run check:miniprogram` 通过。微信 CLI 从唯一主项目预览成功，二维码为 `tmp/question-practice-visual-fix-preview-20261113.png`；从同一目录上传测试版 `2.0.13` 成功。用户真机确认两处显示均无问题；正式提审尚未进行。文件占用已释放。

## 2026-11-13 Mento 职位描述乱码修复第二轮（真机验收通过；文件占用已释放）

- 对 RemoteOK `rok_1137717` 原始记录和生产职位接口做只读核对，确认 5 处错误解码：撇号 3、破折号 1、省略号 1。第一轮只修复撇号，用户反馈仍有乱码；第二轮在小程序展示层还原完整有效的 UTF-8 错误序列，覆盖两种常见误解码形式。实际生产描述经展示组件处理后，5 处均已清除。定向 7/7 通过，`npm run check:miniprogram` 通过，`npm run check:release` 退出 0（818 项中 816 通过、0 失败、2 项既有跳过；数据检查 0 错误、32 条提醒）。v2 微信 CLI 预览成功（总包 2,641,658 字节），用户对同一职位真机回复“都正常”。未修改后端数据、推送或上传正式版本。

## 2026-11-13 候选快照与生产接口核对（审查中，文件占用已释放）

- 使用临时 Git 索引固定本地候选于 `refs/candidates/zhiyin-20261113`，没有改动默认暂存区、当前分支或远端；候选仅供审查，不能直接作为上线提交。
- 匿名只读核对生产 API：健康检查和测评商品返回 200，已挂载的需鉴权接口返回 401；人工服务、刷题、反馈历史、官方招聘及面试报告相关路径返回 404。小程序已有人工服务与刷题可见入口，当前包不能直接上传审核。证据与收口顺序见 `docs/RELEASE_FOLLOWUP_20261113.md`。
- 微信开发者工具登录后首次预览报 `page-meta.json not found`；在 `project.config.json` 打包清单显式包含该文件后，CLI 两次预览通过（总包 2,640,752 字节），预览二维码保存在本机 Temp。`npm run check:release` 在修正后退出 0；仍待代码质量扫描、真机与平台配置验收。未推送、部署、迁移生产库或上传正式版本。文件占用已释放。

## 2026-11-13 提审候选盘点与发布检查修复（代码层完成，文件占用已释放）

- 本轮仅修正 `tests/checkpoint6.test.js` 对已移除简历历史版本恢复入口的旧断言，改为核对当前在线简历版本读取与带 `expectedVersionId` 的新版本保存；`tests/mobileWorkflow.test.js` 的会员 WXML 条件断言对齐实际 `&&` 表达式。未改业务运行代码、生产配置、数据库或支付。
- 定向专项 78/78 通过；全量 `npm run check:release` 退出 0（817 项中 815 通过、0 失败、2 项既有跳过），AI 质量及小程序静态检查通过，数据检查 0 错误、32 条提醒；`check:acceptance -- --no-report` 为 29 通过、0 失败、1 条岗位详情提醒。定向 `git diff --check` 通过。
- 当前工作区集成范围及逐文件哈希见 `docs/RELEASE_CANDIDATE_20261113.md` 与 `docs/RELEASE_CANDIDATE_FILES_20261113.tsv`。尚未形成不可变提交或微信上传版本；后端依赖、微信开发者工具编译、平台配置与体验版真机验收仍待完成。保留全部既有未提交改动，未推送、部署、迁移生产库或提审。文件占用已释放。

## 2026-11-13 本地管理后台密码对齐（已完成，文件占用已释放）

- 已确认本地 `.env` 的 `ADMIN_USERNAME=admin` 与数据库账号一致，但 `ADMIN_PASSWORD` 与原存储哈希不匹配；`ensureEnvAdminAccount` 只在账号不存在时写入密码，已有账号不会自动同步。当前 4400/4401 均未监听。先以 SQLite backup 备份本地 `db/jobapp.db` 至系统 Temp（`jobapp-admin-password-before-1794531178604-c248a226.db`），备份与原库 `integrity_check=ok`；只更新该数据库 `admin` 一行的密码哈希以匹配当前 `.env`，再次 scrypt 比对为 true，更新后 integrity=ok。没有打印明文密码、修改 `.env`、其他账号、生产或 4401 预览库。文件占用已释放；服务仍需按正确数据库启动，旧 4401 临时预览库未找到。

## 2026-11-13 快速核对队列状态筛选补齐（本地完成，文件占用已释放）

- 已补齐已确认、待修复、已排除队列入口、整任务计数及回归；服务端筛选在上一轮已实现。解析/后台/迁移/题库专项 103/103 通过，JS 语法与定向差异检查通过。文件占用已释放，其他未提交改动保留。
- 4401 本地 OCR 预览服务未运行；此前记录使用的临时预览目录仍有私有原件/模型目录，但该目录及当前工作区、系统 Temp 中未找到 `preview-from-local.db` 或同名预览备份。没有创建新库或改动原件，因此真实任务 #6 的浏览器验收尚不能进行；后续应先定位或恢复隔离预览库，再备份后应用 0031–0033 迁移。

## 2026-11-12 单人快速核对开发（本地完成，待浏览器内测）

- 已实现整任务疑点分类与服务端筛选、连续核对及原页放大；新增 0031–0033 迁移，支持版本绑定的人工确认/待修复/排除、默认不勾选的候选题批量确认，以及已确认单选/多选草稿批量转内部题库草稿。批量操作有事务回滚、幂等批次和来源/权限/版本重检；不自动审核、授权或公开。相关文件占用已释放；没有改登录、支付、小程序公开目录或生产配置，保留其他未提交改动。
- 验证：解析、后台、迁移、题库专项 103/103 通过；相关 JS 语法及定向 `git diff --check` 通过。全量 `npm test` 退出 1，题目专项均通过，失败是既有 `tests/mobileWorkflow.test.js:25` 对会员页 WXML `&amp;&amp;` 的旧断言，本轮未修改会员页。独立安全复核发现的批次重试键和已排除题映射问题已修并补回归。原本用于 OCR 的本地 4401 端口当前未启动，尚未对真实 20 题做浏览器计时/人工验收；未迁移主库或生产库，未提交、部署或微信上传。

## 2026-11-11 单人快速核对开发规划（已完成，文件占用已释放）

- Codex 完成 `docs/assessment-question-bank/11_FAST_REVIEW_SOLO_DEV_PLAN_20261111.md`；梳理现有识题、草稿、题库及审核接口，明确疑点分组、人工确认审计、批量建题与单人内测四阶段。仅新增规划文档和本记录，未修改业务代码、数据库或生产配置。两个只读发现任务核对了文档与源码；定向 `git diff --check` 通过。文件占用已释放。

## 2026-11-11 底部 AI 按钮视觉调整（本地完成，待真机视觉验收）

- 仅调整 `miniprogram/custom-tab-bar/index.wxss` 中 AI 按钮样式：按用户截图再缩为 88rpx 圆角方形、蓝紫渐变、半透明细描边、柔和阴影；白色「AI」42rpx，18rpx 星芒在文字右上角；按钮 top 从原来的 -30rpx 调到 -18rpx。其他 TAB、TabBar 容器高度与安全区、路由及业务逻辑未改。文件占用已释放：Codex。
- 验证：`npm run check:miniprogram`、首页/导航专项 62/62 与定向差异检查通过；375pt 基准下按钮约 44px，顶部约突出 6px，按钮底部仍落在 TabBar 容器内。微信开发者工具与真机视觉验收尚未执行。

## 2026-11-10 简历评分工具分包归位（本地完成，待微信重新扫描）

- 微信代码质量扫描提示 `utils/resume-review-score.js` 在主包内未被主包使用。核对后只有简历中心分包页面引用该纯计算工具，现将它移至 `miniprogram/package-career/utils/resume-review-score.js`，并更新页面及专项测试的路径；评分逻辑未改，主包原路径已移除。
- 验证：简历与公开数据专项 49/49 通过，`npm run check:miniprogram`、两个 JS 文件语法检查和定向差异检查通过。微信开发者工具中的「代码质量」尚未重新扫描，不能声称扫描项已转为通过。文件占用已释放：Codex。

## 2026-11-10 首页顶部定向修正（本地完成，待真机视觉验收）

- 按最新截图把统计卡下方的纯蓝横带改为蓝色向白色渐隐的过渡，并在指标下方留 20rpx 的渐变缓冲；待办区仍与外卡左右对齐，数据与操作不变。`check:miniprogram`、首页/导航专项 62/62 和定向差异检查通过。
- 按最新截图收齐计划卡内的左右边缘：蓝色统计区与白色待办区直接相接，白色区域铺满卡片宽度；移除未完成任务的「待处理」标签，保留已完成标识和原有操作按钮。`check:miniprogram`、首页/导航专项 62/62 与定向差异检查通过，未改任务完成逻辑。
- 后续截图微调：品牌与宣传语上移到与微信菜单胶囊同一顶部区域，依据状态栏和胶囊的实际坐标计算顶部位置及品牌最大宽度；通知和个人入口移到搜索框右侧，共用一行，从而缩短首屏顶部。导航目标和未读红点逻辑不变；新增胶囊避让专项断言。首页相关专项 111/111、`check:miniprogram` 通过，仍待真机视觉验收。
- 根据新顶部 PRD 与参考图，把品牌、搜索、三项真实进度指标和今日待办排成一张蓝色渐变「今日求职计划」卡；待办嵌在白色区域。通知红点仍读取现有未读状态，统计仍用现有投递进度和 7 天截止规则，任务沿用 Today 本地规则及服务端同步；同步失败且无本地任务时提供重试，未确认的个人进度显示“—”，不写入参考图的示例数值。
- 本次仅修改 `miniprogram/pages/index/index.{js,wxml,wxss}` 的顶部结构/逻辑、新增顶部 SVG 图标、调整首页顶部相关断言。常用工具、最新机会、热门测评资料、每日最新校招、TabBar 及其他页面未在本次修改。该工作区此前的广泛未提交改动仍保留。文件占用已释放：Codex。
- 验证：`npm run check:miniprogram` 通过（媒体 199.2 KB / 200 KB）；首页/导航/测评/公开数据专项 110/110 通过。微信开发者工具 CLI 预览尝试连接本机既有 IDE 端口时超时，未取得本轮编译结果或预览码；真机视觉验收、上传和发布未执行。

## 2026-11-10 简历评分与建议合并（本地完成，待真机验收）

- 文件占用已释放：Codex；仅 `miniprogram/package-career/pages/resume-center/resume-center.{js,wxml,wxss}`、新增纯计算工具 `miniprogram/utils/resume-review-score.js`、`tests/resumeAttachmentFirst.test.js` 与本节。附件原来的“AI 优化”与“评分”合为“评分与建议”；所选在线简历也只保留同一入口。报告先展示字段内容完整度，再显示可逐条确认的 AI 修改建议；分数明确不代表岗位匹配或录用概率。旧 PDF 点击后先导入再打开报告，模型失败时保留分数并显示重试，账号切换会清除旧报告。
- 专项 `node --test tests/resumeAttachmentFirst.test.js tests/publicDataReliability.test.js` 49/49 通过；`npm run check:miniprogram`、页面 JS 语法、定向差异检查通过。微信开发者工具 CLI 预览编译成功，开发预览码 `C:\Users\admin\AppData\Local\Temp\resume-review-combined-preview-20261110.png`，总包 2.5 MB。主工作区其他尚未发布改动也在预览中；小程序正式版未上传。服务端模型超时修复 `e739089` 尚未获得新的发布授权，因此实际 AI 建议仍待上线后真机验收。

## 2026-11-10 简历 AI 真机故障：模型超时定位与开发预览

- 线上只读核对确认：最近 3 天 5 次简历优化请求均在约 35 秒后因 `ai_timeout` 走规则降级；模型密钥已配置。用虚构简历做服务端连通测试，默认推理方式超时，单独关闭该模型请求的深度推理后，虚构样本约 6–11 秒返回。未把真实用户简历送入诊断输出。
- 独立后端候选工作树 `jobapp-resume-pdf-release-20261105` 的 `codex/resume-model-latency-20261109` 分支已提交并推送 `e739089`，只改简历 AI 请求、运行时参数、失败额度返还、发布基线校验与专项测试；限制模型输入为最多 3 段不含联系方式的简历正文，超时或无可靠建议时明确返回错误，不再生成规则建议。发布工作流的当前版本校验已更新到线上实际版本。全量 `npm run check:release` 通过：514 项中 512 通过、2 项既有跳过，AI 质量与数据检查 0 错误；提交后专项 17/17 通过。候选尚未部署，需单独发布授权。
- 主工作区小程序移除建议弹窗的 JSON 手动编辑和规则降级建议展示；提供可读字段的在线简历编辑、已关联 PDF 的“重新识别并补齐在线简历”，只补空白并保存新版本，保留原附件。专项 45/45、`check:miniprogram` 通过；微信开发者工具 CLI 编译开发预览成功，预览码 `C:\Users\admin\AppData\Local\Temp\resume-ai-repair-preview-20261110.png`，总包 2.5 MB。主工作区尚有其他未发布改动，预览包含它们；正式小程序未上传。真机模型结果需后端候选发布后验收。

## 2026-11-09 真机 AI 优化仍卡住：成功回调修复与页面兜底（新开发预览待验收）

- 文件占用已释放：Codex；`miniprogram/package-career/pages/resume-center/resume-center.js`、`tests/resumeAttachmentFirst.test.js` 与本节。用户在上一个开发预览仍见“优化中”。复查发现成功回调内的局部 `generation` 与外层请求编号重名，在初始化之前被读取；现分别命名请求编号和生成元数据。请求结束但账号或选中简历已变化时，`finally` 也会清除当前请求的忙碌状态。页面另加 60 秒独立截止时间和开发版超时诊断，防止接口 Promise 不结束时无限转圈；旧请求的迟到结果不再覆盖页面。未改生产后端。
- 成功建议、账号变化、请求超时、永不回调、迟到响应及已有 PDF 流程专项 42/42 通过；`npm run check:miniprogram`、页面语法和定向差异检查通过。微信开发者工具 CLI 已重新生成当前工作区开发预览码 `C:\Users\admin\AppData\Local\Temp\resume-optimize-preview-fixed-20261109.png`，总包 2.5 MB。当前工作区其他尚未发布的小程序改动也包含在开发预览中；未上传或发布微信正式版。实际登录账号的 AI 建议成功展示仍待用户真机扫码验收。

## 2026-11-09 真机简历优化持续加载（小程序本地修复，待重新编译验收）

- 文件占用已释放：Codex；仅 `miniprogram/utils/api-client.js`、`miniprogram/utils/api-v4.js`、`miniprogram/package-career/pages/resume-center/resume-center.wxml`、对应专项测试与本节。用户截图显示“优化中”持续数分钟；优化接口已配置 50 秒微信请求超时，但写请求没有独立的 JS 截止时间，若 `wx.request` 回调不返回，页面会一直保持忙碌。简历优化请求现有 55 秒硬截止：到时结束 Promise、尝试中止微信请求，迟到回调不再触发会话或页面更新。简历列表加载提示在优化期间不重复显示。后端已部署的 35 秒模型上限和业务逻辑未改。
- 风险与验证：超时后服务端可能已生成未确认的建议，因此提示“原简历没有被修改”，可再次发起优化；不自动重试非幂等 POST。模拟永不回调请求、迟到 401、页面恢复和专属超时参数的专项 39/39 通过；`npm run check:miniprogram`、相关 JS 语法检查通过，线上匿名优化路由 401（约 0.5 秒）。微信开发者工具 CLI 已成功生成当前工作区的开发预览码（总包 2.5 MB）；未上传正式版本或发布。需本人扫码并用登录账号真机复测，预览包同时包含当前工作区其他尚未发布的小程序改动。

## 2026-11-09 手机端简历优化原文引用二次校验（后端已发布，待真机验收）

- 用户已授权发布独立后端补丁 `dd40f93`。发布分支仅在其上追加工作流基线校验提交 `cf1c2e1`，业务改动仍限 `services/v4ResumeCenter.js` 与简历专项测试；未发布小程序页面或主工作区其他改动。GitHub Actions `Deploy Backend` 运行 `42555985324` 成功，2026-11-09 11:28:30 CST 完成切流；服务端全量测试 0 失败、发布预检 ready、新旧端口健康检查均 ready，公网 `/api/health/ready` 返回 200，匿名 PDF 文件接口返回 401。本人账号的 AI 优化结果仍需开发版真机复测。

- 文件占用已释放：Codex；主工作区 `services/v4ResumeCenter.js`、简历专项测试及本节；独立热修复工作树 `D:\ChatGPT-Projects\求职小程序\jobapp-resume-pdf-release-20261105` 的 `services/v4ResumeCenter.js` 与简历专项测试。复核正常 AI 路径发现运行时在 `validate` 后还会深度脱敏，服务层再校验转换后的值可能重现“未准确引用原简历内容”。服务层现在保存已通过原文与事实校验的建议；降级路径继续用本地原始引用，隐私校验不变。独立热修复提交由 `b1cfaf7` 更新为 `dd40f93`，只含上述服务与两条回归测试；发布工作树干净。
- 独立后端 `npm run check:release` 全部通过（含正常 AI 与降级建议专项 10/10、AI 质量、小程序静态检查、数据检查 0 错误）。主工作区简历专项 19/19 通过。发布后仍需本人账号的真机 AI 优化验收。

## 2026-11-06 手机端简历评分与优化故障（本地修复完成，待发布与真机验收）

- 文件占用已释放：Codex；小程序 `miniprogram/package-career/pages/ats-optimize/ats-optimize.{js,wxml}`、`miniprogram/package-career/pages/resume-center/resume-center.{js,wxml,wxss}` 的评分入口、`tests/resumeAttachmentFirst.test.js` 与本节。简历中心的 PDF 和在线简历增加“评分”入口，明确需要岗位描述；ATS 页改读本人 V4 简历及当前版本，排除归档，载入失败显式重试，评分仅发送必要文本字段，切换账号后丢弃迟到的列表、版本和分析结果。未改 `/api/ai/ats` 的既有模型契约。
- 用户开发版真机的“第 1 条建议未准确引用原简历内容”来自现行线上后端；此前本地降级建议修复尚未发布。基于已发布 PDF 后端基线 `85f42e2`，在现有干净发布工作树创建独立本地分支 `codex/resume-optimize-hotfix-20261106`；最初提交 `b1cfaf7` 已由上节补强的 `dd40f93` 取代。未推送或部署，手机仍会请求旧服务，须在获新范围授权后发布。
- 小程序简历及导航专项 46/46、`npm run check:miniprogram`、语法与定向差异检查通过。当前主工作区 `check:release` 仍受此前会员页 WXML `&&` 与断言 `&amp;&amp;` 不一致阻挡，本轮未修改该页。未预览、上传或发布小程序；手机评分与优化须在后端热修复发布、开发版重新编译后由本人账号真机复测。

## 2026-11-06 在线简历菜单精简（本地完成，待真机验收）

- 文件占用已释放：Codex；仅 `miniprogram/package-career/pages/resume-center/resume-center.{js,wxml,wxss}`、`miniprogram/utils/api-v4.js` 中不再使用的版本/复制入口、该页相关专项测试和本节。菜单现在只保留重命名、设为默认、删除简历；版本查看/恢复、复制及历史记录页入口已移除。删除前二次确认，当前选中简历删除后清除优化建议并刷新列表，失败会提示。底层沿用已有归档接口从在线列表移除，原 PDF 和投递历史保留，确认文案明确说明；附件若仍关联在线简历，提示先删除在线简历。未改后端删除/归档接口或上传链路。
- 验证：简历专项 16/16（含取消删除不调用接口、确认后仅处理对应简历）、导航与 Sprint 3 专项 33/33、`npm run check:miniprogram`、JS 语法及定向 `git diff --check` 通过。未预览、上传或发布；微信真机交互尚未验收。

## 2026-11-06 AI Skill 卡片静态依赖声明（本地完成，待微信扫描）

- 文件占用已释放：Codex；仅 `miniprogram/app.json` 的 `skills` 分包页面注册、新增 `miniprogram/skills/pages/component-holder/`、`scripts/check-miniprogram.js` 的组件依赖校验与本节。保留六个动态 AI 卡片及现有 `mcp.json` 注册；注册页默认不实例化只适用于 AI 对话的卡片，且未加入用户导航。小程序 sitemap 的默认拒绝规则覆盖该页。不改普通用户页面、后端或发布配置。
- `npm run check:miniprogram`、`check:ai-quality`、`check:data`（0 错误、11 项既有提醒）、岗位 Skill 与导航专项 42/42、页面 JS 语法、定向 `git diff --check` 均通过。`npm run check:release` 的全量测试在既有会员页断言失败：`tests/mobileWorkflow.test.js:25` 要求 `&amp;&amp;`，当前 `vip.wxml` 使用 `&&`；本次未修改该文件。微信开发者工具代码质量扫描未重跑，不能保证通用规则已显示通过；未预览、上传或发布。

## 2026-11-06 AI Skill 组件代码质量提示（本地配置已修复，待微信扫描）

- 六个原子组件各自通过 `mcp.json` 的 `components[]` 和对应 API 的 `_meta.ui.componentPath` 注册，四件套完整；普通页面的静态组件扫描不识别这条动态引用链，直接删除将破坏 AI 岗位、校招和面经卡片。`project.config.json` 的 `packOptions.include` 原为空，现按微信 AI Skill 打包契约显式包含 `skills`。`check-miniprogram` 增加打包项、API/组件注册及四件套校验，防止真实缺失被静态扫描误报掩盖。
- `npm run check:miniprogram` 与定向 `git diff --check` 通过，六组件均有对应 API 引用；分包估算 0.10 MB。微信开发者工具扫描尚未重跑，因此不能声称该通用质量规则会转为“通过”；小程序 AI 卡片运行时及真机尚未验收。未预览、上传或发布。

## 2026-11-06 主包未使用 JS 迁入分包（本地完成）

- 将只供刷题分包使用的 `api-question-bank.js` 移入 `package-content/utils`，将只供岗位详情分包使用的 `job-match-evidence.js` 移入 `package-user/utils`；更新两个页面、岗位详情及对应测试引用。通用请求和会话工具继续由普通分包引用主包。未改 API、岗位匹配算法、上传或发布配置。
- 专项测试 33/33、`npm run check:miniprogram`、相对依赖路径及定向 `git diff --check` 通过；静态引用扫描未发现仍由分包独占引用的主包 JS。微信开发者工具窗口最小化，无法重新运行界面中的“代码质量”扫描；本地未预览、上传或发布小程序。

## 2026-11-05 原 PDF 鉴权下载后端已发布（待本人真机验收）

- 用户在微信开发者工具看到“PDF 原件暂不能打开”。复核当前小程序默认请求 `https://api.zhiyincareer.com`；上线前匿名 `GET /api/upload/resume-pdf/1/file` 返回 404，同组 `/extract` 返回鉴权 401。基于当时线上版本 `61044dd` 制作了独立后端分支 `codex/resume-pdf-preview-20261105`，仅加入 PDF 本人鉴权下载、公开直链阻断及隔离测试；未混入主工作区其他改动。
- 本地小程序 `wx.downloadFile` → `wx.openDocument` 已就绪。路由相关风险为简历隐私和旧公开直链兼容；独立候选版本测试本人 200、匿名 401、其他用户 404，公开静态直链 404。该候选版本额外修正了旧 JSearch 专用工作流中已过时的基线锁定，保留上线前后线上版本核对，不再触碰 JSearch 密钥。
- 用户明确授权仅发布此后端修复。独立候选版本 `npm run check:release` 通过：510 项中 508 通过、0 失败、2 项跳过；AI 质量、小程序检查通过，数据检查 0 错误、5 项既有提示。第一次工作流 `41993050499` 因旧基线预检失败、未上传或切流；第二次 `41993226032` 成功发布 `85f42e2`。公网匿名核验：`/file` 401、`/extract` 401、`/uploads/resumes/probe-nonexistent.pdf` 404、`/api/health/ready` 200。正式版原 PDF 的本人下载及微信真机打开仍需用户账号验收；未上传小程序新版本。

## 2026-11-05 简历附件查看动作语义修正（后端已发布，待真机验收）

- 用户要求“查看 PDF 简历”应直接显示原文件分页和排版。简历卡文件名继续走本人鉴权下载 + `wx.openDocument`；404 不再自动改为文字预览，而是明确提示当前后端缺少原 PDF 下载接口，用户可主动选择“查看提取文字”。附件菜单分别提供“打开原 PDF”“查看提取文字”“删除附件”。
- 原 PDF 服务端 `GET /api/upload/resume-pdf/:id/file` 已验证本人 200、匿名 401、其他账号 404；此前线上该路由 404，现已通过独立后端发布恢复鉴权响应。简历专项 15/15、小程序静态检查通过；小程序新版本未上传，仍需本人账号真机验收。

## 2026-11-05 微信开发者工具热更新与附件预览诊断（本地完成，服务端版本待发布）

- 首页 `onLoad`、账号切换与两项公开列表请求改为调用模块内纯函数恢复缓存/核对请求，不依赖热更新前旧页面实例补上新方法；专项模拟实例缺失 `loadHomeFeedCache` 时 `onLoad` 不再抛错。发现本机 `miniprogram/project.private.config.json` 将 `compileHotReLoad` 覆盖为 `true`（公开配置为 `false`）；已在本机改为 `false` 并用 IDE CLI 重新打开项目，该私有文件不提交。
- 附件预览在下载完成后先关闭加载弹层，再打开 PDF；失败也只关闭一次并显示可读提示。线上 `https://api.zhiyincareer.com/api/upload/resume-pdf/1/file` 在 2026-11-05 未登录探测返回 404，同一附件的 `/extract` 返回预期 401，本机 127.0.0.1:4400 未启动；当前开发者工具默认指向线上 API。下载路由 404 时暂用已有的本人鉴权文字提取接口展示可选中的文字，不回退公开静态 PDF 直链；文字无法提取时仍说明预览接口需更新。微信开发者工具 CLI 已打开本项目，小程序 UI 因存在两个同名 IDE 窗口未做交互验收。
- 验证：首页/导航/公开数据专项 64/64，简历附件专项 15/15（含 404 文字预览与加载弹层配对），小程序静态检查通过。原 PDF 预览仍需安全发布后端路由并在微信开发者工具完整重新编译、真机验证。未执行生产发布。

## 2026-11-05 首页最新机会与校招加载提速（本地完成）

- 首页把最新机会和每日校招的成功结果按账号作用域保存到本机。再次进入时先展示最近结果，分别在 5 分钟与 10 分钟后后台更新；校招跨上海日期重新读取，最长只展示 6 小时内的缓存。切页不再取消这两项公开读取，避免返回首页重复发请求。
- 首页校招请求使用稳定参数和短时公开缓存，手动下拉刷新仍强制取新数据；两项读取拒绝把网络失败时的旧 API 缓存当成新结果。后台更新失败保留已显示卡片，首次失败提供重试。服务端聚合请求仍可能受外部职位源延迟影响，但不会让重复打开首页一直显示空白加载态。
- 风险与验证：公开内容新鲜度、账号切换和过期岗位展示；只复用本人作用域内 6 小时以内的成功结果，日期切换清除旧校招。首页视觉、公开数据可靠性和导航专项 63/63、小程序静态检查、JS 语法与差异格式检查通过。未做微信开发者工具或真机计时验收，未上传或发布。

## 2026-11-05 PDF 简历资料同步（本地实现，待真机验收）

- 上传并解析文字版 PDF 后，继续生成当前在线简历版本，再调用本人鉴权 `/api/v4/resumes/:id/sync-profile`。服务端从该版本核验本人 PDF 来源，按空字段补齐 V4 求职画像和旧用户资料中的学校、专业、学历、毕业年份、技能、项目；只有简历明确标注“求职意向/目标岗位/期望地点”等字段时才同步目标岗位或城市，不从过往经历推断当前求职意向。已手填资料优先，重复同步幂等，记录 PDF 来源字段。旧已导入附件重试“导入/优化”也会补跑资料同步。
- 风险与验证：上传、简历版本、资料跨表写入涉及个人数据；服务端事务与本人附件校验，跨账号拒绝，资料同步失败保留已生成的在线简历并在页面提示重试。资料编辑页增加 PDF 导入入口，返回后重新读取服务器资料。简历专项 14/14、资料页专项 6/6、小程序静态检查和 JS 语法检查通过；后端全量测试 780 项中 778 通过、0 失败、2 项平台跳过。扫描件无文字时仍需先转换或手动录入。未部署、未发布、未做微信真机验收。

## 2026-11-05 附件简历查看、管理与优化修复（本地待真机验收）

- 修复简历中心附件无查看入口：增加本人鉴权 PDF 下载与微信文档预览、附件删除入口；已关联在线简历时先归档再删除，避免留下失效来源引用。附件列表上限从 10 调到 100。关闭原 `/uploads/resumes/` 静态直链，预览改走带鉴权接口。风险是旧静态附件直链将失效；验证需检查本人预览、跨账号拒绝、旧申请材料引用的读取方式。
- 修复 AI 优化降级结果脱敏后“未准确引用原简历”错误：本地建议改为用原始字段重新校验，字段必须完整对应，隐私信息不得留在建议修改后内容；PDF 导入摘要排除常见电话行。岗位详情在本机旧在线简历为空时读取本人默认 V4 简历当前版本用于证据分析；外部岗位展示有原文依据的技能关键词覆盖率，不把该比例称为录用概率或完整匹配分。风险是扫描件仍无法自动提取文字；需真机复测上传、预览、优化与岗位匹配。
- 验证：简历专项 15/15（含本人 PDF 读取、匿名与跨账号拒绝）、岗位 Skill 专项 14/14、移动端流程 67/67、小程序静态检查和 JS 语法检查通过；全量后端测试 778 项中 776 通过、0 失败、2 项平台跳过。未做微信真机验收，未部署或发布。

## 2026-11-03 小程序岗位列表分享入口（本地完成并释放）

- 已完成并释放：Codex `search_visibility_20261103`，仅 `miniprogram/pages/jobs/jobs.js` 与本节。公开岗位列表可分享到微信会话及朋友圈；分享固定公开路径，不携带用户搜索词或个人资料。`npm run check:miniprogram`、`node --check miniprogram/pages/jobs/jobs.js` 及定向 `git diff --check` 通过。未做微信开发者工具或真机验收，未上传或发布小程序。

## 2026-11-03 阶段 5 会员页价格来源收口（本地完成并释放）

- 已完成并释放：Codex `stage5_commerce_local_audit`；仅修改 `miniprogram/package-user/pages/vip/vip.js`、`vip.wxml`、`tests/mobileWorkflow.test.js` 的会员价格来源专项与本节。小程序只有在服务端支付配置明确开放、计划 ID 在允许列表且提供有效分价时才显示相应价格和购买入口；配置失败、关闭或缺价格时清除价格卡并展示权益说明，本人订单/退款状态继续可见。当前 `/api/payment/config` 尚无权威价格字段，所以购买入口保持关闭，后续须确定正式价格和服务端价格契约。小程序流程 `node --test tests/mobileWorkflow.test.js` 67/67、`npm run check:miniprogram`、JS 语法及定向 `git diff --check` 通过；未改支付、订单、生产数据或真实收款配置。

## 2026-11-02 阶段 5 订单退款只读运营审计（本地完成并释放）

- 本地完成并释放：Codex `stage5_operations_impl`；`utils/adminPermissions.js` 对 commerce 路由精确映射 `memberships`，`routes/v4-admin.js` 在现有概览、告警及退款决策路由加管理员账号实时启用/用户名/权限复核，并新增只读 `/commerce/audit`。新服务与后台页面按日期、游标和最多 50 条分页展示最小订单退款审计字段及权益状态，不返回用户 ID、联系方式或支付交易标识。订单表无可靠数据类列，Mock 为测试，其他仅为非 Mock 待核验，不认作真实生产转化。高风险权限通过匿名、低权限、旧 JWT 撤权、账号禁用的隔离 HTTP 专项覆盖。后端全量 `npm test` 775 项中 773 通过、0 失败、2 项平台跳过；专项 1/1，后台/服务 JS 语法、OpenAPI YAML 55 paths、定向 `git diff --check` 通过。没有执行真实退款、生产迁移或部署。

## 2026-11-02 测试运行时职位来源隔离（本地完成并释放）

- 已完成并释放：Codex `stage5_manual_recovery`，仅 `tests/all.test.js`、新增 `tests/smokeIsolated.test.js` 与本小节。smoke 在子进程加载服务端前关闭实时职位源；主套件在加载模块前明确启用招聘测试开关，避免模块缓存和测试顺序污染。不修改生产职位路由或配置。定向 smoke 子套件 74/74、wrapper 1/1、sprint8 14/14；整仓主套件 `npm test` 774 项中 772 通过、0 失败、2 项平台跳过。原 74 个 smoke 子用例被一个聚合测试表示，少 73 个计数并非跳过。此前阶段4/5的 3 个 RemoteOK 失败已消除。

## 2026-11-02 阶段 5 人工服务授权工单（本地完成并释放）

- 已完成并释放：Codex `stage5_manual_recovery`；新增 `db/migrations/0030_manual_service_requests.sql`、`services/manualServiceRequests.js`、V4 用户/管理员工单路由、精确 `manualServices` 管理权限、后台工单页和小程序用户页面/API、隔离测试、OpenAPI、人工服务说明和官网开发清单。本地安全闭环包含简历优化/人工筛岗/申请协助三种类型，授权文本版本固定且创建前可见，用户设置最长 90 天/默认 30 天授权期限；撤销后清理申请payload、隐藏敏感字段并禁止管理员继续处理或交付，保留非敏感审计墓碑。交付仅保存摘要和用户现有文件引用，不复制文件。不定义价格、不自动下单/支付、不改现有支付链路。高风险为简历隐私、撤权竞争、管理员鉴权和状态审计，隔离 DB 覆盖双账号/撤销/归档/权限/事务失败，再运行后端全量测试。仅改上述范围，未触达生产数据。

- 验证：迁移与工单隔离专项 26/26，撤销后同键重试专项 1/1，单独禁用实时源的 smoke 74/74；小程序 `check:miniprogram`、后台及小程序 JS 语法、OpenAPI YAML 54 paths 通过。全量 `npm test` 847 项中 842 通过、3 项既有职位 smoke 因合并运行时 RemoteOK 模块缓存污染失败、2 项平台跳过；尚未取得整仓通过。未执行生产迁移、真实支付、部署或真机验收。

## 2026-11-02 阶段 4 岗位数据质量与运营趋势（本地功能完成，全量门禁有既有 smoke 失败）

- 新增只读内部聚合 `services/v4JobQualityAnalytics.js` 和 `/admin/api/v4/operations/jobs/quality`；固定 `dashboard` 权限。数据只来源本机 jobs.json，资格要求官方已知 source、非 fallback、人工 open+verified、官网申请 URL 一致、近 30 日 reachable、未来明确 deadline、fresh/aging；unknown/stale/fallback/unverified等剔除数独立呈现。按 source/region/jobType 只聚合样本量。申请转化以 application confirmation facts 对应唯一 analysis event、owner/application/action/channel 和 trusted job ref 核验；全量对账/覆盖不全返回 null。后台 dashboard 增加质量视图，无公开热度/录用率。
- 验证：质量/权限专项 2/2；人工核验专项 2/2；单独 smoke 74/74；inline dashboard JS 解析、OpenAPI 46 paths、定向 git diff check 通过。整库 `npm test` 846 项中 841 通过、3 失败、2 跳过；三个失败均是已有 `smoke.test.js` 在 all.test 合并运行时，之前加载的 routes/jobs 缓存使该文件设置的 `DISABLE_FREE_JOB_SOURCES=true` 未影响已加载模块，访问了 RemoteOK 实时数据而非本地 fixture；单独运行 smoke 通过。阶段功能已完成，整库绿灯待 smoke 测试隔离修复后重跑。未访问生产数据、未部署。

## 2026-11-02 阶段 4 AI 网申问答草稿（本地完成并释放）

- 已完成：新增 `0029_application_answer_drafts.sql`、`services/v4ApplicationAnswers.js` 和 `/api/v4/materials/answers/draft(s)` 生成、读取、CAS 编辑接口；本人申请需显式绑定本人简历版本，证据只取该版本与已保存材料，服务端生成 evidenceRefs 白名单并过滤个人联系方式。问题作为不可信输入处理，模型不能自造证据引用；缺少证据时拒绝 AI 生成，未配置模型时提供可编辑的降级框架。草稿独立存储为 pending，不写入正式申请材料或已确认事实；客户端始终可编辑，用户手动复制/保存，不会自动提交。
- 双端接入：官网申请助手和小程序申请材料页都可选择本人申请、生成/编辑/保存问答草稿、查看证据/未支持主张和按 Unicode code points 统计字符（emoji 按 1 个码点）。保存使用 expectedVersion CAS；切换申请/账号会丢弃过期请求。
- 验证：新增服务、鉴权隔离、无绑定拒绝、CAS、迁移及小程序 owner/stale response workflow 测试。后端定向 105/105；全量 `npm test` 844 项中 842 通过、0 失败、2 项平台跳过。官网 `npm test` 66/66、`npm run typecheck` 通过；`npm run build` 在 `NODE_OPTIONS=--max-old-space-size=4096` 下通过（60/60 静态页，既有 lint warnings）；默认堆限制首次构建在静态页面阶段 OOM。小程序 `npm run check:miniprogram` 通过（编译媒体 197.1 KB）。OpenAPI YAML 可解析。
- 未做微信开发者工具/真机 UI 自动化验收；没有连接生产数据库、执行生产迁移、部署或发布。`stage4_ai_application_answers` 当前文件占用已释放。

## 2026-11-02 阶段 3 浏览器插件 V1（本地完成并释放，真实 ATS 验收待做）

- 本地完成并释放：新增 `0028_browser_extension_grants.sql`、服务端短时一次性授权签发／撤销／消费、官网申请详情显式字段选择和签发面板、Manifest V3 插件原型。授权绑定本人申请、指定 ATS host 与字段白名单，五分钟过期、可撤销、数据库只存 token hash、插件不持久化 token；CORS 只允许精确配置的扩展 origin 消费授权。插件只在三种 Greenhouse/Lever 主机识别表单；用户逐项预览并确认后填入，检测 tab sender/origin、候选字段仍存在及 host 一致性；不上传 DOM、不填未授权字段、不自动提交。新增本地安装说明；未连接真实 ATS、未发布商店、未部署。验证：后端 `npm test` 835 项中 833 通过、0 失败、2 项既有跳过；插件授权/静态专项 3/3、content/popup JS 语法通过；官网 `npm test` 66/66、typecheck/build 通过。迁移完整断言已包括 0027 和 0028，`git diff --check` 通过。未执行生产迁移或发布。
- 本地完成并释放：Greenhouse/Lever 使用独立合成表单字段适配；扩展最多在本机保存 10 条兼容记录，每条严格只含允许的 host、兼容状态码、原因码和时间，不包含申请 ID、URL、DOM、字段名/标签或值。填表后“打开官网申请并确认状态”只打开已有本人申请详情；如果用户已在企业网站自行提交，必须在官网明确确认，扩展不自动判断、不调用提交确认 API。验证：最终后端 `npm test` 838 项中 836 通过、0 失败、2 项既有跳过；扩展授权/合成表单/返回流程专项 6/6，Manifest JSON、content/popup JS 语法、`git diff --check` 通过。官网 66/66、typecheck/build 曾在本批此前通过；小程序本批无源码变更。未连接真实 ATS、未运行 Chrome 手动预览、未发布扩展商店、未部署。

## 2026-11-02 阶段 2 面试摘要关联申请与确认转任务（本地完成并释放）

- 已完成并释放 `stage2_interview_summary`。新增 `0027_application_interview_reports.sql`、V4 报告服务/路由、练习报告页显式摘要关联、官网/小程序申请详情查看及二次确认转任务。服务端只接受 score、summary、strengths、weaknesses、actions 等白名单字段，丢弃 QA/音频内容；跨账号 404，归档禁写。转换事务检查 `expectedState` 和申请/报告归属；同一 `clientKey` 并发或重试仅生成/返回一个任务，不同键不能为同一报告重建任务。任务继续接入现有提醒同步。
- 验证：隔离 API 专项 1/1、数据库迁移专项 25/25；后端全量 `npm test` 832 项，830 通过、0 失败、2 项既有平台跳过；官网 `npm test` 66/66、typecheck/build 通过；小程序 `mobileWorkflow` 65/65、`check:miniprogram` 和 JS 语法检查通过；OpenAPI YAML 可解析，定向 diff check 通过。仅本地验证，生产库未迁移、未部署或真机验收。

更新时间：2026-11-02

主项目目录：以 `git rev-parse --show-toplevel` 的结果为准。

小程序源码目录：仓库根目录下的 `miniprogram/`。

## 2026-11-02 阶段 2 申请状态历史、CAS 与跨端跳转（本地完成并释放）

- 完成并释放 `stage2_application_status_history`：V4 状态写入要求 `expectedState`，缺少时返回 428；旧进度接口保留描述字段编辑并拒绝状态变更，活跃小程序状态入口迁至 V4。申请历史 GET 复用本人授权校验，支持最多 50 条的游标分页，官网和小程序展示同一申请时间线；跨账号读取为 404。后端全量 `npm test` 828 项中 826 通过、0 失败、2 项既有跳过；官网 66/66、类型检查与生产构建通过；小程序流程 65/65、静态检查通过。仅本地验证，未部署、未迁移生产库或真机验收。

## 2026-11-02 阶段 2 提交确认事实与分析事件对账（本地完成并释放）

- 本地完成并释放：新增幂等对账服务与显式隔离 DB CLI，确认事实可分批补写为分析事件；后台指标卡显示 30 天内曾确认、当前仍确认和对账状态。对账按事实 ID、账号、申请、动作和渠道核对；重复或漏报会使完整指标显示不可用，未迁移时也不报零。旧 `application_submitted` 漏斗含义不变。验证：隔离专项 1/1，后端全量 `npm test` 827 项中 825 通过、0 失败、2 项既有跳过；修正重复事件完整性后重跑隔离专项通过；`git diff --check` 通过。未在生产 DB 执行 CLI、未部署，仍需线上迁移与报表验收。

## 2026-10-30 阶段 2 申请简历绑定与自定义材料清单（本地完成并释放）

- 后端已完成并释放：Codex stage2_material_backend；新增 `0025` 迁移、申请简历绑定与自定义材料清单服务、V4 专用读写接口、隔离专项。旧 V4 PATCH 明确拒绝简历绑定变更；旧进度更新保留现绑定，旧进度新建仅接受本人且匹配的简历版本；简历 link 与 AI 新版本确认不再暗改申请绑定；旧申请简历读写加本人归属校验。仅修改上述后端路径及配套迁移、工作流、smoke 断言；没有修改生产数据库。清单作为用户自报准备备注，确认提交后仍可更正，只有申请简历绑定在确认提交后冻结。
- 后端验证：隔离申请清单专项 7/7、迁移与工作流专项通过；最终 `npm test` 826 项、通过 824、失败 0、跳过 2（Windows 上既有 Linux 发布脚本用例）。首次全量发现 smoke 仍预期 link/AI 自动绑定，已调整为显式 PUT 选版并复跑全量通过。`git diff --check` 与相关 JS 语法检查通过。双账号回归覆盖旧 `GET /api/applications/:id` 对外人简历正文返回 `null`、外人申请 404、旧创建/进度写入的归属校验。
- 同轮 UI 已完成并释放：Codex stage2_material_ui；官网申请详情可显式保存申请级简历版本、按企业公告自建材料清单并编辑名称／准备状态／软删除；确认后仍可更正清单，仅改申请绑定版本需先撤回确认。AI 材料草稿选版默认申请已绑定版本，明确不改变绑定或既有材料；跨申请、跨账号及 A→B→A 迟到响应不会覆盖当前草稿选版。小程序 V4 申请详情读 workspace 并提供同一绑定与清单操作，未迁移／归档禁写、409／404 刷新核对、请求失败不误报成功；已保存材料独立展示。官网范围：`components/applications-workbench-live.tsx`、`components/application-materials-live.tsx`、新增 `components/application-readiness-panel.tsx` 与 CSS module、`lib/application-materials-guard.ts`、`tests/application-materials-guard.test.mjs`；小程序范围：`miniprogram/package-user/pages/application-detail/*`、`miniprogram/utils/api-v4.js`、`tests/mobileWorkflow.test.js`。官网 `npm test` 66/66、`npm run typecheck`、`npm run build` 通过；小程序 mobileWorkflow 64/64、视觉专项 17/17、`npm run check:miniprogram`、相关 JS 语法及定向 `git diff --check` 通过。仅本地验证，尚未在微信开发者工具／真机及线上双账号验收，未部署、未迁移生产库、未发送真实申请。

## 2026-10-30 20 家官网试点数据修复与验收（本地完成并释放）

- 已完成并释放：Codex；范围仅 `services/cnOfficialPilot.js` 的 Ashby 公开列表筛选、Greenhouse prospect post 排除、多地点归一化、错峰与一次短时 502/503/504 重试，`tests/cnOfficialPilot.test.js`、`tests/helpers/jobSourcesProbe.cjs` / `tests/jobSourcesIntegration.test.js` 验收断言、只读验收记录 `docs/CN_OFFICIAL_20_ACCEPTANCE_2026-10-30.md` 与本节。其他任务工作区改动保留，未修改部署、支付、登录及数据迁移文件。
- 验收口径：20 家官网入口，10 家公开 ATS 实时读取；Ashby `isListed=false` 不进入搜索；岗位保留可访问的官方详情、来源与原始 ID；来源空结果与故障可区分；用真实接口检查当前职位分布与返回状态，再跑后端及小程序门禁。
- 数据验收：10 家国内企业官网入口 10/10 HTTP 200；生产节奏读取 10 家自动来源，查询“实习”得到 19 条中国内地岗位，9 家有匹配、1 家真空、无重复 ID，19/19 有描述、地点、官方详情及申请链接，19/19 详情页 HTTP 200；申请链接首次 18/19 返回 200，1 条短时 502 随后复测 200。5 条有明确发布日期，其他留空；无推测薪资。详细记录见验收文档。
- 验证：来源专项 20/20、AI 质量与小程序检查通过，数据内容检查 0 错误、7 条既有非试点文件警告；JS 语法与定向差异检查通过。整仓发布门禁受并行新增 0025 迁移及测试文件影响出现迁移断言不一致，反馈审计失败项单独复跑通过；本轮不把整仓测试记为通过。未在微信开发者工具或真机验收，未提交、推送或部署。

## 2026-10-30 阶段 2 用户确认已提交（本地完成并释放）

- 已完成并释放：Codex stage2_backend_audit；实际范围为新增 `db/migrations/0024_application_submission_events.sql`、`services/v4ApplicationSubmission.js`、`tests/applicationSubmission.test.js`、`tests/helpers/applicationSubmissionFixture.cjs`，以及 `routes/v4/applications.js` 本功能窄范围、`tests/databaseMigrations.test.js` 的 0024 断言、`tests/all.test.js` 注册行和本小节；未改 `services/v4ApplicationWorkspace.js`。追加事实表记录用户确认／撤回，带归属 FK、幂等键、前序事件和时间；准备中确认原子推进已申请，已申请旧记录不会被伪造确认，撤回不倒退招聘状态。旧 `application_submitted` 继续表示状态进入，新 `application_submission_confirmed` 单独记录；分析写入失败不抹去确认事实。未迁移时详情只读、确认写 503；归档确认历史可读但不可再写。高风险迁移、鉴权、跨端并发与重试由隔离双账号、CAS/同键并发、旧键重放、回滚、迁移和归档专项覆盖；迁移 24/24、确认隔离子场景 7/7、稳定版全量 `npm test` 821 项中 819 通过、0 失败、2 项既有 Windows 跳过；JS 语法和定向差异检查通过。仅本地隔离验证，未对正式库迁移、部署或发送真实申请。
- 同轮 UI 已完成并释放：Codex stage2_ui_audit；官网申请详情新增独立的本人最终提交确认／误确认撤回与二次核对，普通“已投递”状态明确不冒充确认事实；确认失败沿用同一 clientKey 重试，409 刷新并重新核对，跨标签 A→B→A 迟到响应由会话版本拦截。小程序 V4 申请详情同样接入确认／撤回，归档时仍展示真实确认历史，未迁移或归档则禁用写入；申请列表区分进度状态与确认事实。官网 `npm test` 64/64、`npm run typecheck`、`npm run build` 通过，构建仅有既有非本轮文件 lint 提示；小程序 `mobileWorkflow` 61/61、视觉专项 17/17、`npm run check:miniprogram` 通过，JS 语法与定向 diff check 通过。范围为官网 `components/applications-workbench-live.tsx`、`app/brand-system.css`、`lib/api-client.ts`、`tests/feedback-session.test.mjs`；小程序 `miniprogram/package-user/pages/application-detail/{application-detail.js,application-detail.wxml,application-detail.wxss}`、`miniprogram/pages/applications/{applications.js,applications.wxml,applications.wxss}`、`miniprogram/utils/api-v4.js`、`tests/mobileWorkflow.test.js`。仅本地验证，未部署、未写生产数据或发送真实申请。

## 2026-10-30 用户反馈历史与跨端状态（本地完成并释放）

- 已完成并释放：Codex feedback_api；范围仅 `routes/feedback.js`、新增 `tests/userFeedbackHistory.test.js`、`tests/all.test.js` 中的测试注册行与本小节。新增需登录的 `GET /api/feedback/mine`，只按 JWT 用户 ID 查询，按 ID 倒序游标分页（默认 20、最大 50），返回公开状态与 UTC 时间戳，不返回联系方式、运营备注、处理审计或其他账号记录。高风险点鉴权与反馈隐私已由匿名/管理员令牌拒绝、两账号交叉、分页/新插入、畸形旧记录、字段白名单的隔离测试覆盖，专项 1/1 通过；UI 并行编辑稳定后重跑全量 `npm test` 812 项中 810 通过、0 失败、2 项既有 Windows 跳过；JS 语法和差异检查通过。仅本地隔离验证，未对正式库迁移或部署。
- 同轮 UI 已完成并释放：Codex feedback_ui；官网新增 `/my-feedback` 私有历史页、导航与岗位纠错成功入口，小程序反馈页新增同账号历史、分页、空态、失败重试和本地时间展示；仅显示后端公开状态，账号切换时清除旧记录。官网请求对迟到的旧账号 401 增加会话版本守卫，跨标签 `storage` 事件同步登录态。官网测试 63/63、`npm run typecheck` 通过，生产构建通过（既有非本轮文件 lint 提示）；小程序反馈专项 6/6、`npm run check:miniprogram` 通过。文件范围：官网 `app/my-feedback/`、`components/{my-feedback-live.tsx,my-feedback-live.module.css,site-header.tsx,job-detail-live.tsx,auth-provider.tsx}`、`lib/api-client.ts`、`tests/feedback-session.test.mjs`；小程序 `miniprogram/package-user/pages/feedback/{feedback.js,feedback.wxml,feedback.wxss}`、`miniprogram/utils/api-feedback.js`、`tests/profileDetailPages.test.js`。未部署、未写生产数据。

## 2026-10-29 国内校招与实习 20 家官网试点（本地完成并释放）

- 当前占用：Codex；新增官方企业来源清单与 ATS 适配服务、`routes/jobs.js` 的中国内地搜索/聚合/详情窄范围、`utils/jobGeography.js` 的中国内地来源、`utils/dataProvenance.js`、新增专项测试与 `tests/jobSourcesIntegration.test.js`、`tests/helpers/jobSourcesProbe.cjs` 的来源测试更新、`miniprogram/pages/jobs/` 的官网入口展示、`miniprogram/utils/api-jobs.js`、`miniprogram/skills/job-search-skill/` 的来源说明、`docs/CN_OFFICIAL_20_PILOT.md` 及本节。其他任务已有工作区改动不纳入本试点；不修改 `tests/all.test.js`。
- 目标：20 家企业官网形成可核验清单；公开招聘 API 的企业返回真实校招/实习职位，其余企业只提供官网入口并标记待接入，绝不伪造职位或把官网首页当岗位。每条岗位保留原始链接、来源、职位 ID、类型及发布日期证据。
- 结果：10 家 Greenhouse/Ashby/Lever 公开招聘板自动同步、10 家国内大型企业展示官网入口。选择“中国内地”可在岗位页查看并复制 20 家官网；聚合接口把公开官网岗位与 JSearch 合并，详情可回源，来源故障与真空结果分开呈现。Greenhouse 的更新时间及 Lever 的创建时间不会冒充发布日期，薪资、签证无证据时不填。试点明细见 `docs/CN_OFFICIAL_20_PILOT.md`。
- 实测：2026-10-29 对“实习”查询，10 家公开招聘板返回中国内地匹配岗位 19 条；9 家有匹配，1 家为空，0 家故障。数量随企业招聘变动，不代表 20 家都有公开岗位。
- 验证：新增服务专项 4/4、来源集成 13/13、移动与视觉专项 71/71、小程序静态与包体检查、AI 质量门禁通过；后端全量 `npm test` 806 项中 804 通过、0 失败、2 项既有 Windows 跳过；内容检查 0 错误、7 条既有非试点文件警告；JS 语法及定向 diff 检查通过。未在微信开发者工具或真机验收，未上传小程序、提交、推送或部署。

## 2026-10-29 多地区岗位来源与状态（本地完成并释放）

- 范围：`utils/jobGeography.js`、`utils/dataProvenance.js`、`routes/jobs.js` 的聚合与香港详情、`services/jobSourceGateway.js`、新增 `services/hkGovJobs.js`、`tests/jobGeography.test.js`、`tests/helpers/jobSourcesProbe.cjs`、`tests/jobSourcesIntegration.test.js`、`tests/jobSearchSkill.test.js`、`tests/mobileWorkflow.test.js`、`miniprogram/skills/job-search-skill/{apis,components,SKILL.md,mcp.json}`、`miniprogram/pages/jobs/jobs.js`、`miniprogram/package-user/pages/job-detail/job-detail.{js,wxml}` 与本节；文件占用已释放，其他任务已有改动保留，未修改 `tests/all.test.js`。
- 结果：美国、英国、中国内地、香港、加拿大都可作为明确地区检索，AI 入口也识别香港和中国内地的中文城市；全球检索每天轮换两个地区，并显示本次覆盖范围，避免误称一次搜索覆盖所有国家。聚合接口逐来源记录成功条数、真实空结果、未配置、故障和超时；AI 岗位卡片显示来源统计。香港政府公开职位源提供职位编号、职责与要求，并保留官网列表入口；城市与实习类型关键词可命中，只有来源明确给出申请链接和薪资时才显示。香港职位详情沿用官方来源及编号，不消耗 JSearch 详情请求；香港岗位不会误标美国 OPT 友好。
- 验证：香港政府公开职位源当天返回 HTTP 200、62 条当前职位，其中 6 条匹配“data”、仅 4 条有直接申请链接；职位源专项 12/12、Skill 专项 14/14、移动端流程 54/54、小程序静态与包体检查通过。后端全量 `npm test` 805 项中 803 通过、0 失败、2 项既有 Windows 跳过；定向 `git diff --check` 与 JS 语法检查通过。
- 范围说明：香港公开源目前只含政府职位；中国内地仍依赖 JSearch，英国和加拿大依赖 JSearch 或已配置的 Adzuna，其他雇主官网 ATS 聚合尚未接入。未在微信开发者工具或真机验收，未上传小程序、提交、推送或部署。

## 2026-10-28 AI 岗位结果与证据匹配（本地完成并释放）

- 范围：`miniprogram/skills/job-search-skill/{apis,components,utils,SKILL.md,mcp.json}`、`miniprogram/pages/jobs/jobs.{js,wxml}`、`miniprogram/utils/job-match-evidence.js`、`miniprogram/package-user/pages/job-detail/job-detail.{js,wxml,wxss}`、`tests/jobSearchSkill.test.js` 与本节；文件占用已释放，保留各文件既有未提交改动。
- 结果：AI 搜索明确显示本次检索条数和卡片展示条数，提供带关键词、国家、岗位类型和时间条件的完整岗位列表入口；区分岗位来源故障与真实空结果；按标题、地点、发布时间排序。薪资与签证仅显示来源明确提供的信息，并将 E-Verify 与签证担保分开。用户点击卡片的简历匹配入口后，使用当前账号在线简历和真实岗位描述列出匹配点、简历未体现的要求及下一步建议，每项标出岗位原文或简历证据；外部岗位不展示缺乏依据的数值匹配分。
- 验证：Skill 专项 12/12、移动端流程 53/53、小程序静态与包体检查通过；全量 `npm run check:release` 788 项中 786 通过、0 失败、2 项既有 Windows 跳过。未做微信开发者工具或真机验收，未上传小程序、提交、推送或部署。

## 2026-10-28 JSearch v5 接口适配（本地完成并释放）

- 范围：仅 `routes/jobs.js`、`services/jobSourceGateway.js`、`tests/helpers/jobSourcesProbe.cjs`、`tests/jobSourcesIntegration.test.js`、`tests/jobSourceGateway.test.js`、`tests/helpers/jobSnapshotProbe.cjs`、`tests/jobSnapshotPagination.test.js` 与本节；文件占用已释放，既有改动保留。
- 结果：更新后的本地 RapidAPI Key 已不再返回 403；旧 `/search` 返回 404，实测 `/search-v2` 返回 200 和岗位。后端已适配新路径与 `data.jobs`、游标分页，并延长岗位查询的合理等待时间；多页请求按页数计入每日预算。真实本地美国岗位聚合接口返回 20 条 JSearch 职位，`degraded=false`。
- 验证：职位源专项 8/8、快照专项 5/5、来源网关专项 5/5；后端全量 `npm test` 778 项中 776 通过、0 失败、2 项既有 Windows 跳过；JS 语法与定向差异格式检查通过。未提交、推送或部署；线上接口仍需发布后复验，生产环境 Key 尚未核对。

## 2026-10-28 微信 AI 岗位搜索修复（本地完成并释放）

- 范围：仅 `miniprogram/skills/job-search-skill/apis/searchJobs.js`、`miniprogram/skills/job-search-skill/mcp.json`、新增 `tests/jobSearchSkill.test.js`、`tests/all.test.js` 的测试注册行和本记录此节；占用已释放。
- 结果：未指定国家时搜索全球；明确国家保持国家限制，常见中文城市和岗位词转换为英文检索词；无可验证实时结果时说明“暂无匹配或来源不可用”而不宣称没有岗位；AI 岗位卡片优先排列标题匹配的岗位。现有本地/线上公开数据、后端岗位聚合逻辑和其他工作区改动未变。
- 验证：专项 5/5、小程序静态检查、JS 语法与定向差异格式检查通过；排序调整前后端全量 `npm test` 775 项中 773 通过、0 失败、2 项既有跳过，排序调整由新增专项覆盖。未在微信开发者工具或真机复测，未上传小程序、提交、推送或部署。
- 当时的外部阻断：本地 `.env` 中 RapidAPI 密钥直连 JSearch 返回 403 `You are not subscribed to this API.`，本地无 Adzuna 凭据；线上美国聚合搜索返回 0 且来源为空。用户随后更新本地密钥，后续诊断与本地修复见上节；生产环境仍需核对密钥并发布后验收。

## 2026-10-27 官网岗位截止日期透传（本地完成并释放）

- 文件占用已释放：Codex `stage1_backend_discovery`；仅 `routes/jobs.js`、`tests/helpers/jobSourcesProbe.cjs`、`tests/jobSourcesIntegration.test.js` 与本记录此节。以上三个代码/测试文件在开始时均无未提交改动；既有私有 PDF/题库、支付及其他工作区改动保持原状。
- 范围：仅将来源明确给出的岗位截止日期透传到官网岗位列表和详情，未知保持空值；复用现有过期判断与来源元数据。不修改生产数据、数据库迁移或职位源调用策略。
- 验证：合成实时/历史岗位覆盖已知截止、未知截止、已过期岗位，Web 列表继续过滤过期项，历史详情继续标记 `dataMeta.isFallback=true`；职位源专项 5/5，后端 `npm test` 751 项中 749 通过、0 失败、2 项既有 Windows 跳过；`node --check` 和定向 `git diff --check` 通过。原始搜索/聚合接口仍按原有策略返回并标记过期记录，不将其当成“可投”列表。未运行微信真机、生产数据或部署；未提交推送。

## 2026-10-26 支付回调生产部署（完成）

- 以已核验的线上购买版本 `43a312e` 为父提交构造精确候选 `a02a82d291d21e850f45fd27604e2483e6a547c6`：仅 `routes/payment.js`、`tests/assessmentCommerce.test.js` 和仅此发布分支中的 `.github/workflows/deploy.yml` 基线保护。工作区其他未提交改动未纳入，当前工作分支未切换；临时工作流改动已从本地工作文件恢复。
- [Deploy Backend 工作流 40289255405](https://github.com/476708310zhao-svg/CareerAI-backend/actions/runs/40289255405) 成功。切流前核对原 `current` 为 2026-10-19 资料购买版本；备份 `/www/backups/zhiyincareer/jobapp-server_20261026_161032.Kmm0Zs` 创建成功。服务器精确候选 `check:release` 505/505、0 失败，Acceptance 29 通过、0 失败、1 项既有提示；严格预检、候选与正式 PM2 健康和公网 readiness 均通过。新发布目录为 `/www/wwwroot/zhiyincareer-main/releases/40289255405-a02a82d291d21e850f45fd27604e2483e6a547c6`。
- 部署后公网 `/api/health/ready` 返回 `ready=true`；资料首页三项均 900 分且 `purchaseEnabled=true`；`/api/payment/config` 显示会员销售仍关闭、provider=virtual、mock=false。未修改生产支付开关或数据库订单，未上传小程序。用户 2026-10-26 的已扣款旧订单仍需核对微信真实交易、服务端订单和回调记录后处理；不能以部署成功代替该订单权益到账。

## 2026-10-26 虚拟支付发货通知修复（本地完成）

- 用户真实 9 元订单在微信账单显示成功，但小程序仍为待确认。`routes/payment.js` 修复 XML 根节点解析，读取虚拟支付发货通知的 `GoodsInfo.ActualPrice` 与 `WeChatPayInfo.MchOrderNo`，并按请求格式返回 JSON/XML 应答。保留签名、渠道、SKU、数量、实付金额、交易号及幂等校验；没有仅凭客户端支付成功发放权益。
- 风险与验证：支付回调属于高风险链路。`tests/assessmentCommerce.test.js` 覆盖微信格式通知、错误金额、XML 应答及重复通知；支付专项 42/42、全量 `npm test` 750 项中 748 通过、0 失败、2 项既有跳过；JS 语法与 `git diff --check` 通过。未改生产库、部署后端或上传小程序。线上旧订单须另行核对微信交易记录和服务端订单后处理，本地修复不会自动补发旧通知。文件占用已释放。

## 2026-10-26 待审草稿入口可见性（已完成）

- 已在 `admin/question-assets.html` 的“2 OCR 识题”步骤和来源记录中加入草稿核对入口；进入来源专属链接时自动选中该来源最新识题任务，并补充 OCR 提示文案。没有改动来源权限、发布条件或草稿内容。
- 验证：`node --test tests/questionAssetsAdmin.test.js tests/questionParsingAdmin.test.js` 34/34 通过；两个前端脚本 `node --check` 通过；静态页面 HTTP 返回 200。已在用户原有的登录 Chrome 标签中打开来源 #1 的任务 #6，选中首道待审题并显示原页与编辑区。

## 2026-10-23 PDF 到刷题题集衔接（本地安全校验接口完成）

- 2026-10-26 OCR 识别率优化（完成并释放）：Codex；`services/questionPdfOcr.js`、`scripts/question_pdf_ocr_worker.js`、`services/questionPdfLayout.js`、`services/questionPdfParser.js`、`services/questionParseJobs.js`、`tests/questionParsing.test.js`、OCR 操作说明、本记录及隔离预览库任务。v5 按内容切换 OCR：题目页 2600 像素灰度及单块阅读，参考答案附录 2100 像素彩色及默认分段；题目页超时可在单页时限内回退。仅当前后题号相邻且字形相符时推断误读题号，显式标记并不自动填答案。真实页 45/46 的答案模式输出与旧答案 OCR 完全一致。v4 曾完整重识别 71 页，任务 #5 为 235 题、159 道自动匹配；隔离任务 #6 使用同一原件此前两次完整 OCR 的页级结果组合（1—44 页取 v4、45—71 页取 v3）验证 v5 解析策略，得到 238 道待审题、186 道自动匹配答案、16 道多选、3 道推断题号，全部 `UNVERIFIED`。旧 v3 为 231/163/0；未覆盖旧任务。备份 `preview-before-ocr-v4-20261026.db` 和 `preview-before-ocr-v5-20261026.db` 均 integrity=ok，预览库 integrity=ok；专项 27/27，全量 `npm test` 747 项中 745 通过、0 失败、2 项既有 Windows 跳过；JS 语法、`git diff --check`、后台 4401 及 readiness HTTP 200。预览服务 PID 60180、Worker PID 66036；入口 `http://127.0.0.1:4401/admin/question-parsing.html?job=6`。题库问题 0、题集 0；不触及主库、生产环境或发布。

- 2026-10-23 OCR 答案自动核对（完成并释放）：Codex；`services/questionPdfParser.js`、`services/questionParseJobs.js`、`admin/js/question-parsing.js`、`tests/questionParsing.test.js`、OCR 操作说明、本记录及隔离预览库任务。修复答案附录在同页中途切换章节时的误归属，并避免把解析正文中的 `B4、B5` 当作新答案；逐题比较“【答案】”与“故本题选 X”的结论。v3 只把唯一、题号/章节匹配、选项/题型相容且无解析矛盾的 OCR 答案自动勾选，继续标为 `UNVERIFIED`；冲突、缺项、截断仍不勾选。备份 `preview-before-answer-autocheck-v3-20261023.db` integrity=ok；隔离任务 #4 复用已完成的 71 页 OCR 检查点，状态 `WAIT_REVIEW`，231 草稿中 163 道自动勾选、68 道留待重点检查；102 道的解析结论与答案一致、3 道有矛盾。旧任务 #1/#2 保留，用户另建的 v2 任务 #3 因 OCR 中途暂停保持 `WAIT_OCR`、未覆盖。专项 23/23；全量 `npm test` 743 项中 741 通过、0 失败、2 项既有 Windows 跳过；语法、`git diff --check`、隔离库 integrity=ok，后台 4401/识题脚本 HTTP 200。4401 与 Worker 已按 v3 重启，PID 47432/20052。题库问题 0、题集 0；未开启公开题集、未写生产库、未提交/部署。入口：`http://127.0.0.1:4401/admin/question-parsing.html?job=4`。

- 2026-10-23 内部 OCR 识题结果（完成并释放）：Codex；只操作隔离预览库，未写主运行库或生产库。用户确认内部机器处理与 2026-10-23—2030-10-23 期限；以“用户声明”标记的来源权利记录 #2 仅批准 `machineProcessing`，其他用途均 false，原含展示用途的 #1 仍为 pending。原件 71 页 `valid/clean`；旧解析任务 #1 误把答案附录当题，保留 453 条 v1 草稿并标为 `NEEDS_MANUAL/SUPERSEDED_BY_OCR_V2`。v2 对同源同 SHA 的 71 页 OCR 检查点复用后，任务 #2 为 `WAIT_REVIEW`，生成 231 条内部待审草稿，193 条带答案候选、38 条无答案候选、4 条 OCR 超长候选显式截断；全部 `answer_status=UNVERIFIED`，未创建题库修订或开放题集。修复 parser 的附录识别、主章节继承与截断标记，解析版本升为 `hybrid-pdf-ocr-v2`；专项 39/39、全量 `npm test` 740 项中 738 通过、0 失败、2 项既有 Windows 跳过；隔离库 integrity=ok，`git diff --check` 和 JS 语法检查通过。后台 4401 已用同一隔离库重启（PID 53476），OCR Worker v2 PID 30172；识题页和脚本 HTTP 200，匿名报告接口 401。备份 `preview-before-internal-ocr-20261023.db` 与 `preview-before-ocr-v2-20261023.db` 均 integrity=ok。原件 `publish_status=blocked`、`display_right=0`，公开题集 0；未提交、部署生产或上传小程序。入口：`http://127.0.0.1:4401/admin/question-parsing.html?job=2`。

- 2026-10-23 本地内部 OCR 过程记录（已释放）：Codex 曾占用本记录、`services/questionPdfParser.js`、`services/questionParseJobs.js`、`admin/js/question-parsing.js`、`tests/questionParsing.test.js`、本地 OCR 操作说明及隔离预览库 `preview-from-local.db` 的来源 #1 权利声明与解析任务；不改主运行库/生产库。Human 在会话中确认取得内部使用授权、允许 OCR，并确认后台填写的 2026-10-23 至 2030-10-23 期限；本轮仅在本地用明确标为“用户声明”的机器处理权记录创建非商业 OCR 待审任务，原有含展示权的待审声明保持原状，不启用公开题集。隔离库备份 `preview-before-internal-ocr-20261023.db` integrity=ok；机器处理声明 #2 已审批，其他权益均 false。初次 OCR 71 页保留检查点后解析出 453 条，进一步发现答案解析附录被误当题目。现修正附录识别、分节匹配及超长 OCR 候选的显式截断，并升级解析器版本；只在隔离预览库建立新任务、复用同源同校验值的 71 页私有 OCR 检查点，旧任务保留供审计。风险与验证：绝不能把截断文本或 OCR 候选答案标为已核对，不写公开发布状态；服务层原有审核约束及审计保留，专项与全量测试后再供人工校对。

- 2026-10-23 PDF 工作入口与练习报告（完成并释放）：Codex；`admin/js/common.js`、`admin/question-assets.html`、`admin/js/question-assets.js`、`services/questionPractice.js`、`routes/question-practice.js`、`miniprogram/utils/api-question-bank.js`、`miniprogram/package-content/pages/practice-session/*`、对应专项测试及本记录。拥有 PDF 导入权限的管理员侧栏只显示“PDF 制作刷题题集”，原审批、OCR、题库页面仍通过当前步骤的按钮访问，单独角色保留对应入口，页面权限未扩张。小程序已答题后显示正确答案及解析；答完或结束后展示服务端统计的正确率、错题/跳过、题型分布和复习方向，账号切换时清除旧报告。报告接口只按登录用户读取，未提交答案和题目文本不出现在报告中；题集撤销后只保留个人汇总成绩。风险验证：专项 43/43；全量 `npm test` 738 项中 736 通过、0 失败、2 项既有 Windows 跳过；`check:miniprogram`、JS 语法及 `git diff --check` 通过。4401 静态后台页面/导航均 HTTP 200 并包含新标题；4401 现有 Node 进程未重启，新报告后端仍须按隔离预览配置重启后才生效。现有无授权 PDF 未 OCR 或发布；无生产部署、小程序上传或提审。

- 2026-10-23 识题校对流程简化（完成并释放）：Codex；`admin/question-parsing.html`、`admin/js/question-parsing.js`、`admin/question-bank.html`、`admin/js/question-bank.js`、对应后台 UI 专项测试、OCR 操作说明及本记录。草稿页新增“保存并看下一题”和“用已保存草稿填入题库”；题库页通过现有管理员 API 实时读取草稿及来源，预填题目和 PDF 页码，不通过 URL 传题目内容、不标为原创；题集页支持一次粘贴多个修订 ID，仍由现有服务端逐题检查审核与权利。未改数据库、后台权限接口、发布门禁或生产开关。专项 UI 29/29；全量 `npm test` 735 项中 733 通过、0 失败、2 项既有 Windows 跳过；4401 两个更新的 JS 均 HTTP 200，`git diff --check` 无差异错误（仅工作区换行提示）。预览库原 PDF 仍无处理权声明，未运行其 OCR、未发布题目；未提交或部署。

- 2026-10-23 本地单人识题确认文件归属（本轮完成并释放）：Codex；`services/questionAssetGovernance.js`、`admin/js/question-governance.js`、`.env.example`、`tests/questionAssetGovernance.test.js`、`tests/questionGovernanceAdmin.test.js`、OCR 操作说明和本记录。用户明确选择本地单人确认。来源权利审核例外只在 `NODE_ENV=development/test` 且本地私有导入与专用开关均开启、资产 `valid/clean`、声明仅含 `machineProcessing` 时允许；审计记录标 `localSingleReview=true`。未放开内容审核、展示/商业权利或生产环境。专项覆盖开关关闭、生产环境、混合权利、未扫描、开启后的机器处理授权及审计；全量 `npm test` 731 项中 729 通过、0 失败、2 项既有 Windows 跳过。4401 本地预览以显式隔离路径和本地单人确认开关重启为 PID 27504，Worker PID 56884 继续运行；三个后台页面 HTTP 200。预览库仍 0 权利声明、0 任务、0 草稿；未代用户确认这份真实 PDF 的权利，也未运行其 OCR。未写主运行/生产库，未提交或部署。

- 2026-10-23 识题流程简化文件归属（本轮完成并释放）：Codex；`admin/question-assets.html`、`admin/js/question-assets.js`、`admin/css/question-assets.css`、`admin/question-governance.html`、`admin/js/question-governance.js`、`admin/css/question-governance.css`、`admin/question-parsing.html`、`admin/js/question-parsing.js`、`admin/css/question-parsing.css`、对应专项 UI 测试、OCR 操作说明和本记录。导入来源卡片接续授权页并带来源 ID；授权页按安全/权利状态只提示当前下一步，审批通过后直达识题页；识题页自动填来源和卷名，已有阻塞任务在明确“开始识题”操作后复核重排，运行中 5 秒自动更新。高级处理范围和其他权利用途折叠显示。保留独立权利审核和人工审题门禁。专项 UI 测试 45/45，通过 HTTP 验证三个后台页面均 200 且包含步骤提示；`git diff --check` 无差异错误（仅旧工作区换行提示）。预览库仍 0 权利声明、0 解析任务、0 草稿；未识别用户真实 PDF。

- 2026-10-23 OCR 文件归属（本轮完成并释放）：Codex；`services/questionPdfLayout.js`、`services/questionPdfParser.js`、`services/questionParseJobs.js`、新增 OCR 子进程脚本/服务、`admin/js/question-parsing.js`、相关专项测试、`package.json`/锁文件、本文档及 OCR 操作说明。风险：扫描页需本地语言模型与私有原页渲染，不能把 OCR 字符串当成可信答案；保持 `machineProcessing` 来源授权、已扫描原件校验、逐页时间/内存/输出限制及页级 checkpoint。验收以合成 PDF OCR、拒绝缺模型/未授权、答案待核对、全量 `npm test` 为准；不自动公开原件或发布题集。
- OCR 本地实现：增加 `tesseract.js@7.0.0`、离线简体中文/英文模型加载、Poppler 单页渲染和受限 OCR 子进程。数字文本空页进入 OCR，结果按原页生成待审草稿；OCR 题页或答案页的答案一律 `UNVERIFIED`，保留候选证据和原页预览。OCR 解析器另用 `hybrid-pdf-ocr-v1`，旧数字解析检查点不可跨版本复用。配置/操作见 `docs/assessment-question-bank/10_SCANNED_PDF_OCR_LOCAL.md`。
- 验证：合成扫描题 PDF 实际跑通渲染、OCR、规则切题，产出 1 道待审草稿；OCR 曾把“乙”读成“G”，证明人工复核必要。专项测试 18/18；全量 `npm test` 727 项中 725 通过、0 失败、2 项既有 Windows 跳过；`git diff --check` 无差异错误（仅旧工作区换行提示）。
- 本地预览：4401 服务已以 OCR 配置重启为 PID 18228，解析队列 Worker PID 56884；后台识题页和更新后的 JS 均 HTTP 200。离线模型仅放在隔离预览目录，不在仓库。预览库目前 1 个资产、0 个来源权利声明、0 个解析任务；对用户导入的 71 页真实 PDF **尚未运行 OCR**，必须先在后台完成其机器处理来源授权。仅操作隔离预览库，未写入主运行或生产数据库。OCR 新增文件仍处于项目现有未提交工作树中，本次未提交/部署。

- 当前文件占用：Codex；私有 PDF 安全校验服务、后台 API/UI、迁移、专项测试与本记录。已有导入、来源授权、辅助识题、人工题库和刷题代码保持原权限与数据边界。
- 风险与验证：安全扫描结果必须来自可核验的扫描器，不以文件扩展名、PDF 能打开或人工点击代替；扫描器不可用时保持待扫描。PDF 结构检查在受限子进程运行，限定内存、时长和输出；处理前后核对 SHA-256。校验状态更新要记录审计，出错或感染不得把资产标为可用。隔离测试覆盖正常、异常、超时、缺扫描器、越权和多来源共享资产；后端运行 `npm test`。
- 已完成：新增迁移 0022、私有资产检查记录、ClamAV 扫描接口、逐页 PDF 结构校验子进程、管理员查询与重检接口，以及“PDF 素材导入”中的操作按钮。无扫描器时仅结构状态可变为有效，扫描保持待扫描，来源权益和发布门禁不放行。操作说明见 `docs/assessment-question-bank/09_PDF_CHECKS_LOCAL.md`。
- 2026-10-23 补充：Human 退出腾讯电脑管家后，Windows Defender 恢复启用；增加本地 Defender 自定义文件扫描适配，要求实时防护启用、病毒库不超过 7 天且命令明确报告扫描完成和无威胁。实机病毒库年龄 143 天，PowerShell 与 MpCmdRun 更新均失败，因此仍保持待扫描；没有宣称原件已扫描安全。全量 `npm test` 724 项中 722 通过、0 失败、2 项既有 Windows 跳过；`git diff --check` 通过（仅有已有换行提示）。
- 2026-10-23 预览恢复计划：Windows Defender 病毒库已由系统更新到当天版本（年龄 0 天）。已核对 4401 为 9:00 启动的旧 Node 进程，临时预览目录 `jobapp-question-preview-dd29f38eb8ac4a218d2fb5e4df1ee768` 的 `preview-from-local.db` 是 schema 0021，含 1 个隔离 PDF 资产（65,832,482 字节），原件存在于同目录私有数据区。短暂停止 4401 后先备份该隔离 DB，再只对它执行 0022 迁移，以显式 DB_PATH/DATA_DIR/UPLOAD_DIR/PORT/本地导入环境重启并验证；失败则用备份恢复预览库。主运行库和生产环境不得写入。
- 预览实际结果：已停止旧 PID 69640；备份 `preview-before-0022.db` 完成且 integrity=ok、schema=0021、资产数=1；仅将 `preview-from-local.db` 应用 0022，integrity=ok、FK=0、资产数仍为 1。4401 以显式隔离路径及关闭支付的本地配置重启为 PID 8616，后台 HTTP 200，新检查 GET 200。对唯一已导入 PDF 的第一次检查遇到 Defender 短暂不可用，仅结构检查完成；同一来源重检后 Defender 明确完成无威胁扫描，检查记录 #2 `scan=clean`、`validation=valid`、71 页、可抽取文字页数 0。资产仍 `publish=blocked` 且处理/展示权益均为 0；后续刷题题集需要来源授权、内容审核和 OCR/人工录入，不得把无文字页当成已成功识题。
- 验证：迁移、服务、路由、后台界面专项通过；全量 `npm test` 724 项中 722 通过、0 失败、2 项既有 Windows 跳过。`git diff --check` 通过（仅提示 Windows 工作区换行转换）。未在主运行数据库或生产数据库执行迁移，未开启生产私有导入。

## 2026-10-23 私有 PDF 大文件导入（本地开发）

- 文件归属（本轮完成并释放）：Codex；`services/questionAssetStore.js`、`services/questionPdfUploads.js`、`routes/admin-question-assets.js`、`db/migrations/0021_question_pdf_upload_sessions.sql`、`admin/question-assets.html`、`admin/js/question-assets.js`、对应测试及本文档。本轮不修改支付、登录和正式环境开关。
- 风险与验证：上传/鉴权/迁移属于高风险链路。分片接口沿用后台实时账号和 `questionAssets` 权限；每片最大 8 MiB、原件最大 256 MiB，私有临时目录总量 1 GiB；断点续传须检查登记文件名、大小和首尾样本指纹，服务端最终对完整 PDF 做头尾检查和 SHA-256。以隔离数据库覆盖越权、断点续传、重复/错位分片、超限、文件内容改变、失败清理和禁止公开原件；执行 `npm test`。
- 当前实现：25 MiB 内保留原 multipart 上传；25–256 MiB 使用 8 MiB 分片与数据库进度记录，中断后选择同一原件继续，成功后保存完整原件到私有隔离区。导入仍只在显式开启的本地开发环境可用，扫描和授权状态仍默认为待审，不能因此发布题目。
- 验证：隔离专项 58/58；全量 `npm test` 715 项中 713 通过、0 失败、2 项既有 Windows 跳过。全量首次遇到过期的练习授权测试日期，已将该测试夹具改为稳定的未来日期并重跑通过。隔离预览数据库已备份并应用 0021，4401 管理页面返回 200 且显示 256 MiB 上限，管理员登录接口返回 200；未迁移主运行库或生产库。

## 2026-10-28 JSearch v5 独立发布候选

- 远端维护分支将职位搜索适配 `/search-v2`、`data.jobs` 与游标分页，并按真实页数计入请求预算；同时补充 JSearch 密钥轮换工具及专项测试。
- 当时部署工作流曾固定核对 2026-10-28 的线上发布目录，供一次性密钥轮换使用。本轮线上目录已变为 2026-11-13 的发布版本，因此合并时恢复通用备份与部署工作流，避免旧目录硬编码阻断新发布。相关业务代码及测试保留。

禁止在个人机器旧副本、Junction 别名或仓库外复制目录中开发、预览、部署或提交。

## 当前批次

### 2026-10-19 小程序主入口信息层级与视觉升级（代码完成）

- 文件归属（本轮完成并释放）：Codex；本记录、`miniprogram/app.wxss`、机会/AI 求职/资源/我的主入口样式与资源、机会 WXML、`miniprogram/components/c-job-card/*` 及两份视觉/导航专项测试。首页保留前一批已完成的今日计划、每日校招和最新机会排版。本轮未碰支付、招聘接口与运行数据，也未覆盖其他工作区改动。
- 目标：沿用已确认的蓝白浅色、白色卡片和语义色，将首屏行动、公司与职位、资源用途和个人记录分层；保持原有页面跳转及数据合同。
- 已完成：岗位卡公司/职位独立两行，地点与有来源的薪资分开显示；机会页补当前展示数量；资源卡补用途/阶段说明；“我的”身份信息回到白色卡片，会员已开通态改为浅色；AI 对话的关键说明文字增大；通用旧灰底与旧按钮色统一到现有蓝白 token。数据、导航和交互处理函数保持不变。
- 验证：视觉/导航/测评相关专项 76/76；`check:release` 全量 545 项中 543 通过、0 失败、2 项既有 Windows 跳过，AI 质量 7/7、小程序静态与包体通过、数据内容 0 错误/5 既有提示；WXSS 机械检查无发现，`git diff --check` 通过。尚未取得微信开发者工具 390×844 截图或真机视觉确认；未提交、上传、提审或发布。

### 2026-10-19 测评购买后端已部署并开放资料收款（真实9元支付待Human验收）

- 执行交接：Codex assessment_checkout_production_execute 现独占本记录及 `docs/ASSESSMENT_CHECKOUT_DEPLOY_20261019.md`。root 已确认 fresh 质量、反模式及 Linux 精确门禁504/504，并明确批准标准生产部署、健康后仅开放资料收款。最终提交 `43a312edc31f56d81e90ffb88df646f3742c14cf` 对应 tree `07c5583de9f79e205af7a8d2296ad4c1cd327d32`，只含四文件。
- 已完成在线完整备份 `/www/backups/zhiyincareer/jobapp-server_20261019_162208.n996Lw`：DB SHA256 `dd3a86b5e69b7d52c299984d55b75d2d7c152fe93e764fa5faaeba8e82195fae`，目录0700、六个备份产物0600，integrity=ok/FK=0/schema15/pending0；财务六表与原基线完全一致，旧current/PID2199936、env及Nginx哈希稳定。正式新release已从规范LF归档提取，2044个blob逐字节校验通过、依赖就绪。当前正在支付关闭下运行标准 `deploy.sh`，不预填切流、收款或真实付款结果。
- 实际结果：标准 `deploy.sh` 完成，正式目录 `assessment-checkout-20261019-07c5583de9f79e205af7a8d2296ad4c1cd327d32-lf` 已切为current；标准门禁504/504、0失败/0跳过，tracked2044个文件部署后字节仍一致。关闭支付的部署后内外readiness、财务六表、旧env/Nginx哈希均核验通过后，单独备份原env并仅修改 `MEMBERSHIP_PAYMENT_ENABLED=false`、`PAYMENT_ENABLED=true`、`REAL_PAYMENT_LAUNCH_APPROVED=true`；COMMERCE审批及其他配置值不变。只重启具名jobapp-server，激活PID2238810，实际进程三flag一致，生产env0600、新SHA256 `df2e0e4e8bc7c899414f4a9b62c97bf0c76a89f9ad2c6275e16a9115b5154ba1`。
- 当前内外接口：五份active商品900分、purchaseEnabled=true，首页开启且三项；会员enabled/available/configured/mock全false、availablePlanIds=[]，未登录已购/交付/管理商品均401，内外readiness=true。已交独立production_verify只读终验；不预填其签核或真实付款结果。未创建真实订单、未向生产发合成回调、未代付款/退款，未操作小程序上传/提审/发布；下一步Human亲自支付9元后再核对订单、真实通知和领取。
- 独立生产核验最终通过：current/PID、2044文件字节、仅三flag且其他env不变、schema与财务六表原基线、五商品可买/会员关闭、私有401及内外readiness均PASS。尚无本轮实单，真实9元回调与领取待Human亲自付款；执行者已完成并释放两份记录的文件占用，不再生产写入。

- Human 明确要求“继续做后端部署和真实支付验收”；小程序上传、提审与正式发布由 Human 自行执行，本轮禁止代操作。
- 文件归属（候选准备完成并释放）：Codex assessment_checkout_release_prepare 本轮仅修改本记录与 `docs/ASSESSMENT_CHECKOUT_DEPLOY_20261019.md`，并在 `.git/` 下生成候选索引/清单/归档。候选基线 `93afc1340a301269b13b94d2ccae7e49eaa8363b`，只选 `routes/payment.js`、`tests/assessmentPaymentCapability.test.js`、`.env.example` 和购买修复说明；现有未提交小程序、职位及其他业务改动均保留，不进入后端包。
- 高风险与门禁：资料收款开启不能同时打开会员/场景包；部署前先独立复核精确 tree，并以独立 DB/数据/上传目录在 Linux 运行 Release/Acceptance，禁止候选连接生产库或真实收费接口。真实支付需要用户亲自确认付款，合成回调不算真实验收；生产配置和切流另由 root 受控执行。
- 本阶段不提交/推送、不切流、不修改生产环境或支付开关；远程暂存写入须先报送路径及方案并获 root 确认。
- root 已批准新建独立远程暂存目录及 Linux 隔离门禁。Human 随后明确“直接开放全部用户购买资料，我自己支付9元验收”；不新增测试账号白名单，仍保持会员/场景包关闭，执行切流与开关待 root 完整门禁后交执行者。本轮回滚必须先关闭全局支付再回旧代码，防止旧代码忽略会员独立开关。
- 候选 tree `07c5583de9f79e205af7a8d2296ad4c1cd327d32`；LF归档SHA256 `71e639e9cae510ff6bc9a65dcc26d219b49d12eab909ed5f021ce23e5d5d60f0`。新Linux暂存目录 `assessment-checkout-preflight-20261019-07c5583de9f79e205af7a8d2296ad4c1cd327d32-lf` 测试前后2044 Git文件字节一致，无真实.env/根运行DB；独立隔离全量504/504（0失败/0跳过），AI7/7外部0，小程序197.1KB/主包1.05MB，数据0错误/5既有提示，Acceptance29通过/0失败/1既有提示/0跳过。fresh verification 独立SSH读取完整日志、逐项SHA和隔离路径后签核。隔离内部包含合成Mock情景，不是真实收费验收。
- 默认index保持空且字节SHA256 `919128801190c789fefb0acf278b0457357b5765c24fa41d420097b95915d483`；2074项原文件保护发现本人两份记录及其他线程并发首页/视觉四文件变化，仅记录未覆盖或回滚。候选仅四文件，不包含同期UI变化。此阶段未提交/推送、切流、修改生产env、开启支付或代发布小程序；远程证据目录 `/tmp/jobapp-assessment-checkout-check.kNnbVJ`，后续执行需 root 和fresh完整门禁通过。

### 2026-10-19 测评资料购买能力独立于会员 SKU（本地实现及独立专项完成，未部署收款）

- 文件归属（完成释放）：Codex assessment_checkout_implementation；仅 `routes/payment.js`、`tests/assessmentPaymentCapability.test.js`、`.env.example`、`docs/ASSESSMENT_RESOURCE_RELEASE_20261019.md` 与本记录。保留全部现有脏改动，不修改真实环境、运行数据库、生产配置或小程序 UI，不提交、推送、部署、上传、提审或发布。
- 高风险：资料真实虚拟支付不能被未配置的会员 SKU 误判为 Mock；资料配置缺失不能静默降级，不能因此打开会员销售或绕过全局 kill switch/真实支付审批。仅拆分内部能力判断与资料 provider 选择，不改微信支付参数和验签协议。
- 验证计划：隔离临时库覆盖全部会员 SKU 为空时资料真实 900 分下单与会员失败关闭、Mock 确认拒绝真实订单且订单/账本不变、签名回调/金额/SKU/数量/幂等校验、本人交付、停售/全局关闭后的历史领取及退款撤权；相关专项和独立全量发布门禁。所有测试不调用真实收费接口。
- 已实现：拆分基础 Provider 配置和资料真实渠道选择；资料真实 Provider 就绪后不会因会员缺 SKU 改走 Mock，缺本品 SKU/通知 Token 时也不降级。全局支付开关和真实支付审批仍有效，无协议改动。
- root 后续批准追加：生产现有会员 SKU 也非空，仅解除全局门禁可能同时打开会员；新增 `MEMBERSHIP_PAYMENT_ENABLED` 独立关闭会员/场景新销售，代码默认 true 保持兼容、示例推荐 false。关闭时服务端在任何写入前拒绝，配置接口反映关闭；资料与历史已付回调/领取不受该新开关影响。只修改示例，不修改真实环境；另增全 SKU 已配但会员开关关闭的隔离回归。
- 专项验证：`node --test tests/assessmentPaymentCapability.test.js tests/assessmentCommerce.test.js tests/sprint7Commerce.test.js` 45/45通过、0失败/0跳过；能力矩阵16场景、独立真实virtual合成闭环、会员销售关闭时七种套餐拒绝且订单/账本不变、默认兼容均通过。两份 JS 语法及五文件差异格式检查通过，仅既有换行提示。独立 full `check:release` 将由 fresh verification 执行，本条不预填结果；未触碰环境配置、运行/生产数据库、真实支付或小程序发布。实现范围完成，交由 root/fresh 审查，后续仅本记录待补独立结果。
- fresh 首轮反馈与本轮修复：完整套件父进程设置的可选会员 SKU 被能力测试子进程继承，导致“无会员 SKU”断言多出 trial；仅修测试 baseline 显式清空四个可选 SKU，并在“全部 SKU 已配/默认兼容”场景显式配置，未放宽断言或改运行逻辑。复跑专项45/45通过（0失败/0跳过）；既有 dirty `screens.json` 的 `maxGlobalShift=3` 与视觉测试期望2冲突仍保留不改，完整发布门禁尚未通过，需 fresh 再验证。本条为获 root 明确授权后的 fixture 修复记录。
- 最终独立结果：质量与反模式检查通过；fresh 在父进程注入四个可选 SKU 的污染条件下复验购买专项45/45通过（0失败/0跳过，3.44秒），AI7/7/外部请求0、小程序结构与包体积、数据检查均通过（数据0错误/5既有提示）。支付运行源码与首次冻结哈希一致，真实 `.env` 与主DB哈希始终未变。首轮全量527项/523通过/2失败/2跳过的证据保留；本轮购买fixture已修复并独立复验，但未重跑全量，既有视觉配置冲突仍在，不能声明完整发布门禁通过。仅交付本地代码，未部署、开启真实收款或代发布小程序。

### 2026-10-19 首页测评资料价格右上对齐（完成）

- 文件归属（完成释放）：Codex；仅调整 `miniprogram/pages/index/index.wxml`、`index.wxss` 的测评条目布局，补充 `tests/assessmentFrontend.test.js` 局部回归及本记录。保留其他已有改动，不修改数据、支付或其他首页模块，不上传、提审或发布。
- 布局：价格与标题置于同一行右侧，不压缩价格；长标题省略，摘要仍独立显示，保留原整行点击与无障碍标签。
- 验证：测评前端专项20/20通过；小程序结构与包体积检查通过；布局/最终机械扫描无发现，指定文件差异格式检查通过。仅源码与专项验证，未执行微信真机视觉或真实E2E验收，未提交推送或发布。

### 2026-10-19 测评资料小程序本地功能准备（精确验证完成，Human 自行发布）

- 文件归属（本阶段完成释放）：Codex mini_release_scope 维护本记录、新增 `docs/ASSESSMENT_MINIPROGRAM_RELEASE_20261019.md` 及 `.git/assessment-mini-release-20261019/` 私有候选/备份辅助材料；未修改其他功能或支付门禁。Human 最新明确只上线功能，小程序上传、提审、正式发布由自己操作，因此相关代发布及提交推送计划全部取消。
- 高风险与验证：上传只能来自唯一主项目根；共享文件逐 hunk 分离，保留 AI/简历/资讯/岗位等无关脏改动。根内受控覆盖前需记录全部受影响文件原始字节及 SHA-256，以排他锁和覆盖前哈希保护阻止并发写入；测试/上传后在 finally 恢复并逐字节核验，不创建外部可运行副本。精确 tree、独立门禁和微信阶段必须如实分别记录，不把上传等同审核通过或发布。
- 本地精确候选 tree `2a5d7c6d90fd6e5f5a9d9f66f724f5f050d2098a`（基线 `93afc134`、36文件测评最小闭包）通过独立质量审查和唯一主根内 `check:release`：525项、523通过、0失败、2项既有Windows跳过，AI7/7/外部请求0，小程序媒体197.1KB、主包估算1.06MB，数据0错误/5既有提示。该结果是本地精确候选验证，不表示小程序已上传或正式发布。
- 根内临时覆盖结束后1688项原文件SHA-256全部恢复，`.git/index`、`.env`、主DB字节不变，冲突0；保留898项差异原字节私有备份。D盘官方CLI仅查询登录、关闭当前项目以避免混入、恢复后按root授权重新打开同一项目；未preview、upload、提审、发布、提交推送、改变安全设置或开启收费。

### 2026-10-19 测评后台已部署、生产迁移及 5 份真实资料草稿已导入（收款与上架保持关闭）

- 本条为当前实际结果，优先于下方同日“准备中/未上线/待验收”等历史阶段记录；旧记录保留，不代表此次后端部署尚未完成。Codex assessment_backend_release_prepare 仅占用本状态与生产发布记录做本地收尾，不暂存、提交、推送，不再操作生产代码、数据库或其他功能。
- 已分开提交并推送：纯测试稳定性修复 `2d3931831db4e2462909bb34a7ad05e6da935888`；测评后端/管理后台 `93afc1340a301269b13b94d2ccae7e49eaa8363b`，精确树 `107448fc00abc6a25983eb106d23cae86aa05d79`。当前版本为 `/www/wwwroot/zhiyincareer-main/releases/assessment-20261019-107448fc00abc6a25983eb106d23cae86aa05d79-lf`，主进程 PID2199936；2044个Git文件字节与提交一致。旧6c候选及非规范换行候选为HOLD，不可部署，未重写迁移SQL。
- 精确 Linux 候选与标准部署均通过498/498测试、0失败/0跳过；AI7/7、外部请求0；Acceptance29通过/0失败/1条既有提示。独立只读验收、质量及反模式三项审查均通过；不能沿用更早 dirty 主工作区的530项结果替代这份精确版本证据。
- 实际顺序：在线完整备份→第一维护窗口仅迁移0012–0015（约6秒）→旧版恢复健康→标准部署新后台→第二维护窗口备份并导入（约4秒）→新版恢复健康。两窗口耗时不是全程对外中断测量，未声称总停机10秒。
- 生产 schema 共15项、pending=0、integrity=ok、外键错误0。京东、美团、百度、拼多多、小米5份均为草稿、900分、领取期限null、目录待审、对应SKU正确；复用4家原公司，仅新增拼多多公司77且公开不可见；共享四段文案与用户原文一致、版本1，只初始化一次。源表40行、跳过35空资料，生产只读重规划 unchanged5。
- 公网 readiness正常；管理后台静态资源200，未登录私有/管理接口401；测评公开商品0、五份商品详情404、拼多多公司404，原公开公司76家，首页关闭。`PAYMENT_ENABLED=false`；另两项审批标志未设置、按默认false，三项收费门禁实效关闭。未上架商品、未开启首页卡片、未上传/提审小程序、未真实付款。
- 历史财务六表校验保持：19笔订单、8项会员计划及四个空账本/退款/权益/告警表不变；原76家公司行内容完全不变。不可声称全85表不变：既有未修改的启动逻辑对15353条校招记录仅将空/null的`updated_at`补为`created_at`，健康探针亦会产生性能记录。
- 生产环境SHA256 `c7042d5596df290257ff947af7bd4ceda422c218fc12e95e636b7326a825eb8a`、Nginx SHA256 `b5dbf762f721770fde5d374ae496d2a983a83c6fdf00c6a4dea3242c24b7cfdc` 前后不变。五份验证备份、私有源权限及校验详情见 `docs/ASSESSMENT_PRODUCTION_RELEASE_20261019.md`。操作方确认只明确控制`jobapp-server`及既有部署脚本生成的候选，未修改cron、未操作其他具名应用或全局停止/重启/删除；常规`pm2 save`会保存全局当时观察到的状态，不保证其他项目不变，不把同期其他PM2变化归因于本发布或擅自恢复其他进程。
- 工作区保护：提交前后2064项文件哈希核验，其他小程序/AI/资讯/职位等 dirty 改动保留，未混入后端发布。草稿导入后回滚代码必须保留公司草稿过滤；恢复写入后不得用旧DB备份覆盖运行库。本条收尾文档仅本地更新，未加入已部署不可变版本。

### 2026-10-19 测评导入新增公司草稿的公开可见性修复（代码及专项完成，待独立候选验收）

- 文件归属（本修复完成并释放）：Codex assessment_import_company_privacy；`services/companyService.js`、`routes/companies.js`、`routes/v4/jobs.js` 的公司查询一行、新增 `tests/assessmentCompanyVisibility.test.js`、导入说明与本记录。测试总入口由发布准备负责人后续登记。
- 范围：只隐藏来源严格为 `assessment-feishu-import` 且状态不是 `published` 的新公司（含草稿、归档、空状态），公共公司列表/详情及用户职位详情不能读到，管理员仍可读取和编辑；不改变既有其他来源草稿或已发布公司的行为。保存或归档该导入公司时保留来源标记，明确 `data_status=published` 才解除草稿边界。
- 风险与验证：只读查询过滤及对应保存来源保护，不改 schema、认证或支付。所有回归使用系统临时隔离库，验证匿名查询不可绕过、后台可见、旧来源不受影响、普通编辑不发布、明确发布恢复可见及已有公司不触发种子导入。本 agent 不操作 SSH、运行库、生产迁移、提交或部署。
- 已完成：可见性参数采用服务端内部第二参数，不受 `req.query` 控制；公共公司列表的行数/分页和详情都在 SQL 阶段过滤，用户职位详情也强制该边界；后台默认全量读取不改。保存/归档时保留来源，显式发布后按既有规则转管理员来源。
- 专项验证：`node --test tests/assessmentCompanyVisibility.test.js tests/assessmentImport.test.js` 21/21通过（新增7、导入14），0失败/0跳过，8.41秒；4个JS语法检查及指定文件 `git diff --check` 通过。`.env` 与主DB SHA-256仍分别为 `75C448B454013134AB3385CD3B508D07B03227B8A3F0C3CB7B315AE4CB08EBBB`、`7772A4CAE8C5D43DB399E9F5FBE2E559D37201382819F678F83EB0D6933D0376`。未运行完整门禁；发布候选需纳入本修复后再独立验证，不能沿用修复前的530项结果。

### 2026-10-19 测评后台生产发布准备（已获备份核验、迁移、部署及 5 份草稿导入授权，执行前审查中）

- 当前占用：Codex assessment_backend_release_prepare 负责本条记录、`docs/ASSESSMENT_PRODUCTION_RELEASE_20261019.md`、发布范围说明及 `tests/all.test.js` 的第五个后端测评专项注册；独立 Git index 选择后端/管理后台闭包，保留其他 dirty 改动和默认 index，不提交推送。
- 授权边界：Human 已明确允许“备份核验后，升级生产数据库、部署测评后台，并导入这 5 份资料草稿”。支付开关、商品上架、首页主推及小程序上传/提审不在本次执行范围。
- 高风险与验证：生产数据库必须先停止写入、生成一致性备份并验证完整性/外键/版本，再应用0012–0015；导入另有独立备份与事务、同源幂等门禁。先审查独立 index 的精确后端树，再对同一不可变版本进行 Linux 预发布隔离验证，才能变更生产。共享支付/账号删除/退款改动须专项验证，环境支付开关前后保持关闭。
- 本条只登记占用与已获授权；尚未因此执行生产变更。旧批次中的“未获批准”描述属于当时的历史状态，不撤销本条明确新授权。
- 预发布调整：旧精确 Linux 候选490项489通过、1失败为日期抽样既有预期9次/实际8次；root 已明确另行批准两份纯测试 fixture 稳定性修复，单独准备测试修复树 T，再以相同两 blob 纳入最终 F，计划分为测试修复、测评两提交。新增测评导入公司草稿隐私闭包三份源码及7项测试也须纳入最终 F，旧530项 dirty 主工作区门禁不能替代 F 的新 Linux 验收。本条不预填尚未执行的最终成功结果。

### 2026-10-19 飞书真实测评资料与线上道具绑定准备（开发、独立审查及隔离验收完成，未上线）

- 文件归属（本批已完成并释放）：Codex assessment_real_import 负责新增 `services/assessmentImport.js`、`scripts/import_assessment_resources.js`、0015 migration、导入专项 tests、`tests/databaseMigrations.test.js`、`tests/all.test.js` 注册、公开 SKU profile、导入说明及本记录；assessment_payment_capability 负责 `routes/payment.js`、`routes/assessment.js`、`services/assessmentCommerce.js` 和新支付能力专项；assessment_candidate_scope 只新增 `docs/ASSESSMENT_RELEASE_SCOPE_20261019.md`；assessment_import_verify 只读执行主root最终门禁和独立审查。其他已有 dirty 改动保留，未修改线上开关。
- 支付风险控制：仅注入与实际下单一致的真实支付能力谓词；环境关闭/配置不完整时购买失败关闭，公开响应无密钥，既有会员/支付协议不变。SKU已发布不替代商户/会员SKU配置及真实回调验收，也不能当作开启全局收款门禁的批准。
- 发布隔离纠正：外部scratch的开发/测试已停止，不能作为发布源或最终验收依据。最终fresh门禁与导入演练均从唯一主root执行，系统临时目录只允许承载隔离测试数据。共享文件需逐hunk提取、无关功能排除，范围以 `docs/ASSESSMENT_RELEASE_SCOPE_20261019.md` 为准。
- 来源：用户飞书40行完整快照，5家公司有网盘资料；用户确认微信对应9元道具已发布线上，尚未独立核实平台。私有原文仅系统临时文件，禁止进入Git或公开投影。
- 高风险与验证：显式目标/环境、只读 dry-run、生产额外确认、在线备份与完整性校验后事务导入；稳定 Feishu record_id 唯一绑定，不覆盖手工商品；空链接跳过，多个或非HTTPS网盘地址拒绝；统一说明仅一次配置，商品默认草稿、未知目录标记待审、无虚构领取期限，不开启首页或支付。隔离临时库覆盖幂等、恶意输入、回滚、备份门禁、会员/历史订单保持；本agent不提交、发布、迁移运行库或开启收款。
- 已完成：新增0015独立私有来源绑定、纯注入DB导入服务、强门禁CLI及公开5SKU/profile；默认只读，apply先新建仓库外备份并验证，再事务重规划导入。只初始化显式提供且未配置的统一说明；同源幂等，冲突不覆盖手工，已上架来源变更拒绝。全部新商品草稿、9元、claimDays=null、contentNeedsReview=true，无私链公开投影，不选首页。
- 隔离验证：真实飞书40行快照在系统临时主库副本完成0012–0015迁移、dry-run、备份后导入5草稿/跳过35、重跑unchanged5；4家公司复用、拼多多仅最小草稿公司，完整性ok、外键0错误，主DB前后SHA-256一致。私密副本/备份仅系统临时目录，未入Git；使用说明见 `docs/ASSESSMENT_IMPORT_20261019.md`。本批未触碰运行/生产库，未提交推送、发布或开启收款。
- 实现专项最终：`node --test tests/assessmentImport.test.js tests/databaseMigrations.test.js` 28/28通过（导入14、迁移14），12.7秒；服务/CLI `node --check`、指定差异格式检查通过。`.env` SHA256仍为 `75C448B454013134AB3385CD3B508D07B03227B8A3F0C3CB7B315AE4CB08EBBB`、主DB仍为 `7772A4CAE8C5D43DB399E9F5FBE2E559D37201382819F678F83EB0D6933D0376`，与既有基线一致。
- 并行支付专项：assessment_payment_capability 报告 capability+commerce+admin 43/43通过；公开购买能力受原有环境/配置门禁约束，未改支付开关；新增专项已注册。
- 最终fresh主root门禁：`npm run check:release` 退出0，530项/528通过/0失败/2既有Windows跳过，65.34秒；AI7/7、外部请求0，小程序媒体197.1KB/主包估算1.10MB，数据0错误/5既有提示。`npm run check:acceptance -- --no-report` 29通过/0失败/1既有job-detail提示/0跳过；导入+迁移+支付能力独立专项41/41，0失败/0跳过，9.10秒。fresh反模式审查与质量审查均无发现，JS语法与`git diff --check`通过（仅既有LF/CRLF提示）。
- 证据范围与上线边界：上述门禁对应**包含其他未提交工作的整个主root工作区**，不是独立测评提交/隔离发布候选的验证结果；不能据此发布无关dirty改动。生产迁移、真实资料导入、人工内容/版权和链接核验、上架及首页选择、全局收费开关、真机支付与小程序发布均未执行；未把用户确认道具线上发布当作明确生产目标的独立迁移/导入或全局收费审批。
- 最终保护核验：fresh验证前后`.env`及主DB哈希与上列基线完全一致；本批无运行/生产库写入、提交、推送、部署、微信上传/提审或真实付款。

### 2026-10-19 道具批量上传图片修正（完成，用户已确认录入并发布线上）

- 当前占用：Codex；会话 outputs 下批量上传工作簿、5 张新制 200×200 PNG，以及获用户明确授权的服务器独立公开图片目录与对应 Nginx 图片路径规则；不改业务源码、数据库或支付开关，不替用户提交微信道具。
- 原因：微信实际上传要求确认图片必填；上一版空图片不合规。保留 5 个道具 ID、名称及 9 元价格，只补真实图片链接。
- 风险与验证：图片限定无私密内容的五张商品封面，均小于 200KB；独立路径仅允许微信来源 CORS，不放宽 API 或全站权限。修改前备份并比对 Nginx 配置指纹，验证配置后平滑加载，失败恢复；核验 PNG 尺寸/类型/体积、HTTPS GET/HEAD/CORS、原 API 和官网健康，再回读与渲染修正版工作簿。
- 已完成：5 张 PNG 已放入 `/var/lib/jobapp-server/uploads/assessment-products/20261019-094a/`；仅对应公开路径设置 `Access-Control-Allow-Origin: https://mp.weixin.qq.com`，允许 GET/HEAD/OPTIONS，无凭据跨域。图片均 200×200、9540–10280 字节，HTTPS GET/HEAD=200、OPTIONS=204、PNG 内容与本地哈希一致。原 API readiness=true、官网响应200、支付 enabled/available=false 未改变。
- 配置备份：`/www/server/panel/vhost/nginx/jobapp.conf.before-assessment-images-20261019-094a`，原 SHA256 `6e86d6cc45540791446235e98c5b71facb9db619a08f3f7782060946cbad5a58`；新配置 `b5dbf762f721770fde5d374ae496d2a983a83c6fdf00c6a4dea3242c24b7cfdc`。`nginx -t` 修改前后通过，平滑 reload 成功；未改业务代码、环境配置、运行数据库或支付门禁。
- 文件：会话 `outputs/assessment-batch-20261019-094a/` 已生成含真实图片链接的修正版 XLSX，保留原五列、5 个 ID 与每项数字价格9元；回读和渲染核查通过。未代用户上传、创建或发布微信道具；用户随后确认录入成功并已发布线上，本批未独立读取微信平台道具列表核验。图片托管或道具发布完成都不代表小程序商品已上架、收款已开启或真机支付已验收。

### 2026-10-19 测评资料统一说明（代码完成，未上线）

- 当前占用：Codex assessment_shared_instructions；`services/assessmentCommerce.js`、`routes/admin-assessment.js`、`utils/adminPermissions.js`（仅新接口映射）、0014 migration、后台测评商品HTML/JS/CSS、小程序测评详情JS、对应tests及共享说明文档。
- 范围：使用/领取/更新/售后四段说明全商品共享一次配置；真实文案待用户提供，初始留空；单品来源及领取天数保持原规则，统一9元与真实支付门禁不变。
- 风险与验证：迁移只创建空单例，未配置禁止新上架/新订单，未迁移结构化降级；共享版本校验与取消待付防止旧条款付款；已付快照/旧单领取不变。测试仅临时隔离数据库；本agent不执行运行/生产库迁移、部署、上传或提交推送。
- 已完成：后台新增一次配置四段文案的“统一说明”页签，单品表单不再重复填写；公开详情继承共享版本，新订单校验用户确认时的版本并存快照，设置变更关闭资料待付；已付快照与领取不变。0014 初始空，不自动播种业务承诺；用户确认文案（含温馨提示）另存 `docs/assessment-shared-instructions-20261019.json` 供显式运营配置，设计说明见 `docs/ASSESSMENT_SHARED_INSTRUCTIONS_20261019.md`。
- 验证：专项最终 59/59（资料服务21、后台6、前端19、迁移13），覆盖共享权限、无配置/未迁移、版本冲突、旧快照、迟到款及确认弹窗刷新竞争。`npm test` 497 项/495通过/0失败/2既有Windows跳过，耗时64.5秒；该全量在新增最后两项前端竞争测试前启动，最终前端19/19另行通过。4个JS语法检查及 `git diff --check` 通过。未发布、未启用支付、未操作运行数据库。
- 独立审查收尾：统一说明GET增加请求世代、切页失效和编辑版本保护，PUT保存期间锁定切页/重新加载，防止迟到GET覆盖新编辑或新保存；新增2项并发回归。服务端补精确私有网盘地址及去`pwd`后的分享地址在公开文案/封面/示例图的误放检查，新增1项回归；后台8/8、服务22/22通过。PRD更新V1.3，发布字段映射改为共享四说明一次配置；飞书40行/5家资料链接已读取但尚未导入/发布。
- 最终独立门禁：fresh `check:release` 退出0，502项/500通过/0失败/2既有Windows跳过，48.65秒；AI7/7、外部请求0，小程序媒体197.1KB/主包估算1.10MB，数据0错误/5既有提示，迁移13/13；Acceptance29通过/0失败/1既有job-detail提示；4个JS语法及`git diff --check`通过。质量复核2项竞态2/2解决，私链误放已有回归；`.env`及主数据库前后SHA-256与基线不变。用户四段正式文案已提供并存JSON，无需再索取；5家真实源已读未导入，当前提供支付ID配置指引并等待真实SKU，不发布、不改支付门禁。

### 2026-10-19 测评资料正式版与统一 9 元（代码完成，未上线）

- 当前占用：Codex assessment_nine_yuan_release；assessment 商品/订单服务、0013 迁移、后台商品定价、小程序正式接口/预览开关、相关测试与发布文档。
- 范围：测评资料单价统一 900 分，保留历史支付快照与账本；开发工具默认关闭示例，真实商品由后续飞书多维表格内容通过后台录入。
- 生效顺序：本条正式版默认关闭自动示例的规则覆盖下方较早的“开发工具只读预览”历史记录；只有模拟器显式设置 `assessmentPreviewMode=readonly-examples` 才启用只读样例，体验版/正式版/真机不启用。
- 风险与验证：价格迁移关闭旧金额待付订单，迟到款进入人工核对而非交付；隔离数据库覆盖迁移重复执行、历史保留、9 元下单、金额篡改、支付回调和退款。正式版与真实接口联调，不造公司或网盘，不执行生产迁移/发布/收款开通。
- 已完成：商品服务强制 900 分，后台只读 9 元；0013 将商品统一改价并仅关闭旧金额资料待付，历史已付/退款、快照、账本与会员价格不改；旧商品未迁移也无法新下单。默认关闭开发工具自动示例，真实商品为空时资源入口可进入准备中列表；首页待真实配置后展示主推三家。
- 验证：资料服务 18/18、前端 17/17、后台 5/5、预览隔离 8/8、迁移 12/12、会员商业 4/4，共 64/64 专项通过。只运行隔离测试，不触碰主库；真实支付、微信编译/真机、生产部署均未执行。发布准备与后续飞书字段见 `docs/ASSESSMENT_RESOURCE_RELEASE_20261019.md`。
- 最终独立门禁：`check:release` 退出码 0（63.1 秒），492 项/490 通过/0 失败/2 项 Windows 跳过；跳过项依赖 Linux shell，分别为生产备份缺库退出和切流健康/启动/TERM 回滚。AI 7/7、外部请求 0；小程序媒体 197.1 KB、主包估算 1.10 MB；数据 0 错误/5 既有提示；迁移 12/12；Acceptance `--no-report` 29 通过/0 失败/1 既有 job-detail 提示/0 跳过；差异格式检查退出码 0。质量及源码反模式审查无阻断。
- 测试稳定性修复：固定岗位源测试的日期采样，并覆盖 JP 请求重叠缓存场景；只修改测试 fixture，不改生产岗位源逻辑。
- 运行环境保护：`.env` SHA-256 `75C448B454013134AB3385CD3B508D07B03227B8A3F0C3CB7B315AE4CB08EBBB`、主数据库 SHA-256 `7772A4CAE8C5D43DB399E9F5FBE2E559D37201382819F678F83EB0D6933D0376` 前后不变。真实物料待用户提供；本轮未提交推送、发布、上传、生产迁移、微信开发者工具编译/真机或真实付款。

### 2026-10-19 测评资料开发工具只读预览（代码完成，待界面重新编译）

- 当前占用：Codex assessment_devtools_visibility；`miniprogram/utils/assessment-preview.js`、`app-config.js`、`api-assessment-resources.js`，首页及测评列表/详情的 JS/WXML，`tests/assessmentPreview.test.js`、`tests/all.test.js` 与本记录。
- 原因：小程序默认访问生产 API，测评资料公开首页和列表接口目前返回 404；首页空列表会隐藏模块。
- 范围：仅 develop + devtools 可使用有明确标记的本地示例资料，真实非空商品优先；示例禁止鉴权查询、下单和支付，不写数据库、不部署。
- 风险与验证：仅在支付入口增加示例拒绝保护，不改真实支付协议；专项验证环境隔离、真实数据优先、无订单/支付/埋点副作用以及既有前端和登录门禁回归。
- 已完成：开发工具空配置/接口缺失时展示示例公司 A/B/C 的 3 份资料；首页、列表、详情标记“开发预览·示例资料，暂不可购买”，价格标为示例价。真实非空数据优先，真机/体验版/正式版不启用示例；真实公司筛选不混入示例公司；私有订单/领取接口不降级。示例详情跳过购买查询，拒绝登录、下单及支付操作。
- 验证：测评前端 17/17 与新增预览 8/8 通过；首页视觉/校招/导航/登录专项共 61/61 通过；`check:miniprogram` 通过（媒体 197.1 KB，主包估算 1.10 MB）；`git diff --check` 通过。测试运行数据库仅在隔离临时目录。
- 联调事实：生产 `/api/v4/assessment-products/home` 与 `/api/v4/assessment-products` 当前仍返回 404，本轮未发布后端、未迁移生产数据库、未配置真实商品或真实收款；界面需在唯一 `miniprogram/` 项目重新编译确认。

### 2026-10-14 上线 P0/P1 修复与待验收项

- [x] 修复生产 HTTPS Nginx 的 `/api/` 路由，保留官网转发；公开 `/api/health/ready`、`/api/features`、`/api/campus` 返回 JSON 200，空参数登录请求返回预期 JSON 400。原配置已在服务器同目录备份，`nginx -t` 及 reload 成功。
- [x] 生产 `.env` 使用现有服务端校验器只读验证通过（未读取或展示密钥值）；AI 可用，ASR、短信和微信订阅模板仍未配置，应保持相关能力降级。
- [x] 发布脚本改为隔离快照预检、只读生产迁移状态门禁、候选/正式 PM2 进程身份验证与失败回滚；备份必须验证 SQLite、运行环境及 Nginx 配置，失败不生成成功标记；CI 执行发布门禁及 Acceptance。
- [x] 当前小程序首页/AI/导航的 P1 文案、触控目标、可访问语义、辅助文字对比度、缓存时效及会员失败关闭已修复；业务路由保持不变。
- [x] 本地最终 `check:release`：360 通过、1 个仅限 Linux 的测试跳过；Acceptance 30/30；差异无空白错误。
- [ ] 微信开发者工具自动化已确认 390×844 视口并导航到资源页，但截图调用在 30 秒及 60 秒两次超时，未取得可比对新图；真机登录验收也仍待完成。扩充后的首页内容与旧基准图冲突，不能将旧图的差异报告当作新方案通过。
- [x] 生产数据库已独立备份并完成 `0001–0011` 正式迁移；合并招聘版的后端提交 `e8194d7` 于 2026-10-14 通过 [Deploy Backend 工作流 38518198158](https://github.com/476708310zhao-svg/CareerAI-backend/actions/runs/38518198158) 上线。线上数据库完整性、招聘开关、岗位列表/地图/详情及公网 readiness 已验收；微信小程序体验版/提审不在本次发布范围。

### 2026-10-14 第三方职位源限流与全球国家选择（代码完成，未上线）

- 当前占用：Codex 在隔离工作树 `jobapp-server-merged-release-20261014` 的 `codex/job-sources-global-coverage-20261014` 分支修改 `routes/jobs.js`、`services/jobSourceGateway.js`、`utils/jobGeography.js`、职位专项测试、`.env.example`、`README.md`、`docs/JOB_CAMPUS_DATA_PROVENANCE_CONTRACT.md` 与本记录；主工作区原有招聘改动保持不动。
- 目标：为 JSearch、Adzuna、The Muse、RemoteOK 加入同键缓存/并发合并、上游 429/403 冷却和有界地图请求；明确国家搜索不再暗中回到美国。全球列表保留真实跨地区远程职位，地图按国家抽样并透明披露覆盖范围。
- [x] JSearch、Adzuna、The Muse、RemoteOK 及可选来源的进程内缓存、同键合并、请求间隔与 429/403 冷却；JSearch 默认每日 6 次上游调用的进程内保护。全球 Web 列表/地图/小程序聚合列表每日抽样两个国家并返回覆盖元数据；明确国家不混入其他市场岗位。小程序筛选增加更多常用国家及两位代码输入。
- [x] mock 验证上游限流、超时和跨国隔离；`check:release` 380 通过、2 项 Windows 环境性跳过，AI 质量检查通过，小程序静态检查通过，数据检查 0 错误/5 项既有提示；`check:acceptance -- --no-report` 29 通过、1 项既有职位详情提示、0 失败。
- [ ] 仍需真实供应商配额/密钥验收；线上后端未切流，微信小程序体验版/提审未执行。进程内预算重启会重置，若未来改为多实例需升级成共享配额存储。抽样不是全球完整职位库。

### 2026-10-10 已确认浅色原型正式落地（已完成）

- Codex 当前占用：`design-system/zhiyin-career/MASTER.md`、`miniprogram/app.wxss`、`miniprogram/custom-tab-bar/*`、五个一级页面、`miniprogram/components/c-job-card/*`、`miniprogram/package-ai/pages/ai-assistant/*`、`miniprogram/pages/profile/profile.js`、`miniprogram/pages/jobs/jobs.js` 与相关视觉/导航测试。
- 目标：严格按照 Human 已确认的六张蓝白浅色原型落地，移除大面积深色色块、英文装饰标题和遮挡 Tab 的 AI 入口；不改接口、登录、状态机或数据库。
- 状态：五个一级页面、悬浮 TabBar 与上下文 AI 已按确认原型完成正式代码落地；340/340 全量测试、30/30 Acceptance、AI 质量、数据内容、小程序静态与包体检查通过，主数据库 SHA-256 保持 `B221AD658D1B24AECAB2F8C1E43F2749C44F979EF703DE35D92283A491C69D4B`。微信开发者工具内视觉编译仍待 Human 点击执行。

### 2026-10-10 五 Tab 与上下文 AI 信息架构重构（已完成）

- Codex 当前占用：`miniprogram/app.wxss`、`miniprogram/custom-tab-bar/*`、`miniprogram/pages/index/*`、`pages/jobs/*`、`pages/applications/*`、`pages/resources/*`、`pages/profile/*`、`miniprogram/package-ai/pages/ai-assistant/*`、相关视觉/导航回归测试与 `design-system/zhiyin-career/`。
- 目标：保留已交付业务逻辑和数据隔离，重构为统一的高级、简洁、直接的移动端工作台。
- 状态：五个一级页面、悬浮 TabBar 与上下文 AI 已完成结构和视觉重构，提交 `0516208`；340/340 全量测试、30/30 Acceptance、AI 质量、数据内容、小程序静态与包体检查通过，主数据库指纹未变化。微信开发者工具服务端口关闭，CLI 无法代替界面执行编译，保留一次开发者工具内人工视觉验收。

### 2026-10-10 功能简化与 AI 编排 checkpoint 交付候选

- Integration 0 已建立工作区拆分、数据库保护和原子提交边界。
- Checkpoint 1–9 已形成独立提交，Checkpoint 10 开始前的已提交运行代码基线为 `2fad29d14013dc813f11f5e5738c0095091e7c15`；Checkpoint 10 文档候选的自动化门禁已通过，本记录随本次文档提交生效，提交哈希以 Git 历史为准。
- 当前小程序一级导航固定为：首页、找岗位、进度、资源中心、我的。首页聚焦单一主行动；资源中心承担内容资产，“我的”承担个人资产，不再展示旧四 Agent 选择器或旧简历主入口。
- 申请工作台、持久上下文 AI、移动申请、简历版本、申请材料和面试空间已按账号/申请隔离；AI 写入和跨对象影响保持预览、确认及幂等保护。
- 2026-10-10 11:39（Asia/Shanghai）候选 tree `abdaccf0cdecccda635440546d039e48f88916c9` 完成自动化门禁；该值是文档候选的 Git tree 证据，不是 branch commit。`npm test` 318/318、`check:acceptance` 30/30、`check:miniprogram` 通过（媒体 192.3 KB，主包 0.99 MB）；`check:e2e-3.0` 4/4 仅为 dry-run 预检。Migration `0001–0011`连续性、五 Tab、6 个 feature 默认值、Checkpoint 9 组件清理、材料工具路径与其他静态一致性检查通过；主数据库指纹未变，未执行 migration apply。
- 未完成/未授权：微信开发者工具完整主链路、真机 E2E、真实支付与测评资料商业化、生产部署、远端同步。
- 功能开关以代码和环境显式配置为准；`utils/featureFlags.js` 的所有已登记开关代码默认值均为 `false`。
- 工作区中的业务预制 diff、设计审计、截图/日志、零引用资源图、API 巡检和未完成依赖不属于已交付 checkpoint，详见 `docs/FINAL_DELIVERY_RECORD_20261010.md`。

### 2026-10-10 小程序质量与登录 404 修复

- [x] 移除职位页已经没有渲染使用的 `empty-state` 注册及四个组件文件，解决微信开发者工具“无使用或无依赖文件”告警。
- [x] 确认本地服务端挂载 `/api/users/login` 和 `/api/users/phone-login`，前端路径与代码契约一致。
- [x] 复现生产 `https://api.zhiyincareer.com/api/health` 与登录接口均被 Next.js 官网接管并返回 HTML 404，确认为线上 Nginx/API 路由冲突，不是微信 `code` 失效。
- [x] 小程序将误路由的 HTML 404 转换为“登录服务暂不可用”，不再直接展示 `HTTP 404`。
- [x] 仓库 `nginx.conf` 增加 `location ^~ /api/` 优先代理到 `127.0.0.1:4400`，避免同机官网路由抢占 API。
- [x] 专项 19/19、全量 338/338、Acceptance 30/30、AI 质量 7/7、`check:miniprogram` 与数据内容检查通过；主数据库 SHA-256 仍为 `B221AD658D1B24AECAB2F8C1E43F2749C44F979EF703DE35D92283A491C69D4B`。
- [x] 2026-10-14 已在服务器修复并重载活动 Nginx 站点配置，公开 `/api/health/ready` 恢复 JSON 200；真实微信授权登录仍需开发者工具/真机确认。
- [ ] 微信开发者工具重新扫描、登录真机验收、五个一级页面的产品结构视觉验收待 Human 执行。

事实层级固定为：已提交的运行代码/schema 与最终门禁输出是事实依据；`docs/FINAL_DELIVERY_RECORD_20261010.md` 是交付摘要；正式 PRD 表达产品意图；Integration manifest 记录 checkpoint 拆分历史。以下内容是历史快照，只用于追溯，不能覆盖上述事实依据。

2026-09-23 正式 API HTTPS 证书故障已恢复：`api.zhiyincareer.com` 的 Let's Encrypt 证书于 2026-09-20 17:23（北京时间）过期，导致微信开发者工具报 `ERR_CERT_DATE_INVALID`，请求未进入应用。已续签并由宝塔 Nginx 重新加载，新证书有效至 2026-12-22 07:56（北京时间）。生产 `/api/health`、`/api/health/ready` 均为 200，未登录访问 `/api/v4/applications/board` 返回预期 401，证明 TLS 与路由正常。服务器原来缺少 certbot timer/cron，现已安装 `/etc/cron.d/certbot-jobapp` 每日两次自动续期，`crond` active；Let's Encrypt staging 模拟续期及 Nginx reload hook 全部成功。未修改小程序代码或业务数据。

2026-09-20 Web P0：补齐 AI 会话恢复/历史/取消/切换隔离，小程序一次性电脑登录码、Web 手动新增申请、PDF 导入与在线简历版本编辑、任务新增/编辑/完成、面试日期及联系人，资源入口接真实工作区。Web 4/4（隔离 API 17/17），原工作台与 P0 Edge 浏览器验收通过；全量临时数据库发布检查 250/250、AI 7/7、小程序检查和数据检查错误 0。此前后台登录 401/429 在隔离数据中未复现。尚未真机双端验收、真实模型联调或生产部署；移动端 AI 历史迁移仍属 P1。


2026-09-20 “我的”按用户要求去重：移除资源中心已有的简历、JD、申请材料、模拟面试、每日简报、错题本、使用指南等入口及求职资产区；会员仅保留顶部入口，收藏和消息各保留一次，我的面经保留个人发布管理。账号服务收敛为反馈、关于、设置三行，删除失去用途的资产统计与远端加载。相关测试 45/45、`check:miniprogram`、定向 `git diff --check` 通过；浏览器静态排版覆盖四种屏宽与未登录/普通/会员状态，无横向溢出，尚未微信真机验收或发布。

2026-09-20 资源中心压缩为分类切换布局：四个求职阶段与“更多工具”一次展示一组，最多 6 个双列工具卡；AI 专家和专项咨询保持顶部，内容与服务改为一行四个入口。所有原有工具及带参数路由保留，切换后返回页面保留当前分类。专项测试 45/45、`check:miniprogram` 通过；使用真实页面数据和 WXSS 的浏览器静态排版检查覆盖 320/375/390/430 宽度与全部 5 个分类，约 1～1.22 屏，无横向溢出或标题裁切。静态预览不替代微信真机验收；未部署。

2026-09-18 按用户提供的旧版截图恢复“我的”页结构：保留求职资产卡、8 个求职工具（收藏、简历、模拟面试、每日简报、材料库、错题本、笔经面经等）和 5 个其他服务入口（反馈、指南、关于、会员权益、设置）。保留当前申请管线 Tab 路由修正和资源中心 Tab，不恢复独立 AI 专家 Tab。新增旧版模块回归断言，定向测试 44/44、`check:miniprogram` 通过，未进行真机验收。

2026-09-18 资源中心视觉层级优化：四个求职阶段使用更清晰的分段导航；每个主阶段的第一项作为主操作横跨整行；增加阶段提示语和更大的可点击卡片；低频“职业决策”改为“更多工具”，避免与主流程竞争；AI 专家入口保持在顶部。定向测试 43/43、`check:miniprogram` 通过，未进行微信真机验收。

2026-09-16 资源中心恢复为第 4 个 Tab，导航顺序为：首页、找岗位、进度、资源中心、我的。资源中心按“明确方向、准备简历、匹配投递、面试准备”四个流程组织工具，顶部提供 AI 专家统一入口；校招日历、AI 网申助手、JD 匹配、简历优化、模拟面试、面试复盘等均保留直接入口。首页恢复岗位、校招、AI 面试三个 Banner 轮播，后台数量不足时自动补齐。新增资源中心路由、工具去重和注册页测试；全量 237/237、`check:miniprogram` 通过，未部署、未进行微信真机验收。

2026-09-16 小程序申请详情可靠性收尾：增加加载失败重试；刷新保留未保存跟进草稿；仅 PATCH 修改字段，避免回写旧日期/长备注；保存防重、失败保留内容、保存期间继续编辑不丢失；可清除日期；状态更新携带服务端版本，冲突刷新并保留草稿；异步请求期间账号变化清空旧数据。“更新下一步”使用卡片选择器定位。新增 5 项行为测试，全量 234/234、`check:release` 通过；申请详情和面试空间标签嵌套检查通过，未做微信真机验收。

2026-09-15 职引 5.0 P0 首页与申请详情继续收敛：首页移除会员权益横幅，运营 Banner 仅保留岗位/校招相关内容，按用户反馈撤回重复新增的“今日待办”列表，保留原有“今日求职计划”卡；申请详情将下一步行动、截止日期、面试日期和短备注压缩为“下一步跟进”轻量卡片。专项 45/45、全量 229/229、`check:release` 通过，未运行真实微信 E2E。

2026-09-15 UI/UX 第二阶段已完成：申请详情按上下文提供单一“建议下一步”主操作；AI 面试报告可将复盘加入当前申请任务，并将相册导出明确命名为“保存图片”。已补充静态回归断言，未运行真实微信 E2E，未提交或部署。

Sprint 8“提醒可靠性、跨设备一致性与收藏请求统一”已完成代码和自动化验证。提醒使用唯一投递键、租约、失败重试、有界并发和结构化耗时；Today 改为跨设备增量合并并拒绝旧状态覆盖；收藏增加幂等 outbox、删除 tombstone，并统一进入小程序请求层。竞争力陪跑已补充响应完整性校验；收藏同步已兼容 iOS 对 SQLite 空格日期格式的限制。真实双设备/微信订阅消息 staging、生产 migration 和上线仍待 Human；未运行真实 E2E、未调用真实 AI、未部署。

## 已完成

| 日期 | 事项 | 文件 | 验证 |
|---|---|---|---|
| 2026-09-14 | 第四批功能收敛：将 AI 求职规划、竞争力陪跑和每日简报明确为同一计划的生成、诊断和执行视图，增加互相带上下文的入口说明，避免用户维护多套计划 | `miniprogram/package-career/pages/career-planner/career-planner.js`、`career-planner.wxml`、`career-planner.wxss`、`miniprogram/package-career/pages/career-coach/career-coach.js`、`career-coach.wxml`、`career-coach.wxss`、`tests/navigationConfig.test.js` | 全量 207/207、`check:miniprogram`、`git diff --check` 通过 |
| 2026-09-14 | 第三批功能收敛：申请详情新增 JD 匹配入口；匹配前自动写入当前岗位快照，用户可从申请上下文重新匹配，补齐岗位、简历、匹配和材料的申请包闭环 | `miniprogram/package-user/pages/application-detail/application-detail.js`、`application-detail.wxml`、`application-detail.wxss`、`tests/navigationConfig.test.js` | 全量 206/206、`check:miniprogram`、`git diff --check` 通过 |
| 2026-09-14 | 第二批功能收敛：申请详情新增“申请包”区域，提供关联简历与申请材料的上下文入口；申请材料页支持携带 `applicationId` 打开并自动选中对应申请，避免用户重新寻找岗位和申请记录 | `miniprogram/package-user/pages/application-detail/application-detail.js`、`application-detail.wxml`、`application-detail.wxss`、`miniprogram/package-ai/pages/application-materials/application-materials.js`、`application-materials.wxml`、`application-materials.wxss`、`tests/navigationConfig.test.js` | 全量 206/206、`check:miniprogram`、`git diff --check` 通过 |
| 2026-09-14 | 第一批功能收敛：将首页、个人中心、每日任务和使用指南中的旧“投递追踪/求职进度”入口统一指向主 Tab“申请管线”；旧页面默认兼容跳回主 Tab，仅本地记录详情保留兼容参数，暂不删除业务能力 | `miniprogram/pages/index/index.js`、`miniprogram/pages/profile/profile.js`、`miniprogram/utils/daily-tasks.js`、`miniprogram/package-user/pages/usage-guide/usage-guide.js`、`miniprogram/pages/applications/applications.js`、`miniprogram/package-user/pages/job-progress/job-progress.js`、`tests/navigationConfig.test.js` | 全量 205/205、`check:miniprogram`、`git diff --check` 通过 |
| 2026-09-14 | 按用户纠正恢复资源中心原有完整展示，撤回隐藏/展开交互；本轮转为评估功能本身的重叠与必要性，未执行功能合并或删除 | `miniprogram/pages/resources/resources.js`、`resources.wxml`、`resources.wxss` | 三个资源页文件已恢复至本轮修改前版本 |
| 2026-09-14 | 继续收口首页入口：移除与资源、进度和 AI 专家 Tab 重复的“核心求职工具”区，首页聚焦今日任务、运营信息和校招更新 | `miniprogram/pages/index/index.wxml`、`index.js` | `check:miniprogram`、导航回归通过 |
| 2026-09-11 | 精简个人中心信息架构：移除与资源中心重复的我的简历、模拟面试、笔经面经和使用指南入口；收藏、投递、面试记录继续从统计卡进入，快捷区收敛为消息、每日简报、申请材料和错题本 | `miniprogram/pages/profile/profile.wxml`、`profile.wxss` | `check:miniprogram`、导航回归 14/14 通过 |
| 2026-09-10 | 修复竞争力陪跑分包页面在 `lazyCodeLoading: requiredComponents` 下偶发将 AI 说明组件解析为 `wx://not-found`；页面改为显式声明主包组件依赖，并增加配置回归断言 | `miniprogram/package-career/pages/career-coach/career-coach.json`、`tests/sprint4CareerCoach.test.js` | Sprint 4 专项 6/6、全量 204/204、`check:release` 与微信官方 CLI preview 编译通过 |
| 2026-09-10 | 修复收藏同步将 SQLite UTC 时间直接传入 `new Date()` 导致部分 iOS 无法解析的警告；改为逐字段 UTC 解析，并兼容 ISO、日期和数字时间戳 | `miniprogram/utils/date-time.js`、`miniprogram/utils/favorites.js`、`tests/sprint8Reliability.test.js` | Sprint 8 专项 7/7、全量 204/204、`check:release` 通过；未运行真实 E2E |
| 2026-09-09 | 修复竞争力陪跑在 401、超时、网络错误、HTTP 错误或残缺响应下仍进入成功视图，造成分数、七维诊断、周报和计划全部空白的问题；登录失效改为重新登录，其余异常展示可重试错误 | `career-coach.js`、`career-coach-state.js`、`tests/sprint4CareerCoach.test.js` | Sprint 4 专项 6/6、全量 203/203、`check:release` 通过；未运行真实 E2E，生产后端仍需独立发布 |
| 2026-09-09 | Sprint 8：提醒派发增加唯一投递账本、租约、失败重试、有界并发、游标续跑和耗时埋点；Today 改为跨设备增量合并与更新时间冲突控制；收藏增加 outbox、操作回执、删除 tombstone 并迁入统一 API 客户端 | `routes/notify.js`、`scripts/dispatch_reminders.js`、Today 服务/首页、收藏路由与工具、`0006_sprint8_reliability.sql`、`tests/sprint8Reliability.test.js`、Sprint 8 文档 | 专项 6/6、Smoke 72/72、全量 202/202、小程序检查与 `git diff --check` 通过；真实微信请求 0，未运行真实 E2E，生产 migration 待 Human |
| 2026-09-08 | Sprint 7：定义 Free/Pro 与 JD 简历包、7 天面试冲刺包、秋招季度包；保持历史 planId 0～3 兼容；建立订单/支付/权益/额度/退款统一账本、权益 Grant、退款审批状态机、六类告警和 0% 商业灰度审批门禁；会员页增加场景包边界、权益/订单/退款入口 | `services/v4Commerce*.js`、支付/会员/管理路由、商业化 migration、小程序会员页、`tests/sprint7Commerce.test.js`、`docs/V4_SPRINT7_COMMERCE_GOVERNANCE.md` | Sprint 7 专项 4/4、migration 5/5、Smoke 71/71、全量 195/195、`check:release` 通过；AI 故障矩阵 7/7、外部请求 0、媒体 191.2 KB、Errors 0/Warnings 4；未运行真实 E2E |
| 2026-09-08 | Sprint 6：新增 OA 计划/计时/错题/能力统计；将旧项目生成页升级为真实岗位差距驱动的证据项目、四里程碑留证、完成证据和确认式经历库写入；岗位详情增加五项证据 Job Trust Score 与本人官网核验记录 | OA/Project/Job Trust V4 数据表、服务、路由和小程序页面，`tests/sprint6Copilots.test.js`、`docs/V4_SPRINT6_OA_PROJECTS_JOB_TRUST.md` | Sprint 6 专项 7/7、migration 5/5、全量 190/190、`check:release` 通过；AI 故障矩阵 7/7、外部请求 0、媒体 191.2 KB、Errors 0/Warnings 4；未运行真实 E2E |
| 2026-09-08 | Sprint 5：新增联系人 CRM、Connect Note/Cold Message/Coffee Chat/Follow-up/Referral Request 五类可编辑草稿、用户确认外部发送、跟进 Today 提醒和 Networking 真实漏斗；Referral 成功关联岗位、正式申请、简历及版本 | `services/v4Networking.js`、Networking V4 路由、新增 Networking migration、Today/竞争力关联、小程序 Networking Copilot、`tests/sprint5Networking.test.js`、`docs/V4_SPRINT5_NETWORKING_COPILOT.md` | Sprint 5 专项 5/5、migration 5/5、全量 182/182、`check:release` 通过；AI 故障矩阵 7/7、外部请求 0、媒体 191.2 KB、Errors 0/Warnings 4；未运行真实 E2E |
| 2026-09-08 | Sprint 4：新增七维 Career Competitiveness Score、证据/差距/行动入口、真实漏斗驱动的 3/6/12 月计划与周报告；每日幂等生成 3～5 个 Today 任务，支持完成、延期、跨设备同步和站内提醒 | `services/v4CareerCoach.js`、Career/Today 路由、新增诊断与周报 migration、小程序竞争力陪跑页、`tests/sprint4CareerCoach.test.js`、`docs/V4_SPRINT4_CAREER_COACH.md` | Sprint 4 专项 5/5、migration 5/5、全量 176/176、`check:release` 通过；AI 故障矩阵 7/7、外部请求 0、媒体 191.2 KB、Errors 0/Warnings 4；未运行真实 E2E |
| 2026-09-04 | Sprint 3：完成可行动岗位梯次与投递决策、Sponsor/身份限制说明；接通岗位 JD 到真实简历版本的逐条确认和不可变新版本；新增公司×岗位×轮次 Interview Brief、弱项专项复练及 Today/申请进度回写 | Job Match、V4 简历中心、面试服务，小程序岗位详情/简历中心/面试空间，`tests/sprint3AiLoops.test.js`、`docs/V4_SPRINT3_HIGH_VALUE_AI_LOOPS.md` | Sprint 3 专项 5/5、全量 170/170、`check:release` 通过；AI 质量矩阵 7/7、外部请求 0、媒体 191.2 KB、Errors 0/Warnings 4；未运行真实 E2E |
| 2026-09-04 | Sprint 2.5：建立 `schema_migrations`、顺序 SQL migration、SHA-256 漂移检测、baseline 结构前置检查与显式目标/备份/确认保护；在隔离副本验证备份、迁移、幂等、故障事务、恢复和回滚 | `db/migrate.js`、`db/backup.js`、`db/migrations/0001_current_schema_baseline.sql`、迁移/演练脚本、专项测试、`docs/DATABASE_MIGRATION_PLAN.md` | migration 专项 5/5、全量 165/165；隔离演练 8 项检查通过，11,182,080-byte 备份恢复 SHA-256 一致，生产写入 0；未运行真实 E2E |
| 2026-09-04 | Sprint 2.4：建立 11 个合成匿名 AI 样本和超时/429/5xx/断网/非法 JSON/配置缺失/kill switch 故障矩阵；增加递归 PII 脱敏、虚构执行拦截、确认写入和额度不多扣；记录耗时、Token、降级与可选成本并汇总到运营看板 | AI runtime/Agent/简历/文案/面试路由与服务、`utils/aiSafety.js`、匿名 fixtures/门禁辅助程序、质量脚本/测试、`docs/AI_QUALITY_GATE.md` | `check:release` 160/160 通过、AI 故障矩阵 7/7、媒体 191.2 KB、Errors 0/Warnings 4；外部请求 0，未运行真实 E2E |
| 2026-09-04 | Sprint 2.3：建立岗位查看、匹配、简历确认、加入看板、确认投递、进入面试、收到 Offer 七阶段漏斗；区分官网点击与真实投递、模拟训练与真实面试；统一服务端可信事件、版本化 `refs`/缺失引用质量标记，并默认从运营看板排除 demo/test/system | `utils/funnelAnalytics.js`、Analytics/职位/申请/简历路由与服务、运营看板、小程序埋点、`.env.example`、`docs/FUNNEL_ANALYTICS_CONTRACT.md`、专项与 smoke 测试 | `check:release` 156/156 通过、媒体 191.2 KB、Errors 0/Warnings 4；专项 4/4、smoke 67/67；未运行真实 E2E，未推送、未部署 |
| 2026-09-04 | Sprint 2.2：统一职位/校招 `dataMeta` 来源与新鲜度契约，修正正式职位主源优先级、历史职位伪造时间与分页复制，补齐校招短日期解析、明确截止过期、缓存/失败降级标记和小程序紧凑展示 | `utils/dataProvenance.js`、职位/校招路由与格式化器、小程序职位/校招适配和卡片、`docs/JOB_CAMPUS_DATA_PROVENANCE_CONTRACT.md`、专项与 smoke 测试 | `check:release` 151/151 通过、Errors 0/Warnings 4；未运行真实 E2E，未推送、未部署 |
| 2026-09-03 | Sprint 2 第一批：建立核心实体 `refs` 契约，统一官方岗位 ID 优先级、数值主键输出与申请 V4 状态；接通申请、简历、材料、面试、Today 和关键埋点引用 | `utils/coreEntityRefs.js`、`utils/applicationStatus.js`、V4 相关路由/服务、`docs/CORE_ENTITY_REFERENCE_CONTRACT.md`、专项与集成测试 | 143/143 tests 通过；`git diff --check` 通过；未运行真实 E2E，未改数据库结构，未推送、未部署 |
| 2026-09-03 | Sprint 1 仓库侧收口：将校招、申请文案、管理员限流、分享封面、审核 UI、测试和部署基线拆成可审查提交；统一 Node 20、4400、版本目录/current 软链接、共享数据、备份、PM2/Nginx 与手动生产发布；移除 n8n 默认密码和日志回显 | Git 提交 `35b8956` 至 `a9b92a6`、部署/安全文档 | `check:release` 137/137、媒体 191.2 KB、Errors 0/Warnings 4；完整 smoke 65/65、Shell/JS/JSON/YAML 静态校验和密钥扫描通过；未运行真实 E2E，未推送、未部署 |
| 2026-09-03 | Sprint 0 清理：完整归档旧备份、旧统一前小程序和 Banner 优化素材；同步 11 份历史开发文档到 Obsidian；注销旧部署工作树并保留独有部署分支；旧目录送入回收站 | `archives/cleanup-20260903/`、Obsidian `历史归档/2026-06旧版/`、Git worktree 元数据 | ZIP 15.54 MB、6,628 个条目可读取；11 份文档 SHA-256 校验一致；主项目分支/HEAD 不变；`check:miniprogram` 通过，微信预览正常 |
| 2026-09-03 | Sprint 0：确认 D 盘唯一主项目及旧目录 Junction；以 `codex/v4-development` 分支、`bcd6e8430710f374cf8dfab61dd319562c0a1b73` 为 Git 基线，恢复 1,588 个受 Git 跟踪的小程序文件，并从 Codex 历史日志恢复 8 月未提交的小程序增量（登录审核交互、AI 提示条、资源中心、校招刷新与文案、分享图及缓存）；恢复并压缩品牌 Logo | `miniprogram/`、`DEVELOPMENT_STATUS.md`、`DEVELOPMENT_LOG.md` | `npm run check:release` 通过：137/137 tests；媒体总量 191.2 KB；数据检查 Errors 0、Warnings 4；`git diff --check` 通过。未推送、未部署；用户已确认微信开发者工具预览正常 |
| 2026-08-25 | 修复微信分享卡片封面空白：移除首页失效的 404 线上图片，新增 5:4 包内分享封面；全局配置、后台配置、旧图片路径和客户端缓存统一迁移到新封面，并避免接口缓存继续下发旧地址 | 小程序分享工具/首页/图片资源、`utils/shareConfig.js`、`routes/share.js`、后台分享页与专项测试 | 全量测试 136/136、分享专项 2/2、`check:miniprogram` 通过；媒体总量 179.8 KB；微信预览因开发者工具登录过期未生成二维码 |
| 2026-08-12 | 将“申请材料库”收窄为“申请文案库”：移除整份简历 JSON 生成与展示，定制简历统一引导至简历中心；生成前强制选择有效简历并支持补充 JD，隐藏模型/提示词内部信息，历史定制简历记录不再进入文案列表 | `routes/v4/materials.js`、`routes/career-assets.js`、小程序 `application-materials`、材料工具与回归测试 | 待本批验证 |
| 2026-08-12 | 修复管理后台正确密码也会频繁被误封：后台登录限额改为按真实 IP + 用户名隔离，仅累计失败请求，成功登录不占用限额；同步重置并统一正式 `admin` 账号密码 | `middleware/rateLimit.js`、`server.js`、`tests/adminLoginRateLimit.test.js`与正式 `zhiyincareer-main` 实例 | 134/134 tests 通过；公网新密码连续登录 6 次均返回 200，第 6 次未再触发原 5 次误封，账号角色为 `super_admin` |
| 2026-08-10 | 修复生产校招已同步但首页仍显示旧批次：服务端按开放日期选取最新批次并禁止中间缓存，小程序每次进入首页强制刷新且携带新鲜度参数，同时升级本地缓存版本 | `routes/campus.js`、小程序 `utils/api-campus.js`、`pages/index/index.js`、部署工作流与校招回归测试 | 公网 API 已返回 2026-08-10 最新 28 条；校招内容测试 4/4、校招接口测试 2/2、`check:miniprogram` 通过 |
| 2026-08-10 | 将“职引睿选”新校招表同步到职引官网校招日历生产板块：修正生产定时任务的 Node 版本与共享数据库路径，增加校招专属配置白名单合并工具，并完成官网实际数据库全量同步 | `scripts/sync_feishu_server.js`、`scripts/run-campus-sync.sh`、`scripts/merge-campus-env.js`、`.env.example` 与校招回归测试 | 生产原始 11,513 条、有效 11,485 条、去重写入 11,467 条、数据库总计 11,498 条；131/131 tests、公网 API 与真实官网页面均显示 8 月 10 日最新内容 |
| 2026-08-10 | 统一缩小全端 AI 生成提示条：增加组件左右安全留白，压缩卡片高度、标签、字号与间距，修复长文案贴边拥挤；将模拟面试设置、面试对话和 AI 报告三处旧提示迁移为共享组件 | 小程序 `components/c-ai-disclosure`、3 个面试页面、审核检查与页面回归测试 | 全量测试 130/130、AI 提示专项 4/4、`check:miniprogram` 通过 |
| 2026-08-10 | 将校招数据源切换为“职引睿选”飞书主体下的新多维表格与指定视图；完成全量重爬并让首页、校招列表和详情统一读取后端同步数据，同时按开始时间自动推导招聘年度 | `.env.example`、`scripts/sync_feishu_server.js`、小程序 `pages/index`、`pages/campus`、`package-content/pages/campus-detail` 与校招回归测试 | 新表原始 11,485 条、有效 11,457 条、去重写入 11,439 条；全量测试 129/129、`check:miniprogram`、数据检查（错误 0）通过 |
| 2026-08-10 | 修复微信代码质量“图片和音频资源”误判理解：按开发者工具真实算法将编译包内媒体总量从 203.1 KB 降至 191.2 KB，并将本地检查由单文件 200 KB 修正为媒体总量严格小于 200 KB | `miniprogram/images/logo_google.png`、`scripts/check-miniprogram.js` | `check:miniprogram` 通过，媒体总量 191.2 KB / < 200 KB，主包约 1.00 MB |
| 2026-08-10 | 优化小程序登录审核交互：登录弹层增加显著关闭按钮和“暂不登录，先逛逛”入口；手机号授权被拒绝后立即退出弹层并返回当前页面，避免反复施压授权 | 小程序 `components/c-login-popup`、登录回归测试与小程序审核检查 | 全量测试 128/128、登录专项 4/4、`check:miniprogram` 通过 |
| 2026-08-10 | 重构资源中心排版：四个模块移除分组副标题，主标题改为蓝/绿/紫主题色胶囊；“内容与服务”由三行紧凑列表改为三张独立服务卡，并让页面底部延续浅蓝灰背景以消除白块 | 小程序 `pages/resources/resources.js`、`resources.wxml`、`resources.wxss` 与导航回归测试 | 资源中心回归 14/14、`check:miniprogram` 通过 |
| 2026-08-10 | 修复首页与校招页仍显示 6 月 9 日旧数据：优先读取已上线的飞书 2027 届校招源，完整映射中文字段、链接和同步日期；旧后端接口保留兜底并改为按更新时间排序，飞书记录详情支持直接打开；“新开”文案统一为“更新” | `db/database.js`、`db/formatters.js`、`routes/campus.js`、`routes/admin.js`、小程序校招数据适配/首页/列表/详情与测试 | 全量测试 127/127、`check:miniprogram`、数据检查（错误 0）通过；线上飞书内容源验证 33 条，首条毕马威记录公司、岗位、链接和 2026-07-09 同步日期映射正确 |
| 2026-08-04 | 修复统一搜索页职位长期停留在加载态：正式职位 API 与飞书人工职位源改为并行竞速，优先采用最先返回的非空结果；增加实时搜索序号和 12 秒加载兜底，防止慢速旧请求覆盖新关键词或无限转圈 | 小程序 `utils/api-jobs.js`、`package-user/pages/search/search.js` 与职位搜索回归测试 | 全量测试 125/125、`check:miniprogram`、数据检查（错误 0）通过；生产同链路搜索 `data analyst` 约 2 秒返回 10 个职位；微信开发者工具生成预览二维码成功 |
| 2026-08-04 | 按产品说明重构职位列表卡片与职位详情决策链路：新增统一职位展示适配层和复用卡片，收敛薪资、地点、标签、技能、AI 匹配、截止与投递状态；详情页依次展示核心信息、公司、匹配、条件、JD、要求、时间、公司介绍、相似职位和安全区固定操作栏，并保留收藏、详情跳转、外链投递、投递看板与 AI 分析 | 小程序 `utils/job-presenter.js`、`components/c-job-card/*`、`pages/jobs/*`、`package-user/pages/search/*`、`package-user/pages/job-detail/*` 与职位展示回归测试 | 全量测试 124/124、`check:miniprogram`、数据检查（错误 0）与微信开发者工具预览编译通过；主包 791.9 KB、`package-user` 451.4 KB |
| 2026-08-04 | 修复统一搜索页在防抖实时匹配时把每个输入片段写入搜索历史的问题：实时结果保持不变，历史仅记录用户点击搜索、键盘搜索或选择完整关键词的提交动作；加载时自动去重并清理已有连续前缀碎片 | 小程序 `package-user/pages/search/search.js` 与导航回归测试 | 全量测试 120/120、`check:miniprogram` 与数据检查通过；微信开发者工具预览编译成功，主包 777.7 KB |
| 2026-08-03 | 修复“我的简历”手动编辑弹层：恢复单行输入框可点击高度、光标及输入文字/占位符显示，统一工作、教育、项目、基本信息和技能表单 UI；保存时使用完整新对象更新，确保关闭弹层后内容立即回显 | 小程序 `package-career/pages/resume/resume.js`、`resume.wxml`、`resume.wxss` 与导航回归测试 | 全量测试 119/119、`check:miniprogram` 与数据检查通过；微信开发者工具预览编译成功，主包 777.7 KB |
| 2026-08-03 | 清理职位详情、职位列表、个人中心、公司详情等非 AI 专属页面的顶部 AI 说明；职位收藏改为静默开启截止提醒，优先使用岗位真实截止日，无截止日时默认收藏后 30 天，并提前 3 天和 1 天提醒 | 小程序普通页面 WXML、`utils/favorite-reminder.js`、`utils/favorites.js`、职位列表/详情、收藏夹与测试 | 全量测试 118/118、`check:miniprogram` 与数据检查通过；微信开发者工具预览编译成功，主包 777.7 KB |
| 2026-08-03 | 将 AI 求职规划从简短关键词清单升级为可执行方案：补充岗位结论与假设、能力差距、技能练习与证明、项目蓝图、阶段交付物与量化指标、6 个里程碑、每周执行节奏和风险预案；生成改为两部分并行 JSON 并增加完整度质量门禁 | `services/careerPlanGenerator.js`、`routes/ai.js`、小程序 `package-career/pages/career-planner/*` 与回归测试 | 全量测试 115/115、小程序检查与微信预览编译通过；真实方舟模型 43 秒生成，质量门禁 9/9；生产 readiness 与公网健康检查通过 |
| 2026-08-03 | 优化编辑资料页多选交互：已选地区、行业、岗位和技能时，将继续搜索缩短为卡片右上角“继续添加”按钮；毕业年份从固定标签改为 1970 年至未来 20 年的年份选择器 | 小程序 `package-user/pages/profile-edit/*` 与导航回归测试 | 导航回归 11/11、全量测试 111/111、`check:miniprogram` 通过；微信开发者工具预览编译成功，主包 776.6 KB |
| 2026-08-03 | 将隐藏的职业工具中心功能并入资源中心：新增 AI 求职规划、简历中心和 Offer 对比入口，复用已有薪酬查询与职业洞察入口；原职业工具中心收口为单一 AI 求职规划页 | 小程序 `pages/resources/*`、`package-career/pages/career-planner/*` 与导航回归测试 | 导航回归 10/10、全量测试 110/110、`check:miniprogram` 通过；微信开发者工具预览编译成功，主包 776.6 KB |
| 2026-08-03 | 隐藏“我的简历”页面及内部纵向滚动区域的滚动指示器，并将基本信息与个人优势合并为同一卡片 | 小程序 `package-career/pages/resume/resume.wxml`、`resume.wxss` 与导航回归测试 | 页面回归 10/10、`check:miniprogram` 通过；微信开发者工具预览编译成功，主包 776.0 KB |
| 2026-08-03 | 修复 AI 简历润色长期误走 `fallback-rules`、建议与原文相同、时间戳和个人隐私被当作优化内容的问题；完善降级标识并发布后端修复 | `services/v4AiRuntime.js`、`services/v4ResumeCenter.js`、小程序 `resume-center`、测试与 AI 运行文档 | `check:release` 通过，109/109 tests、内容错误 0；生产 readiness 全通过，DeepSeek 实测 `source=live`、无降级 |
| 2026-07-29 | 修复底部导航“进度”和“AI专家”未选中仍显示蓝色的问题，为两项补充独立灰色未选中图标，保留品牌蓝作为选中状态并增加防回归检查 | 小程序 `custom-tab-bar/index.js`、`app.json`、`images/*-muted.png` 与导航测试 | 导航测试 9/9、`check:miniprogram` 通过；微信开发者工具预览成功，主包 776.0 KB |
| 2026-07-29 | 修复上线审核阻断风险：面经、评论、回复和机构评价实行发布前人工审核，公开接口仅展示已通过内容；后台支持通过/驳回并保留审核日志，评论数与机构评分按审核状态联动；隐私政策同步虚拟支付、运营主体和社区审核规则 | `db/database.js`、UGC/API 路由、后台审核页、小程序提交反馈、隐私政策、测试与 `docs/UGC_MODERATION_RELEASE.md` | `check:release` 通过，105/105 tests、内容错误 0；微信开发者工具预览编译通过，主包 771.6 KB |
| 2026-07-29 | 将全端登录受限入口统一为当前页登录弹层，登录成功后自动继续原操作；登录弹层替换为压缩后的职引品牌 Logo | 小程序 `components/c-login-popup`、`behaviors/login-gate.js`、进度/AI 专家/岗位/简历/面经/机构/薪资/会员/设置/面试页面及回归测试 | `check:release` 通过，101/101 tests、内容错误 0；微信开发者工具预览编译通过，主包约 770.6 KB |
| 2026-07-20 | 按产品参考图重新制作资源中心：自定义导航、大标题、校招日历主视觉、横向双列工具卡和内容服务列表 | 小程序 `pages/resources`、回归测试与 V4 文档 | `check:release` 通过，91/91 tests、内容错误 0，主包约 0.96 MB |
| 2026-07-20 | 首页校招从双列瀑布流调整为单列最新信息流，每个岗位独占一行并按更新时间倒序；资源中心按求职任务重新分组并全面优化视觉层级 | 小程序 `pages/index`、`pages/resources`、`components/home-campus-updates`、测试与 V4 文档 | `check:release` 通过，91/91 tests、内容错误 0，主包约 0.96 MB |
| 2026-07-20 | 将“校招”一级 Tab 升级为资源中心，聚合题库、STAR、薪酬、公司、OA、AI 面试、技能路径、校招和资讯等入口；首页移除求职情报并改为最多 8 条校招日历双列瀑布流 | 小程序 `pages/resources`、`pages/index`、`components/home-campus-updates`、`custom-tab-bar`、导航调用、测试与 V4 文档 | `check:release` 通过，91/91 tests、内容错误 0，主包约 0.96 MB |
| 2026-07-17 | 修复线上 V4 Agent 路由未部署导致的 404：关闭未部署路由探测、切换旧 AI 通道、本机保存兼容任务、禁用兼容写操作，并接受 HTTP 201 等全部 2xx 写请求 | 小程序 `pages/ai-career`、`utils/app-config.js`、`utils/agent-compat.js`、`utils/api-client.js` 与回归测试 | `check:release` 通过，90/90 tests、内容错误 0，主包约 0.95 MB；生产 V4 后端仍需独立发布 |
| 2026-07-17 | 优化 V4 一级导航中文文案：`Today` 改为“首页”，承载校招日历的“岗位”改为“校招” | 小程序 `app.json`、`custom-tab-bar`、导航测试与 V4 文档 | `check:release` 通过，85/85 tests、内容错误 0，主包约 0.95 MB |
| 2026-07-17 | 恢复全局 AI 悬浮助手，并在首页恢复紧凑会员权益横幅；会员关闭时明确提示真实微信支付未开放 | 小程序 `custom-tab-bar`、`pages/index`、导航防回归测试与首页文档 | `check:release` 通过，85/85 tests、内容错误 0，主包约 0.95 MB |
| 2026-07-17 | 重构 AI Career 主页面 UI：紧凑顶部、2×2 Agent 网格、快捷提问、上下文编排、任务历史与结果弹层 | 小程序 `pages/ai-career`、`components/c-ai-disclosure` | `check:release` 通过，84/84 tests、内容错误 0，主包约 0.94 MB |
| 2026-07-17 | 修复求职进度线上响应异常：兼容旧响应、登录失效、本机记录回退与离线新增保存 | 小程序 `pages/applications`、`utils/application-workbench.js` | `check:release` 通过，84/84 tests、内容错误 0 |
| 2026-07-17 | 将“申请”升级为“求职进度”工作台：本周重点、申请漏斗、准备度、优先级排序、快捷入口与手动新增申请 | 小程序 `pages/applications`、`utils/application-workbench.js`、TabBar 与测试 | `check:release` 通过，82/82 tests、内容错误 0，主包约 0.92 MB |
| 2026-07-17 | 将 V4“岗位”一级 Tab 调整为直接承载校招日历，并迁移旧 `switchTab` 入口 | 小程序 `app.json`、`custom-tab-bar`、导航工具及岗位返回入口 | `check:release` 通过，79/79 tests、导航测试 3/3、内容错误 0 |
| 2026-05-09 | 提交并推送第一批安全修复记录和基础 smoke tests | `AI功能清单开发.md`、`tests/smoke.test.js` | `npm test` 通过，4/4 |
| 2026-05-09 | 新增多 AI 协作规则 | `AGENTS.md` | 文档检查 |
| 2026-05-09 | 新增开发状态跟踪 | `DEVELOPMENT_STATUS.md` | 文档检查 |
| 2026-05-09 | 补充 README 开发、测试、环境变量和协作说明 | `README.md` | 文档检查 |
| 2026-05-09 | 扩展后端 smoke tests，覆盖登录、支付 Mock、上传异常和公开列表 | `tests/smoke.test.js` | `npm test` 通过，11/11 |
| 2026-05-09 | 迁移第一批小程序直接请求到统一 API 模块 | 小程序 `messages`、`feedback`、`news` 页面与 `utils/api-*` | `rg` 无残留，`node --check` 通过 |
| 2026-05-09 | 输出简历 API 去重方案 | `docs/RESUME_API_DEDUP_PLAN.md` | 文档检查 |
| 2026-05-09 | 输出 API 响应格式规范 | `docs/API_RESPONSE_CONVENTION.md` | 文档检查 |
| 2026-05-09 | 固定 `data/jobs.json` 为唯一本地职位数据源，停止创建/导入/读取 SQLite `jobs` 双轨 | `db/database.js`、`db/seed.js`、`routes/applications.js`、`services/companyService.js`、`utils/jobData.js` | `node --check` |
| 2026-05-09 | 增加 AI 免费次数和 VIP 工作流限制 | `routes/ai.js`、`utils/aiQuota.js`、`db/database.js` | `node --check` |
| 2026-05-09 | 标记 `/api/users/resumes` deprecated，前端保持 `/api/resumes` 主入口 | `routes/users.js`、`docs/RESUME_API_DEDUP_PLAN.md` | smoke test |
| 2026-05-09 | 记录支付三阶段上线策略，当前仅 Mock 模式验证 | `docs/PAYMENT_ROLLOUT_PLAN.md` | 文档检查 |
| 2026-05-09 | 完成 AI 响应格式分批治理，补最小 JSON schema 校验和标准错误格式 | `routes/ai.js`、`tests/smoke.test.js`、`docs/API_RESPONSE_CONVENTION.md` | `npm test` 通过，15/15 |
| 2026-05-09 | 抽取上传安全工具，头像和后台 Banner 复用 MIME 与 magic bytes 校验 | `utils/uploadSecurity.js`、`routes/upload.js`、`routes/admin.js` | `npm test` 通过，16/16 |
| 2026-05-09 | 新增后端测试 CI workflow | `.github/workflows/test.yml` | workflow 检查 |
| 2026-05-09 | 补充 P2 上传测试、AI 修改记录和数据库迁移治理方案 | `tests/smoke.test.js`、`CHANGELOG_AI.md`、`docs/DATABASE_MIGRATION_PLAN.md`、`README.md` | `npm test` 通过，18/18 |
| 2026-05-11 | 抽取后台 jobs.json 存储和分页工具，降低 `routes/admin.js` 维护成本 | `utils/adminJobsStore.js`、`utils/pagination.js`、`routes/admin.js` | `npm test` 通过，19/19 |
| 2026-05-11 | 超长 WXSS 初步整理，抽取高频颜色到全局 token 并替换首批页面硬编码 | 小程序 `app.wxss`、`pages/salary/salary.wxss`、`pages/jobs/jobs.wxss`、`pages/applications/applications.wxss` | WXSS token 引用检查 |
| 2026-05-11 | `salary.wxss` 精简第一轮，合并并删除尾部 readability 重复覆盖块 | 小程序 `pages/salary/salary.wxss` | WXSS 括号平衡检查 |
| 2026-05-11 | `salary.wxss` 精简第二轮，合并主要 kingkong polish 单 selector 覆盖块并删除重复 selector | 小程序 `pages/salary/salary.wxss` | WXSS 括号平衡检查，1480 行 |
| 2026-05-11 | `applications.wxss` 精简第一轮，合并头部、搜索、筛选、列表/FAB/弹窗部分覆盖样式 | 小程序 `pages/applications/applications.wxss` | WXSS 括号平衡检查，1163 行 |
| 2026-05-11 | `applications.wxss` 精简第二轮，合并卡片、流程、备注、Offer、表单和弹窗重复覆盖块 | 小程序 `pages/applications/applications.wxss` | WXSS 括号平衡检查，954 行，重复选择器 0 |
| 2026-05-11 | `jobs.wxss` 修复未闭合 `content` 编译错误，并合并主要尾部覆盖样式 | 小程序 `pages/jobs/jobs.wxss` | WXSS 括号平衡检查，1089 行 |
| 2026-05-11 | `index.wxss` 精简第一轮，合并首页搜索、Banner、功能宫格、列表卡片和新闻卡重复覆盖块 | 小程序 `pages/index/index.wxss` | WXSS 括号平衡检查，988 行，重复选择器 2 |
| 2026-05-11 | `experiences.wxss` 精简第一轮，合并题库页头部、Tab、筛选、统计和题目卡片重复覆盖块 | 小程序 `pages/experiences/experiences.wxss` | WXSS 括号平衡检查，980 行，重复选择器 0 |
| 2026-05-11 | `resume.wxss` 精简第一轮，合并简历诊断页 Tab、进度、按钮、空状态和 NLP 面板重复覆盖块 | 小程序 `pages/resume/resume.wxss` | WXSS 括号平衡检查，863 行，重复选择器 0 |
| 2026-05-12 | `agencies.wxss` 精简第一轮，合并机构评估页筛选、搜索、工具栏、卡片和对比条重复覆盖块 | 小程序 `pages/agencies/agencies.wxss` | WXSS 括号平衡检查，504 行，重复选择器 0 |
| 2026-05-12 | `project-builder.wxss` 精简第一轮，合并项目生成器 Hero、表单、轨道卡、芯片、按钮和结果卡重复覆盖块 | 小程序 `pages/project-builder/project-builder.wxss` | WXSS 括号平衡检查，450 行，重复选择器 0 |
| 2026-05-12 | `ai-assistant.wxss` 精简第一轮，合并 AI 助手页头部、消息气泡、快捷问题、建议和输入栏重复覆盖块 | 小程序 `pages/ai-assistant/ai-assistant.wxss` | WXSS 括号平衡检查，656 行，重复选择器 0 |
| 2026-05-12 | `profile.wxss` 精简第一轮，合并个人中心头部、统计、VIP、菜单和工作区重复覆盖块 | 小程序 `pages/profile/profile.wxss` | WXSS 括号平衡检查，355 行，重复选择器 0 |
| 2026-05-12 | `career-planner.wxss` 精简第一轮，合并职业规划页 Hero、表单、输入、提示、生成和阶段 Tab 重复覆盖块 | 小程序 `pages/career-planner/career-planner.wxss` | WXSS 括号平衡检查，474 行，重复选择器 0 |

## 进行中

| 优先级 | 任务 | 负责人 | 文件范围 | 状态 |
|---|---|---|---|---|
| P1 | 简历 API 实施迁移 | AI1 Builder | `routes/users.js`、`routes/resumes.js`、小程序简历调用 | 已完成，旧接口保留 6 个月 |
| P1 | API 响应格式分批实施 | AI1 Builder | `routes/ai.js`、小程序 `utils/api-*` | 已完成首批，支付/健康/Webhook 保持例外 |
| P2 | 上传安全工具抽取 | Codex | `utils/uploadSecurity.js`、`routes/upload.js`、`routes/admin.js` | 已完成 |
| P2 | GitHub Actions 测试 | Codex | `.github/workflows/test.yml` | 已完成 |
| P2 | README/DX 补齐 | Codex | `README.md`、`CHANGELOG_AI.md` | 已完成 |
| P2 | 数据库迁移治理方案 | Codex | `docs/DATABASE_MIGRATION_PLAN.md` | 已完成 |
| P2 | 后台管理维护成本降低 | Codex | `routes/admin.js`、`utils/adminJobsStore.js`、`utils/pagination.js` | 已完成 |
| P2 | 超长 WXSS 初步整理 | Codex | 小程序 `app.wxss`、`pages/salary/salary.wxss`、`pages/jobs/jobs.wxss`、`pages/applications/applications.wxss` | 已完成 |
| P2 | 超长 WXSS 精简清理 | Codex | 小程序 `pages/salary/salary.wxss`、`pages/applications/applications.wxss`、`pages/jobs/jobs.wxss`、`pages/index/index.wxss`、`pages/experiences/experiences.wxss`、`pages/resume/resume.wxss`、`pages/agencies/agencies.wxss`、`pages/project-builder/project-builder.wxss`、`pages/ai-assistant/ai-assistant.wxss`、`pages/profile/profile.wxss`、`pages/career-planner/career-planner.wxss` | 已完成首批 |

## 2026-11-02 阶段 2 授权提醒与投递回执（本地完成并释放）

- 本地完成并释放：新增 0026 一次性模板授权台账和显式提醒渠道；微信授权按 user+exact template ID 存储，拒绝/撤销清零剩余额度，dispatch 在消费额度和实际调用发送组件前二次查授权。站内提醒默认独立运行，旧提醒不推定微信授权。申请 deadline 和申请 task due 日期由服务端按 owner 读取；更新日期时同步提醒，清空/任务完成时停用并失效 pending 投递。本人回执 API 只返回所属账号记录，申请详情包含其任务回执；官网和小程序提供授权/回执查看，小程序可主动发起授权并撤销剩余额度。
- 验证：隔离提醒专项 3/3、迁移 0026 专项 1/1；最终 `npm test` 831 项中 829 通过、0 失败、2 项既有 Windows 跳过；官网 66/66、类型检查、生产构建通过；小程序流程 65/65、`check:miniprogram`、JS 语法检查通过；OpenAPI YAML parse 与 `git diff --check` 通过。模拟 WeChat sender 证明 `in_app` 和未授权 `both` 不触发微信网关，双账号回执隔离通过。未触发真实发送、未迁移生产库、未部署或配置正式定时作业。

## 当前文件占用

- 已完成并释放：Codex，企业官网同步第二批。涉及官网适配器、同步服务、岗位路由和市场配置、小程序官网入口、相关测试和文档。

- 已完成并释放：Codex `expand-official-employers-20261118`。范围：官网同步器、岗位路由、市场来源、小程序岗位目录、专项测试、扩展记录与本文件；验证和发布边界见顶部 2026-11-18 记录。
- 已完成并释放：Codex `official_open_web_jobs`（2026-11-17）。范围：`routes/jobs.js`、`tests/helpers/officialJobSyncProbe.cjs`、`tests/officialJobSync.test.js`、`docs/OFFICIAL_JOB_SYNC_PLAN_20261117.md` 与本记录。线上网页代理只返回 13/18 条开放官网岗位：旧的发布时间新鲜度过滤误删仍可申请岗位。风险：较早发布时间的开放岗位重新出现；验证：官网表单已核对，隔离专项、完整测试及公开网页复核。

- 已完成并释放：Codex `official_public_web_list`（2026-11-17）。范围：`routes/jobs.js`、`services/officialJobSync.js`、`tests/officialJobSync.test.js`、`tests/helpers/officialJobSyncProbe.cjs`、`docs/OFFICIAL_JOB_SYNC_PLAN_20261117.md` 与本记录。目标是将已发布的官网快照接入公开网页实际使用的 `/api/jobs` 列表，保留按国家与筛选条件的现有契约，不外显岗位正文。风险：旧网页列表排序、分页和来源标记变化；验证：隔离库接口专项、`npm test`、发布检查及线上网页复核。

- 已完成并释放：Codex `official_job_sync_release_readiness`（2026-11-17）。范围：`services/cnOfficialPilot.js`、`services/officialJobSync.js`、`tests/cnOfficialPilot.test.js`、`tests/officialJobSync.test.js`、`scripts/run-official-job-sync.sh`、`public/web/app.js`、`public/web/applications.js`、`public/web/styles.css`、相关 Web 专项测试、`docs/OFFICIAL_JOB_SYNC_PLAN_20261117.md` 与本记录；根据真实企业申请页核验修正岗位类型冲突、临时网络错误重试及定时运行入口。Human 明确选择无第三方授权时只展示官网链接和必要岗位信息，因此不保存或展示完整 JD。风险：错误分类会隐藏或误展示岗位；外部请求重试会增加访问量；迁移与正式调度仍须隔离演练及生产审查。验证：专项、`npm test`、发布检查、真实只读抽样和隔离库复测，不提交申请或连接生产数据库。

- 已完成并释放：Codex `official_job_sync_mvp`（2026-11-17）。文件范围、风险和验证见本文件顶部；正式迁移、英美企业板核准与定时运行另行安排。

- 已完成并释放：Codex（2026-11-17）学生求职流程与机构服务差距规划；范围为 `docs/学生求职流程与机构服务差距规划_20261117.md` 和本记录。验证见文件顶部。

- 已完成并释放：Codex（2026-11-17）新成员交接包，范围为 `AGENTS.md`、`README.md`、`.github/pull_request_template.md`、`docs/onboarding/` 与本记录；验证见文件顶部。

- 已完成并释放：Codex `stage5_manual_recovery`，范围为当前文件顶部登记的人工服务授权工单实现；只在本地隔离库开发测试，不触发真实支付或生产数据。

- 本地完成并释放：Codex `stage4_job_quality_analytics`；修改范围仅新增 `services/v4JobQualityAnalytics.js`、`routes/v4-admin.js` 新只读聚合端点、`admin/dashboard.html` 岗位数据质量卡片、`utils/adminPermissions.js` 精确 operations 路由 dashboard 映射、新隔离专项和 `tests/all.test.js` 注册、OpenAPI 与阶段文档。只使用本机 jobs.json 与隔离 analytics 数据，不查阅/输出用户身份，不读写生产库或部署。质量/权限专项 2/2、管理核验相关专项 2/2、单独 smoke 74/74；`npm test` 整体 846 项中 841 通过、3 个既有合并运行 smoke 外部源假设失败、2 跳过（详见上方阶段4记录）；OpenAPI 46 paths、dashboard inline JS parse、定向 diff check 通过。

- 本地完成并释放：Codex `stage4_extension_ashby`；新增 Ashby adapter 和隐私最小化的本机 7 日兼容计数，样本至少 5 且失败率不少于 60% 才提示。兼容回归已由现有 CI 的 `npm run check:release` 自动执行。插件专项 4/4、授权/适配合并专项 7/7；后端全量 `npm test` 839 项，837 通过、0 失败、2 项既有跳过；相关 JS 语法、Manifest JSON、定向 diff check 通过。没有记录/上传用户、申请、URL、DOM、字段标签或值。未连接真实 ATS、未运行 Chrome 手动预览，当前提示不是运营告警。

- 当前文件占用：无。上一轮 `practice_renderer_fix_20261116` 已完成代码与专项检查，微信开发者工具复测被用户停止。`stage2_application_reminders` 已本地完成并释放；相关文档见官网 `docs/stage2-application-reminders.md`。后续正式迁移、微信真机授权及线上调度仍待环境验收。

- Codex `stage1_feedback_audit_impl`（2026-10-30，本地完成并释放）：仅修改 `routes/admin.js` 反馈管理窄范围、`admin/feedback.html`、`tests/databaseMigrations.test.js`、`tests/all.test.js`、`docs/JOB_MANUAL_VERIFICATION.md` 与本记录，新增 `db/migrations/0023_feedback_handling_audit.sql`、`tests/jobFeedbackAudit.test.js`。反馈处理改为要求版本的 SQLite 立即事务，同时追加状态/备注前后值、实时管理员和时间；旧 token/撤权拒绝，冲突 409，缺迁移 503。岗位纠错关闭/忽略须写有界说明，后台可看审计与“距提交”或可追溯结案耗时；迁移前已完成且仅补备注仍显示历史处理时间未知。保留反馈硬删除及审计级联删除并在 UI 警告，不自动修改岗位核验或 `jobs.json`。只在隔离 `DB_PATH` 验证 0023 幂等/迁移回滚、旧记录、故障 trigger 强制事件写失败时反馈三字段及事件数回滚、泛化错误响应、版本冲突、权限、说明边界与删除级联；专项 24/24，后端全量 `npm test` 808 项中 806 通过、0 失败、2 项既有 Windows 跳过。JS 语法、HTML 内联脚本解析与定向差异格式检查通过；真实 `data/jobs.json` SHA-256 仍为 `240B0921B5025078738171457A38E067CC1ABBA932F85A088BF20E4295428EB6`。现有大量无关未提交改动保留。未迁移真实/生产数据库、未部署、提交或推送；正式上线前须备份并审批迁移，既有 `deploy.sh` 待迁移门禁仍会阻断直接发布。

- Codex `stage1_feedback_triage_impl`（2026-10-29，本地完成并释放）：修改 `routes/admin.js` 反馈列表窄范围、`admin/feedback.html`、`admin/jobs.html` 深链、`utils/adminJobsStore.js` 批量只读目标查询、`tests/all.test.js`、`docs/JOB_MANUAL_VERIFICATION.md` 与本记录，新增 `utils/jobFeedbackContext.js`、`tests/jobFeedbackTriage.test.js`。后台增加“岗位信息纠错”筛选，把官网既有文本严格派生为只读用户线索；只有服务端找到本地岗位或删除墓碑且管理员令牌与实时账号都具岗位权限时显示核验/删除审计入口，外部纯数字 ID 撞号仍须核对标题、来源、公告。坏岗位 JSON 仅降级候选入口，不阻断反馈列表；用户文本转义、深链 ID 限制正整数。隔离 HTTP/渲染专项 3/3，JS 语法、定向差异格式检查通过，项目 `data/jobs.json` SHA-256 未变化。最终后端全量 798 项中 795 通过、1 项其他进行中任务的地理采样旧断言失败、2 项既有 Windows 跳过；该任务正修改 `utils/jobGeography.js`，其 day1 已变 `cn/hk`，未改的 `tests/jobGeography.test.js` 仍期望 `sg/de`，单跑稳定复现，不归本轮反馈分流所有。本轮未改 `POST /api/feedback` 契约、数据库迁移、岗位公开状态、真实岗位文件或生产数据，未部署/提交/推送；待地理任务同步测试后重跑全量门禁。

- Codex `stage1_link_schedule_impl`（2026-10-29，本地完成并释放）：修改 `utils/adminJobsStore.js`、`services/jobApplyLinkHealth.js`、`scripts/check_job_apply_links.js`、`tests/all.test.js`、`docs/JOB_MANUAL_VERIFICATION.md` 与本记录，新增 `services/jobApplyLinkSchedule.js`、`tests/jobApplyLinkSchedule.test.js`、`tests/helpers/jobLinkScheduleClaimProbe.cjs`。增加默认关闭的 cron-ready `--scheduled` 入口；只在 `JOB_LINK_CHECK_SCHEDULE_ENABLED=1` 时执行。共享 SQLite 写锁内领取和完成 5 分钟租约，同一上海时区小时最多成功一批；失败可重试、过期租约可重新领取、旧 owner 不可完成新租约。定时模式按 URL 最近检查时间冷却 24 小时，人工 `--run` 保持立即复查。隔离调度专项 6/6，合并旧链接专项 10/10；最终后端 `npm test` 795 项中 793 通过、0 失败、2 项既有 Windows 跳过。CLI 帮助、默认关闭门禁、6 个 JS 语法与定向差异格式检查通过，项目 `data/jobs.json` SHA-256 未变化。未安装定时器、未探测真实公网、未部署/提交/推送；正式环境同主机/同 `DB_PATH`、`DATA_DIR`、运营日志告警及真实来源频率仍待验收。现有大量无关未提交改动保留。

- Codex `stage1_link_probe_impl`（2026-10-28，本地完成并释放）：修改 `utils/adminJobsStore.js`、`admin/jobs.html`、`tests/all.test.js`、`docs/JOB_MANUAL_VERIFICATION.md` 与本记录，新增 `services/jobApplyLinkHealth.js`、`scripts/check_job_apply_links.js`、`tests/jobApplyLinkHealth.test.js`。手动批次只检查人工核验 `open` 且与公开 URL 一致的本地企业申请链接；逐跳验证全部 DNS 地址并固定连接 IP，禁私网/保留地址、代理和非标准端口，限制重定向、单 URL 10 秒及整批约 60 秒。结果在共享写锁内二次比对 URL 后记录，仅供后台人工复核，不自动关闭或改变公开申请状态；删除岗位清理健康结果。真实本地 HTTP server 验证固定 lookup 与代理环境边界，隔离专项 4/4；最终 `npm test` 782 项中 780 通过、0 失败、2 项既有 Windows 跳过；CLI 帮助、5 个 JS 语法与定向差异格式检查通过。项目 `data/jobs.json` SHA-256 保持 `240B0921B5025078738171457A38E067CC1ABBA932F85A088BF20E4295428EB6`。未实际探测公网、未设置定时任务、未部署/提交/推送；真实来源与运营处理验收仍待完成。

- Codex `stage1_jobs_mutex_impl`（2026-10-28，本地完成并释放）：修改 `utils/adminJobsStore.js`、`utils/jobData.js`、`routes/admin.js`、`tests/adminJobVerification.test.js`、`tests/all.test.js`，新增 `utils/jobsFile.js`、`tests/adminJobsStoreConcurrency.test.js`。四种后台岗位写入均在共享 SQLite `DB_PATH` 的 `BEGIN IMMEDIATE` 跨进程锁内读取并原子替换 JSON；读者和写者首次创建共用同目录 fsync 临时文件与 hard link 原子占位。锁忙返回 503/Retry-After，版本冲突保留 409，输入校验 400，坏 JSON 等故障泛化 500。受控双进程锁/半写入、旧版本和缺失/非法输入不写文件、四接口锁忙及坏 JSON 回归通过；专项 4/4，后端全量 `npm test` 771 项中 769 通过、0 失败、2 项既有 Windows 跳过，JS 语法和定向差异格式检查通过。项目 `data/jobs.json` SHA-256 未变化。上线前须确认所有写实例在同一主机/可靠本地文件系统、使用相同 `DB_PATH` 和 `DATA_DIR`，并全部运行本版写入工具；跨主机部署需将岗位写入迁移到共享事务数据库。未部署、提交或推送，工作区其余既有未提交改动保留。

- Codex parent `stage1_expiry_miniprogram`（2026-10-28，本地完成并释放）：仅修改 `miniprogram/package-user/pages/job-detail/job-detail.js`、`tests/mobileWorkflow.test.js`。本地岗位有效日期按上海日期、带明确时区时间戳按截止瞬间在详情页拦截旧链接；即使迟到的旧响应声称可申请也继续拦截。保留原人工核验状态，显示“截止已过”；缓存链接清除，后续进度刷新不改回“待人工复核”。小程序专项 53/53、`node scripts/check-miniprogram.js`、JS 语法和差异格式检查通过。后端全量 768 项的执行早于最后新增的小程序时间戳断言；该断言已由小程序专项覆盖。仅用隔离测试数据，不上传、发布、提交或推送；其余既有未提交改动保留。

- Codex `stage1_expiry_impl`（2026-10-28，本地完成并释放）：仅修改 `utils/jobData.js`、`routes/jobs.js`、`routes/v4/jobs.js`、`tests/adminJobVerification.test.js` 与本记录。有效 `YYYY-MM-DD` 截止日按上海日期次日零点起在读取时自动暂停；旧本地岗位带明确时区的 ISO 时间按实际时刻判断，缺失、无时区或无效日期不自动暂停。公开人工核验状态保持原值，到期单独提示；本地岗位列表、旧详情、Trust、V4/旧版申请链接及官网跳转依当前状态受限，快照续页遇过期岗位返回 410。修改截止日期后自动重新计算，不写运行或生产 `jobs.json`。专项 `adminJobVerification` 2/2、`jobSourcesIntegration` 7/7；后端全量 `npm test` 768 项中 766 通过、0 失败、2 项既有 Windows 跳过；JS 语法及定向差异格式检查通过。未部署、提交或推送；工作区其余既有未提交改动保留。

- Codex `stage1_jobverify_miniprogram_ui`（2026-10-27，本地完成并释放）：再次修改 `miniprogram/package-user/pages/job-detail/job-detail.js` 与 `tests/mobileWorkflow.test.js`，旧版详情成功响应晚于 V4 较新核验结果时直接丢弃，旧版显式可申请也不能覆盖已关闭状态。专项 50/50、小程序静态检查、JS 语法及定向差异格式检查通过；未做微信真机 E2E、上传或发布。

- Codex `stage1_manual_job_verification_impl`（2026-10-27，本地完成并释放）：修改 `routes/applications.js`、`routes/v4/applications.js`、`utils/jobData.js`、新增 `utils/applicationLinkVisibility.js`、更新 `tests/adminJobVerification.test.js`、`docs/JOB_MANUAL_VERIFICATION.md` 与本记录本条。已删除的本地岗位由 `job_deleted` 审计墓碑继续识别，历史申请保留但申请链接持续清空、V4 官网跳转返回 409；未曾是本地岗位的数字 ID 不因墓碑规则受限。旧版/V4 申请响应共用九种链接别名脱敏，包含 `job_apply_link`。专项 1/1；后端全量 `npm test` 765 项中 763 通过、0 失败、2 项既有 Windows 跳过；JS 语法与定向差异格式检查通过。仅用隔离测试数据，不动项目/生产 `data/jobs.json`，未部署、提交或推送；JSON 多实例并发写入仍需发布前核对 PM2 拓扑和互斥方案。

- Codex `stage1_manual_job_verification_impl` 首轮实现（2026-10-27）：岗位核验元数据及追加审计保存在 jobs.json 顶层，专用接口要求实时管理员岗位权限，并由服务端写核验时间、操作者。首轮专项 1/1；全量 `npm test` 759 项中 757 通过、0 失败、2 项既有 Windows 跳过。后续审查发现公开关闭态与字段边界仍需加固，见本轮“审查修复”条；首轮结果不代表最终门禁。

- Codex `stage1_country_fix`（2026-10-27，已完成并释放）：仅修改 `routes/jobs.js` 的 JSearch 国家识别与 Web 列表来源过滤、`tests/helpers/jobSourcesProbe.cjs`、`tests/jobSourcesIntegration.test.js` 及本记录此行。来源明确国家优先于请求国家；国家缺失时回退请求国家；JSearch 返回明确异国或无法识别的国家时，不计入所请求国家的官网列表、快照、地图与聚合。合成反例覆盖 `US`、`United States`、`Japan`、国家缺失及 `UK`/`United Kingdom`/`英国` 的 GB 规范化；职位源专项 7/7、快照专项 5/5，后端全量 `npm test` 758 项中 756 通过、0 失败、2 项既有 Windows 跳过；JS 语法和定向 `git diff --check` 通过。保留其他既有未提交改动；未部署、提交或接触运行/生产数据。

- 阶段 1 官网岗位样本分页验证（2026-10-27）：显式 `pagination=snapshot` 保留旧页码客户端；本次检索样本以 5 分钟游标稳定续页，来源失败固定回退，未知或过期游标 410，结果上限及截断标记见 `docs/JOB_LIST_SNAPSHOT_PAGINATION.md`。合成专项 5/5，后端全量 `npm test` 756 项中 754 通过、0 失败、2 项既有 Windows 跳过；JS 语法与定向差异格式检查通过。仓库 PM2 配置为单 fork，但线上实际实例未独立核实，未部署或启用官网新控件，未修改运行/生产数据库、环境或其它未提交工作。

- Codex `stage1_pagination_backend_design`（2026-10-27，本地完成并释放）：仅占用 `routes/jobs.js` 的 `/api/jobs` opt-in 分支、新增 `utils/jobListSnapshot.js`、新增 `tests/jobSnapshotPagination.test.js`、`tests/helpers/jobSnapshotProbe.cjs`、`docs/JOB_LIST_SNAPSHOT_PAGINATION.md`，更新 `tests/all.test.js` 的专项注册与本记录此节。保留 `routes/jobs.js` 已有岗位截止日期透传等未提交改动及其他工作区文件。风险：进程内快照需单 PM2 实例；生产实际实例尚未独立核实，不部署或开启官网翻页。验证计划：合成来源跨页、失效、筛选绑定、降级、旧接口兼容专项及后端全量测试。

- Codex 阶段 7 本地发布前验证（2026-10-22，完成并释放）：新增 `docs/assessment-question-bank/08_PHASE7_RELEASE_READINESS.md`，修复 `routes/admin-question-assets.js` 仅信 JWT 旧权限的问题，`tests/questionAssets.test.js` 新增实时撤权/停用测试并使用独立管理员 ID。公开 DTO、免费发布/实时授权、私有目录和客户端判分审计未发现其他本轮可复现的发布前代码阻断。专项 23/23；最终 `check:release` 711 项中 709 通过/0 失败/2 项既有 Windows 跳过，AI 质量、小程序检查通过，数据 0 错误/7 项既有提示；隔离 `check:acceptance -- --no-report` 29 通过/0 失败/1 项既有职位详情提示；迁移与备份恢复隔离测试通过。首轮全量曾因新增测试管理员 ID 与治理专项冲突失败，改独立 ID 后重跑通过。`git diff --check` 通过。真实授权题集、生产私有存储/扫描、预发布迁移与文件备份恢复、网页/小程序真实账号及 Android/iOS 真机仍待验收，因此未批准公开发布；未触碰生产库、真实 PDF、支付/会员开关、微信发布，未提交/推送/部署。文件占用已释放。

- Codex 阶段 6 小程序免费刷题（2026-10-21，完成并释放）：新增 `miniprogram/utils/api-question-bank.js`、`miniprogram/package-content/pages/practice-home/*`、`miniprogram/package-content/pages/practice-session/*`、`tests/questionPracticeMiniProgram.test.js`、`docs/assessment-question-bank/07_PHASE6_MINIPROGRAM.md`，并在 `miniprogram/app.json` 局部注册两页、资源中心新增独立入口、`tests/all.test.js` 接入专项。原生免费题集、服务端判分与同账号网页进度、续答、错题/收藏/历史已接通；弱网同 requestId/原答案重试、退出重进对账、快照竞态、切号/撤权/迟到响应清屏和敏感列表逐页重取均有回归。小程序专项 18/18、视觉专项 17/17；独立 `check:miniprogram` 通过（package-content 0.31 MB），独立 `check:release` 退出 0：710 项中 708 通过/0 失败/2 项既有 Windows 跳过，AI 质量通过、数据 0 错误/7 项既有提示；`git diff --check` 通过。`app.json` 既有 skills/agent 未提交改动保留。未用真实账号/授权题集做网页与小程序联动或 Android/iOS 真机验收，未改生产库、未微信上传、提交、推送或部署。
- Codex 阶段 6 会员权益评估（2026-10-21，完成）：Human 选择“会员题集暂不开通，9 元资料独立”。当前会员套餐无刷题权益码，现有 question-practice API 仅列显式开放的免费题集，9 元订单只交付测评资料；本批未新增会员题集发布或购买入口、未修改支付/会员后端。

- Codex 阶段 5 后端（2026-10-21，完成并释放）：新增 `db/migrations/0020_question_parse.sql`、`services/questionPdfLayout.js`、`services/questionPdfParser.js`、`services/questionParseJobs.js`、`routes/admin-question-parsing.js`、`scripts/dispatch_question_parse.js`、`scripts/question_pdf_page_worker.js`、`tests/questionParsing.test.js`、`tests/fixtures/question-parse-cases.json`、`docs/assessment-question-bank/06_PHASE5_DIGITAL_PDF.md`，并接入迁移、路由、权限和全量测试。私有数字 PDF 页级提取、来源授权/资产扫描闸门、持久任务/逐页 checkpoint、冲突答案候选证据、可终止子进程硬超时与输出容量上限、待审草稿编辑审计及受权单页预览均已实现；解析不写可发布题库。高风险迁移、私有原件、动态鉴权、撤权竞态与中断恢复用隔离测试核验。最后独立门禁：联合专项 31/31、迁移 20/20、全量 `npm test` 692 项中 690 通过/0 失败/2 项既有 Windows 跳过，`git diff --check` 通过。原开发包合成 JSON 与项目 fixture SHA-256 一致。真实授权样本的质量、成本及工时未测；现有资产深验/扫描 pending 仍默认阻断。未改真实 DB 或生产配置，未提交/推送/部署。
- Codex 阶段 5 审题工作台（2026-10-21，完成并释放）：新增 `admin/question-parsing.html`、`admin/js/question-parsing.js`、`admin/css/question-parsing.css`、`tests/questionParsingAdmin.test.js`，在 `admin/js/common.js` 增加入口。支持任务状态、来源页及文末/冲突候选答案页核对、受权 PNG 原页、审题修订和审计；来源/管理员撤权后清除敏感内容及 Blob，跨页与迟到请求有回归。仅 PDF 素材权限可读，另有题库编辑权限才可改。管理端专项 17/17；真实管理员账号浏览器视觉联调未做，文件占用已释放。

- Codex 阶段 4 后端（2026-10-21，完成并释放）：新增 `db/migrations/0019_question_practice.sql`、`services/questionPractice.js`、`routes/question-practice.js`、`routes/admin-question-practice.js`、`tests/questionPractice.test.js`、`docs/assessment-question-bank/05_PHASE4_WEB_PRACTICE.md`，接入 `server.js`、`tests/all.test.js`、`tests/databaseMigrations.test.js` 并更新本记录。新增默认关闭的免费网页发布开关及审计/CAS；公开商业+全球单份完整授权、JWT 实时本人核验、冻结会话、顺序取题、服务端正式判分与幂等、错题/收藏/历史分页和失权脱敏。高风险迁移、鉴权、公开答案、并发与撤权均用隔离专项验证；联合迁移/后端/网页/管理专项 45/45，通过；全量 `npm test` 660 项中 658 通过、0 失败、2 项既有 Windows 跳过；`git diff --check` 与 JS 语法检查通过。未接生产库、真实 PDF 或生产配置，未提交/推送/部署；保留原有未提交文件。
- Codex 阶段 4 网页（2026-10-21，完成并释放）：phase4_web 新增 `public/web/practice.js`、`public/web/practice.css`、`tests/questionPracticeWeb.test.js`，接入 `public/web/index.html`、`public/web/app.js` 并修正 `p0-workspace.js` 资源文案。支持登录后公开目录、开始/续答、顺序作答、弱网同键重试、结果、错题/收藏/历史与撤权后清理敏感 DOM；Web+现有工作台专项 21/21，通过合成浏览器 smoke（空目录、三题型、键盘、刷新续答、结束历史），无真实账号或生产 DB。
- Codex 阶段 4 管理发布开关（2026-10-21，完成并释放）：phase4_admin 修改 `admin/question-bank.html`、`admin/js/question-bank.js`、`admin/css/question-bank.css` 并新增 `tests/questionPracticeAdmin.test.js`；内部 ready 题集须有 `questionBankPublish` 实时权限的管理员确认后才可免费网页启用，界面展示实时可用状态、版本冲突和撤权。新旧管理页专项 14/14 与联合专项通过，JS 语法与差异检查通过。

- Codex 阶段 3 后端（2026-10-21，完成并释放）：新增 `db/migrations/0018_question_bank.sql`、`services/questionBank.js`、`services/questionBankRights.js`、`routes/admin-question-bank.js`、`tests/questionBank.test.js`、`docs/assessment-question-bank/04_PHASE3_QUESTION_BANK.md`，接入 `db/migrate.js`、`server.js`、`utils/adminPermissions.js`、`tests/all.test.js`、`tests/databaseMigrations.test.js`，并更新本记录。实现严格单选/多选/判断 DTO、逻辑题与不可变修订、原创/PDF 来源及媒体元数据、内容/权益独立审核和幂等 CAS、固定修订顺序内部题集及逐题发布闸门。DB 触发器保护修订与 ready 题集不变性，动态 ready/use 复查撤权、到期与来源权利；PDF 相同 SHA 不跨来源授权，图片尚无安全交付能力时整题阻断。迁移/后端/UI 联合专项最终 33/33、0 失败；最终全量 `npm test` 为 633 项、631 通过/0 失败/2 项既有 Windows 跳过；`git diff --check` 通过。保留现有微信与阶段 1/2 未提交文件；未接生产库/真实 PDF、未提交推送部署、不开放学生 API。
- Codex 阶段 3 管理页（2026-10-21，完成并释放）：phase3_admin 新增 `admin/question-bank.html`、`admin/js/question-bank.js`、`admin/css/question-bank.css`、`tests/questionBankAdmin.test.js`，接入 `admin/js/common.js`；提供人工录题、修订、两类审核、题集编排的内部页面。其专属 7/7 与联合专项通过，`node --check`、`git diff --check` 通过。双方未交叉覆盖文件。

- Codex 阶段 2 后端（2026-10-21，已完成并释放）：新增 `db/migrations/0017_question_asset_governance.sql`、`services/questionAssetRights.js`、`services/questionAssetGovernance.js`、`routes/admin-question-asset-governance.js`、`tests/questionAssetGovernance.test.js`、`docs/assessment-question-bank/03_PHASE2_GOVERNANCE.md`，并接入 `server.js`、`utils/adminPermissions.js`、`tests/all.test.js`、`tests/databaseMigrations.test.js`。来源级操作授权、独立权利/内容审核、分页审计、实时账号权限与撤权/到期/未来生效日检查均按默认拒绝实现；内容审核以稳定请求键及所见最新审核 ID 防止旧重试覆盖后续驳回；阶段 1 校验/扫描 pending 仍拦截内容通过与发布。治理后端专项 9/9、迁移 16/16、联合后台专项 23/23、全量 `npm test` 616 项中 614 通过/0 失败/2 项既有 Windows 跳过；`git diff --check` 通过。未改微信既有脏文件、真实数据库或生产配置；未提交推送，文件占用已释放。

- Codex 阶段 2 后台审核页（2026-10-21，已完成并释放）：phase2_admin 新增 `admin/question-governance.html`、`admin/js/question-governance.js`、`admin/css/question-governance.css`、`tests/questionGovernanceAdmin.test.js`，并接入 `admin/js/common.js`。提供来源列表/详情、权利声明、独立审核和历史分页；按同一声明展示免费/商业组合覆盖，修复旧历史分页请求覆盖新状态；内容审核网络失败重试复用请求键，409 旧版本刷新后要求重新提交。专属 14/14、联合 23/23、全量回归通过；未提交推送，文件占用已释放。

- Codex 阶段 1A 收尾（2026-10-21，已完成并释放）：调整 `services/questionAssets.js`、`services/questionAssetStore.js`、`routes/admin-question-assets.js`、`utils/adminPermissions.js`、`tests/questionAssets.test.js`、`tests/all.test.js`、`docs/assessment-question-bank/02_PHASE1A_BACKEND.md` 与本记录。修复同一来源并发上传覆盖资产，HTTP 内仅做有界 PDF 头尾预检与异步流式 SHA-256，深验/扫描继续待处理；修复管理员权限路径查询串和大小写绕过、非法 ID 上传临时文件泄漏、中文文件名编码、关闭批次后的失败事件。阶段 1A 与 1B 专项合计 26/26，迁移检查 15/15，全量 588 项中 586 通过、0 失败、2 项既有跳过；JS 语法及 `git diff --check` 通过。未提交推送，文件占用已释放。

- Codex 阶段 1B 后台导入页（2026-10-21，已完成并释放）：占用并调整 `admin/js/common.js`，新增 `admin/question-assets.html`、`admin/js/question-assets.js`、`admin/css/question-assets.css`、`tests/questionAssetsAdmin.test.js`；管理员专属页面只接阶段 1A 的批次、来源、隔离上传与状态接口。独立复核后修复跨批次异步上传/重试覆盖当前提示的问题，并让不在首批分页中的新建或深链接批次持续显示在侧栏。专属测试 10/10、JS 语法与 `git diff --check` 通过；未提交推送，文件占用已释放。

- Codex 阶段 1A 加固（2026-10-20，已完成并释放）：调整 `.gitignore`、`.env.example`、`db/migrations/0016_private_pdf_assets.sql`、`services/questionAssetStore.js`、`services/questionAssets.js`、`routes/admin-question-assets.js`、`server.js`、`tests/questionAssets.test.js`、新增合成的 `tests/fixtures/question-valid.pdf`、`tests/databaseMigrations.test.js`、`docs/assessment-question-bank/02_PHASE1A_BACKEND.md` 与本记录。修复新 router 拦截原测评管理接口的问题；增加目录双向交叠与 junction 拒绝、真实 PDF 解析、旧文件完整性校验、分页和批次幂等、临时区配额与残留清理。专项 16/16、迁移 15/15、全量 576 项中 574 通过、0 失败、2 项既有跳过；JS 语法与 `git diff --check` 通过。生产导入仍关闭，未接入 COS、扫描或真实 PDF；未提交推送，文件占用已释放。

- Codex 阶段 1A（2026-10-20，已完成并释放）：调整 `.gitignore`、`.env.example`、`db/migrations/0016_private_pdf_assets.sql`、`services/questionAssetStore.js`、`services/questionAssets.js`、`routes/admin-question-assets.js`、`server.js`、`utils/adminPermissions.js`、`tests/questionAssets.test.js`、`tests/databaseMigrations.test.js`、`tests/all.test.js`、`docs/assessment-question-bank/02_PHASE1A_BACKEND.md` 与本记录。完成私有 PDF 批次、来源、SHA-256 去重、失败重试和独立管理员权限。上传与迁移风险已用隔离测试验证：专项 7/7、`npm run check:db-migrations` 15/15、`npm test` 567 项中 565 通过、0 失败、2 项既有跳过，`git diff --check` 通过。私有本地导入需显式开关，生产始终关闭；未动支付、会员、真实库、生产配置或真实 PDF。文件占用已释放。

- Codex（2026-10-20，微信 AI 与搜一搜收录优化，已完成并释放）：在 `miniprogram/app.json` 声明现有岗位、校招、面经三套只读 Skill 的独立分包及页面元数据；`miniprogram/sitemap.json` 的公司详情仅要求真实入口使用的 `id`，同时移出依赖本机缓存或缺少独立内容的资讯详情、题目详情、机构对比、空搜索页；`miniprogram/page-meta.json` 同步调整可推荐页面及参数；更新 `docs/WECHAT_PAGE_CONTENT_ACCESS_CN.md`。`node scripts/check-miniprogram.js` 通过（媒体197.1KB、主包1.11MB、skills 0.09MB），`git diff --check` 通过；`npm run check:miniprogram` 首次受 Windows 内存不足影响未启动 Node，随后用同一检查脚本直接执行成功。未运行微信 AI 平台评测、真机或正式版本的实际收录检查；未操作微信后台、上传或发布。

- Codex（2026-10-20，消息通知页视觉与分类优化，已完成并释放）：调整 `miniprogram/package-user/pages/messages/messages.{js,wxml,wxss}`、`tests/profileDetailPages.test.js` 与本记录。顶部改为未读摘要与“全部已读”，四分类保持完整点击区域；白色消息卡分层展示类别、日期、标题、完整正文和可跳转状态，空状态与页面背景统一。支付消息计入系统分类，仅展示层清理已知接口错误前缀，原始消息与已读/跳转行为不变。页面与导航专项 31/31、`check:miniprogram`、JS 语法及差异格式检查通过；未在微信开发者工具或真机预览，未上传或发布，未改支付、后端通知或生产数据。

- Codex（2026-10-20，AI 求职助手流式问答修复，已完成并释放）：调整 `miniprogram/pages/ai-career/ai-career.js`、`miniprogram/package-ai/pages/ai-assistant/ai-assistant.js`、新增 `tests/aiAssistantStreaming.test.js`、登记至 `tests/all.test.js` 与本记录。将微信分块监听注册到 RequestTask，使回答在请求结束前显示；补齐跨分块 UTF-8 中文解码，保留原有错误回退。专项 8/8；`check:release` 557 项中 555 通过、0 失败、2 项既有 Windows 跳过，AI 质量与小程序检查通过，数据 0 错误/7 项既有提示。公网 readiness 200，但仅检查 AI 配置就绪，未实际代用户调用线上问答；未做微信真机预览或小程序上传发布，也未改 AI 服务配置、鉴权和生产部署。

- Codex（2026-10-20，今日求职计划移除待办副标题，已完成并释放）：调整 `miniprogram/pages/index/index.{wxml,wxss}`、`tests/frontendVisualCheckpoint.test.js` 与本记录。移除“优先处理”和次要待办描述，收紧待办行距；保留任务标题、状态、跳转和任务数据。首页/导航专项 45/45、`check:miniprogram` 和差异格式检查通过；未在微信开发者工具或真机预览，未发布。

- Codex（2026-10-20，首页校招区标题与查看全部样式，已完成并释放）：调整 `miniprogram/pages/index/index.{wxml,wxss}` 与本记录。删除标题下的更新说明，右侧统一为其他首页卡片的“查看全部”文本、箭头和样式，保留跳转及校招列表数据。首页/导航专项 45/45、`check:miniprogram` 和差异格式检查通过；未在微信开发者工具或真机预览，未发布。

- Codex（2026-10-20，修复微信代码质量主包冗余 JS，已完成并释放）：将 `miniprogram/utils/oa-practice-bank.js` 移到 `miniprogram/package-career/pages/oa-bank/oa-practice-bank.js`，更新同目录 OA 页引用与 `tests/oaPracticeBank.test.js`。题目与交互不变，主包已无该文件或旧引用。OA 专项 3/3、`check:miniprogram`、JS 语法和差异格式检查通过；未运行微信开发者工具质量复扫，未预览或发布。

- Codex（2026-10-19，“我的”七个详情入口升级，已完成并释放）：调整 `miniprogram/package-career/pages/resume-center/resume-center.{wxml,wxss}`、`miniprogram/package-user/pages/{favorites,messages,my-experiences,feedback,about,settings}/*.{js,wxml,wxss}` 中本轮涉及的页面、`tests/profileDetailPages.test.js`、`tests/all.test.js` 与本记录。统一蓝白卡片、信息层级、操作与空状态；消息总数与分类数改为基于完整列表，失败时给出重试并隐藏不准确数字；面经操作可点击且明确本机保存；反馈失败保留输入并提示重试；设置移除不生效的外观与推送开关。简历上传与服务端数据删除请求及确认逻辑未改，消息已读接口行为保持原样。页面、导航及消息相关专项 88/88、`check:miniprogram`、JS 语法与差异格式检查通过；未在微信开发者工具或真机预览，未上传或发布。

- Codex（2026-10-19，编辑资料表单减负，已完成并释放）：调整 `miniprogram/package-user/pages/profile-edit/profile-edit.{js,wxml,wxss}` 与本记录。取消首屏“缺少多项”进度施压，压缩身份卡；学历改为单行选择器，首屏保留基础资料、毕业年份、目标地区和目标岗位；常见选项仍可在搜索弹层选择，行业、求职类型、签证、技能及项目等字段归入默认收起的“其他资料”。原有值、保存/同步和头像上传链路保持不变，不改后端或生产数据。导航/资料隔离专项 34/34、小程序静态、JS 语法及差异格式检查通过；未在微信开发者工具或真机预览，未上传或发布。

- Codex（2026-10-19，测评资料详情页整体排版，已完成并释放）：调整 `miniprogram/package-content/pages/assessment-detail/assessment-detail.{wxml,wxss}` 与本记录。封面下的标题、公司届别、价格和摘要归入白色商品卡；介绍、目录、示例、领取及售后分区，订单状态改为提示卡，底部价格与主操作重新对齐。保留全部商品字段、购买/已购状态、领取入口和示例图预览，不改支付逻辑、商品数据或生产环境。测评页面/预览专项 29/29 与 `check:miniprogram` 通过；未在微信开发者工具或真机预览，未上传或发布。

- Codex（2026-10-19，测评资料列表/详情封面重新设计，已完成并释放）：调整 `miniprogram/package-content/pages/assessment-list/assessment-list.{wxml,wxss}`、`miniprogram/package-content/pages/assessment-detail/assessment-detail.{wxml,wxss}`、`miniprogram/package-content/assessment-shared.wxss`、`miniprogram/utils/api-assessment-resources.js`、`tests/assessmentFrontend.test.js` 与本记录。生产商品原图仅 200×200；列表改为 124×160rpx 竖版原生图形，详情改为全宽×340rpx 横版图形，按公司显示五种配色与清晰原生文字，避免原图放大裁切。保留原 `coverUrl` 数据供其它入口使用，不改商品、支付或生产数据。测评专项 51/51、小程序静态、JS 语法与差异格式检查通过；未在微信开发者工具或真机预览，未上传或发布。

- Codex（2026-10-19，测评资料列表卡片排版，已完成并释放）：调整 `miniprogram/package-content/pages/assessment-list/assessment-list.{wxml,wxss}` 与本记录；资料列表改为独立白色卡片，封面放大并完整显示，标题、公司届别、说明及价格分层，搜索和“我的已购”点击区域分开。保留原搜索、分页、已购状态及详情跳转。相关专项 28/28、小程序静态与差异格式检查通过；未在微信开发者工具或真机预览，未上传或发布。

- Codex（2026-10-19，我的页面会员权益卡片间距，已完成并释放）：调整 `miniprogram/pages/profile/profile.wxss` 与本记录；个人资料卡与会员卡之间补齐 24rpx 间距，与会员卡到“我的记录”保持一致。相关专项 45/45、小程序静态与差异格式检查通过；未在微信开发者工具或真机预览，未上传或发布。

- Codex（2026-10-19，OA 页面改为直接刷题，已完成并释放）：调整 `miniprogram/package-career/pages/oa-bank/oa-bank.{js,wxml,wxss}`、`miniprogram/pages/resources/resources.js`，新增 `miniprogram/utils/oa-practice-bank.js`、`tests/oaPracticeBank.test.js` 与本记录。首页可免登录直接练习 21 道原创通用模拟题（7 类各 3 题）、提交看解析、换题和重练；原训练计划、计时及本人记录保留在“训练记录”次级标签，模拟题成绩只在当前页面会话显示，不混入用户确认的服务端统计。资源入口描述同步修正。相关专项 64/64、小程序静态、JS 语法与差异格式检查通过；未在微信开发者工具或真机预览，未上传或发布。

- Codex（2026-10-19，资源中心“我的已购”卡片统一，已完成并释放）：调整 `miniprogram/pages/resources/resources.wxml`、`tests/frontendVisualCheckpoint.test.js` 与本记录；把“我的已购”放入“更多资源”的同一个白色列表卡，图标改用与“我的收藏”相同的可用态和行样式。相关专项 45/45、小程序静态与差异格式检查通过；未在微信开发者工具或真机预览，未上传或发布。

- Codex（2026-10-19，申请进度数字同行右对齐，已完成并释放）：调整 `miniprogram/pages/index/index.wxss`、`tests/frontendVisualCheckpoint.test.js` 与本记录；三项进度标签与数字同行，数字放在各自色块右端。相关专项 58/58、小程序静态与差异格式检查通过；未在微信开发者工具或真机预览，未上传或发布。

- Codex（2026-10-19，今日计划重复标题与申请进度对齐，已完成并释放）：调整 `miniprogram/pages/index/index.{wxml,wxss}`、`tests/frontendVisualCheckpoint.test.js` 与本记录；删除“今天有 X 项待办”重复行，将“申请进度”标题左对齐，保留右侧“查看全部”。相关专项 58/58、小程序静态与差异格式检查通过；未在微信开发者工具或真机预览，未上传或发布。

- Codex（2026-10-19，资源中心恢复标题式卡片，已完成并释放）：撤销上一轮在 `miniprogram/pages/resources/resources.{wxml,wxss}` 新增的精选资源阶段文案、更多资源说明及卡片增高/加大间距；保留可进入“我的已购”的功能入口。同步调整两份视觉/导航断言，专项 78/78、小程序静态与差异格式检查通过。未取得微信开发者工具或真机截图，未上传或发布。

- Codex（2026-10-19，今日计划卡片按最新截图调整，已完成并释放）：修改 `miniprogram/pages/index/index.{js,wxml,wxss}`、`tests/frontendVisualCheckpoint.test.js`、`tests/checkpoint8.test.js` 与本记录。移除顶部重复任务说明；申请进度标题居中，保留右侧查看全部；主按钮可点区域仍为 88rpx，蓝色可视部分缩至 68rpx；本地和同步任务不再只取前三项，首要任务下逐条显示其余事项完整标题、说明与完成状态。保留原数据隔离、状态更新和导航语义。相关专项 106/106、小程序静态与 JS/差异格式检查通过，WXSS 机械扫描无发现；未取得微信开发者工具或真机截图，未上传或发布。

- Codex（2026-10-19，今日计划与申请进度合并）：已完成 `miniprogram/pages/index/index.{wxml,wxss}`、首页/导航回归测试和视觉夹具本轮调整，文件占用已释放。参考线上旧卡片把原来两张卡合为一张：待办数与简短说明、可进入申请进度的三项统计、单条今日建议及紧凑主操作；首页不再逐条铺开两个次要待办。任务与进度数据及原导航逻辑继续复用。相关测试 56/56、小程序静态、JSON 与差异格式检查通过；尚未微信开发者工具或真机视觉验收，未提交或发布。

- Codex（2026-10-19，每日校招白色卡片外框）：已恢复首页每日校招整个模块的白底、边框、圆角与轻阴影，标题和岗位列表同处一张卡片内；保留公司/职位双行与彩色标签。`tests/frontendVisualCheckpoint.test.js` 增加外框回归检查，专项 15/15、小程序静态与差异格式检查通过；未做微信开发者工具或真机视觉验收，未提交或发布，文件占用已释放。

- Codex（2026-10-19，首页卡片视觉层级优化）：已完成 `miniprogram/pages/index/index.{js,wxml,wxss}`、首页/校招专项测试和视觉夹具本轮调整，文件占用已释放。每日校招参照线上样式采用区块标题加白色列表卡，保留公司与职位各一行，增加真实状态、行业和截止标签；最新机会改为公司、岗位、类型/地点和来源分层；今日任务、进度、常用功能及资料价格增加语义色。缺失明确截止日期不再误标“即将截止”。相关测试 68/68、小程序静态、JS 语法、JSON 和差异格式检查通过；旧首页 PNG 基准仍标记过时，未做微信开发者工具/真机视觉验收，未提交或发布。

- Codex（2026-10-19，首页最新机会展示 3 个岗位）：已完成 `miniprogram/pages/index/index.{js,wxml}`、首页视觉测试及视觉夹具的数量调整，文件占用已释放。最新机会从公开数据取最近 3 条有效岗位，页面最多展示 3 行；“为你推荐”已有 3 条数据时现在也展示完整 3 行。专项测试 15/15、小程序静态、JS 语法、JSON 与差异格式检查通过；未在微信开发者工具重新编译或发布。

- Codex（2026-10-19，职位详情描述显示）：已完成 `miniprogram/utils/job-presenter.js`、`miniprogram/package-user/pages/job-detail/job-detail.{js,wxml,wxss}` 和 `tests/jobPresentation.test.js` 的本轮修复，文件占用已释放。招聘源多层 HTML 实体解码并转为可读段落；长描述默认展示摘要，支持展开完整原文。专项测试 6/6、小程序静态检查、JS 语法和差异格式检查通过；尚未在微信开发者工具重新编译做真机视觉确认，未提交或发布。

- Codex 后端 review 修复（2026-10-19）：继续占用本次 assessment 后端/0012/专项测试/实施文档，必要扩展 `routes/users.js` 的账号注销数据库事务。风险：账号注销不得被历史订单阻断或先提交部分删除；已注销用户旧 token 不得领取；关闭订单迟到收款必须记账待人工核对且不发链接。验证：隔离数据库覆盖 pending/paid/refunded 注销、注销失败回滚、旧 token、合法迟到回调及凭据退款，禁止生产写入。

- Codex 团队（2026-10-19，测评资料 1.0 已完成本地开发）：已完成首页最多三家不同公司的运营推荐、资源中心/公司详情入口、资料列表与详情、单品支付、本人已购与网盘领取、后台商品/推荐/订单/人工退款记录，以及 0012 正式迁移文件。范围包括 `services/assessmentCommerce.js`、新增资料路由、现有支付/商业服务接入、`routes/users.js` 注销事务、`server.js`、后台权限、本次小程序/后台资料界面与相关测试；文件占用已释放。已复核服务端定价、签名/金额/SKU/provider、幂等、退款撤权、关闭订单迟到收款待核对、账号隔离与注销回滚；后台编辑乱序和过期已付订单的购买提示已修复。未提交、推送、部署或向主运行数据库应用迁移。

  最终集成：`check:release` 全量 478 项，475 通过、1 失败、2 项 Windows 跳过；唯一失败为实现前既有 `jobSourcesIntegration.test.js:17` JSearch actual 8 / expected 9，发布检查未标全绿。对比实现前 441 项（438/1/2），新增 37 项全部通过（资料后端 15、前端 17、后台 4、迁移 1），三个旧购买文案/资源数量断言已更新并通过。截断后补跑 AI 质量 7/7、小程序静态（媒体 197.1 KB、主包 1.09 MB）、数据检查（0 错误/5 既有提示）通过；迁移 11/11，Acceptance 29 通过/0 失败/1 既有岗位详情提示。独立后端与 UI review 对具体发现复核通过，非全系统审计或像素验收。`.env` 与 `db/jobapp.db` 测试前后 SHA-256 一致，均仅使用隔离临时测试库。详细接口、独立 review、指纹与上线步骤见 `docs/ASSESSMENT_RESOURCE_IMPLEMENTATION_20261019.md`。真实商品/支付 SKU/网盘及首页推荐仍需配置，生产迁移、部署、真实支付、DevTools 编译及真机/小程序视觉验收均未执行。

- Codex（2026-10-19，测评资料首页三公司入口开发 PRD）：已完成 `docs/ASSESSMENT_RESOURCE_COMMERCE_PRD_20261008.md` V1.1 与本记录本条。按用户截图规定首页岗位机会之后、每日校招之前展示最多三家不同公司的资料，每家一份主推商品；补齐运营排序、商品直达、独立异步加载、首页接口草案、后台配置、DEV-01–09 开发依赖与验收。按 impeccable 界面规划规范沿用现有圆角列表形式；代码围栏、JSON 示例和定向差异检查通过。本轮仅文档，未修改业务代码、运行支付或发布。
- Codex（2026-10-19，求职快讯标题精简与加载反馈）：已完成 `miniprogram/package-content/pages/news/news.{js,wxml,wxss}`、`miniprogram/pages/resources/resources.js`、新增 `tests/newsPageState.test.js`、`tests/all.test.js` 与本记录。移除求职快讯页副标题并收紧标题到搜索区的间距，资源入口名称统一为“求职快讯”；修复加载中误显示 0 条和空列表，请求失败且无缓存时提供重试。专项及相关测试 61/61、小程序静态、JS 语法与差异检查通过；新版微信预览待验，未提交、上传或发布。
- Codex（2026-10-19，测评资料 1.0 规划精简）：已完成 `docs/ASSESSMENT_RESOURCE_COMMERCE_PRD_20261008.md`、归档 `docs/archive/ASSESSMENT_RESOURCE_COMMERCE_EXPANDED_DRAFT_20261008.md` 与本记录中的本条。按用户最新需求改为独立入口、公司关联、商品详情、购买后网盘链接/提取码交付及最小已购记录；历史扩展草案保留，阅读器/练习/OA 联动后置。已核对现有公司和支付模式；Markdown 代码围栏、文档链接及定向差异检查通过。本轮仅文档，未运行业务测试、开发、开启支付、提交或发布。
- Codex（2026-10-19，AI 历史侧栏实机适配）：已完成 `miniprogram/pages/ai-career/ai-career.{js,wxml,wxss}`、`miniprogram/package-ai/pages/ai-assistant/ai-assistant.{js,wxml,wxss}` 与本记录。按用户实机截图修复侧栏顶部微信胶囊避让、底部手势区留白和空状态可读性；两套 AI 页面共用动态胶囊下缘计算，侧栏宽度加像素上限。相关测试 69/69、小程序静态与差异检查通过；仍需用户在微信开发者工具重新编译后核对真机视觉。未提交、上传或发布。
- Codex（2026-10-16 至 19，AI 对话原型落地）：已完成 `miniprogram/pages/ai-career/ai-career.{js,wxml,wxss}`、`miniprogram/package-ai/pages/ai-assistant/ai-assistant.{js,wxml,wxss}`、新建 `miniprogram/utils/ai-chat-sessions.js`、相关测试与本记录。按已确认原型实现对话主页、全高历史抽屉、输入框工具面板、任务上下文提示及账号隔离的多会话保存恢复；新增历史搜索、重命名、删除和回答重试。AI 页面专项 75/75、JS 语法、小程序静态与 `git diff --check` 通过。完整 `check:release` 中 434 通过、2 项 Windows 跳过、1 项既有岗位源集成测试失败（JSearch 期望调用 9 次、实际 8 次，单独运行同样失败）；本轮未修改岗位源。尚未取得新版微信开发者工具真实截图；未提交、上传或发布。
- Codex（2026-10-16，机会页岗位列表紧凑化）：已完成 `miniprogram/pages/jobs/jobs.{wxml,wxss}`、`miniprogram/components/c-job-card/c-job-card.{wxml,wxss}`、`tests/{jobPresentation,frontendVisualCheckpoint}.test.js` 与本记录。按用户截图移除搜索下方职位类别快捷标签和“推荐岗位”标题，仅机会页岗位卡使用紧凑样式并将招聘期限移入标签行；相关测试 48/48、全量 430 通过/2 项 Windows 跳过、小程序静态与差异检查通过。尚未取得新版微信开发者工具截图，未提交、上传或发布。
- Codex（2026-10-16，首页视觉层级优化）：已完成 `miniprogram/pages/index/index.{wxml,wxss}`、`tests/frontendVisualCheckpoint.test.js` 与本记录。今日计划去除重复标题和内嵌卡，保留一个全宽主行动与最多两条次要待办；页面左右留白改为 28rpx，普通卡片去阴影，快捷入口统一浅蓝底色，申请进度零值弱化，校招行去重复徽标。岗位、待办和校招的入口与动态数据保持原逻辑。相关测试 56/56、全量 430 通过/2 项 Windows 跳过、小程序静态及差异检查通过；尚未取得新版微信开发者工具真实编译截图，未提交、上传或发布。
- Codex（2026-10-16，电脑预览上传简历连接拒绝）：已完成 `miniprogram/utils/app-config.js`、`tests/loginGate.test.js` 与本记录。微信开发者工具控制台显示开发版指向 `127.0.0.1:4400` 且本机无监听；模拟器现默认访问生产 HTTPS，仅在开发工具中设置 `devApiMode=local` 后才走 4400，真机/体验版保持生产 HTTPS。配置专项 9/9、全量 430 通过/2 项 Windows 跳过、小程序静态与差异检查通过；需重新编译预览验证真实上传，未提交/发布。
- Codex（2026-10-16，简历优化真机快速网络失败复查）：已补充 `miniprogram/package-career/pages/resume-center/resume-center.{js,wxml,wxss}`、`tests/resumeAttachmentFirst.test.js` 与本记录。用户实测约 1–3 秒失败，排除原 20/50 秒超时；线上 readiness 200、未登录优化 POST 预期 401，说明公网路由存在，但不代表真机请求成功。开发版现显示安全截断的 `request:fail` 细节、错误类别及耗时，专项 9/9、全量 430 通过/2 项 Windows 跳过、小程序静态与差异检查通过；待真机或开发者工具网络日志复现后定位具体连接层错误，未提交/发布。
- Codex（2026-10-16，首页校招岗位单行展示）：已完成 `miniprogram/pages/index/index.wxss`、`tests/frontendVisualCheckpoint.test.js` 与本记录。仅将校招岗位行改为单行省略，保留完整无障碍名称和详情入口；专项 15/15、小程序静态检查及 `git diff --check` 通过。390×844 自动截图因开发者工具 `ws://127.0.0.1:9420` 连接失败而未取得，旧首页基准也已登记为内容过时，不能声明像素门禁通过。未提交、上传或发布。
- Codex（2026-10-16，首页校招卡片信息层级）：已完成 `miniprogram/pages/index/index.{js,wxml,wxss}`、`tests/frontendVisualCheckpoint.test.js`、`.agents/skills/zhiyin-miniprogram-pixel-replica/references/screens.json` 与本记录。首页卡片按公司／岗位／届数·批次·地点三层展示，去掉可见和无障碍名称中的飞书来源，不改来源数据、列表接口与详情跳转。微信开发者工具重新打开项目并编译后，模拟器实际校招记录的三层顺序与无来源文案已目视确认；相关 68/68，全量 430 通过/2 项 Windows 跳过，AI 质量、小程序静态及数据检查通过（0 错误/5 项既有提示），`git diff --check` 通过。旧首页原型图已登记为内容过时；重启前的旧模板 390×844 截图对旧基准差异 15.86%，重启后自动化端口未恢复，因此不能声称新版像素门禁通过。未提交、上传或发布。
- Codex（2026-10-16，简历 AI 优化反馈与超时）：已完成 `miniprogram/package-career/pages/resume-center/resume-center.{js,wxml,wxss}`、`miniprogram/utils/api-v4.js`、`services/v4ResumeCenter.js`、`tests/resumeAttachmentFirst.test.js` 与本记录。点击立即显示进度和按钮状态，失败弹出原因并保留页内提示；优化请求 50 秒，服务端模型单次 35 秒后走现有安全降级，避免客户端 20 秒先于服务端返回。AI 结果只生成待确认建议，不自动改原简历。专项 9/9、`check:release` 430 通过/2 项 Windows 跳过，AI 质量/小程序静态/数据检查通过（数据 0 错误、5 项既有提示），JS 语法和差异检查通过；真机视觉与线上模型仍待新版预览/发布后验收，未提交/发布。
- Codex（2026-10-16，首页今日待办与每日最新校招合并）：占用 `miniprogram/pages/index/index.{js,wxml,wxss}`、`tests/{checkpoint8,navigationConfig,frontendVisualCheckpoint,publicDataReliability,campusContent}.test.js` 与本记录。主行动与剩余待办合并为单卡，沿用原任务完成/跳转入口；求职动态换成接口最新校招批次的真实日期、总数及前三条。线上公开接口只读核对最新批次 2026-10-15 共 51 条；相关测试 81/81，全量 428 通过/2 项 Windows 跳过，小程序静态检查、AI 质量、数据检查（0 错误/5 条既有警告）通过。开发者工具 390×844 实图已取得并检查首屏，但旧 `home-approved.png` 已被登记为内容过时，本轮旧基准像素门禁 16.1% 未通过，不能声称与旧原型像素一致；待 Human 确认新首页基准。未提交、上传或发布。
- Codex（2026-10-16，AI 上下文侧栏与对话布局）：已完成 `miniprogram/pages/ai-career/ai-career.{js,wxml,wxss}`、`miniprogram/package-ai/pages/ai-assistant/ai-assistant.{js,wxml,wxss}` 的内容高度侧栏、紧凑工具菜单、空历史区隐藏、底栏遮挡修复及新对话清空确认；保留对话和工具业务路由。全量 428 通过/2 项 Windows 跳过、`check:miniprogram`、JS 语法和 `git diff --check` 通过；微信开发者工具真机视觉验收待执行，未提交/发布。
- Codex（2026-10-16，手机开发版登录网络连接失败）：占用 `miniprogram/utils/app-config.js`、`tests/loginGate.test.js` 与本记录。仅修正开发版 API 地址选择：真机使用线上 HTTPS，开发者工具模拟器保留本机接口；不更改登录协议、token 或后端。风险是环境识别错误导致请求进入错误环境；配置专项 9/9、全量 428 通过/2 项 Windows 跳过、小程序静态检查和线上 readiness 通过。真实微信手机登录仍需重新生成预览包后验收；未上传或发布。
- Codex（2026-10-15，公司资料空列表及开发版公开请求修复）：`miniprogram/utils/api-companies.js`、`miniprogram/package-user/pages/companies/companies.{js,wxml,wxss}`、`miniprogram/utils/{share,feature-flags}.js`、`tests/publicDataReliability.test.js`。开发版公开公司、分享配置和功能开关读取使用线上内容接口；公司请求失败显示可重试错误。线上公司接口核对为 76 家，专项 16/16、全量 428 通过/2 项 Windows 跳过、小程序静态检查通过；尚未微信预览或发布。
- Codex（2026-10-15，机构测评空列表修复）：`miniprogram/utils/api-agencies.js`、`miniprogram/pages/agencies/agencies.js`、`miniprogram/pages/agencies/agencies.wxml`。开发版公开机构读取改走线上内容接口，请求失败显示重试；线上接口核对为 56 家，`check:miniprogram` 与 JS 语法检查通过。尚未微信预览或发布。
- Codex 统一发布 AI 页面收尾与简历隔离（2026-10-15，完成待统一发布）：两个 AI 对话页停止无 token/部分 token 生成均直接结束，不触发备用 AI、不卡 loading；换号后有流/无流均清理旧对话、简历和申请材料 Page.data，异步旧结果不回填，同账号令牌轮换保留草稿。两套简历版本工具及 AI/JD/题目/职位/资料页只读账号作用域简历，不再认领无归属的旧全局 `onlineResume`；题目 AI 训练缓存、收藏/已做状态与 AI Tab 待消费上下文亦按账号隔离，并拦截迟到训练回包。专项 `releaseAuthConcurrency` 19/19、`aiResumeOwnerIsolation` 6/6；最终 `npm run check:release` 427 通过、2 项 Windows 环境跳过，AI/miniprogram 检查通过、data 0 错误 5 条既有警告；`npm run check:acceptance -- --no-report` 29 通过、1 条既有岗位种子警告。未提交/推送/部署。

- Codex 统一发布安全阻塞第二轮（2026-10-15，代码完成，待独立复核）：占用 `miniprogram/{app.js,utils/api-user.js,utils/auth-session.js,pages/ai-career/ai-career.js,package-ai/pages/ai-assistant/ai-assistant.js}`、新增 `tests/releaseAuthConcurrency.test.js`、`tests/all.test.js` 与本记录。两路 AI 直连流式请求固定发起时 token+登录世代，迟到 401/成功、待刷新的 delta 和备用通道均不得更新新会话，失效流从页面移除；静默校验只在明确 401 清理，临时网络/超时/429/500 保留有效登录态，兼容请求层已先清 token；微信/手机号登录共享最新尝试序号，登出/注销会令 pending 登录失效，旧回包不得覆盖新账号。第二轮专项 7/7；`check:release` 409 通过/2 Windows 环境跳过、AI 质量 7/7、小程序静态/包体和数据检查通过（0 错误/5 既有提示）；Acceptance 29 通过/1 既有岗位详情种子提示；`git diff --check HEAD` 通过。未做真实微信双账号/流式联调；未提交、推送、部署或执行旧 `recruitment-*.sh` 脚本。

- Codex 统一发布安全阻塞修复（2026-10-15，代码完成，待独立复核）：占用 `miniprogram/utils/{api-client,auth-session,api-user,api-feishu-content,api-jobs}.js`、`miniprogram/app.js`、登出/注销/AI 鉴权过期页面、`tests/{publicDataReliability,jobPresentation}.test.js` 与本记录。账号 GET 内存缓存、飞行中请求和限流按不含 JWT 的登录世代及端点隔离；旧账号迟到成功/401 不回填或清除新登录态；写请求默认不重放，显式幂等重试固定原账号且切号取消。第三方公开内容不带 Authorization；指定国家职位主源失败不使用无法验证国家的飞书兜底。高风险登录/鉴权与职位源专项 20/20 通过，含 A→B→A、迟到写成功、POST 不重放及跨路由 429；`check:release` 402 通过/2 Windows 跳过、AI 质量 7/7、小程序静态/包体、数据 0 错误/5 既有提示；Acceptance 29 通过/1 既有岗位详情种子提示；`git diff --check HEAD` 通过。未提交、推送、部署或执行旧 `recruitment-*.sh` 脚本。

- Codex merge_backend_impl（2026-10-14，隔离工作树 `codex/merged-backend-release-20261014`）：占用 `routes/jobs.js`、`scripts/healthcheck.js`、`services/feishuCompanyImport.js`、`deploy.sh`、`tests/releaseEngineering.test.js`、`tests/smoke.test.js`、`docs/JOB_CAMPUS_DATA_PROVENANCE_CONTRACT.md` 与本记录；选择性保留线上招聘版新增的近期岗位过滤、RemoteOK 地图覆盖及 Feishu 请求重试，同时保留目标版本全局岗位默认与发布安全门禁。历史岗位详情保留且标注时效风险、Feishu 非暂态错误不重试且错误信息脱敏、缺失共享配置拒绝发布，TCP 拒绝后的 readiness 重试已覆盖；文档说明全球产品定位不等于现有源覆盖全球本地职位。`check:release` 369 通过/2 Windows 跳过、Acceptance 29 通过/1 旧种子近期岗位不足的警告、Git Bash `bash -n deploy.sh` 与 `git diff --check` 均通过；仅本地合并，未提交、推送或部署。

- Codex 统一发布候选整合（2026-10-15，代码完成，待独立复核）：占用本轮现有 29 个已修改文件、5 个未跟踪文件及本记录；原工作区已保存为可恢复 stash `82a7839c6702472b782ace5dea35722bb93d6e15`（未 pop），从全球职位源后继 `531a201` 建立 `codex/unified-release-20261015`。冲突仅在本记录、`routes/jobs.js`、`tests/smoke.test.js`；状态记录保留双方历史，后两者采用较新的全球职位源实现，`tests/all.test.js` 保留新增两个专项注册。附件上传、登录隔离及公开数据由全量 393 通过/2 Windows 跳过、AI 质量 7/7、小程序包体/数据检查与 Acceptance 29 通过/1 既有近期岗位种子告警验证，`git diff --check HEAD` 通过。三份未跟踪招聘脚本含旧版一次性切流/删除逻辑，保留在工作区和 stash 中供追溯，不纳入统一发布入口或提交；不得执行。未提交、推送、部署、上传或写入生产库。

- Codex 发布候选整合预检（2026-10-15，待集成）：本轮仅占用本记录此行，梳理 29 个已修改及 5 个未跟踪文件；全球职位源分支 `531a201` 是当前 `362d395` 的后继，应以其为最终基底。当前脏版本的 `routes/jobs.js`、`tests/smoke.test.js` 是已在后继提交中加强的旧实现，不应覆盖新版本；`tests/all.test.js` 新增两个专项测试注册须保留。当前工作区 `check:release` 375 通过/2 Windows 跳过，AI 质量和小程序检查通过，内容 0 错误/5 既有警告，`git diff --check` 通过；忽略规则涵盖环境文件、数据库、上传物和微信私有配置，未发现新文件含常见私钥/API Token 形态。三份未跟踪招聘脚本为一次性上线操作记录，含定向删除与切流逻辑，需评估是否纳入发布提交但不得作为本次统一发布入口。未切分支、提交、推送、部署或上传；待独立验证后确定同版发布方案。

- Codex 公开数据可靠性修复（2026-10-15，代码完成）：修改 `miniprogram/utils/{app-config,api-client,api-campus,api-jobs}.js`、`miniprogram/pages/index/index.{js,wxml,wxss}`、新增 `tests/publicDataReliability.test.js` 并接入 `tests/all.test.js`。公开校招列表/筛选/详情与聚合岗位/详情从线上公开接口匿名读取，登录、简历和用户写入仍走开发环境本机服务；GET 缓存与限流按来源及鉴权范围隔离，匿名 401 不清除登录态。首页区分网络失败与真实空列表并支持立即重试，失败不缓存 5 分钟。线上公开接口只读抽样可返回数据；专项 6/6、全量 375 通过/2 Windows 跳过、`check:miniprogram` 与 `git diff --check` 通过。未运行微信开发者工具截图、未上传小程序、未提交/推送。

- Codex 资源页副标题精简（2026-10-15，代码完成）：仅修改 `miniprogram/pages/resources/resources.{wxml,wxss}`、`design-system/zhiyin-career/pages/resources.md`、资源页相关的 `tests/{navigationConfig,frontendVisualCheckpoint}.test.js` 与本记录此行。按 Human 截图移除资源列表及“我的已购”的可见副标题，并按再次澄清彻底去除资源卡片中的“适用阶段”文案（包含无障碍名称），保留资源名称与 104rpx 触控行高。相关测试 43/43、`check:miniprogram`、`git diff --check` 通过；开发者工具 CLI 已以唯一项目路径成功编译预览，总包 2.1 MB，未上传正式版；自动化端口 9420 不可连接，未取得模拟器截图，视觉验收待完成；未提交或发布。

- Codex Tab 文案调整（2026-10-14，已完成）：修改 `miniprogram/app.json`、`miniprogram/custom-tab-bar/index.js`、`tests/{checkpoint8,navigationConfig}.test.js`、`PRODUCT.md`、`design-system/zhiyin-career/pages/tabs-and-context-ai-pixel-spec.md` 与本记录；按 Human 审核要求仅将第二个 Tab 的“找岗位”改为“机会”，不更改页面标题、路由和业务逻辑。导航专项 41/41、`check:miniprogram` 与 `git diff --check` 通过；待开发者工具重新编译目视确认，未上传体验版或提交审核。

- Codex 修正简历附件动作（2026-10-14，代码完成）：修改 `miniprogram/package-career/pages/resume-center/resume-center.{js,wxml}`、`tests/resumeAttachmentFirst.test.js`、本记录。把“导入简历”和“AI 优化”分开；从历史版本恢复旧服务缺失的附件关联；创建前服务端复查，失败时禁止盲目创建。旧重复记录只标记不删除。专项 7/7、`npm run check:release` 通过（369 通过、2 Windows 跳过）；未运行微信开发者工具真实交互、未部署生产，本地 4400 旧进程仍需手动重启以加载后端幂等保护。

- Codex 附件优先简历中心（2026-10-14，代码完成）：修改 `miniprogram/package-career/pages/resume-center/`、`miniprogram/utils/api-v4.js`、`routes/v4/resumes.js`、`services/v4ResumeCenter.js`、`tests/resumeAttachmentFirst.test.js`、`tests/all.test.js`；接通 PDF 上传、解析、来源关联、AI 建议确认及浅色界面。扫描件不生成空简历；重复导入幂等；附件仅允许所属用户关联；AI 不改写附件元数据。专项 5/5、`npm run check:release` 通过（367 通过、2 Windows 跳过）；未做微信开发者工具真机/截图验收，未部署生产。本机 4400 旧服务重启受环境策略阻止，联调前需在原终端手动重启。

- Codex 招聘接口开放（2026-10-14）：占用 `routes/jobs.js`、`tests/smoke.test.js`、`scripts/recruitment-{preflight,cutover,cleanup}.sh` 与本记录此行。官网岗位列表和地图接入 RemoteOK，并排除过期职位；职位详情支持实时 ID。隔离快照预检列表 10 条、地图 99 条、详情 200；官网候选版同 ID 200。生产先备份数据库、核验 PM2 PID/物理目录后切流，启用 `recruitment` 单一开关，公网列表 10 条、地图 99 条且过期 0 条，详情 200。后端全量 362 通过/2 Windows 跳过；无数据库迁移。发布版本：后端 `recruitment-20261014-1791949367110`，官网 `recruitment-20261014-1791949367110-site-v2`。切流前数据库备份已保存至服务端 `/var/lib/jobapp-server/backups/`，无效候选版及预检快照已清理。

- Codex deploy_guard_impl（2026-10-14）：占用 `deploy.sh`、`scripts/backup-production.sh`、`scripts/verify-pm2-instance.js`、`tests/releaseEngineering.test.js` 与本记录此行；修复 PM2 JSON 静默输出，分别保留原始 `current` 链接与 PM2 实际物理版本，切流前复核旧 PID/4400 监听者。`current` 用同目录临时软链接及 `mv -Tf` 原子替换；切流期间的 EXIT/INT/TERM 守护可在失败或中断时分别恢复旧进程与旧链接，PM2 身份辅助脚本固定新版本绝对路径。Linux 隔离假 PM2 故障注入覆盖新进程启动失败、健康检查失败及 TERM，三种错位回滚均通过；临时测试目录已清理。本地/远端 `bash -n`、聚焦 7 通过/2 Windows 跳过、全量 362 通过/2 Windows 跳过、`check:release`、`git diff --check` 通过；未执行生产部署、提交或推送。

- Codex CI 收口（2026-10-14）：占用 `tests/sprint4CareerCoach.test.js`、`tests/sprint5Networking.test.js` 与本记录；Linux CI 的两条旧资源页文案断言与当前已确认的资源分类不一致，只更新断言到当前产品结构，不变更业务实现。

- Codex 视觉验收（2026-10-14）：占用 `.agents/skills/zhiyin-miniprogram-pixel-replica/scripts/capture-and-compare.js` 与本记录；开发者工具已登录且 automation 端口可连接，但固定 8/15 秒操作超时导致视口、fixture 或导航中断。本轮仅允许增加可配置等待时间，不更改基准 PNG、差异阈值或遮罩。

- Codex release 集成（2026-10-14）：占用 `.gitignore` 与本记录新增行，整理当前工作区安全提交；仅排除本地 `artifacts/` 运行数据及根目录微信开发者工具配置，保留业务代码和设计基准。

- Codex（2026-10-14）：按 Human 最新截图调整资源页，顺序接续已完成的 ui_impl 视觉改动；范围 `miniprogram/pages/resources/resources.{js,wxml,wxss}`、资源页相关断言所在 `tests/{frontendVisualCheckpoint,navigationConfig,mobileWorkflow,checkpoint7}.test.js` 与本记录。已移除资源分类切换条，在同页展示全部 9 个可用入口及未开放的“我的已购”，精选卡片改为图文同排并缩短；搜索覆盖全部资源，原有目标上下文与题型参数传递保留。相关回归 94/94、`check:miniprogram`、`git diff --check` 通过；待微信开发者工具视觉复核，未改底部主导航，未提交/发布。

- Codex ui_impl（2026-10-14）：占用 `miniprogram/pages/ai-career/ai-career.{wxml,wxss}`、`miniprogram/custom-tab-bar/index.wxss`、`miniprogram/pages/index/index.{js,wxml,wxss}`、`miniprogram/pages/{jobs,resources}/*.wxss`、`miniprogram/utils/{app-config,feature-flags,data-provenance}.js`、`tests/{checkpoint8,frontendVisualCheckpoint,campusContent}.test.js`、`.agents/skills/zhiyin-miniprogram-pixel-replica/references/screens.json` 与本记录此行；会员缓存/失败关闭、AI 侧栏与网申触控语义、辅助文字对比度和缓存时效修复完成。聚焦测试 37/37、`check:miniprogram`、Impeccable 检测（空结果）与 `git diff --check` 通过；390×844 微信截图叠加由发布验收执行，扩充内容与旧首页原型基准存在明确冲突。不占用发布脚本或 `tests/all.test.js`，未替换已确认原型图，未提交/推送。

- Codex release_impl（2026-10-13 至 14）：占用 `tests/checkpoint7.test.js`、`tests/releaseEngineering.test.js`、`tests/all.test.js`、`scripts/backup-production.sh`、`scripts/verify-pm2-instance.js`、`deploy.sh`、`server.js`、`.github/workflows/test.yml`、`.github/workflows/deploy.yml`、`docs/production-deploy.md` 与本记录顶部；已修复过期页面断言、备份失败误报、发布前隔离快照/只读迁移状态门禁、候选与切流监听进程身份校验/回滚及 CI。切流后从物理 release 执行 PM2，`/current` 别名拒绝冒充新实例。上轮全量测试 352 pass/1 Windows-only skip、Acceptance 30/30；最后一项修改后的聚焦测试 6 pass/1 Windows-only skip、Shell 语法与差异检查通过。生产 Nginx 实际配置路径须设置 GitHub production Environment 变量 `PRODUCTION_NGINX_CONFIG_PATH`。生产 migration 状态与真实 Linux 备份/部署仍待人工验证；公网 API 404 将阻止发布并触发回滚。未执行生产迁移 apply、生产部署、共享库写入或 Git 提交。

- Codex（2026-10-13）：首页内容密度优化代码完成，待 390×844 微信开发者工具截图验收，未提交/发布。范围 `miniprogram/pages/index/index.{js,wxml,wxss}`、`miniprogram/package-ai/pages/jd-match/jd-match.js`、对应导航/视觉/校招内容测试及本记录；增加常用功能、最多两条真实且近期发布的岗位、校招动态，保留当前蓝白视觉与原有业务入口。专项测试 46/46、`check:miniprogram`、布局检测与 `git diff --check` 通过；全量测试 346/347，唯一失败为既存 `checkpoint7.test.js:149` 仍断言“我的申请”，与当前“我的”页面结构冲突。开发者工具 CLI 服务端口关闭，尚未完成编译截图及原型叠加，不视作视觉验收通过。

- Codex（2026-10-13）：按首页截图收紧“今日重点”和“申请进度”卡片：主行动卡最小高度由 276rpx 调至 218rpx，进度卡由 226rpx 调至 174rpx；同步压缩内部留白，保留主按钮及“查看全部”的 88rpx 点按高度。`check:miniprogram`、首页视觉与导航专项 37/37、`git diff --check` 通过；尚待微信开发者工具实机视觉复核，未提交/发布。

- Codex（2026-10-10）：恢复小程序旧版视觉语言、悬浮 TabBar 与上下文 AI 入口。范围 `miniprogram/custom-tab-bar/*`、五个一级页面 WXSS、`components/c-job-card`、`package-ai/pages/ai-assistant/*` 及相关导航/视觉测试；保留五 Tab、申请工作流和数据库隔离，不回退业务结构。状态：代码完成；336/336 全量测试、30/30 Acceptance、`check:miniprogram` 与 `git diff --check` 通过，主数据库指纹未变；待微信开发者工具人工视觉验收。

2026-09-20 Codex：Web P0 完善（代码与隔离验收完成，未提交/部署），范围 `public/web/*`、AI 会话 service/route、新增 Web 登录衔接 service/route、`server.js`、V4 申请/简历路由、小程序设置页、隔离 API/浏览器测试与 Web 开发文档。风险：登录衔接仅允许已登录的小程序用户生成短期一次性凭证，不按未核验的邮箱/手机号合并账号；验证过期/重放/匿名拒绝。上传复用已有 PDF 文件头和大小检查；简历新版本验证归属与并发冲突，AI 验证跨申请/退出隔离。全部测试使用临时数据库，不调用真实模型，不修改生产数据。

- Codex（2026-09-20）：校招关注未展示在收藏的问题已修复；用户确认点击“加入关注/截止提醒”，原操作只存提醒。范围 `miniprogram/utils/favorites.js`、`miniprogram/package-content/pages/campus-detail/campus-detail.js`、`miniprogram/package-user/pages/favorites/favorites.js`、`tests/mobileWorkflow.test.js` 和本文件。关注成功或本地兜底均加入校招收藏，取消提醒保留收藏；进入收藏页导入本机旧关注及账号有效云端提醒，导入标记/删除 tombstone 防止取消收藏后反复恢复。默认展示最近收藏所属分类，异步刷新保留手动选择；排序使用 iOS 安全日期解析。专项 30/30、隔离库全量 250/250 与 `check:release` 通过，保留原 3 项支付静态提示。未执行真机 E2E、尚未发布；重新编译进入收藏页触发历史关注补入（仅本地保存且已清缓存的数据无法恢复）。

- Codex（2026-09-20）：微信上传检查“主包未使用 JS：utils/application-materials.js”已修复。该工具仅被 AI 助手与申请材料页使用，已迁移至 `miniprogram/package-ai/utils/application-materials.js`，同步两页引用及工具的公共 API 引用；范围为上述三个 JS 文件与本记录。仅调整分包归属，功能不变。导航/移动流程 45/45、小程序静态检查（含 require 路径）通过，主包估算降至 1.00 MB；待开发者工具重新编译复查上传质量检查，尚未上传。

- Codex（2026-09-20）：首页校招截止日期 `10.25` 的 iOS 解析警告已修复。范围 `miniprogram/pages/index/index.js`、新增 `miniprogram/utils/campus-deadline.js`、`tests/campusContent.test.js` 和本文件。优先使用接口规范日期；短日期按招聘年份/开始日期推断，兼容跨年、闰年，非法日期和非日期说明保持原文；按北京时间计算剩余天数，不把原始文本交给 Date。同步更新校招排序的 SQLite 时间解析、升级首页缓存版本。专项测试 54/54、小程序静态检查通过；未运行微信真机 E2E、未发布，重新编译后验证。

- Codex（2026-09-20）：小程序 API 排查修复已完成。范围 `services/v4TodayTasks.js`、相关测试、`miniprogram/utils/daily-tasks.js`、`util.js`、`jd-match.js`、`pages/index/index.js`、`components/home-campus-updates/*`、API 巡检脚本与记录。Today 跨天/重复键冲突已定点发布，官网精确 CORS 域名已补齐并备份。公网 58 项查询：56 正常、2 招聘关闭；Today 同步/重复请求均 200，历史保持正确。隔离库 `check:release` 243/243 及各检查通过。未改鉴权/支付核心或数据库结构；iOS 日期与 WXSS 修复在本地小程序，尚未发布。详见 `docs/API_AUDIT_20260920.md`。

- Codex（2026-09-20）：资源中心流程工具去掉文字图标、降低卡片高度，内容与服务改用历史时钟、资讯报纸、机构评分、指南书本四个本地图形图标。范围 `miniprogram/pages/resources/resources.{js,wxml,wxss}`、`miniprogram/images/resource-*.png` 和本文件；已完成，定向测试 45/45、`check:miniprogram` 通过（媒体 196.0 KB），20 组浏览器静态排版与图片解码检查通过，未进行微信真机验收、未发布。

- Codex（2026-09-20）：按用户补充要求恢复“我的简历”图标，个人记录改为四列（简历、收藏、消息、我的面经），直达现有简历页。范围 `miniprogram/pages/profile/profile.{js,wxml,wxss}`、`tests/navigationConfig.test.js` 和本文件；已完成，导航检查 23/23、`check:miniprogram` 通过，未发布。

- Codex（2026-09-20）：“我的”去除与资源中心重复的工具和资产入口，保留个人资料、会员、收藏、消息、我的面经与账号服务。范围 `miniprogram/pages/profile/profile.{js,wxml,wxss}`、`tests/navigationConfig.test.js` 和本文件；已完成，定向 45/45 和小程序检查通过，未发布。

- Codex（2026-09-20）：资源中心紧凑布局，将纵向全部展开改为分类切换、双列工具和四列服务入口。范围 `miniprogram/pages/resources/resources.{js,wxml,wxss}`、`tests/mobileWorkflow.test.js`、`tests/navigationConfig.test.js` 和本文件；已完成，专项测试 45/45、小程序静态检查和 20 组浏览器静态排版检查通过，未进行微信真机验收、未部署。

- Codex（2026-09-16）：恢复首页三个 Banner 轮播，并恢复首页会员权益入口（位于今日求职计划之后）；后台 Banner 不足时补齐岗位、校招、AI 面试默认 Banner。范围 `miniprogram/pages/index/index.js`、`index.wxml`、测试与文档；已完成，定向测试 43/43、`check:miniprogram` 通过。

2026-09-16—2026-09-18 Codex：`routes/ai-conversations.js`、`services/aiConversations.js`、`db/migrations/0007_ai_conversations.sql`、`server.js`、`public/web/app.js`、Web 隔离测试及开发文档。任务：Web AI 服务端会话、上下文和失败/取消恢复；已完成。

风险与验证：新增会话表仅增量建表，不改现有业务表；隔离库验证重复执行、事务、跨用户拒绝、重复 requestId 幂等、失败和取消状态、AI 结果未经确认不写入申请。`node --check`、Web 专项 4/4（含隔离 API 11/11）、数据库迁移 5/5、AI 质量 7/7 通过；旧 `/api/ai/assistant` 保持兼容。真实模型和生产部署待后续验收。

- Codex：按用户最新要求恢复第四位资源中心 Tab，并按求职流程整合 AI 专家工具。范围 `miniprogram/app.json`、`custom-tab-bar/index.js`、`utils/navigation.js`、`utils/util.js`、`package-ai/pages/ai-assistant/ai-assistant.js`、`pages/resources/*`、`tests/navigationConfig.test.js`、`tests/mobileWorkflow.test.js` 与 P0/5.0 规划文档；已完成，237/237 与 `check:release` 通过，未部署。

- Codex（2026-09-16）：首页 Banner 移至搜索下方、今日计划上方，间距改为 Banner 下方留白；范围 `miniprogram/pages/index/index.wxml`、`index.wxss` 和本文件；已完成，`check:miniprogram` 和定向 `git diff --check` 通过，未部署。

- Codex（2026-09-16）：申请详情加载/保存/状态更新可靠性；范围 `miniprogram/package-user/pages/application-detail/*`、`tests/mobileWorkflow.test.js`、本文件和 `docs/V5_P0_MOBILE_WORKFLOW_20260915.md`；已完成，全量 234/234 与发布检查通过，未提交、未部署。

- Codex：撤回重复首页待办卡；范围 `miniprogram/pages/index/index.{js,wxml,wxss}`、`tests/navigationConfig.test.js`、`docs/V5_P0_MOBILE_WORKFLOW_20260915.md` 和本文件；已完成，导航回归 21/21、`check:miniprogram` 和定向 `git diff --check` 通过，未提交、未部署。

5.0 P0 移动闭环（2026-09-15，Codex 本批已完成）：岗位列表/详情、公共岗位卡片、申请状态工具、进度页、我的资源入口及专项测试已完成，释放占用。本批仅复用现有 V4 API，未修改 Web、后端路由和数据库。

| 负责人 | 文件 | 任务 | 状态 |
|---|---|---|---|
| Codex | `routes/v4/applications.js`、`services/v4Application*.js`、`public/web/*`、Web 专项/浏览器测试、开发文档和修改记录 | Web 第二批（2026-09-15）：表格/看板、精确筛选/排序/分页、批量预览/更新/撤销、工作区聚合、关联隔离和安排保存 | 已完成本批；隔离 API 场景 7/7、前端数据检查 3/3、Edge 浏览器验收通过；发布检查 214/214、AI 矩阵 7/7、小程序检查通过；未做真实微信 E2E，未推送/部署 |
| Codex | `public/web/index.html`、`public/web/styles.css`、`public/web/app.js`、`server.js`、`routes/ai.js`、`tests/webWorkbench.test.js`、`docs/WEB_APPLICATION_WORKBENCH_DEVELOPMENT_PLAN_20260914.md`、`CHANGELOG_AI.md` | Web 用户侧首个可运行版本：登录/注册、工作台、申请看板首版、关键词/状态筛选、申请详情状态变更、Today 任务完成和 AI 专家连续问询；传递公司、岗位和申请标识并同步勾选开发文档 | 已完成；`node --check`、全量 209/209 tests、`git diff --check` 通过；真实浏览器/微信双端验收待 Human |
| Codex | `miniprogram/package-career/pages/career-coach/*`、`tests/sprint4CareerCoach.test.js`、开发记录 | 修复竞争力陪跑登录按钮只更新状态、未挂载登录弹层而无响应 | 已完成；专项 6/6、全量 204/204、发布检查和微信 CLI preview 通过 |
| Codex | `miniprogram/package-career/pages/career-coach/career-coach.json`、`tests/sprint4CareerCoach.test.js`、开发记录 | 修复竞争力陪跑分包页面在按需注入时将 AI 说明组件解析为 `wx://not-found` | 已完成；专项 6/6、全量 204/204、发布检查和微信 CLI preview 通过 |
| Codex | `miniprogram/utils/date-time.js`、`miniprogram/utils/favorites.js`、`tests/sprint8Reliability.test.js`、开发记录 | 修复收藏同步解析 SQLite 日期时的 iOS 兼容警告，并保持 UTC 排序语义 | 已完成；专项 7/7、全量 204/204 与发布检查通过；未运行真实 E2E，未部署 |
| Codex | `routes/notify.js`、`services/v4TodayTasks.js`、Sprint 8 schema/migration、收藏请求工具、专项测试和文档 | Sprint 8：提醒派发幂等与有界并发、Today 跨设备增量同步、收藏统一请求层与离线补传 | 已完成；全量 202/202 与发布检查通过；真实验收和生产 migration 待 Human，不推送、不部署 |
| Codex | 商业套餐/权益/额度账本、退款审计、运营告警、会员小程序页、Sprint 7 migration/测试/文档 | Sprint 7：Free/Pro/场景包、统一商业账本、Mock 支付与退款一致性、可暂停灰度及异常告警 | 已完成；195/195 tests 与 `check:release` 通过，真实支付与外部退款保持关闭，不运行真实 E2E，不推送、不部署，生产 migration 待 Human |
| Codex | OA/Project Builder/Job Trust V4 数据表、服务、路由、小程序页面、专项测试和文档 | Sprint 6：OA 计划/计时/错题/统计，证据导向项目里程碑/交付物/验收/真实成果确认，以及可追溯岗位可信度评分 | 已完成；190/190 tests 与 `check:release` 通过，不调用真实 AI，不运行真实 E2E，不推送、不部署，生产 migration 待 Human |
| Codex | Networking V4 数据表/服务/路由、Today 关联、小程序 Networking 页面、专项测试和文档 | Sprint 5：联系人 CRM、五类可编辑草稿、跟进提醒、Referral 漏斗及岗位/简历/申请关联 | 已完成；182/182 tests 与发布检查通过，只生成/保存/复制草稿，不自动外发，不调用真实 AI，不运行真实 E2E，不推送、不部署 |
| Codex | `miniprogram/package-career/pages/career-coach/*`、`tests/sprint4CareerCoach.test.js`、开发记录 | 修复竞争力陪跑将 401、网络错误和残缺响应误渲染为空白的问题 | 已完成；专项 6/6、全量 203/203 与发布检查通过；未运行真实 E2E，未部署 |
| Codex | Job Match、V4 简历中心/材料、面试空间/报告、Today 回写、小程序对应页面、专项测试与文档 | Sprint 3：可行动岗位分层、JD 定制简历确认式新版本、Interview Brief 与弱项复练闭环 | 已完成；170/170 tests 与发布检查通过，不调用真实 AI，不运行真实 E2E |
| Codex | `db/migrate.js`、`db/migrations/`、数据库迁移/备份演练脚本、相关测试与文档 | Sprint 2.5：建立 schema migration baseline，在隔离数据库验证备份、迁移、幂等、失败事务、恢复与回滚 | 已完成自动化与隔离演练；生产 baseline 登记待 Human，不运行真实 E2E |
| Codex | `services/v4AiRuntime.js`、`services/v4Agents.js`、AI 路由、`utils/aiSafety.js`、匿名样本/门禁辅助程序、测试/脚本/文档 | Sprint 2.4：AI 异常矩阵、PII/真实性/确认写入/额度质量门禁 | 已完成自动化基线；真实供应商 staging 抽样待 Human，不运行真实 E2E |
| Codex | `utils/funnelAnalytics.js`、Analytics/职位/简历/申请/面试路由与服务、运营漏斗、小程序埋点、相关测试/文档 | Sprint 2.3：统一求职漏斗事件与 `refs`，隔离 production/demo/test/system 数据 | 已完成；兼容式 Analytics 加列，不运行真实 E2E |
| Codex | `utils/dataProvenance.js`、职位/校招路由与格式化器、小程序职位/校招适配与相关测试/文档 | Sprint 2.2：统一数据来源、更新时间、过期与失败降级口径，停止伪造本地职位新鲜度 | 已完成；发布检查通过，未运行真实 E2E，未推送、未部署 |
| Codex | `utils/coreEntityRefs.js`、`utils/applicationStatus.js`、V4 核心数据路由/服务、相关测试和 Sprint 2 文档 | Sprint 2 第一批：统一核心对象关联 ID 与申请状态输出，修复岗位 ID 双轨造成的跨模块错链 | 已完成；默认不运行真实 E2E |
| Codex | `scripts/run-campus-sync.sh`、`scripts/merge-campus-env.js`、`.env.example`、校招同步脚本与测试 | 将新校招表持续同步至职引官网生产共享数据库，隔离营销飞书配置并修复定时任务 Node/数据库路径 | 已完成；生产写入 11,467 条，131/131 tests、公网 API 和真实官网页面显示 8 月 10 日最新记录 |
| Codex | 小程序 `components/c-ai-disclosure/*`、模拟面试设置/对话/报告页面、`tests/favoriteReminder.test.js`、`scripts/check-miniprogram.js` | 统一缩小所有 AI 提示条，增加左右安全留白并清理三处重复旧样式 | 已完成；130/130 tests、AI 提示专项 4/4、小程序检查通过 |
| Codex | `.env.example`、`scripts/sync_feishu_server.js`、小程序校招首页/列表/详情与相关测试 | 使用“职引睿选”飞书应用持续同步新校招 Base 指定视图，移除客户端旧飞书代理数据优先级，并修正招聘年度推导 | 已完成；新表全量同步写入 11,439 条，129/129 tests、小程序检查和数据检查通过 |
| Codex | `miniprogram/images/logo_google.png`、`scripts/check-miniprogram.js` | 按微信开发者工具实际规则压缩媒体总量，并增加一致的本地防回归检查 | 已完成；媒体总量 191.2 KB，`check:miniprogram` 通过 |
| Codex | 小程序 `components/c-login-popup/*`、`tests/loginGate.test.js`、`scripts/check-miniprogram.js` | 增加清晰有效的关闭/暂不登录路径，并在拒绝手机号授权后返回当前页面，修复登录环节审核问题 | 已完成；128/128 tests、登录专项 4/4、小程序检查通过 |
| Codex | 小程序 `pages/resources/resources.js`、`resources.wxml`、`resources.wxss` 与资源中心回归测试 | 移除四个模块副标题，统一主题色标题胶囊，并将“内容与服务”改为独立卡片布局、修复底部白块 | 已完成；资源中心回归 14/14、小程序检查通过 |
| Codex | 校招数据表/接口/格式化器、小程序校招数据适配/首页/列表/详情、相关测试 | 修复首页仍显示 6 月 9 日旧校招：接入更新的飞书校招源，统一按同步更新时间排序并兼容飞书记录详情 | 已完成；127/127 tests、小程序检查、数据检查与线上飞书详情映射验证通过 |
| Codex | 小程序 `utils/api-jobs.js`、`package-user/pages/search/search.js` 与搜索回归测试 | 修复职位搜索因飞书职位源超时而长期停留在加载态：正式职位 API 优先、飞书并行兜底，并防止实时搜索的旧请求覆盖新结果 | 已完成；125/125 tests、小程序检查、数据检查、生产同链路搜索与微信预览通过 |
| Codex | 小程序职位展示适配工具、`components/c-job-card`、`pages/jobs/*`、`package-user/pages/search/*`、`package-user/pages/job-detail/*` 与回归测试 | 按产品说明重构职位列表卡片和职位详情信息架构，统一薪资、截止、标签、技能、匹配及缺省字段展示，同时保留收藏、详情跳转、投递看板和 AI 匹配链路 | 已完成；124/124 tests、小程序检查、数据检查与微信预览编译通过 |
| Codex | 小程序 `package-user/pages/search/search.js` 与导航回归测试 | 保留搜索输入防抖实时匹配，但仅在用户主动提交搜索时写入历史，并清理历史中的连续输入前缀碎片 | 已完成；120/120 tests、小程序检查、数据检查与微信预览编译通过 |
| Codex | 小程序 `package-career/pages/resume/resume.js`、`resume.wxml`、`resume.wxss` 与回归测试 | 修复在线简历手动编辑弹层中单行输入框高度压缩、无法稳定聚焦/回显及保存后列表不立即显示的问题，并统一工作、教育、项目和基本信息表单 UI | 已完成；119/119 tests、小程序检查、数据检查与微信预览编译通过 |
| Codex | 小程序普通页面 AI 提示、`utils/favorites.js`、职位列表/详情与提醒回归测试 | 移除非 AI 专属页面的顶部 AI 说明；职位收藏不再弹设置对话框，并按岗位截止日或默认 30 天自动开启提前 3 天和 1 天提醒 | 已完成；118/118 tests、小程序检查、数据检查与微信预览编译通过 |
| Codex | `routes/ai.js`、职业规划生成服务、小程序 `package-career/pages/career-planner/*`、测试与文档 | 将 AI 求职规划从关键词清单升级为包含技能标准、项目证据、阶段交付物、量化指标、每周节奏和风险应对的可执行方案 | 已完成；115/115 tests、小程序检查、微信预览、真实模型质量门禁与生产部署健康检查通过 |
| Codex | 小程序 `package-user/pages/profile-edit/*`、导航回归测试 | 压缩编辑资料页多选项的继续搜索入口并移至卡片右上角；毕业年份改为宽范围年份选择器 | 已完成；导航回归、全量测试、小程序检查和微信预览编译通过 |
| Codex | 小程序 `pages/resources/*`、`package-career/pages/career-planner/*`、导航回归测试 | 将隐藏的职业工具中心缺失功能并入资源中心，补充 AI 求职规划、Offer 对比和简历中心入口，并将规划页收口为单一功能页 | 已完成；导航回归、全量测试、小程序检查和微信预览编译通过 |
| Codex | `miniprogram/package-career/pages/resume/resume.wxml`、`resume.wxss`、页面回归测试 | 隐藏“我的简历”页面滚动条，并合并基本信息与个人优势卡片 | 已完成；页面回归、小程序检查和微信预览编译通过 |
| Codex | `services/v4AiRuntime.js`、`services/v4ResumeCenter.js`、`miniprogram/package-career/pages/resume-center/*`、`tests/`、`DEVELOPMENT_STATUS.md` | 修复 AI 简历润色误走 fallback、原文与建议相同及敏感/无意义字段被推荐的问题 | 已完成；109/109 tests、发布检查和生产 AI 实测通过 |
| Codex | `miniprogram/custom-tab-bar/index.js`、`miniprogram/app.json`、两张灰色 Tab 图标与导航测试 | 区分“进度”“AI专家”的选中/未选中图标颜色，未选中统一灰色 | 已完成；导航测试与小程序检查通过 |
| Codex | UGC 数据表、面经/评论/回复/机构评价接口、管理后台审核页、隐私政策及审核测试文档 | 建立发布前人工审核、公开内容过滤、统计联动和审核日志；同步虚拟支付与公司主体隐私披露 | 已完成；105/105 tests、发布检查与微信预览通过 |
| Codex | `miniprogram/components/c-login-popup`、`miniprogram/behaviors/login-gate.js`、所有登录受限入口及登录回归测试 | 将未登录点击统一改为当前页登录弹层，登录成功后继续原操作；登录弹层替换职引品牌 Logo | 已完成；101/101 tests、发布检查与微信预览编译通过 |
| Codex | `miniprogram/package-ai/pages/daily-brief/*`、导航回归测试 | 移除求职日报旧绿色问候头部，按首页蓝白求职计划卡片重构概览、统计与内容模块；移除 AI 返回的单字“伪图标” | 已完成；98/98 tests、发布检查与微信预览编译通过 |
| Codex | `miniprogram/utils/resume-versions.js`、`miniprogram/package-ai/utils/resume-versions.js`、AI 助手/JD 匹配引用与导航测试 | 将仅供 AI 分包使用的简历版本工具迁出主包，修复微信代码质量“主包未使用 JS”提示 | 已完成；97/97 tests、发布检查与微信预览编译通过，主包减少约 3 KB |
| Codex | `utils/featureFlags.js`、管理后台功能开关/Banner 页面、小程序首页与功能开关客户端、测试 | 增加“首页推荐岗位”独立审核开关并默认隐藏；校正 Banner 展示比例和上传尺寸提示 | 已完成；95/95 tests、生产开关关闭、公网验证通过、微信开发版 4.0.2 已上传 |
| Codex | 生产服务器、`miniprogram/utils/app-config.js`、Agent 配置测试与运维文档 | 将正确 4.0 主项目部署到 4400，完成 V4 数据迁移、虚拟支付与 Nginx 收口，并启用小程序 V4 Agent | 已完成；公网 readiness/V4/职位/校招/支付/鉴权冒烟通过 |
| Codex | `AGENTS.md`、`DEVELOPMENT_STATUS.md`、`docs/`、运行检查脚本、薪资可信度相关文件、首页与 TabBar、测试 | 收口误用副本，确认桌面仓库为唯一 4.0 主项目，迁移有效上线能力并完成发布验证 | 已完成；93/93 tests、发布检查与微信预览通过 |
| Codex | 小程序 `pages/resources`、资源页测试与文档 | 按参考图重做自定义导航、校招主视觉和横向资源卡片 | 已完成；91/91 tests、发布检查通过 |
| Codex | 小程序 `pages/index`、`pages/resources`、`components/home-campus-updates`、校招排序测试与文档 | 首页校招改为每个岗位独占一行并按每日最新更新时间排序；重构资源中心 UI | 已完成；91/91 tests、发布检查通过 |
| Codex | 小程序 `pages/resources`、`pages/index`、`components/home-campus-updates`、`custom-tab-bar`、导航调用及相关测试/文档 | 将校招 Tab 改为资源中心，首页求职情报改为校招瀑布流 | 已完成；91/91 tests、发布检查通过 |
| Codex | `README.md` | 补充开发说明 | 已完成 |
| Codex | `AGENTS.md` | 建立协作规则 | 已完成 |
| Codex | `DEVELOPMENT_STATUS.md` | 建立状态记录 | 已完成 |
| Codex | `tests/smoke.test.js` | 扩展后端 smoke tests | 已完成 |
| Codex | 小程序 `messages`、`feedback`、`news` 页面与 `utils/api-*` | 统一请求迁移 | 已完成 |
| Codex | `docs/RESUME_API_DEDUP_PLAN.md` | 简历 API 去重方案 | 已完成 |
| Codex | `docs/API_RESPONSE_CONVENTION.md` | API 响应格式规范 | 已完成 |
| Codex | 职位本地数据源相关后端文件 | 删除 SQLite `jobs` 双轨读取 | 已完成 |
| Codex | AI 配额相关后端文件 | 助手/规划/工作流权限限制 | 已完成 |
| Codex | `routes/ai.js`、`tests/smoke.test.js` | AI schema 与错误格式首批治理 | 已完成 |
| Codex | `utils/uploadSecurity.js`、`routes/upload.js`、`routes/admin.js` | 上传安全工具抽取 | 已完成 |
| Codex | `.github/workflows/test.yml` | 后端测试 CI | 已完成 |
| Codex | `README.md`、`CHANGELOG_AI.md`、`docs/DATABASE_MIGRATION_PLAN.md`、`tests/smoke.test.js` | P2 文档和上传测试补齐 | 已完成 |
| Codex | `routes/admin.js`、`utils/adminJobsStore.js`、`utils/pagination.js`、`tests/smoke.test.js` | 后台 jobs 存储和分页工具抽取 | 已完成 |
| Codex | 小程序 `app.wxss`、`pages/salary/salary.wxss`、`pages/jobs/jobs.wxss`、`pages/applications/applications.wxss` | 超长 WXSS 首批 token 化整理 | 已完成 |
| Codex | 小程序 `pages/salary/salary.wxss`、`pages/applications/applications.wxss`、`pages/jobs/jobs.wxss`、`pages/index/index.wxss`、`pages/experiences/experiences.wxss`、`pages/resume/resume.wxss`、`pages/agencies/agencies.wxss`、`pages/project-builder/project-builder.wxss`、`pages/ai-assistant/ai-assistant.wxss`、`pages/profile/profile.wxss`、`pages/career-planner/career-planner.wxss` | 超长 WXSS 重复覆盖块清理 | 已完成首批 |
| Codex | `utils/featureFlags.js`、`routes/features.js`、`server.js`、`.env.example`、`tests/smoke.test.js`、小程序全局配置/导航及职位相关页面 | 职位功能全局开关 | 已完成，40/40 smoke tests 与小程序检查通过 |
| Codex | `db/v4Schema.js`、`services/v4JobMatch.js`、`services/v4Profile.js`、`routes/v4/`、`server.js`、`tests/smoke.test.js`、`docs/V4_SPRINT1_BACKEND.md` | V4 Sprint 1 后端基座：画像、岗位匹配、申请状态历史 | 已完成，58/58 tests 通过 |
| Codex | `db/v4Schema.js`、`services/v4Sponsor.js`、`services/v4JobMatch.js`、`routes/v4/jobs.js`、`routes/v4/applications.js`、`tests/smoke.test.js`、`docs/V4_SPRINT1_BACKEND.md` | V4 第一优先级完善：Sponsor、资格匹配、CRM 看板与详情 | 已完成，60/60 tests 通过 |
| Codex | `db/v4Schema.js`、`routes/v4-admin.js`、`routes/v4/jobs.js`、`services/v4JobMatchStore.js`、`scripts/migrate_v4.js`、`package.json`、`server.js`、`tests/smoke.test.js` | V4 第一优先级收尾：Sponsor 核验审计、批量匹配、V3 迁移 | 已完成；正式迁移及二次 dry-run 成功，pending=0；迁移后 63/63 tests 通过 |
| Codex | 小程序 `utils/api-v4.js`、`package-user/pages/profile-edit`、`job-detail`、`applications` | V4 小程序首批接入：画像完整度、Sponsor 情报、三维匹配、云端 CRM 状态机 | 已完成；`check:miniprogram` 与 63/63 tests 通过 |
| Codex | 小程序 `pages/jobs`、`package-user/pages/application-detail`、`applications`、`app.json`，后台 `admin/sponsor-profiles.html`、`admin/js/common.js` | V4 小程序第二批：Sponsor 筛选、云端匹配、申请详情协作、后台 Sponsor 审核 | 已完成；`check:miniprogram`、63/63 tests、迁移 dry-run 通过；`check:data` 仅命中既有 `api-feishu-content.js` 乱码问题 |
| Codex | `routes/v4/jobs.js`、`routes/v4/applications.js`、`tests/smoke.test.js`、小程序 `pages/jobs`、`package-user/pages/application-detail`、`utils/api-feishu-content.js` | V4 第三批发布收尾：筛选一致性、详情状态流转、内容检查清零 | 已完成；`check:release` 通过、63/63 tests、内容错误 0、迁移 pending=0 |
| Codex | 微信开发者工具与 `scripts/acceptance-bot.js` 验收链路 | V4 联调阶段：开发者工具 E2E 与无 GUI 验收 | E2E 预检 4/4；安全验收 29/29；真实 E2E 已完成 10/11 场景，面试空间 mock 路由问题已修复 |
| Codex | `scripts/e2e-3.0-bot.js`、微信开发者工具自动化报告 | V4 真实 E2E 兼容修复 | 脚本语法已验证；按 Human 决定真实 E2E 暂停且非默认，用户已确认人工预览正常 |

## 待决策

| 事项 | 决策人 | 说明 |
|---|---|---|
| 真实微信支付上线 | Human | 当前仅 Mock 模式验证流程，有营业执照和商户资质后再进入真实支付灰度。 |

## 验证命令

```bash
npm test
```

当前测试覆盖：

- `/api/health`
- `/api/jobs`
- `/api/banners`
- `/api/companies`
- `/api/applications` 匿名拒绝
- `/api/payment/orders` 匿名拒绝
- `/api/users/web-register` 密码哈希
- `/api/users/web-login`
- `/api/users/resumes` deprecated 标记
- `/api/ai/workflow` VIP 拒绝
- `/api/ai/chat` 参数错误标准响应
- `/api/ai/project-builder` 参数错误标准响应
- `/admin/api/upload/banner` 伪 MIME 拒绝
- `/admin/api/upload/banner` 非图片 MIME 拒绝
- `/admin/api/jobs` 读取 jobs.json 列表
- `/api/upload/avatar` 正常 PNG 上传
- `/api/payment/create-order` Mock 下单
- `/api/payment/mock-confirm`
- `/api/payment/verify/:orderNo`
- `/api/upload/avatar` 伪 MIME 拒绝
- `/webhook/deploy` 缺签名拒绝

## Sprint 2 开发占用（2026-07-14）

| 负责人 | 文件范围 | 任务 | 状态 |
|---|---|---|---|
| Codex | `db/v4Schema.js`、`routes/v4/resumes.js`、`routes/v4/materials.js`、`services/v4ResumeCenter.js`、`utils/aiQuota.js`、`tests/smoke.test.js`、小程序简历与申请材料中心 | Sprint 2 申请材料中心：经历库、简历版本、AI 修改确认、AI 申请助手与额度控制 | 已完成，65/65 tests 与小程序检查通过 |

## Sprint 2 完成记录（2026-07-14）

| 事项 | 文件 | 验证 |
|---|---|---|
| 经历库、五类简历、复制/重命名/归档/默认、岗位与申请关联、版本对比恢复 | `db/v4Schema.js`、`services/v4ResumeCenter.js`、`routes/v4/resumes.js` | 自动化回归通过 |
| AI 逐条确认、手动编辑、防直接覆盖、防虚构、模型/提示词留痕、额度统计 | `routes/v4/resumes.js`、`utils/aiQuota.js` | 自动化回归通过 |
| JD 定制简历、Cover Letter、Recruiter 消息、Follow-up 邮件及确认保存 | `routes/v4/materials.js`、小程序 `application-materials` | 自动化回归与小程序检查通过 |
| AI 简历中心页面与完整开发说明 | 小程序 `resume-center`、`docs/V4_SPRINT2_APPLICATION_MATERIALS.md` | 页面注册检查通过 |

## Sprint 4 开发占用（2026-07-14）

| 负责人 | 文件范围 | 任务 | 状态 |
|---|---|---|---|
| Codex | `db/v4Schema.js`、`routes/v4/interviews.js`、`routes/v4/agents.js`、`routes/v4/membership.js`、相关 services/scripts/admin/miniprogram/tests/docs | Sprint 4 面试闭环、统一 AI、埋点看板、会员商业化与上线工程 | 已完成，69/69 tests 与发布检查通过 |

## Sprint 4 完成记录（2026-07-14）

| 事项 | 验证 |
|---|---|
| 岗位面试空间自动创建、模拟/STAR 训练、四维评分、报告、趋势和 Today 任务 | 自动化闭环通过 |
| 四 Agent、上下文读取、历史、超时降级、重试、取消、敏感信息脱敏、写操作确认 | 自动化状态机通过 |
| 全链路标准事件、7 日留存、申请漏斗、AI 使用率和后台运营看板 | 管理接口测试通过 |
| 会员方案、AI/简历/面试配额、高级匹配、订阅到期降级、订单退款状态 | 权益接口测试通过；真实支付双开关保持关闭 |
| 正式迁移、回滚 dry-run、功能开关、API 文档、小程序检查、灰度与错误监控 | `pending=0`，回滚计划可生成，灰度 0%，错误 0 |
| 性能采样 | 用户主链路未发现慢请求；测试中的内部提醒派发为 1.0–1.5 秒，已纳入看板持续观察 |
## 首页信息架构优化占用（2026-07-16）

| 负责人 | 文件范围 | 任务 | 状态 |
|---|---|---|---|
| Codex | `miniprogram/pages/index`、`miniprogram/pages/applications`、`miniprogram/pages/ai-career`、`miniprogram/custom-tab-bar`、`routes/v4/today.js` | 完成首页工作台、Today 同步与 V4 五项一级导航 | 已完成；79/79 tests、小程序检查通过；真实 E2E 待复验 |


| 2026-09-14 | 完成官网 Web 与小程序重新分工规划：Web 作为申请管理主工作台，小程序作为提醒、快速更新和面试练习助手；明确申请管理 MVP、申请包、面试复盘的 Web 迁移顺序 | docs/WEB_MINIPROGRAM_PRODUCT_PLAN_20260914.md | 规划文档完成，未改运行代码 |

## 面试训练收敛阶段（2026-09-14）

| 事项 | 文件 | 验证 |
|---|---|---|
| 面试训练上下文串联：申请详情携带 `applicationId` 进入岗位面试空间；空间提供返回申请与复盘中心入口；AI 模拟面试将申请上下文写入报告和历史；报告错题复练保留申请上下文 | `miniprogram/package-user/pages/application-detail/application-detail.js`、`miniprogram/package-ai/pages/interview-space/*`、`interview-setup/*`、`interview-dialog/*`、`ai-report/*`、`interview-notebook/interview-notebook.js`、`tests/navigationConfig.test.js` | 208/208 tests，`check:miniprogram` 与 `git diff --check` 通过 |
| 面试素材入口上下文复用：岗位面试空间写入 interviewContext，题库、STAR 和模拟面试入口自动复用公司、岗位和申请 | miniprogram/package-ai/pages/interview-space/interview-space.js、miniprogram/package-ai/pages/interview-setup/interview-setup.js、miniprogram/pages/experiences/experiences.js、miniprogram/package-content/pages/star-library/star-library.js、miniprogram/package-content/pages/question-detail/question-detail.js、	ests/navigationConfig.test.js | 待本轮测试完成 |

## 小程序 UI/UX 收敛阶段（2026-09-15）

| 负责人 | 文件范围 | 任务 | 状态 |
|---|---|---|---|
| Codex | `miniprogram/app.wxss`、首页 Today 工作台、校招卡片、首页求职计划、非首屏 Logo、`tests/navigationConfig.test.js`、`docs/UI_UPGRADE_20260915.md` | 补齐全局设计 Token，修复首页完成态和任务落地动作，明确校招卡片操作，降低首页渐变差异并补充图片懒加载 | 已完成；211/211 tests、导航专项 20/20、`check:miniprogram` 和 `git diff --check` 通过；真机回归待 Human |

## Web 申请包操作阶段（2026-09-15）

| 负责人 | 文件范围 | 任务 | 状态 |
|---|---|---|---|
| Codex | `services/v4ApplicationWorkspace.js`、`routes/v4/applications.js`、`db/v4Schema.js`、`public/web/applications.js`、`public/web/applications.css` | 简历版本选择、JD 匹配、ATS 检查、申请材料编辑/归档、AI 草稿确认写入 | 已完成；`npm test` 215/215，通过 Web 隔离场景及语法检查 |

本阶段未进行真实微信双设备验收、生产部署或推送。当前剩余首期事项：Web 岗位创建入口、AI 通用回答确认写入备注/任务、双端人工验收。

## Web 岗位入口阶段（2026-09-15）

| 负责人 | 文件范围 | 任务 | 状态 |
|---|---|---|---|
| Codex | `public/web/app.js`、`public/web/styles.css` | Web 职位搜索、匹配分数展示、一键加入申请管线 | 已完成；沿用 V4 岗位与申请接口 |

## 职引 5.0 P0 小程序收敛阶段（2026-09-15）

| 负责人 | 文件范围 | 任务 | 状态 |
|---|---|---|---|
| Codex | `miniprogram/app.json`、`custom-tab-bar`、`utils/navigation.js`、`utils/util.js`、AI/申请页导航 | 小程序一级导航收敛为：首页、找岗位、进度、我的；AI 改为上下文页面，不再占用一级 Tab | 已完成；导航专项与全量 215 项测试通过 |
| Codex | `miniprogram/pages/jobs/*`、既有岗位图标 | 将校招日历作为找岗位模块入口保留，支持从岗位搜索页进入校招批次和截止日期列表 | 已完成；`check:miniprogram` 通过 |

### P0 第二批：移动申请闭环

- 岗位卡片增加待投递/查看进度；服务端成功后显示状态，重复点击合并请求，409 读取已有申请，只有感兴趣记录可以推进至待投递，不覆盖面试和 Offer。
- 统一移动状态展示，收藏和准备申请不再显示为已投递；详情页复制官方链接不再自动写已投递，也不再复制个人简历摘要。
- 收藏继续使用原收藏同步；详情页收藏不再额外写申请记录，避免覆盖已有进度。明确点击待投递才创建申请；已有记录保留。
- 进度页增加独立 OA 筛选、列表改状态（使用服务端合法流转与版本检查），移除漏斗、工具宫格和材料准备度展示。
- 空列表和网络失败分开；进度页拦截过期请求，登录失效退出加载态；手动新增失败保留表单和同一个 jobId 供重试。
- 我的增加完整资源目录入口；校招入口移出岗位页固定头部，避免遮挡；复用原岗位选中/未选中图标，移除重复搜索图。
- 验证：新增移动流程测试 14/14，`check:release` 通过，全量 229/229；小程序媒体 191.2 KB、主包估算 1.04 MB；数据检查错误 0，保留既有 4 条提示。未部署、未进行微信真机 E2E。
- 详情及剩余 P0 范围见 `docs/V5_P0_MOBILE_WORKFLOW_20260915.md`，不表示整个 5.0 P0 已全部完成。

## Web AI 申请上下文与确认写入（2026-09-15）

- 已完成：服务端读取本人申请状态、下一步及 JD 摘要；AI 回答可编辑预览后确认保存为申请备注或申请任务。
- 权限验证：必须显式 confirm；跨用户申请拒绝；备注/任务长度有上限。
- 最新验证：Web 专项 4/4（隔离 API 场景 9/9），Edge 浏览器验收通过。
- 最终全量回归 215/215，`check:release` 通过；同期导航约定已统一，小程序检查通过。
- 未推送、未部署、未进行真实微信双设备验收。
