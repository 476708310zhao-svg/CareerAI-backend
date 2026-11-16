# 网申问答草稿 API

规范定义见官网仓库 `docs/openapi.yaml`。以下接口均要求登录，申请和草稿只对所属用户可见。

## 生成草稿

`POST /api/v4/materials/answers/draft`

请求：`{ "applicationId": 123, "question": "请描述一次解决问题的经历", "maxChars": 500 }`

服务端要求申请已绑定该用户的简历及明确简历版本；不会替用户选择版本。生成依据仅包含该版本和用户已保存的材料。无可用依据时返回 422；没有绑定简历版本时拒绝生成。模型问题和材料均按不可信文本处理，模型只能引用服务端生成的 `evidenceRefs` 白名单。

返回数据包含 `id`、`version`、`applicationId`、`question`、`draft`、`evidenceRefs`、`evidence`、`unsupportedClaims`、`charCount`、`maxChars`、`characterCountUnit` 和 `generation`。`charCount` 按 Unicode code points 统计；例如 emoji 计为一个码点。模型不可用时返回可编辑降级框架。

## 读取待核对草稿

`GET /api/v4/materials/answers/drafts?applicationId=123`

只返回当前用户、指定申请下尚未归档的问答草稿。

## 编辑草稿

`PATCH /api/v4/materials/answers/drafts/{id}`

请求：`{ "expectedVersion": 1, "content": "用户编辑后的文本" }`

服务端核对草稿所有者、申请状态、申请仍绑定原简历版本和版本号；版本不一致返回冲突。编辑保留服务端证据快照及未支持主张标记。记录继续保持 `pending`，与正式申请材料分离，任何接口都不会自动提交给招聘方。
