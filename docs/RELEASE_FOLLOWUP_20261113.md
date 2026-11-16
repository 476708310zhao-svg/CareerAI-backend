# 小程序候选版本后续核对（2026-11-13）

## 结论

本地候选已固定为 Git 引用 `refs/candidates/zhiyin-20261113`，仅供审查与复现；**当前不能提交微信审核**。代码门禁与开发者工具预览已通过，生产后端契约及真机链路仍未通过。没有推送、部署、执行生产迁移或上传正式版本。

## 生产接口只读核对

2026-11-13 对 `https://api.zhiyincareer.com` 发起匿名 GET；结果只证明检查时该地址的响应，不能替代登录后的端到端验收。

| 接口 | 响应 | 对候选版本的含义 |
| --- | --- | --- |
| `/api/health/ready` | 200 | 服务可达。 |
| `/api/v4/assessment-products` | 200 | 测评商品接口可达。 |
| `/api/v4/applications/1/workspace`、`/history` | 401 | 路由可达，匿名请求被鉴权拦截。 |
| `/api/v4/materials/answers/drafts?applicationId=1`、`/api/v4/resumes/1/versions` | 401 | 路由可达，匿名请求被鉴权拦截。 |
| `/api/v4/manual-services/consent`、`/api/v4/manual-services` | 404 | 当前生产地址未提供小程序人工服务入口依赖的接口。 |
| `/api/v4/question-practice/sets` | 404 | 当前生产地址未提供小程序在线刷题入口依赖的接口。 |
| `/api/feedback/mine`、`/api/jobs/official-boards` | 404 | 反馈历史和官方招聘入口的生产接口仍需逐项对齐。 |
| `/api/v4/applications/1/interview-reports` | 404 | 面试报告路由仍需核对生产部署及鉴权契约。 |

小程序 `miniprogram/pages/profile/profile.js`、`miniprogram/pages/resources/resources.js` 已提供人工服务与刷题跳转，`miniprogram/app.json` 已注册页面。因此不能仅因本地路由和测试存在就把当前小程序包上传审核。

## 微信开发者工具

本机 CLI 位于 `C:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat`。首次预览先遇到登录问题，登录后遇到微信平台 `-80426 Page metadata JSON page-meta.json not found`；核对文件确在小程序根目录且 JSON 可解析后，在 `miniprogram/project.config.json` 的 `packOptions.include` 显式加入该文件。再次在同一已登录 CLI 端口预览两次均返回 `√ preview`，不再出现该错误；最终工具报告总包 2,640,752 字节、主包 890,740 字节。预览二维码保存在本机临时目录 `zhiyin-preview-20261113.png`，只供本轮人工体验。

同一工作树重新运行 `npm run check:release` 退出码 0；小程序静态检查通过，数据检查 0 错误、32 条提醒。尚无本轮代码质量扫描、Android/iOS 真机主链路或微信平台配置核对记录。预览成功不代表生产接口已部署，也不代表小程序已上传审核。

## 职位描述乱码修复

真机截图中的 Mento 职位为 RemoteOK `rok_1137717`（Strategy & Operations Coach APAC）。只读获取 RemoteOK 原始记录及生产 `/api/jobs/rok_1137717` 后确认：描述中共有 5 处 UTF-8 字节被按 Latin-1 解释，分别是 3 处右撇号、1 处破折号、1 处省略号。第一轮只修复撇号，所以用户在新预览里仍看到其余乱码。第二轮在 `miniprogram/utils/job-presenter.js` 对完整、有效的 UTF-8 错误序列统一还原，兼容 Latin-1 和 Windows-1252 两种常见形式；正常中英文保持原样。`tests/jobPresentation.test.js` 覆盖这三种符号、Windows-1252 引号和重音字符。

第二轮修复后，生产 `/api/jobs/rok_1137717` 返回 200；把其真实描述交给小程序展示组件，原始 5 处错误序列全部消失，撇号、破折号、省略号均正常。定向测试 7/7 通过，`npm run check:miniprogram` 通过，`npm run check:release` 退出码 0（818 项中 816 通过、0 失败、2 项既有跳过；数据检查 0 错误、32 条提醒）。微信 CLI 新预览返回 `√ preview`，总包 2,641,658 字节；v2 二维码保存在本机 Temp 的 `zhiyin-preview-encodingfix-v2-20261113.png`。用户已在该职位真机回复“都正常”，本缺陷验收通过。

## 发布收口顺序

1. 将候选引用与当前生产接口差异逐项审查。对本轮公开的功能，要么完成相容后端的独立发布及生产只读复核，要么在小程序发布包中撤下未具备服务端契约的入口；两种方案需在同一固定版本上验收。
2. 人工服务、刷题、反馈、官方招聘和面试报告分别核对后端部署范围、鉴权和数据迁移。迁移、上传、支付、登录等高风险改动单独评审；刷题公开还须满足 `docs/assessment-question-bank/08_PHASE7_RELEASE_READINESS.md` 列出的内容授权、审核、私有存储和扫描条件。
3. 对固定小程序版本执行代码质量扫描；使用预览二维码在 Android/iOS 真机验收登录、岗位申请、简历、资料、付费可见性、空态与错误态及以上新入口。
4. 完成微信公众平台域名、隐私指引和权限核对，再决定是否提交审核。所有版本号、后端版本、测试记录和截图要对应同一候选树。

当前快照是集成审查材料，包含多个尚未拆分的业务主题，不应直接作为正式部署提交。
