# 职引填表助手（本地 V1）

这是一个未发布的 Chrome Manifest V3 扩展原型，只支持以下 HTTPS 页面：

- `boards.greenhouse.io`
- `job-boards.greenhouse.io`
- `jobs.lever.co`
- `jobs.ashbyhq.com`

## 本地加载

1. 在 Chrome 打开 `chrome://extensions`，启用开发者模式并选择“加载已解压的扩展程序”。
2. 选择本目录。复制 Chrome 显示的扩展 ID。
3. 在后端 `.env` 中设置 `BROWSER_EXTENSION_ORIGIN=chrome-extension://<32位扩展ID>` 并重启本地后端。服务端只允许此 ID 调用 `/api/v4/browser-extension/consume`；生产环境必须独立审核扩展 ID 和域名策略。
4. 点击扩展图标，在 API 地址处填入本地官网 API 地址并主动批准该来源。官网与 API 分离部署时填写实际 API origin/base path。
5. 登录官网，在某条申请详情中勾选本次允许使用的字段，生成五分钟一次性授权码；粘贴到扩展弹窗。
6. 在允许的招聘页面先识别字段，再输入授权并查看值；逐项勾选后点击填入。检查招聘表单后，由用户自行提交。

## 数据和权限边界

- 授权码仅展示一次，数据库只保存 SHA-256 摘要；绑定本人申请、允许的招聘域名和显式选择字段，五分钟过期且只能消费一次，可在官网撤销未消费授权。
- 扩展不把授权码写入 `chrome.storage`。API base 仅保存在扩展本地存储；网络权限通过用户操作请求单一来源。
- content script 仅在上述招聘域名本地检查 input/textarea/select 标签，页面结构和值不会上传给职引服务。
- Greenhouse、Lever 与 Ashby 分别使用本地字段适配；弹窗显示识别状态和固定原因代码，不上传或保存页面标签、URL 参数或表单内容。真实网站兼容尚未验收。
- 弹窗只在本机按允许的主机和 UTC 日期聚合样本数、支持/部分支持/不支持次数及固定原因码；兼容统计不包含申请 ID、用户、URL、页面字段名、标签或值，也不会上传。最近 7 天样本至少 5 次且失败率不低于 60% 时才显示本机提示。
- 只有服务端授权的字段值才会传回扩展。页面候选项和值会显示预览，填入前仍需用户逐项勾选。
- 不收集密码、文件、单选/多选框或未知字段，不自动提交，不代表目标 ATS 网站已通过真实兼容验收。
- 填入后可打开官网对应申请（`/applications?open=<id>`）。若用户已自行在招聘网站完成提交，必须在官网申请详情再次明确确认；扩展不会判断或自动记录提交成功。

本地检查：`node --check content.js`、`node --check popup.js`，以及后端 `tests/browserExtensionGrant.test.js`。未发布到 Chrome Web Store，未连接真实 ATS。
