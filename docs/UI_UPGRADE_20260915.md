# 小程序 UI/UX 优化记录 · 2026-09-15

## 本轮目标

把首页和校招列表的主要动作表达清楚，并补齐公共设计 Token，降低分包页面使用旧变量时的样式失效风险。

## 已完成

- 首页 Today 工作台不再用 `Math.max(1, ...)` 把已完成状态显示成待办；无待办时显示“今日任务已完成”，主按钮回到申请管线或资料完善。
- 首页下一步按钮使用当前任务的真实 URL，面试任务才显示“准备今日面试”，避免按钮文案和落地页不一致。
- 全局 `app.wxss` 补齐旧组件和新页面共同使用的颜色、圆角、按钮、动效和阴影 Token；静态扫描仅剩页面自定义的 `--score-color`。
- 首页求职计划卡改为白色轻边框表面，按钮改用品牌 Token，减少页面之间的渐变差异。
- 校招卡片根据是否有投递链接显示“复制投递链接”或“查看公告”，并为筛选入口补充可访问标签。
- 校招相关列表、机构对比和技能组件中的非首屏公司 Logo 增加 `lazy-load`；当前图片懒加载覆盖从 15/37 提升到 20/37。

## 验证

- `node --check miniprogram/pages/index/index.js`
- `node --check tests/navigationConfig.test.js`
- `node --test tests/navigationConfig.test.js`：20/20 通过
- `npm test`：211/211 通过
- `npm run check:miniprogram`：通过，媒体总量 191.2 KB，主包估算 1.03 MB
- `git diff --check`：通过

## 后续建议

- 在微信开发者工具和真机检查首页任务卡、底部 Tab、安全区、键盘弹起和校招筛选抽屉。
- 继续把长列表页的剩余远程图片逐页补齐懒加载，并统一岗位/校招筛选组件。
- 下一轮处理申请详情的单一主 CTA，以及 AI 结果卡的“保存到申请包”动作。

## 第二阶段：申请闭环动作

- 申请详情根据当前阶段、JD 匹配、申请材料和可用状态流转，生成一个“建议下一步”主操作，减少用户在多个卡片之间寻找入口。
- AI 面试报告在存在 `applicationId` 时提供“加入当前申请”，使用现有申请任务接口保存一条可追踪的复盘任务；“保存图片”继续明确表示导出到相册。
- 申请详情底部增加内容安全区，避免主操作或长页面内容被系统手势区域遮挡。

## 第二阶段验证

- `node --check miniprogram/package-user/pages/application-detail/application-detail.js`
- `node --check miniprogram/package-ai/pages/ai-report/ai-report.js`
- `node --test tests/navigationConfig.test.js`
